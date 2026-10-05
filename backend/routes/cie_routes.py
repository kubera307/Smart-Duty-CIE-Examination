from flask import Blueprint, request, jsonify
from datetime import datetime, date, timedelta
from collections import defaultdict
from models import db, CIE, ExamSession, ExamRoom, Subject, Semester, AuditLog, Duty, Faculty, TimetableEntry, SystemSettings
from allocation.buffer_rules import BufferRuleEvaluator

cie_bp = Blueprint('cie_bp', __name__)

@cie_bp.route('', methods=['GET'])
def get_cies():
    """Returns list of CIEs with live computed statistics. Supports ?academic_year= filter."""
    academic_year = request.args.get('academic_year')
    query = CIE.query
    if academic_year:
        query = query.filter_by(academic_year=academic_year.strip())
    cies = query.order_by(CIE.start_date).all()
    return jsonify([c.to_dict(include_stats=True) for c in cies])


@cie_bp.route('/academic-years', methods=['GET'])
def get_academic_years():
    """Returns all available distinct academic years across CIEs and Semesters."""
    cie_years = [r[0] for r in db.session.query(CIE.academic_year).distinct().all() if r[0]]
    sem_years = [r[0] for r in db.session.query(Semester.academic_year).distinct().all() if r[0]]

    combined = set()
    for y in cie_years + sem_years + ['2026-27', '2027-28']:
        if y and y.strip() != '2025-26':
            combined.add(y.strip())

    sorted_years = sorted(list(combined))
    current_year = '2027-28'
    setting = SystemSettings.query.filter_by(key='academic_year').first()
    if setting and setting.value:
        current_year = setting.value

    return jsonify({
        'academic_years': sorted_years,
        'current_year': current_year
    })


@cie_bp.route('/academic-years', methods=['POST'])
def create_academic_year():
    """
    Creates standard CIE cycles (CIE-I, CIE-II, CIE-III) for a new academic year
    so its duties, schedules, and analytics are stored separately.
    """
    data = request.get_json() or {}
    year = (data.get('academic_year') or '').strip()
    if not year:
        return jsonify({'error': 'academic_year is required (e.g. 2027-28 or 2027-2028)'}), 400

    existing_cies = CIE.query.filter_by(academic_year=year).all()
    if not existing_cies:
        try:
            y_num = int(year.split('-')[0])
        except Exception:
            y_num = 2027

        cies_to_add = [
            CIE(
                name='CIE-I',
                academic_year=year,
                start_date=date(y_num, 9, 10),
                end_date=date(y_num, 9, 12),
                status='UPCOMING',
                is_current=False
            ),
            CIE(
                name='CIE-II',
                academic_year=year,
                start_date=date(y_num, 10, 22),
                end_date=date(y_num, 10, 24),
                status='UPCOMING',
                is_current=False
            ),
            CIE(
                name='CIE-III',
                academic_year=year,
                start_date=date(y_num, 11, 26),
                end_date=date(y_num, 11, 28),
                status='UPCOMING',
                is_current=False
            )
        ]
        db.session.add_all(cies_to_add)
        db.session.commit()

    return jsonify({
        'message': f'Academic year {year} is ready with separate CIE cycles.',
        'academic_year': year
    }), 201


@cie_bp.route('/academic-years/current', methods=['POST'])
def set_current_academic_year():
    data = request.get_json() or {}
    year = (data.get('academic_year') or '').strip()
    if not year:
        return jsonify({'error': 'academic_year is required'}), 400

    setting = SystemSettings.query.filter_by(key='academic_year').first()
    if not setting:
        setting = SystemSettings(key='academic_year', value=year, description='Active Academic Year')
        db.session.add(setting)
    else:
        setting.value = year
    db.session.commit()
    return jsonify({'message': f'Current academic year updated to {year}', 'current_year': year})


@cie_bp.route('/<int:cie_id>', methods=['GET'])
def get_cie(cie_id):
    cie = CIE.query.get_or_404(cie_id)
    return jsonify(cie.to_dict(include_stats=True))


@cie_bp.route('/<int:cie_id>/sessions', methods=['GET'])
def get_cie_sessions(cie_id):
    """
    Returns exam sessions for a CIE with room breakdown and duty allocation status.
    Supports optional ?semester_id= filter to view 5th or 7th sem separately.
    """
    sem_id = request.args.get('semester_id')
    query = ExamSession.query.filter_by(cie_id=cie_id)
    if sem_id:
        query = query.filter_by(semester_id=int(sem_id))

    sessions = query.order_by(ExamSession.exam_date, ExamSession.start_time).all()
    return jsonify([s.to_dict() for s in sessions])


@cie_bp.route('/<int:cie_id>/sessions', methods=['POST'])
def create_session(cie_id):
    """
    Creates a new exam session with multiple exam rooms and student ranges.
    """
    cie = CIE.query.get_or_404(cie_id)
    data = request.get_json() or {}

    required = ['semester_id', 'subject_id', 'exam_date', 'start_time', 'end_time']
    for f in required:
        if not data.get(f):
            return jsonify({'error': f'Field {f} is required'}), 400

    try:
        e_date = datetime.strptime(data['exam_date'], '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date format. Expected YYYY-MM-DD'}), 400

    rooms_data = data.get('rooms', [])
    total_students = int(data.get('total_students') or 60)
    primary_room = rooms_data[0].get('room_number', 'AI301') if rooms_data else data.get('room_number', 'AI301')

    session = ExamSession(
        cie_id=cie.id,
        semester_id=int(data['semester_id']),
        subject_id=int(data['subject_id']),
        exam_date=e_date,
        start_time=data['start_time'].strip(),
        end_time=data['end_time'].strip(),
        total_students=total_students,
        room_number=primary_room,
        required_invigilators=len(rooms_data) if rooms_data else int(data.get('required_invigilators', 1)),
        required_squad=int(data.get('required_squad', 0))
    )
    db.session.add(session)
    db.session.flush()

    # Create associated ExamRoom entities
    if rooms_data:
        for r in rooms_data:
            r_num = r.get('room_number', 'AI301').strip()
            s_start = int(r.get('student_start', 1))
            s_end = int(r.get('student_end', 30))
            count = max(0, s_end - s_start + 1)
            capacity = int(r.get('room_capacity', 30))

            room_obj = ExamRoom(
                exam_session_id=session.id,
                room_number=r_num,
                student_start=s_start,
                student_end=s_end,
                student_count=count,
                room_capacity=capacity
            )
            db.session.add(room_obj)
    else:
        # Fallback default room
        room_obj = ExamRoom(
            exam_session_id=session.id,
            room_number=primary_room,
            student_start=1,
            student_end=total_students,
            student_count=total_students,
            room_capacity=max(30, total_students)
        )
        db.session.add(room_obj)

    db.session.flush()

    audit = AuditLog(
        action='EXAM_SESSION_CREATED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='ExamSession',
        entity_id=session.id,
        details=f"Created exam session for {session.subject.code} ({session.semester.name}) with {len(session.exam_rooms)} rooms on {e_date.isoformat()}."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify(session.to_dict()), 201


@cie_bp.route('/auto-split-rooms', methods=['POST'])
def auto_split_rooms():
    """
    Utility endpoint to automatically partition total students into sequential room ranges based on capacities.
    """
    data = request.get_json() or {}
    total_students = int(data.get('total_students', 60))
    rooms_input = data.get('rooms', [])

    if not rooms_input:
        half = total_students // 2
        return jsonify({
            'rooms': [
                {'room_number': 'AI301', 'room_capacity': 30, 'student_start': 1, 'student_end': half, 'student_count': half},
                {'room_number': 'AI302', 'room_capacity': 30, 'student_start': half + 1, 'student_end': total_students, 'student_count': total_students - half}
            ]
        })

    result_rooms = []
    current_start = 1
    remaining = total_students

    for i, r in enumerate(rooms_input):
        capacity = int(r.get('room_capacity', 30))
        room_num = r.get('room_number', f"Room-{i+1}").strip() or f"Room-{i+1}"

        if i == len(rooms_input) - 1:
            count = max(0, remaining)
        else:
            count = min(capacity, remaining)

        end_num = current_start + count - 1 if count > 0 else current_start
        result_rooms.append({
            'room_number': room_num,
            'room_capacity': capacity,
            'student_start': current_start,
            'student_end': end_num,
            'student_count': count
        })
        current_start = end_num + 1
        remaining -= count

    return jsonify({'rooms': result_rooms})


@cie_bp.route('/<int:cie_id>/setup-5th-7th', methods=['POST'])
def setup_5th_7th_sessions(cie_id):
    """
    Sets up the official CIE-1 exam sessions for 5th & 7th Semesters with room splitting:
    - 5th Semester (09:00 - 10:00 AM): 60 students split into AI301 (1-29) and AI302 (30-60).
    - 7th Semester (12:00 - 01:00 PM): 60 students split into AI301 (1-30) and AI302 (31-60).
    """
    cie = CIE.query.get_or_404(cie_id)
    sem5 = Semester.query.filter_by(sem_number=5).first()
    sem7 = Semester.query.filter_by(sem_number=7).first()

    if not sem5 or not sem7:
        return jsonify({'error': '5th or 7th Semester not configured'}), 400

    sub5_map = {s.code: s for s in Subject.query.filter_by(semester_id=sem5.id).all()}
    sub7_map = {s.code: s for s in Subject.query.filter_by(semester_id=sem7.id).all()}

    # Multi-room schedule specifications:
    # (sem_id, subj_code, date, start_time, end_time, total_students, rooms_list)
    schedule = [
        # 10 September
        (sem5.id, sub5_map.get('24AI501'), date(2026, 9, 10), '09:00', '10:00', 60, [
            ('AI301', 30, 1, 29),
            ('AI302', 30, 30, 60),
        ]),
        (sem7.id, sub7_map.get('23AI701'), date(2026, 9, 10), '12:00', '13:00', 60, [
            ('AI301', 30, 1, 29),
            ('AI302', 30, 30, 60),
        ]),
        # 11 September
        (sem5.id, sub5_map.get('24AI502'), date(2026, 9, 11), '09:00', '10:00', 60, [
            ('AI301', 30, 1, 29),
            ('AI302', 30, 30, 60),
        ]),
        (sem7.id, sub7_map.get('23AI702'), date(2026, 9, 11), '12:00', '13:00', 60, [
            ('AI301', 30, 1, 29),
            ('AI302', 30, 30, 60),
        ]),
        # 12 September
        (sem5.id, sub5_map.get('24AI503'), date(2026, 9, 12), '09:00', '10:00', 60, [
            ('AI301', 30, 1, 29),
            ('AI302', 30, 30, 60),
        ]),
        (sem7.id, sub7_map.get('23AI703'), date(2026, 9, 12), '12:00', '13:00', 60, [
            ('AI301', 30, 1, 29),
            ('AI302', 30, 30, 60),
        ]),
    ]

    # Remove existing 5th and 7th sem sessions for this CIE to avoid duplicates
    existing_sessions = ExamSession.query.filter(
        ExamSession.cie_id == cie.id,
        ExamSession.semester_id.in_([sem5.id, sem7.id])
    ).all()
    for s in existing_sessions:
        db.session.delete(s)
    db.session.flush()

    created_sessions = []
    total_rooms_count = 0
    for sem_id, subj, dt, st, et, tot_stud, rooms in schedule:
        if subj:
            sess = ExamSession(
                cie_id=cie.id,
                semester_id=sem_id,
                subject_id=subj.id,
                exam_date=dt,
                start_time=st,
                end_time=et,
                total_students=tot_stud,
                room_number='AI301',
                required_invigilators=len(rooms),
                required_squad=0
            )
            db.session.add(sess)
            db.session.flush()

            for r_num, r_cap, s_start, s_end in rooms:
                count = max(0, s_end - s_start + 1)
                room_obj = ExamRoom(
                    exam_session_id=sess.id,
                    room_number=r_num,
                    student_start=s_start,
                    student_end=s_end,
                    student_count=count,
                    room_capacity=r_cap
                )
                db.session.add(room_obj)
                total_rooms_count += 1

            created_sessions.append(sess)

    audit = AuditLog(
        action='EXAM_SCHEDULE_SETUP',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='CIE',
        entity_id=cie.id,
        details=f"Configured 5th & 7th Semester CIE sessions with room splitting for Sep 10, 11, 12 ({len(created_sessions)} sessions, {total_rooms_count} room duty slots)."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Successfully configured {len(created_sessions)} exam sessions with {total_rooms_count} room duty slots for Sep 10, 11, 12',
        'sessions_count': len(created_sessions),
        'rooms_count': total_rooms_count
    }), 201


@cie_bp.route('/<int:cie_id>/setup-all-semesters', methods=['POST'])
def setup_all_semesters_sessions(cie_id):
    """
    Creates the whole CIE examination schedule for all active semesters (III, V, VII)
    or custom selected semesters with multi-room splitting (AI301 & AI302).
    """
    cie = CIE.query.get_or_404(cie_id)
    data = request.get_json() or {}

    start_date_str = data.get('start_date', '2026-09-10')
    try:
        base_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
    except Exception:
        base_date = cie.start_date or date(2026, 9, 10)

    # Optional custom sessions list from frontend wizard
    custom_sessions = data.get('sessions')

    # Optional semester filter (defaults to [3, 5, 7])
    included_sem_numbers = data.get('included_semesters', [3, 5, 7])
    clear_existing = data.get('clear_existing', True)

    # Fetch active semesters (Odd: 3, 5, 7; Even: 4, 6)
    sem3 = Semester.query.filter_by(sem_number=3).first()
    sem4 = Semester.query.filter_by(sem_number=4).first()
    sem5 = Semester.query.filter_by(sem_number=5).first()
    sem6 = Semester.query.filter_by(sem_number=6).first()
    sem7 = Semester.query.filter_by(sem_number=7).first()

    sem_map = {}
    if sem3 and 3 in included_sem_numbers:
        sem_map[3] = sem3
    if sem4 and 4 in included_sem_numbers:
        sem_map[4] = sem4
    if sem5 and 5 in included_sem_numbers:
        sem_map[5] = sem5
    if sem6 and 6 in included_sem_numbers:
        sem_map[6] = sem6
    if sem7 and 7 in included_sem_numbers:
        sem_map[7] = sem7

    if not sem_map and not custom_sessions:
        return jsonify({'error': 'No valid semesters selected for schedule creation'}), 400

    # Apply faculty duty quotas if provided by admin during duty creation
    faculty_quotas = data.get('faculty_quotas')
    faculty_quotas_text = data.get('faculty_quotas_text')
    squad_quotas = data.get('squad_quotas') or {}
    squad_fids = data.get('squad_faculty_ids')

    if squad_fids:
        import json
        sq_setting = SystemSettings.query.filter_by(key='squad_faculty_ids').first()
        if not sq_setting:
            sq_setting = SystemSettings(key='squad_faculty_ids', value=json.dumps(squad_fids))
            db.session.add(sq_setting)
        else:
            sq_setting.value = json.dumps(squad_fids)
        db.session.flush()

    if faculty_quotas_text or faculty_quotas or squad_quotas:
        all_fac_list = Faculty.query.all()
        parsed_q = {}
        if faculty_quotas_text:
            from routes.faculty_routes import parse_duty_quota_string
            parsed_q = parse_duty_quota_string(faculty_quotas_text, all_fac_list)
        if isinstance(faculty_quotas, dict):
            for fid_str, q_val in faculty_quotas.items():
                try:
                    parsed_q[int(fid_str)] = int(q_val)
                except Exception:
                    pass
        if isinstance(squad_quotas, dict):
            for fid_str, q_val in squad_quotas.items():
                try:
                    parsed_q[int(fid_str)] = int(q_val)
                except Exception:
                    pass
        for f in all_fac_list:
            if f.id in parsed_q:
                f.max_duty_capacity = max(0, int(parsed_q[f.id]))
        db.session.flush()

    # Default room setup: AI301 (Roll 1-29) and AI302 (Roll 30-60)
    default_rooms = data.get('rooms', [
        {'room_number': 'AI301', 'capacity': 30, 'student_start': 1, 'student_end': 29},
        {'room_number': 'AI302', 'capacity': 31, 'student_start': 30, 'student_end': 60}
    ])

    clear_existing = data.get('clear_existing', True)
    clear_all = data.get('clear_all', False)  # Safely default to False so other semesters' data is never interrupted!

    if clear_all:
        old_sessions = ExamSession.query.filter_by(cie_id=cie.id).all()
        old_session_ids = [s.id for s in old_sessions]
        if old_session_ids:
            Duty.query.filter(Duty.exam_session_id.in_(old_session_ids)).delete(synchronize_session=False)
            ExamRoom.query.filter(ExamRoom.exam_session_id.in_(old_session_ids)).delete(synchronize_session=False)
        for s in old_sessions:
            db.session.delete(s)
        db.session.flush()
    elif clear_existing:
        # Crucial: Only clear sessions and duties for the specific semesters being configured!
        target_sem_ids = [s.id for s in sem_map.values()]
        if target_sem_ids:
            old_sessions = ExamSession.query.filter(
                ExamSession.cie_id == cie.id,
                ExamSession.semester_id.in_(target_sem_ids)
            ).all()
            old_session_ids = [s.id for s in old_sessions]
            if old_session_ids:
                Duty.query.filter(Duty.exam_session_id.in_(old_session_ids)).delete(synchronize_session=False)
                ExamRoom.query.filter(ExamRoom.exam_session_id.in_(old_session_ids)).delete(synchronize_session=False)
            for s in old_sessions:
                db.session.delete(s)
            db.session.flush()

    # Clean only truly orphaned duty or room records (never delete valid duties of other semesters)
    valid_session_ids = [s.id for s in ExamSession.query.all()]
    if valid_session_ids:
        Duty.query.filter(~Duty.exam_session_id.in_(valid_session_ids)).delete(synchronize_session=False)
        ExamRoom.query.filter(~ExamRoom.exam_session_id.in_(valid_session_ids)).delete(synchronize_session=False)
    db.session.flush()

    created_sessions = []
    total_rooms_count = 0

    if custom_sessions and len(custom_sessions) > 0:
        # 1. Process custom-defined sessions from wizard
        for cs in custom_sessions:
            try:
                s_date = datetime.strptime(cs['exam_date'], '%Y-%m-%d').date()
            except Exception:
                s_date = base_date

            rooms_data = cs.get('rooms', default_rooms)
            tot_students = int(cs.get('total_students', 60))
            sess = ExamSession(
                cie_id=cie.id,
                semester_id=int(cs['semester_id']),
                subject_id=int(cs['subject_id']),
                exam_date=s_date,
                start_time=cs['start_time'].strip(),
                end_time=cs['end_time'].strip(),
                total_students=tot_students,
                room_number=rooms_data[0].get('room_number', 'AI301'),
                required_invigilators=len(rooms_data),
                required_squad=int(cs.get('required_squad', 0))
            )
            db.session.add(sess)
            db.session.flush()

            for r in rooms_data:
                r_num = r.get('room_number', 'AI301').strip().upper()
                s_start = int(r.get('student_start', 1))
                s_end = int(r.get('student_end', 30))
                r_cap = int(r.get('capacity', r.get('room_capacity', 30)))
                room_obj = ExamRoom(
                    exam_session_id=sess.id,
                    room_number=r_num,
                    student_start=s_start,
                    student_end=s_end,
                    student_count=max(0, s_end - s_start + 1),
                    room_capacity=r_cap
                )
                db.session.add(room_obj)
                total_rooms_count += 1

            created_sessions.append(sess)
    else:
        # 2. Automated curriculum-matched 3-day schedule generator
        day1 = base_date
        day2 = base_date + timedelta(days=1)
        day3 = base_date + timedelta(days=2)

        morning_start = data.get('morning_start', '09:30')
        morning_end = data.get('morning_end', '10:30')
        afternoon_start = data.get('afternoon_start', '14:30')
        afternoon_end = data.get('afternoon_end', '15:30')

        # Map core theory curriculum subjects (1-credit courses like 24EVS and labs/projects excluded)
        sub3 = {s.code: s for s in Subject.query.filter_by(semester_id=sem3.id).all()} if sem3 else {}
        sub4 = {s.code: s for s in Subject.query.filter_by(semester_id=sem4.id).all()} if sem4 else {}
        sub5 = {s.code: s for s in Subject.query.filter_by(semester_id=sem5.id).all()} if sem5 else {}
        sub6 = {s.code: s for s in Subject.query.filter_by(semester_id=sem6.id).all()} if sem6 else {}
        sub7 = {s.code: s for s in Subject.query.filter_by(semester_id=sem7.id).all()} if sem7 else {}

        # Master schedule tuples: (sem_num, subject_obj, date, start_time, end_time)
        master_plan = []

        is_both_5_and_7 = (5 in sem_map and 7 in sem_map)
        is_both_4_and_6 = (4 in sem_map and 6 in sem_map)

        semester_timings = data.get('semester_timings', {})

        def get_timing(sem_num, slot_type, fallback_st, fallback_et):
            sem_cfg = semester_timings.get(str(sem_num)) or semester_timings.get(sem_num)
            if sem_cfg and isinstance(sem_cfg, dict):
                st = sem_cfg.get(f'{slot_type}_start') or fallback_st
                et = sem_cfg.get(f'{slot_type}_end') or fallback_et
                return st.strip(), et.strip()
            return fallback_st.strip(), fallback_et.strip()

        # Standard slot timings for Odd Semesters (5th & 7th)
        if is_both_5_and_7:
            def_s5_m_st, def_s5_m_et = '09:00', '10:00'
            def_s7_m_st, def_s7_m_et = '11:30', '12:30'
            def_s5_a_st, def_s5_a_et = '14:00', '15:00'
            def_s7_a_st, def_s7_a_et = '15:30', '16:30'
        else:
            def_s5_m_st, def_s5_m_et = morning_start, morning_end
            def_s7_m_st, def_s7_m_et = morning_start, morning_end
            def_s5_a_st, def_s5_a_et = afternoon_start, afternoon_end
            def_s7_a_st, def_s7_a_et = afternoon_start, afternoon_end

        # Standard slot timings for Even Semesters (4th & 6th)
        if is_both_4_and_6:
            def_s4_m_st, def_s4_m_et = '09:00', '10:00'
            def_s6_m_st, def_s6_m_et = '11:30', '12:30'
            def_s4_a_st, def_s4_a_et = '14:00', '15:00'
            def_s6_a_st, def_s6_a_et = '15:30', '16:30'
        else:
            def_s4_m_st, def_s4_m_et = morning_start, morning_end
            def_s6_m_st, def_s6_m_et = morning_start, morning_end
            def_s4_a_st, def_s4_a_et = afternoon_start, afternoon_end
            def_s6_a_st, def_s6_a_et = afternoon_start, afternoon_end

        s5_m_st, s5_m_et = get_timing(5, 'morning', def_s5_m_st, def_s5_m_et)
        s5_a_st, s5_a_et = get_timing(5, 'afternoon', def_s5_a_st, def_s5_a_et)

        s7_m_st, s7_m_et = get_timing(7, 'morning', def_s7_m_st, def_s7_m_et)
        s7_a_st, s7_a_et = get_timing(7, 'afternoon', def_s7_a_st, def_s7_a_et)

        s4_m_st, s4_m_et = get_timing(4, 'morning', def_s4_m_st, def_s4_m_et)
        s4_a_st, s4_a_et = get_timing(4, 'afternoon', def_s4_a_st, def_s4_a_et)

        s6_m_st, s6_m_et = get_timing(6, 'morning', def_s6_m_st, def_s6_m_et)
        s6_a_st, s6_a_et = get_timing(6, 'afternoon', def_s6_a_st, def_s6_a_et)

        s3_m_st, s3_m_et = get_timing(3, 'morning', morning_start, morning_end)
        s3_a_st, s3_a_et = get_timing(3, 'afternoon', afternoon_start, afternoon_end)

        # Day 1 - Morning
        s3_d1m = sub3.get('25MAAI301') or sub3.get('24MAAI301')
        if 3 in sem_map and s3_d1m: master_plan.append((3, s3_d1m, day1, s3_m_st, s3_m_et))
        if 4 in sem_map and '24AI401' in sub4:   master_plan.append((4, sub4['24AI401'], day1, s4_m_st, s4_m_et))
        if 5 in sem_map and '24AI501' in sub5:   master_plan.append((5, sub5['24AI501'], day1, s5_m_st, s5_m_et))
        if 6 in sem_map and '23AI601' in sub6:   master_plan.append((6, sub6['23AI601'], day1, s6_m_st, s6_m_et))
        if 7 in sem_map and '23AI701' in sub7:   master_plan.append((7, sub7['23AI701'], day1, s7_m_st, s7_m_et))

        # Day 1 - Afternoon
        s3_d1a = sub3.get('25AI302') or sub3.get('24AI302')
        if 3 in sem_map and s3_d1a: master_plan.append((3, s3_d1a, day1, s3_a_st, s3_a_et))
        if 4 in sem_map and '24AI402' in sub4:   master_plan.append((4, sub4['24AI402'], day1, s4_a_st, s4_a_et))
        if 5 in sem_map and '24AI502' in sub5:   master_plan.append((5, sub5['24AI502'], day1, s5_a_st, s5_a_et))
        if 6 in sem_map and '23AI602' in sub6:   master_plan.append((6, sub6['23AI602'], day1, s6_a_st, s6_a_et))
        if 7 in sem_map and '23AI702' in sub7:   master_plan.append((7, sub7['23AI702'], day1, s7_a_st, s7_a_et))

        # Day 2 - Morning
        s3_d2m = sub3.get('25AI303') or sub3.get('24AI303')
        if 3 in sem_map and s3_d2m: master_plan.append((3, s3_d2m, day2, s3_m_st, s3_m_et))
        if 4 in sem_map and '24AI403' in sub4:   master_plan.append((4, sub4['24AI403'], day2, s4_m_st, s4_m_et))
        if 5 in sem_map and '24AI503' in sub5:   master_plan.append((5, sub5['24AI503'], day2, s5_m_st, s5_m_et))
        if 6 in sem_map and '23AI603' in sub6:   master_plan.append((6, sub6['23AI603'], day2, s6_m_st, s6_m_et))
        if 7 in sem_map and '23AI703' in sub7:   master_plan.append((7, sub7['23AI703'], day2, s7_m_st, s7_m_et))

        # Day 2 - Afternoon
        s3_d2a = sub3.get('25AI304') or sub3.get('24AI304')
        if 3 in sem_map and s3_d2a: master_plan.append((3, s3_d2a, day2, s3_a_st, s3_a_et))
        if 4 in sem_map and '24AI404' in sub4:   master_plan.append((4, sub4['24AI404'], day2, s4_a_st, s4_a_et))
        if 5 in sem_map and '24AI504' in sub5:   master_plan.append((5, sub5['24AI504'], day2, s5_a_st, s5_a_et))
        if 6 in sem_map and '23AI604' in sub6:   master_plan.append((6, sub6['23AI604'], day2, s6_a_st, s6_a_et))
        if 7 in sem_map and '23AI704D' in sub7:  master_plan.append((7, sub7['23AI704D'], day2, s7_a_st, s7_a_et))

        # Day 3 - Morning
        s3_d3m = sub3.get('25AI305') or sub3.get('24AI305')
        if 3 in sem_map and s3_d3m: master_plan.append((3, s3_d3m, day3, s3_m_st, s3_m_et))
        if 4 in sem_map and '24AI405A' in sub4:  master_plan.append((4, sub4['24AI405A'], day3, s4_m_st, s4_m_et))
        if 5 in sem_map and '24AI505A' in sub5:  master_plan.append((5, sub5['24AI505A'], day3, s5_m_st, s5_m_et))
        if 6 in sem_map and '23AI605A' in sub6:  master_plan.append((6, sub6['23AI605A'], day3, s6_m_st, s6_m_et))
        if 7 in sem_map and '23OEAI75x' in sub7: master_plan.append((7, sub7['23OEAI75x'], day3, s7_m_st, s7_m_et))

        # Day 3 - Afternoon (6th and 7th sem have finished their 5 subjects, so 4th, 5th, or 3rd sem write!)
        s3_d3a = sub3.get('25AIL306') or sub3.get('25AI308A') or sub3.get('24AI306I')
        if 3 in sem_map and s3_d3a: master_plan.append((3, s3_d3a, day3, s3_a_st, s3_a_et))
        if 4 in sem_map and '24AI408' in sub4:   master_plan.append((4, sub4['24AI408'], day3, s4_a_st, s4_a_et))
        if 5 in sem_map and '24AI508' in sub5:   master_plan.append((5, sub5['24AI508'], day3, s5_a_st, s5_a_et))

        # 5th Semester EVS examination rule:
        # In CIE-II and CIE-III, 5th semester students have an additional examination for 24EVS (Environmental Studies).
        is_cie2_or_3 = ('II' in (cie.name or '') or 'III' in (cie.name or '') or '2' in (cie.name or '') or '3' in (cie.name or ''))
        if is_cie2_or_3 and 5 in sem_map and '24EVS' in sub5:
            # Avoid duplicate if user also explicitly selected 24EVS in one_credit_subjects
            evs_already_added = any(int(oc.get('subject_id', 0)) == sub5['24EVS'].id for oc in (data.get('one_credit_subjects') or []))
            if not evs_already_added:
                master_plan.append((5, sub5['24EVS'], day3, '15:30', '16:30'))

        # Process any optional 1-credit subjects added by admin at the bottom of the modal:
        one_credit_list = data.get('one_credit_subjects') or data.get('one_credit_sessions') or []
        for oc in one_credit_list:
            try:
                oc_sem_id = int(oc.get('semester_id'))
                oc_sub_id = int(oc.get('subject_id'))
                oc_sem = Semester.query.get(oc_sem_id)
                oc_sub = Subject.query.get(oc_sub_id)
                if oc_sem and oc_sub:
                    try:
                        oc_date = datetime.strptime(oc['exam_date'], '%Y-%m-%d').date()
                    except Exception:
                        oc_date = day3
                    oc_st = oc.get('start_time', '15:30').strip()
                    oc_et = oc.get('end_time', '16:30').strip()
                    sem_map[oc_sem.sem_number] = oc_sem
                    master_plan.append((oc_sem.sem_number, oc_sub, oc_date, oc_st, oc_et))
            except Exception as oc_err:
                print('Error processing 1-credit subject in master_plan:', oc_err)

        # Group master plan by slot to assign squad duty once per slot
        slot_plan_map = defaultdict(list)
        for item in master_plan:
            slot_plan_map[(item[2], item[3], item[4])].append(item)

        assigned_squad_slots = set()
        for slot_key, slot_items in slot_plan_map.items():
            dt, st, et = slot_key
            req_squad = 1 if slot_key not in assigned_squad_slots else 0
            assigned_squad_slots.add(slot_key)

            for s_num, subj, _, _, _ in slot_items:
                sem_obj = sem_map[s_num]

                # CRITICAL RULE:
                # 7th sem Open Elective subject gets ONLY ONE duty (1 room, 1 invigilator)
                # All other subjects are conducted across BOTH rooms: AI301 (1-29) and AI302 (30-60)
                is_oe = (s_num == 7 and (subj.code == '23OEAI75x' or 'OE' in subj.code or 'Open Elective' in (subj.name or '')))
                if is_oe:
                    rooms_to_create = [
                        {'room_number': 'AI301', 'student_start': 1, 'student_end': 60, 'capacity': 60}
                    ]
                else:
                    rooms_to_create = [
                        {'room_number': 'AI301', 'student_start': 1, 'student_end': 29, 'capacity': 30},
                        {'room_number': 'AI302', 'student_start': 30, 'student_end': 60, 'capacity': 31}
                    ]

                sess = ExamSession(
                    cie_id=cie.id,
                    semester_id=sem_obj.id,
                    subject_id=subj.id,
                    exam_date=dt,
                    start_time=st,
                    end_time=et,
                    total_students=60,
                    room_number='AI301',
                    required_invigilators=len(rooms_to_create),
                    required_squad=req_squad
                )
                db.session.add(sess)
                db.session.flush()

                for r in rooms_to_create:
                    r_num = r.get('room_number', 'AI301').strip().upper()
                    s_start = int(r.get('student_start', 1))
                    s_end = int(r.get('student_end', 29))
                    r_cap = int(r.get('capacity', 30))
                    room_obj = ExamRoom(
                        exam_session_id=sess.id,
                        room_number=r_num,
                        student_start=s_start,
                        student_end=s_end,
                        student_count=max(0, s_end - s_start + 1),
                        room_capacity=r_cap
                    )
                    db.session.add(room_obj)
                    total_rooms_count += 1

                # Squad requirement is assigned once per slot
                req_squad = 0
                created_sessions.append(sess)

    audit = AuditLog(
        action='EXAM_SCHEDULE_SETUP',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='CIE',
        entity_id=cie.id,
        details=f"Configured whole CIE schedule for all semesters: {len(created_sessions)} exam sessions, {total_rooms_count} room duty slots."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Successfully created whole CIE schedule ({len(created_sessions)} sessions, {total_rooms_count} room duty slots across selected semesters).',
        'sessions_count': len(created_sessions),
        'rooms_count': total_rooms_count
    }), 201


def find_conflict_free_faculty_for_session(session, exclude_faculty_ids=None):
    """
    Finds eligible, conflict-free faculty members for an exam session based on its
    respected regular class timetable (with mandatory +-60 min buffer).
    - If 5th or 7th sem exam: inspects 3rd semester regular class timetable.
    - If 3rd sem exam: inspects 5th and 7th semester regular class timetables.
    """
    if exclude_faculty_ids is None:
        exclude_faculty_ids = set()

    sem = session.semester
    all_semesters = Semester.query.all()
    if sem:
        if sem.sem_number in [5, 7]:
            regular_semesters = [s for s in all_semesters if s.sem_number == 3]
        elif sem.sem_number == 3:
            regular_semesters = [s for s in all_semesters if s.sem_number in [5, 7]]
        else:
            regular_semesters = [s for s in all_semesters if s.id != sem.id]
    else:
        sem3 = Semester.query.filter_by(sem_number=3).first()
        regular_semesters = [sem3] if sem3 else []

    dow_map = {0: 'MON', 1: 'TUE', 2: 'WED', 3: 'THU', 4: 'FRI', 5: 'SAT', 6: 'SUN'}
    dow = dow_map.get(session.exam_date.weekday(), 'MON') if session.exam_date else 'MON'

    st_m = BufferRuleEvaluator.parse_minutes(session.start_time)
    et_m = BufferRuleEvaluator.parse_minutes(session.end_time)
    buf_st = max(0, st_m - 60)
    buf_et = min(1440, et_m + 60)

    all_fac = Faculty.query.all()
    candidates = []

    for f in all_fac:
        is_squad = getattr(f, 'only_squad_duty', False) or f.id == 1 or 'Arjun' in (f.name or '')
        if not f.is_active or not f.eligible_for_duty or is_squad:
            continue
        if f.id in exclude_faculty_ids:
            continue

        has_clash = False
        for reg_sem in regular_semesters:
            if not reg_sem:
                continue
            entries = TimetableEntry.query.filter_by(faculty_id=f.id, semester_id=reg_sem.id, day_of_week=dow).all()
            for e in entries:
                c_st = BufferRuleEvaluator.parse_minutes(e.start_time)
                c_et = BufferRuleEvaluator.parse_minutes(e.end_time)
                if max(buf_st, c_st) < min(buf_et, c_et):
                    has_clash = True
                    break
            if has_clash:
                break

        if not has_clash:
            # Check concurrent exam duties on the same date to avoid double-booking
            concurrent_duties = Duty.query.join(ExamSession).filter(
                Duty.faculty_id == f.id,
                Duty.status != 'CANCELLED',
                ExamSession.exam_date == session.exam_date,
                ExamSession.id != session.id
            ).all()
            has_concurrent_clash = False
            for cd in concurrent_duties:
                cs = cd.exam_session
                if cs and cs.start_time and cs.end_time:
                    cs_st = BufferRuleEvaluator.parse_minutes(cs.start_time)
                    cs_et = BufferRuleEvaluator.parse_minutes(cs.end_time)
                    if max(st_m, cs_st) < min(et_m, cs_et):
                        has_concurrent_clash = True
                        break
            if has_concurrent_clash:
                continue

            assigned_count = Duty.query.filter_by(faculty_id=f.id).filter(Duty.status != 'CANCELLED').count()
            target = f.max_duty_capacity if f.max_duty_capacity is not None else 5
            is_over_quota = (assigned_count >= target)
            diff = assigned_count - target
            candidates.append((f, is_over_quota, diff, assigned_count))

    candidates.sort(key=lambda x: (x[1], x[2], x[3]))
    return [c[0] for c in candidates]


@cie_bp.route('/sessions/<int:session_id>', methods=['GET'])
def get_session(session_id):
    """
    Returns full details for an exam session, including all rooms, duties, and assigned faculty.
    """
    session = ExamSession.query.get_or_404(session_id)
    return jsonify({
        'success': True,
        'session': session.to_dict()
    })


@cie_bp.route('/sessions/<int:session_id>', methods=['PUT'])
def update_session(session_id):
    """
    Updates an existing exam session and its rooms/duties.
    Allows editing date, time, subject, semester, room details, and assigned faculty.
    Automatically verifies against the respected regular timetable and assigns conflict-free faculty.
    """
    session = ExamSession.query.get_or_404(session_id)
    data = request.get_json() or {}

    orig_date = session.exam_date
    orig_start_time = session.start_time

    if 'exam_date' in data:
        try:
            session.exam_date = datetime.strptime(data['exam_date'], '%Y-%m-%d').date()
        except Exception:
            pass
    if 'start_time' in data:
        session.start_time = data['start_time'].strip()
    if 'end_time' in data:
        session.end_time = data['end_time'].strip()
    if 'semester_id' in data:
        session.semester_id = int(data['semester_id'])
    if 'subject_id' in data:
        session.subject_id = int(data['subject_id'])
    if 'total_students' in data:
        session.total_students = int(data['total_students'])

    # Determine respected regular class semesters for clash checking
    dow_map = {0: 'MON', 1: 'TUE', 2: 'WED', 3: 'THU', 4: 'FRI', 5: 'SAT', 6: 'SUN'}
    dow = dow_map.get(session.exam_date.weekday(), 'MON') if session.exam_date else 'MON'
    all_sems = Semester.query.all()
    if session.semester and session.semester.sem_number in [5, 7]:
        reg_sems = [s for s in all_sems if s.sem_number == 3]
    elif session.semester and session.semester.sem_number == 3:
        reg_sems = [s for s in all_sems if s.sem_number in [5, 7]]
    else:
        reg_sems = [s for s in all_sems if s.id != session.semester_id]

    st_m = BufferRuleEvaluator.parse_minutes(session.start_time)
    et_m = BufferRuleEvaluator.parse_minutes(session.end_time)
    buf_st = max(0, st_m - 60)
    buf_et = min(1440, et_m + 60)

    # Update rooms and duties if provided
    rooms_data = data.get('rooms')
    auto_assign_requested = data.get('auto_assign', False)
    reassign_conflicts = data.get('auto_reassign_conflicts', True)
    assigned_in_session = set()

    if rooms_data and isinstance(rooms_data, list):
        session.required_invigilators = len(rooms_data)
        existing_room_map = {r.id: r for r in session.exam_rooms}
        updated_room_ids = set()

        for r_item in rooms_data:
            r_id = r_item.get('id')
            r_num = (r_item.get('room_number') or 'AI301').strip().upper()
            s_start = int(r_item.get('student_start', 1))
            s_end = int(r_item.get('student_end', 30))
            r_cap = int(r_item.get('room_capacity') or r_item.get('capacity') or 30)
            fac_id = r_item.get('faculty_id')
            fac_id_int = int(fac_id) if (fac_id and str(fac_id).strip() != '') else None
            duty_type = r_item.get('duty_type') or 'Invigilation'

            # Check if this faculty has a conflict with the respected timetable
            has_respected_clash = False
            if fac_id_int:
                for rs in reg_sems:
                    for e in TimetableEntry.query.filter_by(faculty_id=fac_id_int, semester_id=rs.id, day_of_week=dow).all():
                        c_st = BufferRuleEvaluator.parse_minutes(e.start_time)
                        c_et = BufferRuleEvaluator.parse_minutes(e.end_time)
                        if max(buf_st, c_st) < min(buf_et, c_et):
                            has_respected_clash = True
                            break
                    if has_respected_clash:
                        break

            # If auto-assign requested, or clashing with respected timetable, auto-assign conflict-free faculty
            if (auto_assign_requested or not fac_id_int or (has_respected_clash and reassign_conflicts)):
                cand_list = find_conflict_free_faculty_for_session(session, exclude_faculty_ids=assigned_in_session)
                if cand_list:
                    fac_id_int = cand_list[0].id

            if fac_id_int:
                assigned_in_session.add(fac_id_int)

            if r_id and r_id in existing_room_map:
                room_obj = existing_room_map[r_id]
                room_obj.room_number = r_num
                room_obj.student_start = s_start
                room_obj.student_end = s_end
                room_obj.student_count = max(0, s_end - s_start + 1)
                room_obj.room_capacity = r_cap
                updated_room_ids.add(r_id)
            else:
                room_obj = ExamRoom(
                    exam_session_id=session.id,
                    room_number=r_num,
                    student_start=s_start,
                    student_end=s_end,
                    student_count=max(0, s_end - s_start + 1),
                    room_capacity=r_cap
                )
                db.session.add(room_obj)
                db.session.flush()
                updated_room_ids.add(room_obj.id)

            # Update or create Duty for this room
            duty = Duty.query.filter_by(exam_session_id=session.id, exam_room_id=room_obj.id).first()
            if not duty:
                duty = Duty(
                    exam_session_id=session.id,
                    exam_room_id=room_obj.id,
                    duty_type=duty_type,
                    status='ASSIGNED' if fac_id_int else 'PENDING',
                    allocated_at=datetime.utcnow()
                )
                db.session.add(duty)
            
            duty.faculty_id = fac_id_int
            duty.duty_type = duty_type
            duty.status = 'ASSIGNED' if fac_id_int else 'PENDING'
            duty.is_manual_override = True
            duty.override_reason = r_item.get('override_reason') or f'Verified with Timetable Protection ({session.start_time}-{session.end_time})'
            duty.updated_at = datetime.utcnow()

        # Delete rooms that were removed
        for r_id, r_obj in existing_room_map.items():
            if r_id not in updated_room_ids:
                Duty.query.filter_by(exam_session_id=session.id, exam_room_id=r_id).delete()
                db.session.delete(r_obj)

    # Squad duty update if provided
    squad_fac_id = data.get('squad_faculty_id')
    if squad_fac_id is not None or 'required_squad' in data:
        squad_duty = Duty.query.filter_by(exam_session_id=session.id, duty_type='Squad Duty').first()
        if squad_duty:
            if squad_fac_id:
                squad_duty.faculty_id = int(squad_fac_id)
                squad_duty.status = 'ASSIGNED'
            elif data.get('required_squad') == 0:
                db.session.delete(squad_duty)
        elif squad_fac_id or data.get('required_squad', 0) > 0:
            s_duty = Duty(
                exam_session_id=session.id,
                faculty_id=int(squad_fac_id) if squad_fac_id else 1,
                duty_type='Squad Duty',
                status='ASSIGNED' if squad_fac_id else 'PENDING',
                allocated_at=datetime.utcnow()
            )
            db.session.add(s_duty)

    # =========================================================================
    # CASCADE TIMING TO ALL DUTIES IN THIS SLOT ON THIS DAY (OR ALL DAYS)
    # =========================================================================
    cascade_all_days = data.get('apply_to_all_days_slot') or data.get('cascade_scope') == 'all_days_slot'
    cascade_today = data.get('apply_to_all_slot_duties_today', False) or data.get('apply_to_slot_today', False) or data.get('cascade_scope') == 'slot_today'
    
    cascaded_count = 0
    orig_st_m = BufferRuleEvaluator.parse_minutes(orig_start_time) if orig_start_time else 540
    all_assigned_in_slot = set(assigned_in_session)

    if cascade_all_days:
        all_other_sessions = ExamSession.query.filter(
            ExamSession.cie_id == session.cie_id,
            ExamSession.id != session.id
        ).all()
        other_sessions = [
            s for s in all_other_sessions
            if s.start_time == orig_start_time or abs(BufferRuleEvaluator.parse_minutes(s.start_time or '09:00') - orig_st_m) <= 45
        ]
    elif cascade_today:
        all_today_sessions = ExamSession.query.filter(
            ExamSession.cie_id == session.cie_id,
            ExamSession.exam_date == orig_date,
            ExamSession.id != session.id
        ).all()
        other_sessions = [
            s for s in all_today_sessions
            if s.start_time == orig_start_time or abs(BufferRuleEvaluator.parse_minutes(s.start_time or '09:00') - orig_st_m) <= 45
        ]
    else:
        other_sessions = []

    for osess in other_sessions:
        osess.start_time = session.start_time
        osess.end_time = session.end_time
        if session.exam_date != orig_date:
            osess.exam_date = session.exam_date
        cascaded_count += 1

        os_dow = dow_map.get(osess.exam_date.weekday(), 'MON') if osess.exam_date else 'MON'
        if osess.semester and osess.semester.sem_number in [5, 7]:
            os_reg_sems = [s for s in all_sems if s.sem_number == 3]
        elif osess.semester and osess.semester.sem_number == 3:
            os_reg_sems = [s for s in all_sems if s.sem_number in [5, 7]]
        else:
            os_reg_sems = [s for s in all_sems if s.id != osess.semester_id]

        os_st_m = BufferRuleEvaluator.parse_minutes(osess.start_time)
        os_et_m = BufferRuleEvaluator.parse_minutes(osess.end_time)
        os_buf_st = max(0, os_st_m - 60)
        os_buf_et = min(1440, os_et_m + 60)

        for r in osess.exam_rooms:
            r_duty = Duty.query.filter_by(exam_session_id=osess.id, exam_room_id=r.id).first()
            cur_fid = r_duty.faculty_id if r_duty else None

            has_clash = False
            if cur_fid:
                if cur_fid in all_assigned_in_slot:
                    has_clash = True
                else:
                    for rs in os_reg_sems:
                        for e in TimetableEntry.query.filter_by(faculty_id=cur_fid, semester_id=rs.id, day_of_week=os_dow).all():
                            c_st = BufferRuleEvaluator.parse_minutes(e.start_time)
                            c_et = BufferRuleEvaluator.parse_minutes(e.end_time)
                            if max(os_buf_st, c_st) < min(os_buf_et, c_et):
                                has_clash = True
                                break
                        if has_clash:
                            break

            if not cur_fid or has_clash:
                cands = find_conflict_free_faculty_for_session(osess, exclude_faculty_ids=all_assigned_in_slot)
                if cands:
                    cur_fid = cands[0].id

            if cur_fid:
                all_assigned_in_slot.add(cur_fid)
                if not r_duty:
                    r_duty = Duty(
                        exam_session_id=osess.id,
                        exam_room_id=r.id,
                        duty_type='Invigilation',
                        status='ASSIGNED',
                        allocated_at=datetime.utcnow()
                    )
                    db.session.add(r_duty)
                r_duty.faculty_id = cur_fid
                r_duty.status = 'ASSIGNED'
                r_duty.override_reason = f'Cascaded timing {osess.start_time}-{osess.end_time} with timetable protection'
                r_duty.updated_at = datetime.utcnow()

    details_msg = f"Updated exam session ID {session.id} ({session.subject.code if session.subject else 'Subject'}): date {session.exam_date}, time {session.start_time}-{session.end_time}."
    if cascaded_count > 0:
        details_msg += f" Cascaded timing to {cascaded_count} other sessions in this slot on {session.exam_date}."

    audit = AuditLog(
        action='EXAM_SESSION_UPDATED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='ExamSession',
        entity_id=session.id,
        details=details_msg
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Exam duty timing updated to {session.start_time} - {session.end_time}' + (f' and cascaded to all {cascaded_count} other duties in this slot on {session.exam_date}.' if cascaded_count > 0 else ' and verified with respected timetable.'),
        'session': session.to_dict(),
        'cascaded_count': cascaded_count
    })


@cie_bp.route('/sessions/batch-update', methods=['POST'])
def batch_update_sessions():
    """
    Updates multiple exam sessions in one atomic operation.
    Checks respected timetables for each session and ensures conflict-free assignments.
    """
    data = request.get_json() or {}
    session_items = data.get('sessions', [])
    updated_sessions = []

    all_sems = Semester.query.all()
    dow_map = {0: 'MON', 1: 'TUE', 2: 'WED', 3: 'THU', 4: 'FRI', 5: 'SAT', 6: 'SUN'}

    for item in session_items:
        s_id = item.get('id') or item.get('session_id')
        if not s_id:
            continue
        session = ExamSession.query.get(s_id)
        if not session:
            continue
        
        if 'exam_date' in item:
            try:
                session.exam_date = datetime.strptime(item['exam_date'], '%Y-%m-%d').date()
            except Exception:
                pass
        if 'start_time' in item:
            session.start_time = item['start_time'].strip()
        if 'end_time' in item:
            session.end_time = item['end_time'].strip()
        
        dow = dow_map.get(session.exam_date.weekday(), 'MON') if session.exam_date else 'MON'
        if session.semester and session.semester.sem_number in [5, 7]:
            reg_sems = [s for s in all_sems if s.sem_number == 3]
        elif session.semester and session.semester.sem_number == 3:
            reg_sems = [s for s in all_sems if s.sem_number in [5, 7]]
        else:
            reg_sems = [s for s in all_sems if s.id != session.semester_id]

        st_m = BufferRuleEvaluator.parse_minutes(session.start_time)
        et_m = BufferRuleEvaluator.parse_minutes(session.end_time)
        buf_st = max(0, st_m - 60)
        buf_et = min(1440, et_m + 60)

        rooms_data = item.get('rooms')
        assigned_in_session = set()

        if rooms_data:
            for r_item in rooms_data:
                r_id = r_item.get('id')
                fac_id = r_item.get('faculty_id')
                fac_id_int = int(fac_id) if (fac_id and str(fac_id).strip() != '') else None

                has_clash = False
                if fac_id_int:
                    if fac_id_int in assigned_in_session:
                        has_clash = True
                    else:
                        for rs in reg_sems:
                            for e in TimetableEntry.query.filter_by(faculty_id=fac_id_int, semester_id=rs.id, day_of_week=dow).all():
                                c_st = BufferRuleEvaluator.parse_minutes(e.start_time)
                                c_et = BufferRuleEvaluator.parse_minutes(e.end_time)
                                if max(buf_st, c_st) < min(buf_et, c_et):
                                    has_clash = True
                                    break
                            if has_clash:
                                break

                if not fac_id_int or has_clash or item.get('auto_assign'):
                    cands = find_conflict_free_faculty_for_session(session, exclude_faculty_ids=assigned_in_session)
                    if cands:
                        fac_id_int = cands[0].id

                if fac_id_int:
                    assigned_in_session.add(fac_id_int)

                if r_id:
                    room_obj = ExamRoom.query.get(r_id)
                else:
                    room_obj = None
                
                if room_obj:
                    duty = Duty.query.filter_by(exam_session_id=session.id, exam_room_id=room_obj.id).first()
                    if not duty:
                        duty = Duty(
                            exam_session_id=session.id,
                            exam_room_id=room_obj.id,
                            duty_type='Invigilation',
                            allocated_at=datetime.utcnow()
                        )
                        db.session.add(duty)
                    duty.faculty_id = fac_id_int
                    duty.status = 'ASSIGNED' if fac_id_int else 'PENDING'
                    duty.is_manual_override = True
                    duty.override_reason = f'Batch Updated ({session.start_time}-{session.end_time}) with timetable verification'
                    duty.updated_at = datetime.utcnow()
        else:
            for room_obj in session.exam_rooms:
                duty = Duty.query.filter_by(exam_session_id=session.id, exam_room_id=room_obj.id).first()
                cur_fid = duty.faculty_id if duty else None

                has_clash = False
                if cur_fid:
                    if cur_fid in assigned_in_session:
                        has_clash = True
                    else:
                        for rs in reg_sems:
                            for e in TimetableEntry.query.filter_by(faculty_id=cur_fid, semester_id=rs.id, day_of_week=dow).all():
                                c_st = BufferRuleEvaluator.parse_minutes(e.start_time)
                                c_et = BufferRuleEvaluator.parse_minutes(e.end_time)
                                if max(buf_st, c_st) < min(buf_et, c_et):
                                    has_clash = True
                                    break
                            if has_clash:
                                break

                if not cur_fid or has_clash or item.get('auto_assign'):
                    cands = find_conflict_free_faculty_for_session(session, exclude_faculty_ids=assigned_in_session)
                    if cands:
                        cur_fid = cands[0].id

                if cur_fid:
                    assigned_in_session.add(cur_fid)
                    if not duty:
                        duty = Duty(
                            exam_session_id=session.id,
                            exam_room_id=room_obj.id,
                            duty_type='Invigilation',
                            allocated_at=datetime.utcnow()
                        )
                        db.session.add(duty)
                    duty.faculty_id = cur_fid
                    duty.status = 'ASSIGNED'
                    duty.override_reason = f'Batch Updated ({session.start_time}-{session.end_time}) with timetable verification'
                    duty.updated_at = datetime.utcnow()
        
        updated_sessions.append(session.to_dict())

    db.session.commit()
    return jsonify({
        'success': True,
        'message': f'Successfully updated {len(updated_sessions)} exam sessions.',
        'sessions': updated_sessions
    })



@cie_bp.route('/sessions/shift-slot-time', methods=['POST'])
def shift_slot_time():
    """
    Shifts or updates the time window for all exam sessions within an overall slot.
    Useful when institutional exam timings are shifted (e.g. morning session shifted from 09:00 to 09:30).
    """
    data = request.get_json() or {}
    cie_id = data.get('cie_id', 1)
    current_date_str = data.get('current_date')
    current_start_time = data.get('current_start_time')
    new_date_str = data.get('new_date', current_date_str)
    new_start_time = data.get('new_start_time')
    new_end_time = data.get('new_end_time')

    if not current_date_str or not current_start_time or not new_start_time or not new_end_time:
        return jsonify({'error': 'current_date, current_start_time, new_start_time, and new_end_time are required'}), 400

    try:
        c_date = datetime.strptime(current_date_str, '%Y-%m-%d').date()
        n_date = datetime.strptime(new_date_str, '%Y-%m-%d').date() if new_date_str else c_date
    except Exception:
        return jsonify({'error': 'Invalid date format, expected YYYY-MM-DD'}), 400

    all_dates = data.get('all_dates', False)
    if all_dates:
        sessions = ExamSession.query.filter_by(
            cie_id=cie_id,
            start_time=current_start_time.strip()
        ).all()
    else:
        sessions = ExamSession.query.filter_by(
            cie_id=cie_id,
            exam_date=c_date,
            start_time=current_start_time.strip()
        ).all()

    if not sessions:
        return jsonify({'error': f'No exam sessions found {"across all dates" if all_dates else f"on {current_date_str}"} at {current_start_time}'}), 404

    dow_map = {0: 'MON', 1: 'TUE', 2: 'WED', 3: 'THU', 4: 'FRI', 5: 'SAT', 6: 'SUN'}
    all_sems = Semester.query.all()
    updated_count = len(sessions)
    reassigned_count = 0

    for s in sessions:
        if not all_dates:
            s.exam_date = n_date
        s.start_time = new_start_time.strip()
        s.end_time = new_end_time.strip()

        # Re-check respected timetable conflicts
        s_dow = dow_map.get(s.exam_date.weekday(), 'MON') if s.exam_date else 'MON'
        if s.semester and s.semester.sem_number in [5, 7]:
            reg_sems = [sem for sem in all_sems if sem.sem_number == 3]
        elif s.semester and s.semester.sem_number == 3:
            reg_sems = [sem for sem in all_sems if sem.sem_number in [5, 7]]
        else:
            reg_sems = [sem for sem in all_sems if sem.id != s.semester_id]

        s_st_m = BufferRuleEvaluator.parse_minutes(s.start_time)
        s_et_m = BufferRuleEvaluator.parse_minutes(s.end_time)
        s_buf_st = max(0, s_st_m - 60)
        s_buf_et = min(1440, s_et_m + 60)

        s_assigned_fids = set()
        for r in s.exam_rooms:
            r_duty = Duty.query.filter_by(exam_session_id=s.id, exam_room_id=r.id).first()
            cur_fid = r_duty.faculty_id if r_duty else None

            has_clash = False
            if cur_fid:
                for rs in reg_sems:
                    for e in TimetableEntry.query.filter_by(faculty_id=cur_fid, semester_id=rs.id, day_of_week=s_dow).all():
                        c_st = BufferRuleEvaluator.parse_minutes(e.start_time)
                        c_et = BufferRuleEvaluator.parse_minutes(e.end_time)
                        if max(s_buf_st, c_st) < min(s_buf_et, c_et):
                            has_clash = True
                            break
                    if has_clash:
                        break

            if not cur_fid or has_clash:
                cands = find_conflict_free_faculty_for_session(s, exclude_faculty_ids=s_assigned_fids)
                if cands:
                    cur_fid = cands[0].id
                    reassigned_count += 1

            if cur_fid:
                s_assigned_fids.add(cur_fid)
                if not r_duty:
                    r_duty = Duty(
                        exam_session_id=s.id,
                        exam_room_id=r.id,
                        duty_type='Invigilation',
                        status='ASSIGNED',
                        allocated_at=datetime.utcnow()
                    )
                    db.session.add(r_duty)
                r_duty.faculty_id = cur_fid
                r_duty.status = 'ASSIGNED'
                r_duty.override_reason = f'Shifted slot to {new_start_time}-{new_end_time} with timetable protection'
                r_duty.updated_at = datetime.utcnow()

    audit = AuditLog(
        action='EXAM_SLOT_TIME_SHIFTED',
        user_identifier=request.headers.get('X-User', 'Admin'),
        entity_type='CIE',
        entity_id=cie_id,
        details=f"Shifted slot {'across all dates' if all_dates else f'on {current_date_str}'} from {current_start_time} to {new_start_time}-{new_end_time} for {updated_count} sessions."
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Successfully updated slot timing to {new_start_time} - {new_end_time} for {updated_count} exam sessions ({reassigned_count} duties re-assigned conflict-free).',
        'updated_count': updated_count,
        'reassigned_count': reassigned_count
    })


@cie_bp.route('/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    session = ExamSession.query.get_or_404(session_id)
    db.session.delete(session)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Exam session removed'})


@cie_bp.route('/<int:cie_id>/sessions/by-semester/<int:semester_id>', methods=['DELETE'])
def clear_semester_sessions(cie_id, semester_id):
    """Deletes all exam sessions for a specific semester within a CIE."""
    sessions = ExamSession.query.filter_by(cie_id=cie_id, semester_id=semester_id).all()
    count = len(sessions)
    for s in sessions:
        db.session.delete(s)
    db.session.commit()
    return jsonify({'success': True, 'deleted_count': count})
