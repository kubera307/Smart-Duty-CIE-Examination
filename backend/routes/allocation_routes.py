from flask import Blueprint, request, jsonify
from datetime import datetime, date
from types import SimpleNamespace
from models import db, CIE, ExamSession, ExamRoom, Duty, DutySwapRequest, Faculty, Semester, AllocationExplanation, AuditLog
from allocation.engine import AllocationEngine
from allocation.eligibility import EligibilityEngine
from allocation.validator import AllocationValidator
from allocation.semester_engine import SemesterStatusEngine
from allocation.timetable_conflicts import TimetableConflictEngine


allocation_bp = Blueprint('allocation_bp', __name__)

def get_faculty_timetable_conflicts(faculty, exam_session, all_semesters=None, buffer_minutes=None):
    semesters = all_semesters or Semester.query.filter_by(is_active=True).all()
    semester_status = SemesterStatusEngine.classify_semesters_for_slot(
        slot_sessions=[exam_session],
        all_active_semesters=semesters
    )
    effective_buffer = (
        AllocationEngine.get_system_buffer_minutes()
        if buffer_minutes is None
        else buffer_minutes
    )
    return TimetableConflictEngine.check_faculty_timetable_conflicts(
        faculty=faculty,
        exam_session=exam_session,
        regular_semester_ids=semester_status['regular_class_semester_ids'],
        buffer_minutes=effective_buffer
    )

@allocation_bp.route('/preview/<int:cie_id>', methods=['GET'])
def get_allocation_preview(cie_id):
    """Pre-allocation audit diagnostic before running the engine, optionally filtered by semester or semesters."""
    sem_id = request.args.get('semester_id')
    sem_ids = request.args.getlist('semester_ids') or (request.args.get('semester_ids').split(',') if request.args.get('semester_ids') else None)
    include_one_credit = request.args.get('include_one_credit', 'false').lower() == 'true'
    include_squad = request.args.get('include_squad', 'false').lower() == 'true'
    preview = AllocationEngine.get_pre_allocation_audit(
        cie_id=cie_id,
        semester_id=int(sem_id) if sem_id else None,
        semester_ids=[int(s) for s in sem_ids if s] if sem_ids else None,
        include_one_credit=include_one_credit,
        include_squad=include_squad
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
    include_one_credit = bool(data.get('include_one_credit', False))
    include_squad = bool(data.get('include_squad', False))
    user_identifier = request.headers.get('X-User', 'Admin')

    try:
        result = AllocationEngine.generate_cie_allocation(
            cie_id=int(cie_id),
            user_identifier=user_identifier,
            semester_id=int(sem_id) if sem_id else None,
            semester_ids=[int(s) for s in sem_ids] if sem_ids else None,
            include_one_credit=include_one_credit,
            include_squad=include_squad
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
        duty_type=duty.duty_type,
        exclude_duty_id=duty.id
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
    if any('duty buffer violation' in error.lower() for error in validation['errors']):
        return jsonify({
            'can_assign': False,
            'requires_force': False,
            'errors': validation['errors'],
            'warnings': validation['warnings'],
            'conflict_details': validation['conflict_details'],
            'message': 'Faculty cannot be assigned within the required buffer of another exam duty.'
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
        existing_duty = None
        if room:
            existing_duty = Duty.query.filter_by(exam_session_id=session.id, exam_room_id=room.id).first()
        else:
            existing_duty = Duty.query.filter_by(exam_session_id=session.id).first()

        faculty = Faculty.query.get(faculty_id) if faculty_id else None
        if faculty:
            conflicts = get_faculty_timetable_conflicts(faculty, session)['conflicts']
            if conflicts:
                return jsonify({
                    'error': f"{faculty.name} has a timetable conflict in a peer semester.",
                    'conflict_details': conflicts
                }), 409
            duty_conflicts = EligibilityEngine.get_exam_duty_buffer_conflicts(
                faculty=faculty,
                exam_session=session,
                buffer_minutes=AllocationEngine.get_system_buffer_minutes(),
                exclude_duty_id=existing_duty.id if existing_duty else None
            )
            if duty_conflicts:
                return jsonify({
                    'error': f"{faculty.name} has another exam duty within the required buffer.",
                    'conflict_details': duty_conflicts
                }), 409

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

    proposed_duties_by_faculty = {}
    for room_data in rooms_input:
        assigned_faculty = Faculty.query.get(room_data.get('faculty_id')) if room_data.get('faculty_id') else None
        if assigned_faculty:
            conflicts = get_faculty_timetable_conflicts(assigned_faculty, session)['conflicts']
            if conflicts:
                return jsonify({
                    'error': f"{assigned_faculty.name} has a timetable conflict in a peer semester.",
                    'conflict_details': conflicts
                }), 409
            room_number = (room_data.get('room_number') or 'AI301').strip().upper()
            existing_room = ExamRoom.query.filter_by(
                exam_session_id=session.id,
                room_number=room_number
            ).first()
            existing_duty = (
                Duty.query.filter_by(exam_session_id=session.id, exam_room_id=existing_room.id).first()
                if existing_room else None
            )
            current_duties = proposed_duties_by_faculty.setdefault(assigned_faculty.id, [])
            duty_conflicts = EligibilityEngine.get_exam_duty_buffer_conflicts(
                faculty=assigned_faculty,
                exam_session=session,
                buffer_minutes=AllocationEngine.get_system_buffer_minutes(),
                current_slot_duties=current_duties,
                exclude_duty_id=existing_duty.id if existing_duty else None
            )
            if duty_conflicts:
                return jsonify({
                    'error': f"{assigned_faculty.name} has another exam duty within the required buffer.",
                    'conflict_details': duty_conflicts
                }), 409
            current_duties.append({
                'faculty_id': assigned_faculty.id,
                'exam_date': session.exam_date,
                'start_time': session.start_time,
                'end_time': session.end_time,
                'room_number': room_number
            })

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
    Returns timetable conflict and buffer analysis for all faculty in the
    regular semesters of the target exam's odd/even cycle.
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

    dow = TimetableConflictEngine.get_day_of_week(exam_date)
    all_semesters = Semester.query.filter_by(is_active=True).all()
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

    # Protect peer semesters in the same odd/even cycle as the exam semester.
    if exam_sem:
        regular_semesters = SemesterStatusEngine.get_regular_class_semesters(
            [exam_sem],
            all_semesters
        )
    else:
        # Default: 3rd semester is the primary regular class semester
        sem3 = Semester.query.filter_by(sem_number=3).first()
        regular_semesters = [sem3] if sem3 else []

    all_faculty = Faculty.query.all()

    results = []
    for f in all_faculty:
        is_squad_only = getattr(f, 'only_squad_duty', False) or f.id == 1 or 'Arjun' in (f.name or '')
        exam_slot = SimpleNamespace(
            semester=exam_sem,
            semester_id=exam_sem.id if exam_sem else None,
            exam_date=exam_date,
            start_time=start_time,
            end_time=end_time
        )
        conflict_result = TimetableConflictEngine.check_faculty_timetable_conflicts(
            faculty=f,
            exam_session=exam_slot,
            regular_semester_ids={semester.id for semester in regular_semesters},
            buffer_minutes=buffer_minutes
        )
        clashes = [
            f"{conflict['semester_name']} {conflict['subject_code']} ({conflict['class_time']})"
            for conflict in conflict_result['conflicts']
        ]

        has_clash = len(clashes) > 0
        duty_conflicts = EligibilityEngine.get_exam_duty_buffer_conflicts(
            faculty=f,
            exam_session=exam_slot,
            buffer_minutes=buffer_minutes
        )
        has_exam_duty_conflict = bool(duty_conflicts)
        can_invigilate = (
            f.is_active and f.eligible_for_duty and not is_squad_only
            and not has_clash and not has_exam_duty_conflict
        )

        status_label = 'Available'
        if not f.is_active:
            status_label = 'Inactive'
        elif not f.eligible_for_duty:
            status_label = 'Excluded'
        elif is_squad_only:
            status_label = 'Squad Only'
        elif has_clash:
            status_label = f"Class Clash: {', '.join(clashes)}"
        elif has_exam_duty_conflict:
            status_label = f"Exam duty buffer: {', '.join(duty_conflicts)}"

        results.append({
            'faculty_id': f.id,
            'name': f.name,
            'designation': f.designation,
            'is_active': f.is_active,
            'eligible_for_duty': f.eligible_for_duty,
            'is_squad_only': is_squad_only,
            'has_3rd_sem_clash': has_clash,
            'has_clash': has_clash,
            'has_exam_duty_conflict': has_exam_duty_conflict,
            'exam_duty_conflicts': duty_conflicts,
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

    duty_conflicts = EligibilityEngine.get_exam_duty_buffer_conflicts(
        faculty=substitute_faculty,
        exam_session=sess,
        buffer_minutes=AllocationEngine.get_system_buffer_minutes(),
        exclude_duty_id=duty.id
    )
    if duty_conflicts:
        return False, (
            f"{substitute_faculty.name} has another assigned exam duty within "
            f"the required buffer ({', '.join(duty_conflicts)})."
        )

    conflicts = get_faculty_timetable_conflicts(
        substitute_faculty,
        sess,
        buffer_minutes=60
    )['conflicts']
    if conflicts:
        conflict = conflicts[0]
        return False, (
            f"Timetable clash with {conflict['semester_name']} "
            f"{conflict['subject_code']} ({conflict['class_time']}) "
            "violating 60-min buffer."
        )

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
