from flask import Blueprint, request, jsonify
from datetime import datetime, date
import json
import re
from models import db, Faculty, FacultyAvailability, Duty, TimetableEntry, AuditLog, AllocationExplanation, AllocationRun, SystemSettings, CIE, ExamSession
from allocation.engine import AllocationEngine

faculty_bp = Blueprint('faculty_bp', __name__)

@faculty_bp.route('', methods=['GET'])
def get_faculty_list():
    """
    Returns list of faculty with live computed duty statistics.
    Supports filtering by designation, eligibility, active status, search query.
    """
    search = request.args.get('search', '').strip().lower()
    designation = request.args.get('designation', '').strip()
    eligibility = request.args.get('eligibility', '').strip()
    status = request.args.get('status', '').strip()

    query = Faculty.query

    if designation:
        query = query.filter_by(designation=designation)
    if eligibility in ('true', 'false'):
        query = query.filter_by(eligible_for_duty=(eligibility == 'true'))
    if status in ('active', 'inactive'):
        query = query.filter_by(is_active=(status == 'active'))

    faculty_members = query.order_by(Faculty.name).all()

    results = []
    for f in faculty_members:
        if search:
            emp_id = (f.employee_id or '').lower()
            desig = (f.designation or '').lower()
            if not (search in f.name.lower() or search in emp_id or search in desig):
                continue
        results.append(f.to_dict(include_stats=True))

    return jsonify({'faculty': results, 'total': len(results)})


@faculty_bp.route('/<int:faculty_id>', methods=['GET'])
@faculty_bp.route('/<int:faculty_id>/profile', methods=['GET'])
def get_faculty_profile(faculty_id):
    """
    Returns complete database-driven staff profile formatted according
    to institutional specification section 10.
    """
    faculty = Faculty.query.get_or_404(faculty_id)
    stats_dict = faculty.to_dict(include_stats=True)

    # Sort duties
    valid_duties = [d for d in faculty.duties if d.status != 'CANCELLED']
    duties_sorted = sorted(
        faculty.duties,
        key=lambda d: (d.exam_session.exam_date, d.exam_session.start_time) if d.exam_session else (date.min, '')
    )

    today = date.today()
    upcoming = []
    history = []

    for d in duties_sorted:
        if not d.exam_session:
            continue
        d_dict = d.to_dict()
        if d.exam_session.exam_date >= today and d.status == 'ASSIGNED':
            upcoming.append(d_dict)
        else:
            history.append(d_dict)

    # Timetable entries grouped & formatted
    tt_entries = []
    for entry in faculty.timetable_entries:
        tt_entries.append({
            'id': entry.id,
            'semester_id': entry.semester_id,
            'semester_name': entry.semester.name if entry.semester else 'Not specified',
            'sem_number': entry.semester.sem_number if entry.semester else None,
            'subject_code': entry.subject.code if entry.subject else 'N/A',
            'subject_name': entry.subject.name if entry.subject else 'N/A',
            'day': entry.day_of_week,
            'start_time': entry.start_time,
            'end_time': entry.end_time,
            'room_number': entry.room_number,
        })

    # Sort timetable entries by day order and time
    day_order = {'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6}
    tt_entries.sort(key=lambda x: (day_order.get(x['day'], 7), x['start_time']))

    cie_counts = stats_dict.get('cie_breakdown', {})
    duty_types = stats_dict.get('duty_types', {})

    response_payload = {
        'faculty': {
            'id': faculty.id,
            'name': faculty.name,
            'employee_id': faculty.employee_id,
            'designation': faculty.designation if faculty.designation != 'Not provided' else None,
            'department': faculty.department or 'CSE (AI & ML)',
            'experience_years': faculty.experience_years,
            'skills': stats_dict.get('skills', []),
            'active': faculty.is_active,
            'eligible_for_duty': faculty.eligible_for_duty
        },
        'teaching_semesters': stats_dict.get('teaching_semesters', []),
        'subjects': stats_dict.get('subjects', []),
        'timetable_summary': stats_dict.get('timetable_summary', {'total_slots': 0, 'semester_wise': {}}),
        'duty_summary': {
            'total_assigned': stats_dict.get('total_assigned', 0),
            'completed': stats_dict.get('completed', 0),
            'remaining': stats_dict.get('remaining', 0),
            'completion_percentage': stats_dict.get('completion_rate', 0.0),
            'maximum_allowed': faculty.max_duty_capacity,
            'remaining_capacity': stats_dict.get('remaining_capacity', faculty.max_duty_capacity)
        },
        'cie_breakdown': {
            'cie_1': cie_counts.get('CIE-1', 0),
            'cie_2': cie_counts.get('CIE-2', 0),
            'cie_3': cie_counts.get('CIE-3', 0)
        },
        'duty_type_breakdown': {
            'invigilation': duty_types.get('invigilation', 0),
            'squad': duty_types.get('squad', 0)
        },
        'upcoming_duties': upcoming,
        'duty_history': history,
        'timetable': tt_entries,
        'availabilities': [a.to_dict() for a in faculty.availabilities]
    }

    return jsonify(response_payload)


@faculty_bp.route('', methods=['POST'])
def create_faculty():
    """
    Creates a new faculty member with optional fields.
    Does NOT force employee_id or designation invention.
    """
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Faculty name is required'}), 400

    employee_id = (data.get('employee_id') or '').strip() or None
    if employee_id:
        if Faculty.query.filter_by(employee_id=employee_id).first():
            return jsonify({'error': f'Employee ID {employee_id} already exists'}), 409

    designation = (data.get('designation') or '').strip() or 'Not provided'
    department = (data.get('department') or '').strip() or 'CSE (AI & ML)'
    
    exp_years = None
    if data.get('experience_years') is not None and str(data.get('experience_years')).strip() != '':
        try:
            exp_years = float(data['experience_years'])
        except ValueError:
            exp_years = None

    skills_raw = data.get('skills', [])
    if isinstance(skills_raw, list):
        skills_json = json.dumps(skills_raw)
    elif isinstance(skills_raw, str):
        skills_json = json.dumps([s.strip() for s in skills_raw.split(',') if s.strip()])
    else:
        skills_json = '[]'

    max_capacity = 15
    if data.get('max_duty_capacity') is not None:
        try:
            max_capacity = int(data['max_duty_capacity'])
        except ValueError:
            max_capacity = 15
    elif data.get('max_duties') is not None:
        try:
            max_capacity = int(data['max_duties'])
        except ValueError:
            max_capacity = 15

    is_active = True
    if 'is_active' in data:
        is_active = bool(data['is_active'])
    elif 'active' in data:
        is_active = bool(data['active'])

    eligible = True
    if 'eligible_for_duty' in data:
        eligible = bool(data['eligible_for_duty'])

    faculty = Faculty(
        name=name,
        employee_id=employee_id,
        designation=designation,
        department=department,
        experience_years=exp_years,
        skills=skills_json,
        email=(data.get('email') or '').strip() or None,
        phone=(data.get('phone') or '').strip() or None,
        max_duty_capacity=max_capacity,
        is_active=is_active,
        eligible_for_duty=eligible
    )

    db.session.add(faculty)
    db.session.flush()

    audit = AuditLog(
        action='FACULTY_CREATED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='Faculty',
        entity_id=faculty.id,
        details=f"Created faculty member {faculty.name} (Eligible: {faculty.eligible_for_duty})."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify(faculty.to_dict(include_stats=True)), 201


@faculty_bp.route('/<int:faculty_id>', methods=['PUT'])
def update_faculty(faculty_id):
    """Updates an existing faculty member."""
    faculty = Faculty.query.get_or_404(faculty_id)
    data = request.get_json() or {}

    old_state = f"eligible: {faculty.eligible_for_duty}, active: {faculty.is_active}"

    if 'name' in data:
        faculty.name = data['name'].strip()
    if 'employee_id' in data:
        val = (data['employee_id'] or '').strip() or None
        if val != faculty.employee_id:
            if val and Faculty.query.filter_by(employee_id=val).first():
                return jsonify({'error': 'Employee ID already exists'}), 409
            faculty.employee_id = val
    if 'email' in data:
        faculty.email = (data['email'] or '').strip() or None
    if 'phone' in data:
        faculty.phone = (data['phone'] or '').strip() or None
    if 'designation' in data:
        faculty.designation = (data['designation'] or '').strip() or 'Not provided'
    if 'department' in data:
        faculty.department = (data['department'] or '').strip() or 'CSE (AI & ML)'
    if 'experience_years' in data:
        try:
            faculty.experience_years = float(data['experience_years']) if data['experience_years'] is not None else None
        except ValueError:
            pass
    if 'max_duty_capacity' in data or 'max_duties' in data:
        cap = data.get('max_duty_capacity', data.get('max_duties'))
        try:
            faculty.max_duty_capacity = int(cap)
        except ValueError:
            pass
    if 'is_active' in data:
        faculty.is_active = bool(data['is_active'])
    elif 'active' in data:
        faculty.is_active = bool(data['active'])
    if 'eligible_for_duty' in data:
        faculty.eligible_for_duty = bool(data['eligible_for_duty'])
    if 'skills' in data:
        skills_raw = data.get('skills', [])
        if isinstance(skills_raw, list):
            faculty.skills = json.dumps(skills_raw)
        elif isinstance(skills_raw, str):
            faculty.skills = json.dumps([s.strip() for s in skills_raw.split(',') if s.strip()])

    new_state = f"eligible: {faculty.eligible_for_duty}, active: {faculty.is_active}"

    audit = AuditLog(
        action='FACULTY_UPDATED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='Faculty',
        entity_id=faculty.id,
        old_value=old_state,
        new_value=new_state,
        details=f"Updated faculty member {faculty.name}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify(faculty.to_dict(include_stats=True))


@faculty_bp.route('/<int:faculty_id>', methods=['DELETE'])
def delete_faculty(faculty_id):
    """Deletes a specific faculty member and reclaims duties/timetables."""
    faculty = Faculty.query.get_or_404(faculty_id)
    name = faculty.name

    # Reset any duties assigned to this faculty to PENDING
    for d in faculty.duties:
        d.faculty_id = None
        d.status = 'PENDING'

    db.session.delete(faculty)
    
    audit = AuditLog(
        action='FACULTY_DELETED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='Faculty',
        entity_id=faculty_id,
        details=f"Deleted faculty member {name}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({'success': True, 'message': f"Faculty {name} deleted successfully"})


@faculty_bp.route('/clear-all', methods=['POST'])
def clear_all_faculty():
    """
    Clears all faculty members from the database so the administrator
    can populate each staff member cleanly from scratch.
    """
    # Delete related runs, explanations, and unassign duties
    AllocationExplanation.query.delete()
    AllocationRun.query.delete()
    
    # Mark duties as unassigned
    for d in Duty.query.all():
        d.faculty_id = None
        d.status = 'PENDING'

    FacultyAvailability.query.delete()
    TimetableEntry.query.delete()
    deleted_count = Faculty.query.delete()

    audit = AuditLog(
        action='ALL_FACULTY_CLEARED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='Faculty',
        entity_id=0,
        details=f"Cleared all existing faculty records ({deleted_count} removed) for manual entry."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f"All {deleted_count} existing faculty members removed. Roster is now completely clear.",
        'cleared_count': deleted_count
    })


@faculty_bp.route('/<int:faculty_id>/unavailability', methods=['POST'])
def add_unavailability(faculty_id):
    """Registers leave or unavailability block for a faculty member."""
    faculty = Faculty.query.get_or_404(faculty_id)
    data = request.get_json() or {}

    try:
        u_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date format. Expected YYYY-MM-DD'}), 400

    record = FacultyAvailability(
        faculty_id=faculty.id,
        date=u_date,
        start_time=data.get('start_time', '09:00'),
        end_time=data.get('end_time', '17:00'),
        is_available=False,
        reason=data.get('reason', 'Leave registered')
    )
    db.session.add(record)
    
    audit = AuditLog(
        action='FACULTY_UNAVAILABILITY_ADDED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='FacultyAvailability',
        entity_id=faculty.id,
        details=f"Registered unavailability for {faculty.name} on {u_date.isoformat()} ({record.start_time}-{record.end_time})."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify(record.to_dict()), 201


def parse_duty_quota_string(text, all_faculty):
    """
    Parses natural quota strings such as:
    'swathi-1, ankitha-3, sushma-4, megha-4, maseeha-5, shithal-5'
    into a map of {faculty_id: target_quota}.
    Supports delimiters: comma, semicolon, newline, pipe, hyphen, colon, equals.
    """
    if not text:
        return {}
    items = re.split(r'[,;\n\|]+', str(text).strip())
    result = {}
    for item in items:
        item = item.strip()
        if not item:
            continue
        m = re.match(r'^(.+?)[\s\-:=]+(\d+)$', item)
        if m:
            name_part = m.group(1).strip().lower()
            val = int(m.group(2))
            matched_fac = None
            for f in all_faculty:
                f_name_lower = (f.name or '').lower()
                if name_part in f_name_lower:
                    matched_fac = f
                    break
                if name_part in ['shithal', 'sheethal'] and ('shithal' in f_name_lower or 'sheethal' in f_name_lower):
                    matched_fac = f
                    break
            if matched_fac:
                result[matched_fac.id] = val
    return result


@faculty_bp.route('/duty-quotas', methods=['GET'])
def get_duty_quotas():
    """
    Returns the current configured duty quotas for all active faculty members,
    along with their current assigned duty counts and a formatted text representation.
    """
    all_faculty = Faculty.query.filter_by(is_active=True).order_by(Faculty.name).all()
    setting = SystemSettings.query.filter_by(key='faculty_duty_quotas_raw').first()
    saved_raw_text = setting.value if setting else ""

    quotas_list = []
    text_parts = []
    total_quota = 0

    for f in all_faculty:
        assigned_count = Duty.query.filter_by(faculty_id=f.id).filter(Duty.status != 'CANCELLED').count()
        is_squad_only = getattr(f, 'only_squad_duty', False) or f.id == 1 or 'Arjun' in (f.name or '')
        is_senior = 'Associate Professor' in (f.designation or '') or 'Professor' in (f.designation or '') or 'Head' in (f.designation or '')
        quota = f.max_duty_capacity if f.max_duty_capacity is not None else 5
        
        quotas_list.append({
            'faculty_id': f.id,
            'name': f.name,
            'designation': f.designation,
            'is_senior': is_senior,
            'is_squad_only': is_squad_only,
            'eligible_for_duty': f.eligible_for_duty,
            'quota': quota,
            'assigned_duties': assigned_count
        })

        if not is_squad_only and f.eligible_for_duty:
            total_quota += quota
            short_name = f.name.replace('Dr. ', '').replace('Mrs. ', '').replace('Mr. ', '').replace('Ms. ', '').split(' ')[0].lower()
            text_parts.append(f"{short_name}-{quota}")

    default_raw = ", ".join(text_parts)

    return jsonify({
        'quotas': quotas_list,
        'raw_text': saved_raw_text or default_raw,
        'total_quota': total_quota
    })


@faculty_bp.route('/duty-quotas', methods=['POST'])
def update_duty_quotas():
    """
    Updates duty quotas for faculty members.
    Accepts:
    - raw_text: e.g. "swathi-1, ankitha-3, sushma-4, megha-4, maseeha-5, shithal-5"
    - quotas: dict of {faculty_id: quota}
    """
    data = request.get_json() or {}
    raw_text = data.get('raw_text', '').strip()
    quotas_dict = data.get('quotas', {})

    all_faculty = Faculty.query.all()
    parsed_quotas = {}

    if raw_text:
        parsed_quotas = parse_duty_quota_string(raw_text, all_faculty)

    # Merge explicit quotas dict
    if isinstance(quotas_dict, dict):
        for fid_str, q_val in quotas_dict.items():
            try:
                fid = int(fid_str)
                parsed_quotas[fid] = int(q_val)
            except (ValueError, TypeError):
                pass

    if not parsed_quotas:
        return jsonify({'error': 'No valid faculty quotas detected. Expected format like "swathi-1, ankitha-3"'}), 400

    updated_faculties = []
    text_summary_parts = []
    for f in all_faculty:
        if f.id in parsed_quotas:
            new_cap = max(0, int(parsed_quotas[f.id]))
            f.max_duty_capacity = new_cap
            updated_faculties.append({'id': f.id, 'name': f.name, 'quota': new_cap})
            text_summary_parts.append(f"{f.name}: {new_cap}")

    # Persist in SystemSettings
    setting_raw = SystemSettings.query.filter_by(key='faculty_duty_quotas_raw').first()
    if not setting_raw:
        setting_raw = SystemSettings(key='faculty_duty_quotas_raw', value=raw_text or ", ".join(f"{f['name'].split()[0].lower()}-{f['quota']}" for f in updated_faculties))
        db.session.add(setting_raw)
    else:
        setting_raw.value = raw_text or ", ".join(f"{f['name'].split()[0].lower()}-{f['quota']}" for f in updated_faculties)

    setting_json = SystemSettings.query.filter_by(key='faculty_duty_quotas').first()
    if not setting_json:
        setting_json = SystemSettings(key='faculty_duty_quotas', value=json.dumps(parsed_quotas))
        db.session.add(setting_json)
    else:
        setting_json.value = json.dumps(parsed_quotas)

    audit = AuditLog(
        action='DUTY_QUOTAS_UPDATED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='Faculty',
        entity_id=0,
        details=f"Updated faculty duty quotas: {', '.join(text_summary_parts)}"
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f"Successfully updated duty quotas for {len(updated_faculties)} faculty members.",
        'updated_faculties': updated_faculties,
        'raw_text': setting_raw.value
    })


@faculty_bp.route('/duty-quotas/assign', methods=['POST'])
def assign_by_duty_quotas():
    """
    Saves duty quotas and immediately re-allocates duties in the target CIE
    strictly according to the configured quotas and 3rd sem regular timetable protection.
    """
    data = request.get_json() or {}
    cie_id = int(data.get('cie_id') or 1)

    # First apply any updated quotas if supplied
    if data.get('raw_text') or data.get('quotas'):
        raw_text = data.get('raw_text', '').strip()
        quotas_dict = data.get('quotas', {})
        all_faculty = Faculty.query.all()
        parsed = parse_duty_quota_string(raw_text, all_faculty) if raw_text else {}
        if isinstance(quotas_dict, dict):
            for fid_str, q_val in quotas_dict.items():
                try:
                    parsed[int(fid_str)] = int(q_val)
                except Exception:
                    pass
        for f in all_faculty:
            if f.id in parsed:
                f.max_duty_capacity = max(0, int(parsed[f.id]))
        db.session.commit()

    # Trigger allocation engine
    user_identifier = request.headers.get('X-User', 'Admin')
    try:
        alloc_res = AllocationEngine.generate_cie_allocation(
            cie_id=cie_id,
            user_identifier=user_identifier
        )
        return jsonify({
            'success': True,
            'message': f"Successfully applied duty quotas and allocated duties for CIE cycle.",
            'allocation_result': alloc_res
        })
    except Exception as e:
        return jsonify({'error': f"Quota assignment failed: {str(e)}"}), 500

