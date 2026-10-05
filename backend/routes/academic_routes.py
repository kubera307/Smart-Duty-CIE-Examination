from flask import Blueprint, request, jsonify
from models import db, Semester, Subject, TimetableEntry, Faculty, AuditLog

academic_bp = Blueprint('academic_bp', __name__)

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

    query = TimetableEntry.query

    if semester_id:
        query = query.filter_by(semester_id=int(semester_id))
    if faculty_id:
        query = query.filter_by(faculty_id=int(faculty_id))
    if day:
        query = query.filter_by(day_of_week=day.strip().upper())

    entries = query.order_by(TimetableEntry.start_time).all()
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
    sub_id = data.get('subject_id')
    if not sub_id:
        sub = Subject.query.filter_by(semester_id=sem_id).first()
        if not sub:
            sub = Subject(
                code=f"SEM{sem_id}-CLS",
                name="Class Lecture",
                semester_id=sem_id,
                department='Computer Science & Engineering (AI & ML)'
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
        room_number=data.get('room_number', 'CR-301').strip()
    )
    db.session.add(entry)
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

    if 'faculty_id' in data:
        entry.faculty_id = int(data['faculty_id'])
    if 'subject_id' in data:
        entry.subject_id = int(data['subject_id'])
    if 'day_of_week' in data:
        entry.day_of_week = data['day_of_week'].strip().upper()
    if 'start_time' in data:
        entry.start_time = data['start_time'].strip()
    if 'end_time' in data:
        entry.end_time = data['end_time'].strip()
    if 'room_number' in data:
        entry.room_number = data['room_number'].strip()

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
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Timetable entry deleted'})


@academic_bp.route('/timetables/semester/<int:semester_id>', methods=['DELETE'])
def clear_semester_timetables(semester_id):
    sem = Semester.query.get_or_404(semester_id)
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
        if replace_existing:
            TimetableEntry.query.filter_by(semester_id=sem.id).delete()

        created_entries = []
        all_faculties = Faculty.query.all()
        faculty_by_id = {f.id: f for f in all_faculties}
        faculty_by_name = {f.name.lower().strip(): f for f in all_faculties}

        for item in entries_data:
            day = (item.get('day_of_week') or '').strip().upper()
            start = (item.get('start_time') or '').strip()
            end = (item.get('end_time') or '').strip()
            room = (item.get('room_number') or 'AI302').strip()

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
                        department='Computer Science & Engineering (AI & ML)'
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
                        department='Computer Science & Engineering (AI & ML)'
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
                day_of_week=day,
                start_time=start,
                end_time=end,
                room_number=room
            )
            db.session.add(entry)
            created_entries.append(entry)

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



