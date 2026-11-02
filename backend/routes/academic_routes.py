import os
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import or_
from models import db, Semester, Subject, TimetableEntry, TimetableCoverage, Faculty, AuditLog
from allocation.timetable_conflicts import normalize_academic_year

academic_bp = Blueprint('academic_bp', __name__)


def _coverage_department(department):
    value = (department or '').lower()
    if 'robot' in value:
        return 'Robotics & Artificial Intelligence'
    if 'cse' in value or 'ai' in value:
        return 'CSE (AI & ML)'
    return None


def _invalidate_timetable_coverage(semester, department, academic_year):
    canonical_department = _coverage_department(department)
    year = normalize_academic_year(academic_year)
    if not canonical_department or not year:
        return
    coverage = TimetableCoverage.query.filter_by(
        academic_year=year,
        sem_number=semester.sem_number,
        department=canonical_department
    ).first()
    if coverage:
        coverage.is_verified = False
        coverage.verified_at = None


# --- Semesters ---
@academic_bp.route('/semesters', methods=['GET'])
def get_semesters():
    semesters = Semester.query.order_by(Semester.sem_number).all()
    return jsonify([s.to_dict() for s in semesters])


# --- Subjects ---
@academic_bp.route('/subjects', methods=['GET'])
def get_subjects():
    sem_id = request.args.get('semester_id')
    query = Subject.query
    if sem_id:
        query = query.filter_by(semester_id=int(sem_id))
    subjects = query.order_by(Subject.code).all()
    return jsonify([s.to_dict() for s in subjects])


@academic_bp.route('/subjects', methods=['POST'])
def create_subject():
    data = request.get_json() or {}
    if not data.get('code') or not data.get('name') or not data.get('semester_id'):
        return jsonify({'error': 'code, name, and semester_id are required'}), 400

    if Subject.query.filter_by(code=data['code'].strip()).first():
        return jsonify({'error': 'Subject code already exists'}), 409

    subj = Subject(
        code=data['code'].strip(),
        name=data['name'].strip(),
        semester_id=int(data['semester_id']),
        department=data.get('department', 'Computer Science & Engineering (AI & ML)')
    )
    db.session.add(subj)
    db.session.commit()
    return jsonify(subj.to_dict()), 201


@academic_bp.route('/timetable-coverage', methods=['GET'])
def get_timetable_coverage():
    academic_year = request.args.get('academic_year')
    semester_id = request.args.get('semester_id', type=int)
    if not academic_year:
        return jsonify({'error': 'academic_year is required'}), 400

    year = normalize_academic_year(academic_year)
    semester_query = Semester.query.filter_by(is_active=True)
    if semester_id:
        semester_query = semester_query.filter_by(id=semester_id)
    semesters = semester_query.order_by(Semester.sem_number).all()

    coverage_rows = []
    for semester in semesters:
        for department in ('CSE (AI & ML)', 'Robotics & Artificial Intelligence'):
            coverage = TimetableCoverage.query.filter_by(
                academic_year=year,
                sem_number=semester.sem_number,
                department=department
            ).first()
            entries = TimetableEntry.query.filter_by(semester_id=semester.id).all()
            entry_count = sum(
                1 for entry in entries
                if normalize_academic_year(entry.academic_year) == year
                and _coverage_department(
                    entry.department or (entry.subject.department if entry.subject else '')
                ) == department
            )
            coverage_data = coverage.to_dict(entry_count) if coverage else {
                    'academic_year': year,
                    'sem_number': semester.sem_number,
                    'department': department,
                    'is_verified': False,
                    'verified_at': None,
                    'entry_count': entry_count
                }
            coverage_data['semester_id'] = semester.id
            coverage_rows.append(coverage_data)

    return jsonify({
        'academic_year': year,
        'coverage': coverage_rows,
        'verified': all(row['is_verified'] for row in coverage_rows)
    })


@academic_bp.route('/timetable-coverage', methods=['POST'])
def update_timetable_coverage():
    data = request.get_json() or {}
    academic_year = normalize_academic_year(data.get('academic_year'))
    try:
        semester_id = int(data.get('semester_id'))
    except (TypeError, ValueError):
        semester_id = None
    department = _coverage_department(data.get('department'))
    is_verified = data.get('is_verified')

    if not academic_year or not semester_id or not department or not isinstance(is_verified, bool):
        return jsonify({
            'error': 'academic_year, semester_id, department, and boolean is_verified are required'
        }), 400

    semester = db.session.get(Semester, int(semester_id))
    if not semester:
        return jsonify({'error': 'Semester not found'}), 404

    coverage = TimetableCoverage.query.filter_by(
        academic_year=academic_year,
        sem_number=semester.sem_number,
        department=department
    ).first()
    if not coverage:
        coverage = TimetableCoverage(
            academic_year=academic_year,
            sem_number=semester.sem_number,
            department=department
        )
        db.session.add(coverage)

    coverage.is_verified = is_verified
    coverage.verified_at = datetime.utcnow() if is_verified else None
    db.session.commit()

    entries = TimetableEntry.query.filter_by(semester_id=semester.id).all()
    entry_count = sum(
        1 for entry in entries
        if normalize_academic_year(entry.academic_year) == academic_year
        and _coverage_department(
            entry.department or (entry.subject.department if entry.subject else '')
        ) == department
    )
    result = coverage.to_dict(entry_count)
    result['semester_id'] = semester.id
    return jsonify(result)


# --- Timetables ---
@academic_bp.route('/timetables', methods=['GET'])
def get_timetables():
    """
    Returns timetable entries with filters:
    - semester_id
    - faculty_id
    - day_of_week (MON, TUE, etc.)
    """
    semester_id = request.args.get('semester_id')
    faculty_id = request.args.get('faculty_id')
    day = request.args.get('day_of_week')
    department = request.args.get('department') or request.args.get('branch')
    academic_year = request.args.get('academic_year')

    query = TimetableEntry.query

    if semester_id:
        query = query.filter_by(semester_id=int(semester_id))
    if faculty_id:
        query = query.filter_by(faculty_id=int(faculty_id))
    if day:
        query = query.filter_by(day_of_week=day.strip().upper())
    if department:
        dept_str = department.strip().lower()
        if 'robot' in dept_str:
            query = query.filter(TimetableEntry.department.ilike('%robot%'))
        elif 'cse' in dept_str or 'ai' in dept_str:
            query = query.filter(~TimetableEntry.department.ilike('%robot%'))

    entries = query.order_by(TimetableEntry.start_time).all()
    if academic_year:
        year_key = normalize_academic_year(academic_year)
        entries = [
            entry for entry in entries
            if normalize_academic_year(entry.academic_year) == year_key
        ]
    day_order = {'MON': 0, 'TUE': 1, 'WED': 2, 'THU': 3, 'FRI': 4, 'SAT': 5}
    entries.sort(key=lambda entry: (day_order.get(entry.day_of_week, 6), entry.start_time))
    return jsonify([e.to_dict() for e in entries])


@academic_bp.route('/timetables', methods=['POST'])
def create_timetable_entry():
    data = request.get_json() or {}
    required = ['semester_id', 'faculty_id', 'day_of_week', 'start_time', 'end_time']
    for f in required:
        if not data.get(f):
            return jsonify({'error': f'Field {f} is required'}), 400

    sem_id = int(data['semester_id'])
    semester = db.session.get(Semester, sem_id)
    if not semester:
        return jsonify({'error': 'Semester not found'}), 404
    sub_id = data.get('subject_id')
    target_dept = data.get('department') or data.get('branch') or 'CSE (AI & ML)'
    academic_year = normalize_academic_year(data.get('academic_year') or semester.academic_year)
    if not sub_id:
        sub = Subject.query.filter_by(semester_id=sem_id).first()
        if not sub:
            sub = Subject(
                code=f"SEM{sem_id}-CLS",
                name="Class Lecture",
                semester_id=sem_id,
                department=target_dept
            )
            db.session.add(sub)
            db.session.flush()
        sub_id = sub.id
    else:
        sub_id = int(sub_id)

    entry = TimetableEntry(
        semester_id=sem_id,
        faculty_id=int(data['faculty_id']),
        subject_id=sub_id,
        day_of_week=data['day_of_week'].strip().upper(),
        start_time=data['start_time'].strip(),
        end_time=data['end_time'].strip(),
        section=(data.get('section') or '').strip() or None,
        academic_year=academic_year,
        room_number=data.get('room_number', 'CR-301').strip(),
        department=target_dept
    )
    db.session.add(entry)
    _invalidate_timetable_coverage(semester, target_dept, academic_year)
    db.session.flush()

    audit = AuditLog(
        action='TIMETABLE_UPDATED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='TimetableEntry',
        entity_id=entry.id,
        details=f"Added timetable entry: {entry.day_of_week} {entry.start_time}-{entry.end_time} for faculty {entry.faculty_id}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify(entry.to_dict()), 201


@academic_bp.route('/timetables/<int:entry_id>', methods=['PUT'])
def update_timetable_entry(entry_id):
    entry = TimetableEntry.query.get_or_404(entry_id)
    data = request.get_json() or {}
    old_semester = entry.semester
    old_department = entry.department or (entry.subject.department if entry.subject else '')
    old_year = entry.academic_year

    if 'faculty_id' in data:
        entry.faculty_id = int(data['faculty_id'])
    if 'subject_id' in data:
        entry.subject_id = int(data['subject_id'])
    if 'semester_id' in data:
        entry.semester_id = int(data['semester_id'])
    if 'department' in data or 'branch' in data:
        entry.department = data.get('department') or data.get('branch')
    if 'academic_year' in data:
        entry.academic_year = normalize_academic_year(data['academic_year'])
    if 'section' in data:
        entry.section = (data['section'] or '').strip() or None
    if 'day_of_week' in data:
        entry.day_of_week = data['day_of_week'].strip().upper()
    if 'start_time' in data:
        entry.start_time = data['start_time'].strip()
    if 'end_time' in data:
        entry.end_time = data['end_time'].strip()
    if 'room_number' in data:
        entry.room_number = data['room_number'].strip()

    _invalidate_timetable_coverage(old_semester, old_department, old_year)
    new_semester = db.session.get(Semester, entry.semester_id)
    if not new_semester:
        return jsonify({'error': 'Semester not found'}), 404
    _invalidate_timetable_coverage(
        new_semester,
        entry.department or (entry.subject.department if entry.subject else ''),
        entry.academic_year
    )
    audit = AuditLog(
        action='TIMETABLE_UPDATED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='TimetableEntry',
        entity_id=entry.id,
        details=f"Updated timetable entry ID {entry.id}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify(entry.to_dict())


@academic_bp.route('/timetables/<int:entry_id>', methods=['DELETE'])
def delete_timetable_entry(entry_id):
    entry = TimetableEntry.query.get_or_404(entry_id)
    _invalidate_timetable_coverage(
        entry.semester,
        entry.department or (entry.subject.department if entry.subject else ''),
        entry.academic_year
    )
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Timetable entry deleted'})


@academic_bp.route('/timetables/semester/<int:semester_id>', methods=['DELETE'])
def clear_semester_timetables(semester_id):
    sem = Semester.query.get_or_404(semester_id)
    for entry in TimetableEntry.query.filter_by(semester_id=sem.id).all():
        _invalidate_timetable_coverage(
            sem,
            entry.department or (entry.subject.department if entry.subject else ''),
            entry.academic_year
        )
    count = TimetableEntry.query.filter_by(semester_id=sem.id).delete()
    db.session.commit()
    return jsonify({
        'success': True,
        'message': f'Deleted {count} timetable entries for {sem.name}',
        'count': count
    })


@academic_bp.route('/timetables/bulk', methods=['POST'])
def bulk_create_timetable_entries():
    """
    Complete Timetable Entry / Bulk Import.
    Payload:
    {
      "semester_id": 4,
      "replace_existing": true, // if true, clears existing entries for this semester
      "entries": [
        {
          "day_of_week": "MON",
          "start_time": "09:30",
          "end_time": "10:30",
          "subject_id": 1, // or "subject_code": "24AI401", "subject_name": "..."
          "faculty_id": 2, // or "faculty_name": "Dr. Swathi H Y"
          "room_number": "AI302"
        }
      ]
    }
    """
    data = request.get_json() or {}
    semester_id = data.get('semester_id')
    entries_data = data.get('entries', [])
    replace_existing = data.get('replace_existing', False)

    if not semester_id:
        return jsonify({'error': 'semester_id is required'}), 400
    if not isinstance(entries_data, list) or len(entries_data) == 0:
        return jsonify({'error': 'entries must be a non-empty list'}), 400

    sem = Semester.query.get(semester_id)
    if not sem:
        return jsonify({'error': f'Semester with ID {semester_id} not found'}), 404

    try:
        target_dept = data.get('department') or data.get('branch')
        if replace_existing:
            del_q = TimetableEntry.query.filter_by(semester_id=sem.id)
            if target_dept:
                if 'robot' in target_dept.lower():
                    del_q = del_q.filter(TimetableEntry.department.ilike('%robot%'))
                else:
                    del_q = del_q.filter(or_(
                        TimetableEntry.department.is_(None),
                        ~TimetableEntry.department.ilike('%robot%')
                    ))
            for existing_entry in del_q.all():
                _invalidate_timetable_coverage(
                    sem,
                    existing_entry.department or (
                        existing_entry.subject.department if existing_entry.subject else ''
                    ),
                    existing_entry.academic_year
                )
                db.session.delete(existing_entry)

        created_entries = []
        all_faculties = Faculty.query.all()
        faculty_by_id = {f.id: f for f in all_faculties}
        faculty_by_name = {f.name.lower().strip(): f for f in all_faculties}

        for item in entries_data:
            day = (item.get('day_of_week') or '').strip().upper()
            start = (item.get('start_time') or '').strip()
            end = (item.get('end_time') or '').strip()
            room = (item.get('room_number') or 'AI302').strip()
            item_dept = item.get('department') or item.get('branch') or target_dept or 'CSE (AI & ML)'

            if not day or not start or not end:
                continue

            # 1. Resolve Subject
            subject = None
            if item.get('subject_id'):
                subject = Subject.query.get(int(item['subject_id']))
            
            if not subject and item.get('subject_code'):
                code = str(item['subject_code']).strip()
                subject = Subject.query.filter_by(code=code).first()
                if not subject:
                    # Auto-create subject if new
                    subj_name = (item.get('subject_name') or code).strip()
                    subject = Subject(
                        code=code,
                        name=subj_name,
                        semester_id=sem.id,
                        department=item_dept
                    )
                    db.session.add(subject)
                    db.session.flush()

            if not subject:
                # Subjects change every year - auto-fallback to semester default subject
                subject = Subject.query.filter_by(semester_id=sem.id).first()
                if not subject:
                    subject = Subject(
                        code=f"SEM{sem.sem_number}-CLS",
                        name="Class Lecture",
                        semester_id=sem.id,
                        department=item_dept
                    )
                    db.session.add(subject)
                    db.session.flush()

            # 2. Resolve Faculty
            faculty = None
            if item.get('faculty_id') and int(item['faculty_id']) in faculty_by_id:
                faculty = faculty_by_id[int(item['faculty_id'])]
            elif item.get('faculty_name'):
                raw_name = str(item['faculty_name']).strip().lower()
                if raw_name in faculty_by_name:
                    faculty = faculty_by_name[raw_name]
                else:
                    for k, f_obj in faculty_by_name.items():
                        if raw_name in k or k in raw_name:
                            faculty = f_obj
                            break

            if not faculty:
                # Default to first active faculty if matching fails
                faculty = all_faculties[0] if all_faculties else None

            if not faculty:
                continue

            entry = TimetableEntry(
                semester_id=sem.id,
                faculty_id=faculty.id,
                subject_id=subject.id,
                academic_year=normalize_academic_year(
                    item.get('academic_year') or data.get('academic_year') or sem.academic_year
                ),
                day_of_week=day,
                start_time=start,
                end_time=end,
                section=(item.get('section') or '').strip() or None,
                room_number=room,
                department=item_dept
            )
            db.session.add(entry)
            created_entries.append(entry)
            _invalidate_timetable_coverage(
                sem,
                item_dept,
                item.get('academic_year') or data.get('academic_year') or sem.academic_year
            )

        audit = AuditLog(
            action='TIMETABLE_UPDATED',
            user_identifier=request.headers.get('X-User', 'Admin'),
            entity_type='TimetableEntry',
            entity_id=sem.id,
            details=f"Bulk imported {len(created_entries)} timetable slots for {sem.name} (replace={replace_existing})."
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Successfully configured {len(created_entries)} timetable slots for {sem.name}',
            'count': len(created_entries)
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@academic_bp.route('/timetables/parse-image', methods=['POST'])
def parse_timetable_image():
    """
    Parses an uploaded timetable circular image and aligns weekly slots,
    subjects, and faculty members for a semester.
    Supports multipart/form-data with 'image' file, or JSON with 'image_base64'.
    """
    try:
        from services.timetable_ocr_service import parse_timetable_from_image
        import base64

        img_bytes = None
        target_sem_id = request.form.get('semester_id') or request.args.get('semester_id')

        if 'image' in request.files:
            file = request.files['image']
            if file.filename == '':
                return jsonify({'error': 'No image file selected'}), 400
            img_bytes = file.read()
        elif request.is_json:
            data = request.get_json() or {}
            target_sem_id = target_sem_id or data.get('semester_id')
            b64_data = data.get('image_base64') or data.get('image')
            if b64_data:
                if ',' in b64_data:
                    b64_data = b64_data.split(',', 1)[1]
                img_bytes = base64.b64decode(b64_data)

        if not img_bytes:
            return jsonify({'error': 'No image provided. Please upload an image file or provide image_base64.'}), 400

        result = parse_timetable_from_image(img_bytes)

        # Match semester in DB
        sem_num = result.get('detected_semester_number')
        target_sem = None
        if target_sem_id:
            target_sem = Semester.query.get(int(target_sem_id))
        elif sem_num:
            target_sem = Semester.query.filter_by(sem_number=int(sem_num)).first()

        if not target_sem:
            target_sem = Semester.query.first()

        result['detected_semester_id'] = target_sem.id if target_sem else None
        result['detected_semester_name'] = target_sem.name if target_sem else f"Semester {sem_num}"
        result['detected_semester_number'] = target_sem.sem_number if target_sem else sem_num

        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': f'Failed to parse timetable image: {str(e)}'}), 500


@academic_bp.route('/timetables/sample-circular', methods=['GET'])
def get_sample_circular():
    """Returns the official timetable circular image."""
    candidates = [
        os.path.join(os.path.dirname(__file__), '..', '..', 'tests', 'sample_outputs', 'page_1_img_1.png'),
        os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'page_1_img_1.png'),
        os.path.join(os.path.dirname(__file__), '..', '..', 'page_1_img_1.png')
    ]
    for p in candidates:
        if os.path.exists(p):
            return send_file(os.path.abspath(p), mimetype='image/png')
    return jsonify({'error': 'Sample circular image not found'}), 404


@academic_bp.route('/timetables/parse-sample', methods=['POST'])
def parse_sample_circular():
    """Automatically parses the official Malnad timetable circular and returns aligned grid slots."""
    try:
        from services.timetable_ocr_service import parse_timetable_from_image
        candidates = [
            os.path.join(os.path.dirname(__file__), '..', '..', 'tests', 'sample_outputs', 'page_1_img_1.png'),
            os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'page_1_img_1.png'),
            os.path.join(os.path.dirname(__file__), '..', '..', 'page_1_img_1.png')
        ]
        img_bytes = None
        for p in candidates:
            if os.path.exists(p):
                with open(p, 'rb') as f:
                    img_bytes = f.read()
                break

        if not img_bytes:
            return jsonify({'error': 'Sample circular image not found'}), 404

        result = parse_timetable_from_image(img_bytes)
        sem_num = result.get('detected_semester_number', 3)
        target_sem = Semester.query.filter_by(sem_number=int(sem_num)).first() or Semester.query.first()

        result['detected_semester_id'] = target_sem.id if target_sem else None
        result['detected_semester_name'] = target_sem.name if target_sem else f"Semester {sem_num}"
        result['detected_semester_number'] = target_sem.sem_number if target_sem else sem_num

        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': f'Failed to parse sample circular: {str(e)}'}), 500
