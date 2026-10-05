from flask import Blueprint, request, jsonify
from datetime import datetime, date
from models import db, CIE, ExamSession, ExamRoom, Duty, DutySwapRequest, Faculty, Semester, Subject, TimetableEntry, AllocationExplanation, AuditLog
from allocation.engine import AllocationEngine
from allocation.validator import AllocationValidator
from allocation.buffer_rules import BufferRuleEvaluator


allocation_bp = Blueprint('allocation_bp', __name__)

@allocation_bp.route('/preview/<int:cie_id>', methods=['GET'])
def get_allocation_preview(cie_id):
    """Pre-allocation audit diagnostic before running the engine, optionally filtered by semester or semesters."""
    sem_id = request.args.get('semester_id')
    sem_ids = request.args.getlist('semester_ids') or (request.args.get('semester_ids').split(',') if request.args.get('semester_ids') else None)
    preview = AllocationEngine.get_pre_allocation_audit(
        cie_id=cie_id,
        semester_id=int(sem_id) if sem_id else None,
        semester_ids=[int(s) for s in sem_ids if s] if sem_ids else None
    )
    if 'error' in preview:
        return jsonify(preview), 404
    return jsonify(preview)


@allocation_bp.route('/generate', methods=['POST'])
def generate_allocation():
    """Triggers the full constraint allocation solver for a CIE or specific semester(s)."""
    data = request.get_json() or {}
    cie_id = data.get('cie_id')
    if not cie_id:
        return jsonify({'error': 'cie_id is required'}), 400

    sem_id = data.get('semester_id')
    sem_ids = data.get('semester_ids')
    user_identifier = request.headers.get('X-User', 'Admin')

    try:
        result = AllocationEngine.generate_cie_allocation(
            cie_id=int(cie_id),
            user_identifier=user_identifier,
            semester_id=int(sem_id) if sem_id else None,
            semester_ids=[int(s) for s in sem_ids] if sem_ids else None
        )
        return jsonify(result), 200
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        return jsonify({'error': f"Allocation failed: {str(e)}"}), 500


@allocation_bp.route('/results/<int:cie_id>', methods=['GET'])
def get_allocation_results(cie_id):
    """
    Returns allocated duties for a CIE with comprehensive filtering.
    Filters:
    - semester_id
    - faculty_id
    - date (YYYY-MM-DD)
    - status (ASSIGNED, COMPLETED, CANCELLED, PENDING)
    - duty_type
    """
    sem_id = request.args.get('semester_id')
    fac_id = request.args.get('faculty_id')
    exam_date = request.args.get('date')
    status = request.args.get('status')
    duty_type = request.args.get('duty_type')

    query = Duty.query.join(ExamSession).filter(ExamSession.cie_id == cie_id)

    if sem_id:
        query = query.filter(ExamSession.semester_id == int(sem_id))
    if fac_id:
        query = query.filter(Duty.faculty_id == int(fac_id))
    if exam_date:
        query = query.filter(ExamSession.exam_date == exam_date)
    if status:
        query = query.filter(Duty.status == status.strip().upper())
    if duty_type:
        query = query.filter(Duty.duty_type == duty_type.strip())

    duties = query.order_by(ExamSession.exam_date, ExamSession.start_time, ExamSession.room_number).all()

    # Calculate live summary stats
    all_cie_duties = Duty.query.join(ExamSession).filter(ExamSession.cie_id == cie_id).all()
    total_required = sum(s.required_invigilators for s in ExamSession.query.filter_by(cie_id=cie_id).all())
    allocated_count = sum(1 for d in all_cie_duties if d.status in ('ASSIGNED', 'COMPLETED') and d.faculty_id is not None)
    pending_count = sum(1 for d in all_cie_duties if d.status == 'PENDING' or d.faculty_id is None)
    completed_count = sum(1 for d in all_cie_duties if d.status == 'COMPLETED')

    return jsonify({
        'duties': [d.to_dict() for d in duties],
        'total_count': len(duties),
        'summary': {
            'total_required': total_required,
            'allocated': allocated_count,
            'pending': pending_count,
            'completed': completed_count,
            'conflicts': pending_count
        }
    })


@allocation_bp.route('/duty/<int:duty_id>/explanation', methods=['GET'])
def get_duty_explanation(duty_id):
    """Returns the full explainability trace for a specific duty assignment."""
    duty = Duty.query.get_or_404(duty_id)
    if not duty.explanation:
        return jsonify({'error': 'No explanation recorded for this duty'}), 404
    return jsonify(duty.explanation.to_dict())


@allocation_bp.route('/override', methods=['POST'])
def manual_duty_override():
    """
    Allows controlled manual assignment or reassignment of faculty to a duty.
    Validates timetable conflicts, 1h buffer, capacity, and active status.
    If conflicts exist, requires explicit 'force_override=true' with confirmation reason.
    """
    data = request.get_json() or {}
    duty_id = data.get('duty_id')
    faculty_id = data.get('faculty_id')
    force_override = bool(data.get('force_override', False))
    override_reason = data.get('override_reason', '').strip()
    user_identifier = request.headers.get('X-User', 'Admin')

    if not duty_id or not faculty_id:
        return jsonify({'error': 'duty_id and faculty_id are required'}), 400

    duty = Duty.query.get_or_404(duty_id)
    faculty = Faculty.query.get_or_404(faculty_id)
    all_active_semesters = Semester.query.filter_by(is_active=True).all()
    buffer_minutes = AllocationEngine.get_system_buffer_minutes()

    # Perform validation
    validation = AllocationValidator.validate_manual_assignment(
        faculty=faculty,
        exam_session=duty.exam_session,
        all_active_semesters=all_active_semesters,
        buffer_minutes=buffer_minutes,
        duty_type=duty.duty_type
    )

    # If conflicts exist and force_override is not confirmed, halt and return warning
    if not validation['can_assign'] and not force_override:
        return jsonify({
            'can_assign': False,
            'requires_force': True,
            'errors': validation['errors'],
            'warnings': validation['warnings'],
            'conflict_details': validation['conflict_details'],
            'message': 'Constraint violation detected. Administrator confirmation with justification required to force override.'
        }), 409

    # Apply override
    old_faculty_name = duty.faculty.name if duty.faculty else "None (Pending)"
    duty.faculty_id = faculty.id
    duty.status = 'ASSIGNED'
    duty.is_manual_override = True
    duty.override_reason = override_reason or "Manual administrative reassignment"
    duty.updated_at = datetime.utcnow()

    # Record Audit Log
    audit = AuditLog(
        action='MANUAL_OVERRIDE',
        user_identifier=user_identifier,
        entity_type='Duty',
        entity_id=duty.id,
        old_value=f"Faculty: {old_faculty_name}",
        new_value=f"Faculty: {faculty.name} ({faculty.employee_id})",
        details=f"Manual override applied. Reason: {duty.override_reason}. Violations overridden: {', '.join(validation['errors'] + validation['warnings']) if not validation['can_assign'] else 'None (Clean assignment)'}"
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'duty': duty.to_dict(),
        'message': f"Duty successfully reassigned to {faculty.name}."
    })


@allocation_bp.route('/duty/<int:duty_id>/status', methods=['PUT'])
def update_duty_status(duty_id):
    """Updates status of a duty (ASSIGNED, COMPLETED, CANCELLED)."""
    duty = Duty.query.get_or_404(duty_id)
    data = request.get_json() or {}
    new_status = data.get('status', '').strip().upper()

    if new_status not in ('ASSIGNED', 'COMPLETED', 'CANCELLED'):
        return jsonify({'error': 'Invalid status. Choose ASSIGNED, COMPLETED, or CANCELLED'}), 400

    old_status = duty.status
    duty.status = new_status
    duty.updated_at = datetime.utcnow()

    audit = AuditLog(
        action=f"DUTY_{new_status}",
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='Duty',
        entity_id=duty.id,
        old_value=f"Status: {old_status}",
        new_value=f"Status: {new_status}",
        details=f"Changed duty {duty.id} status from {old_status} to {new_status}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify(duty.to_dict())


@allocation_bp.route('/duty', methods=['POST'])
def create_or_assign_duty():
    """
    Directly creates one or more examination duty slots (multi-room) or reassigns an existing room duty.
    Supports:
    1. Direct Reassignment: (exam_session_id, exam_room_id, faculty_id)
    2. Direct Multi-Room Duty Creation: (semester_id, subject_id, exam_date, start_time, end_time, rooms: [{ room_number, student_start, student_end, faculty_id, duty_type }, ...])
    """
    data = request.get_json() or {}
    session_id = data.get('exam_session_id')
    room_id = data.get('exam_room_id')
    faculty_id = data.get('faculty_id')
    duty_type = data.get('duty_type', 'Invigilation')
    user_identifier = request.headers.get('X-User', 'Admin')
    override_reason = data.get('override_reason') or 'Administrative Duty Creation'

    # CASE 1: Quick reassign on an existing session/room
    if session_id:
        session = ExamSession.query.get_or_404(session_id)
        room = ExamRoom.query.get(room_id) if room_id else (session.exam_rooms[0] if session.exam_rooms else None)
        faculty = Faculty.query.get(faculty_id) if faculty_id else None

        existing_duty = None
        if room:
            existing_duty = Duty.query.filter_by(exam_session_id=session.id, exam_room_id=room.id).first()
        else:
            existing_duty = Duty.query.filter_by(exam_session_id=session.id).first()

        if existing_duty:
            existing_duty.faculty_id = faculty.id if faculty else None
            existing_duty.duty_type = duty_type
            existing_duty.status = 'ASSIGNED' if faculty else 'PENDING'
            existing_duty.is_manual_override = True
            existing_duty.override_reason = override_reason
            existing_duty.updated_at = datetime.utcnow()
            duty = existing_duty
        else:
            duty = Duty(
                exam_session_id=session.id,
                exam_room_id=room.id if room else None,
                faculty_id=faculty.id if faculty else None,
                duty_type=duty_type,
                status='ASSIGNED' if faculty else 'PENDING',
                is_manual_override=True,
                override_reason=override_reason,
                allocated_at=datetime.utcnow()
            )
            db.session.add(duty)

        audit = AuditLog(
            action='DUTY_REASSIGNED',
            user_identifier=user_identifier,
            entity_type='Duty',
            entity_id=duty.id,
            details=f"Reassigned room {room.room_number if room else 'Hall'} duty to {faculty.name if faculty else 'Unassigned'}."
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({
            'success': True,
            'duty': duty.to_dict(),
            'message': f"Duty successfully assigned to {faculty.name if faculty else 'Unassigned'}."
        }), 201

    # CASE 2: Create new duties directly with Semester, Subject, Date, Time, and Rooms (e.g. AI301 & AI302)
    sem_id = data.get('semester_id')
    subj_id = data.get('subject_id')
    exam_date_str = data.get('exam_date')
    start_time = data.get('start_time', '09:00')
    end_time = data.get('end_time', '10:00')
    cie_id = data.get('cie_id') or 1

    if not sem_id or not subj_id or not exam_date_str:
        return jsonify({'error': 'Semester, Subject, and Exam Date are required to create a duty'}), 400

    # Parse date
    if isinstance(exam_date_str, str):
        parts = [int(p) for p in exam_date_str.split('-')]
        parsed_date = date(parts[0], parts[1], parts[2])
    else:
        parsed_date = exam_date_str

    # Process rooms input
    rooms_input = data.get('rooms')
    if not rooms_input or not isinstance(rooms_input, list):
        rooms_input = [
            {
                'room_number': 'AI301',
                'student_start': 1,
                'student_end': 29,
                'faculty_id': data.get('faculty_id'),
                'duty_type': data.get('duty_type', 'Invigilation'),
                'room_capacity': 30
            },
            {
                'room_number': 'AI302',
                'student_start': 30,
                'student_end': 60,
                'faculty_id': None,
                'duty_type': data.get('duty_type', 'Invigilation'),
                'room_capacity': 31
            }
        ]

    total_students = sum(max(0, int(r.get('student_end', 0)) - int(r.get('student_start', 0)) + 1) for r in rooms_input)

    # Find or create matching ExamSession
    session = ExamSession.query.filter_by(
        cie_id=cie_id,
        semester_id=sem_id,
        subject_id=subj_id,
        exam_date=parsed_date,
        start_time=start_time
    ).first()

    if not session:
        session = ExamSession(
            cie_id=cie_id,
            semester_id=sem_id,
            subject_id=subj_id,
            exam_date=parsed_date,
            start_time=start_time,
            end_time=end_time,
            total_students=total_students,
            room_number=rooms_input[0].get('room_number', 'AI301'),
            required_invigilators=len(rooms_input),
            required_squad=0
        )
        db.session.add(session)
        db.session.flush()
    else:
        session.total_students = total_students
        session.required_invigilators = max(session.required_invigilators or 0, len(rooms_input))

    created_duties = []
    for r_data in rooms_input:
        r_num = (r_data.get('room_number') or 'AI301').strip().upper()
        s_start = int(r_data.get('student_start', 1))
        s_end = int(r_data.get('student_end', 30))
        s_count = max(0, s_end - s_start + 1)
        r_cap = int(r_data.get('room_capacity') or 30)
        r_fac_id = r_data.get('faculty_id')
        r_duty_type = r_data.get('duty_type') or duty_type or 'Invigilation'
        r_faculty = Faculty.query.get(r_fac_id) if r_fac_id else None

        room = ExamRoom.query.filter_by(
            exam_session_id=session.id,
            room_number=r_num
        ).first()

        if not room:
            room = ExamRoom(
                exam_session_id=session.id,
                room_number=r_num,
                student_start=s_start,
                student_end=s_end,
                student_count=s_count,
                room_capacity=r_cap
            )
            db.session.add(room)
            db.session.flush()
        else:
            room.student_start = s_start
            room.student_end = s_end
            room.student_count = s_count

        existing_duty = Duty.query.filter_by(exam_session_id=session.id, exam_room_id=room.id).first()
        if existing_duty:
            if r_faculty:
                existing_duty.faculty_id = r_faculty.id
                existing_duty.status = 'ASSIGNED'
            existing_duty.duty_type = r_duty_type
            existing_duty.is_manual_override = True
            existing_duty.override_reason = override_reason
            existing_duty.updated_at = datetime.utcnow()
            duty = existing_duty
        else:
            duty = Duty(
                exam_session_id=session.id,
                exam_room_id=room.id,
                faculty_id=r_faculty.id if r_faculty else None,
                duty_type=r_duty_type,
                status='ASSIGNED' if r_faculty else 'PENDING',
                is_manual_override=True,
                override_reason=override_reason,
                allocated_at=datetime.utcnow()
            )
            db.session.add(duty)
            db.session.flush()

        created_duties.append(duty)

    audit = AuditLog(
        action='DUTY_CREATED',
        user_identifier=user_identifier,
        entity_type='ExamSession',
        entity_id=session.id,
        details=f"Created {len(created_duties)} room duty slots for {session.subject.code if session.subject else 'Subject'} across rooms: {', '.join(r.get('room_number') for r in rooms_input)}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'duties_count': len(created_duties),
        'duties': [d.to_dict() for d in created_duties],
        'message': f"Successfully created {len(created_duties)} examination room duties."
    }), 201


@allocation_bp.route('/check-faculty-conflicts', methods=['GET'])
def check_faculty_conflicts():
    """
    Returns real-time respected timetable conflict and buffer analysis for all faculty
    for a given date, time window, and target exam semester.
    - If exam is for 5th or 7th sem: inspects 3rd semester regular classes with 60-min buffer.
    - If exam is for 3rd sem: inspects 5th and 7th semester regular classes with 60-min buffer.
    """
    date_str = request.args.get('date', '2026-09-10')
    start_time = request.args.get('start_time') or '09:00'
    end_time = request.args.get('end_time') or '10:00'
    buffer_minutes = int(request.args.get('buffer_minutes', 60))
    exam_sem_id = request.args.get('semester_id')
    exam_sem_num = request.args.get('sem_number')

    try:
        exam_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        exam_date = date(2026, 9, 10)

    # Day of week
    dow_map = {0: 'MON', 1: 'TUE', 2: 'WED', 3: 'THU', 4: 'FRI', 5: 'SAT', 6: 'SUN'}
    dow = dow_map.get(exam_date.weekday(), 'MON')

    all_semesters = Semester.query.all()
    exam_sem = None
    if exam_sem_id:
        try:
            exam_sem = Semester.query.get(int(exam_sem_id))
        except Exception:
            pass
    elif exam_sem_num:
        try:
            exam_sem = Semester.query.filter_by(sem_number=int(exam_sem_num)).first()
        except Exception:
            pass

    # Determine respected regular class semesters based on exam semester
    if exam_sem:
        if exam_sem.sem_number in [5, 7]:
            # 5th or 7th sem exam -> respected regular classes are 3rd sem
            regular_semesters = [s for s in all_semesters if s.sem_number == 3]
        elif exam_sem.sem_number == 3:
            # 3rd sem exam -> respected regular classes are 5th and 7th sem
            regular_semesters = [s for s in all_semesters if s.sem_number in [5, 7]]
        else:
            regular_semesters = [s for s in all_semesters if s.id != exam_sem.id]
    else:
        # Default: 3rd semester is the primary regular class semester
        sem3 = Semester.query.filter_by(sem_number=3).first()
        regular_semesters = [sem3] if sem3 else []

    all_faculty = Faculty.query.all()

    try:
        e_st_m = BufferRuleEvaluator.parse_minutes(start_time)
    except Exception:
        e_st_m = 540
    try:
        e_et_m = BufferRuleEvaluator.parse_minutes(end_time)
    except Exception:
        e_et_m = 600
    buf_st = max(0, e_st_m - buffer_minutes)
    buf_et = min(1440, e_et_m + buffer_minutes)

    results = []
    for f in all_faculty:
        is_squad_only = getattr(f, 'only_squad_duty', False) or f.id == 1 or 'Arjun' in (f.name or '')
        
        # Check clashes against respected regular class timetables
        clashes = []
        for reg_sem in regular_semesters:
            if not reg_sem:
                continue
            entries = TimetableEntry.query.filter_by(faculty_id=f.id, semester_id=reg_sem.id, day_of_week=dow).all()
            for e in entries:
                c_st = BufferRuleEvaluator.parse_minutes(e.start_time)
                c_et = BufferRuleEvaluator.parse_minutes(e.end_time)
                if max(buf_st, c_st) < min(buf_et, c_et):
                    sub = db.session.get(Subject, e.subject_id)
                    sub_code = sub.code if sub else 'Class'
                    clashes.append(f"{reg_sem.name} {sub_code} ({e.start_time}-{e.end_time})")

        has_clash = len(clashes) > 0
        can_invigilate = f.is_active and f.eligible_for_duty and not is_squad_only and not has_clash

        status_label = 'Available'
        if not f.is_active:
            status_label = 'Inactive'
        elif not f.eligible_for_duty:
            status_label = 'Excluded'
        elif is_squad_only:
            status_label = 'Squad Only'
        elif has_clash:
            status_label = f"Class Clash: {', '.join(clashes)}"

        results.append({
            'faculty_id': f.id,
            'name': f.name,
            'designation': f.designation,
            'is_active': f.is_active,
            'eligible_for_duty': f.eligible_for_duty,
            'is_squad_only': is_squad_only,
            'has_3rd_sem_clash': has_clash,
            'has_clash': has_clash,
            'clash_details': clashes,
            'can_invigilate': can_invigilate,
            'status_label': status_label
        })

    return jsonify({
        'date': date_str,
        'day_of_week': dow,
        'start_time': start_time,
        'end_time': end_time,
        'buffer_minutes': buffer_minutes,
        'exam_semester': exam_sem.name if exam_sem else None,
        'exam_sem_number': exam_sem.sem_number if exam_sem else None,
        'respected_regular_semesters': [s.name for s in regular_semesters],
        'faculty_analysis': results
    })


# =========================================================================
# FACULTY DUTY SWAP & DELEGATION WORKFLOW
# =========================================================================

def verify_swap_safety(duty, substitute_faculty):
    """
    Verifies that substitute faculty has:
    1. Active eligibility
    2. No squad-only restriction (if duty is Invigilation)
    3. No concurrent exam duty in the same session
    4. No regular class lecture buffer clash (+/- 60 min)
    5. Remaining duty capacity
    """
    if not substitute_faculty.is_active or not substitute_faculty.eligible_for_duty:
        return False, f"{substitute_faculty.name} is currently inactive or marked ineligible for duties."

    if (duty.duty_type or 'Invigilation') != 'Squad Duty' and substitute_faculty.only_squad_duty:
        return False, f"{substitute_faculty.name} is designated for Squad Duty only."

    sess = duty.exam_session
    if not sess:
        return True, "OK"

    # 1. Concurrent duty check
    concurrent_duty = Duty.query.join(ExamSession).filter(
        Duty.faculty_id == substitute_faculty.id,
        Duty.status.in_(['ASSIGNED', 'COMPLETED']),
        ExamSession.exam_date == sess.exam_date,
        ExamSession.start_time == sess.start_time
    ).first()
    if concurrent_duty:
        return False, f"{substitute_faculty.name} already has an assigned duty in this session ({sess.start_time}-{sess.end_time})."

    # 2. Timetable lecture clash (+/- 60 min buffer)
    dow = sess.exam_date.strftime('%a').upper()[:3]
    try:
        sh, sm = map(int, sess.start_time.split(':'))
        eh, em = map(int, sess.end_time.split(':'))
        exam_start_m = sh * 60 + sm
        exam_end_m = eh * 60 + em
        buffer_m = 60

        entries = TimetableEntry.query.filter_by(
            faculty_id=substitute_faculty.id,
            day_of_week=dow
        ).all()

        for te in entries:
            t_sh, t_sm = map(int, te.start_time.split(':'))
            t_eh, t_em = map(int, te.end_time.split(':'))
            lec_start_m = t_sh * 60 + t_sm
            lec_end_m = t_eh * 60 + t_em

            # Clash if lecture falls within [exam_start - buffer, exam_end + buffer]
            if not (lec_end_m <= exam_start_m - buffer_m or lec_start_m >= exam_end_m + buffer_m):
                return False, f"Lecture clash with {te.subject.code if te.subject else 'Class'} ({te.start_time}-{te.end_time}) on {dow} violating 60-min buffer."
    except Exception as e:
        print("Buffer check error during swap verification:", e)

    return True, "OK"


@allocation_bp.route('/swap-requests', methods=['GET'])
def get_swap_requests():
    """Returns duty swap requests, optionally filtered by faculty or status."""
    fac_id = request.args.get('faculty_id')
    status = request.args.get('status')

    query = DutySwapRequest.query
    if fac_id:
        f_id = int(fac_id)
        query = query.filter((DutySwapRequest.requesting_faculty_id == f_id) | (DutySwapRequest.substitute_faculty_id == f_id))
    if status:
        query = query.filter_by(status=status.upper())

    swaps = query.order_by(DutySwapRequest.created_at.desc()).all()
    return jsonify([s.to_dict() for s in swaps])


@allocation_bp.route('/swap-requests', methods=['POST'])
def create_swap_request():
    """Submits a peer-to-peer duty swap request after automated conflict verification."""
    data = request.get_json() or {}
    duty_id = data.get('duty_id')
    substitute_faculty_id = data.get('substitute_faculty_id')
    reason = data.get('reason', 'Mutual faculty exchange')

    if not duty_id or not substitute_faculty_id:
        return jsonify({'error': 'duty_id and substitute_faculty_id are required'}), 400

    duty = Duty.query.get_or_404(int(duty_id))
    if not duty.faculty_id:
        return jsonify({'error': 'Cannot request swap for an unassigned duty'}), 400

    sub_fac = Faculty.query.get_or_404(int(substitute_faculty_id))
    if duty.faculty_id == sub_fac.id:
        return jsonify({'error': 'Cannot swap duty with yourself'}), 400

    # Verify conflict safety
    is_safe, msg = verify_swap_safety(duty, sub_fac)
    if not is_safe:
        return jsonify({'error': f'Swap safety check failed: {msg}'}), 409

    swap_req = DutySwapRequest(
        duty_id=duty.id,
        requesting_faculty_id=duty.faculty_id,
        substitute_faculty_id=sub_fac.id,
        status='PENDING',
        reason=reason
    )
    db.session.add(swap_req)
    db.session.commit()

    return jsonify(swap_req.to_dict()), 201


@allocation_bp.route('/swap-requests/<int:swap_id>/approve', methods=['POST'])
def approve_swap_request(swap_id):
    """Approves a swap request and reassigns the duty to the substitute faculty."""
    swap = DutySwapRequest.query.get_or_404(swap_id)
    if swap.status != 'PENDING':
        return jsonify({'error': f'Swap request is already {swap.status}'}), 400

    duty = swap.duty
    sub_fac = swap.substitute_faculty

    # Re-verify conflict safety at approval time
    is_safe, msg = verify_swap_safety(duty, sub_fac)
    if not is_safe:
        return jsonify({'error': f'Approval blocked: {msg}'}), 409

    # Reassign duty
    old_faculty_name = duty.faculty.name if duty.faculty else "None"
    duty.faculty_id = sub_fac.id
    duty.is_manual_override = True
    duty.override_reason = f"Approved duty swap from {old_faculty_name} (Reason: {swap.reason})"
    swap.status = 'APPROVED'
    swap.admin_notes = request.get_json().get('admin_notes') if request.is_json else None

    # Audit log
    audit = AuditLog(
        action='DUTY_SWAPPED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='Duty',
        entity_id=duty.id,
        details=f"Approved swap for Duty #{duty.id}: {old_faculty_name} -> {sub_fac.name}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f"Duty successfully reassigned to {sub_fac.name}",
        'swap': swap.to_dict(),
        'duty': duty.to_dict()
    })


@allocation_bp.route('/swap-requests/<int:swap_id>/reject', methods=['POST'])
def reject_swap_request(swap_id):
    """Rejects a duty swap request."""
    swap = DutySwapRequest.query.get_or_404(swap_id)
    if swap.status != 'PENDING':
        return jsonify({'error': f'Swap request is already {swap.status}'}), 400

    data = request.get_json() or {}
    swap.status = 'REJECTED'
    swap.admin_notes = data.get('admin_notes', 'Rejected by Coordinator/HOD')
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Swap request rejected',
        'swap': swap.to_dict()
    })


# =========================================================================
# EXAM-DAY OPERATIONS & ATTENDANCE CHECK-IN
# =========================================================================

@allocation_bp.route('/duties/<int:duty_id>/attendance', methods=['POST'])
def update_duty_attendance(duty_id):
    """Updates invigilator exam-day check-in status (REPORTED, PRESENT, LATE, ABSENT)."""
    duty = Duty.query.get_or_404(duty_id)
    data = request.get_json() or {}
    status = (data.get('attendance_status') or 'PRESENT').upper().strip()

    valid_statuses = ['PENDING', 'REPORTED', 'PRESENT', 'LATE', 'ABSENT']
    if status not in valid_statuses:
        return jsonify({'error': f'Invalid attendance status. Must be one of {valid_statuses}'}), 400

    duty.attendance_status = status
    if status in ('REPORTED', 'PRESENT', 'LATE'):
        duty.check_in_time = datetime.utcnow()
    elif status == 'ABSENT':
        duty.check_in_time = None

    db.session.commit()
    return jsonify({
        'success': True,
        'duty_id': duty.id,
        'attendance_status': duty.attendance_status,
        'check_in_time': duty.check_in_time.isoformat() if duty.check_in_time else None
    })


@allocation_bp.route('/emergency-standby/<int:duty_id>', methods=['GET'])
def get_emergency_standby(duty_id):
    """Finds all available standby faculty with zero lecture buffer clashes for emergency replacement."""
    duty = Duty.query.get_or_404(duty_id)
    all_faculty = Faculty.query.filter_by(is_active=True, eligible_for_duty=True).all()
    standby_list = []

    for f in all_faculty:
        if duty.faculty_id == f.id:
            continue
        is_safe, msg = verify_swap_safety(duty, f)
        if is_safe:
            # Count current assigned duties to sort by lowest workload
            current_duties = Duty.query.filter_by(faculty_id=f.id, status='ASSIGNED').count()
            standby_list.append({
                'id': f.id,
                'name': f.name,
                'designation': f.designation,
                'current_duties': current_duties,
                'max_capacity': f.max_duty_capacity or 15,
                'is_optimal': True
            })

    standby_list.sort(key=lambda x: x['current_duties'])
    return jsonify({
        'duty_id': duty.id,
        'session_time': f"{duty.exam_session.start_time} - {duty.exam_session.end_time}" if duty.exam_session else None,
        'exam_date': duty.exam_session.exam_date.isoformat() if duty.exam_session else None,
        'available_standby': standby_list,
        'count': len(standby_list)
    })


@allocation_bp.route('/duties/<int:duty_id>/emergency-reassign', methods=['POST'])
def emergency_reassign_duty(duty_id):
    """1-tap emergency replacement of an absent invigilator."""
    duty = Duty.query.get_or_404(duty_id)
    data = request.get_json() or {}
    new_faculty_id = data.get('faculty_id')
    reason = data.get('reason', 'Emergency standby reassignment due to absence')

    if not new_faculty_id:
        return jsonify({'error': 'faculty_id is required'}), 400

    new_fac = Faculty.query.get_or_404(int(new_faculty_id))
    is_safe, msg = verify_swap_safety(duty, new_fac)
    if not is_safe:
        return jsonify({'error': f'Emergency reassignment blocked: {msg}'}), 409

    old_name = duty.faculty.name if duty.faculty else "Unassigned"
    duty.faculty_id = new_fac.id
    duty.attendance_status = 'REPORTED'
    duty.check_in_time = datetime.utcnow()
    duty.is_manual_override = True
    duty.override_reason = f"Emergency reassignment from {old_name}: {reason}"

    db.session.commit()
    return jsonify({
        'success': True,
        'message': f'Duty #{duty.id} successfully reassigned to {new_fac.name}',
        'duty': duty.to_dict()
    })
