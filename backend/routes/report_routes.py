from collections import defaultdict
from flask import Blueprint, request, jsonify, send_file
from models import CIE, Duty, ExamSession, Faculty, Semester
from services.report_service import ReportService, get_faculty_initials, format_time_slot

report_bp = Blueprint('report_bp', __name__)

@report_bp.route('/cie-excel/<int:cie_id>', methods=['GET'])
def download_cie_excel(cie_id):
    cie = CIE.query.get_or_404(cie_id)
    sem_id = request.args.get('semester_id')
    sem_ids_param = request.args.get('semesters')
    selected_semester = None
    query = Duty.query.join(ExamSession).filter(ExamSession.cie_id == cie_id)

    if sem_ids_param:
        try:
            s_ids = [int(x.strip()) for x in sem_ids_param.split(',') if x.strip()]
            query = query.filter(ExamSession.semester_id.in_(s_ids))
        except Exception:
            pass
    elif sem_id:
        selected_semester = Semester.query.get(int(sem_id))
        if selected_semester:
            query = query.filter(ExamSession.semester_id == int(sem_id))

    duties = query.order_by(
        ExamSession.exam_date, ExamSession.start_time, ExamSession.room_number
    ).all()

    excel_stream = ReportService.generate_cie_excel(cie, duties, selected_semester=selected_semester)
    sem_suffix = f"_{selected_semester.name.replace(' ', '_')}" if selected_semester else "_All_Semesters"
    resp = send_file(
        excel_stream,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=f"{cie.name}{sem_suffix}_Duty_Allocation_{cie.academic_year}.xlsx"
    )
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@report_bp.route('/cie-pdf/<int:cie_id>', methods=['GET'])
def download_cie_pdf(cie_id):
    cie = CIE.query.get_or_404(cie_id)
    sem_id = request.args.get('semester_id')
    sem_ids_param = request.args.get('semesters')
    selected_semester = None
    semester_ids = None
    query = Duty.query.join(ExamSession).filter(ExamSession.cie_id == cie_id)

    if sem_ids_param:
        try:
            semester_ids = [int(x.strip()) for x in sem_ids_param.split(',') if x.strip()]
            query = query.filter(ExamSession.semester_id.in_(semester_ids))
        except Exception:
            pass
    elif sem_id:
        selected_semester = Semester.query.get(int(sem_id))
        if selected_semester:
            query = query.filter(ExamSession.semester_id == int(sem_id))

    duties = query.order_by(
        ExamSession.exam_date, ExamSession.start_time, ExamSession.room_number
    ).all()

    pdf_stream = ReportService.generate_cie_pdf(cie, duties, selected_semester=selected_semester, semester_ids=semester_ids)
    sem_suffix = f"_{selected_semester.name.replace(' ', '_')}" if selected_semester else "_All_Semesters"
    resp = send_file(
        pdf_stream,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"{cie.name}{sem_suffix}_Duty_Circular_{cie.academic_year}.pdf"
    )
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@report_bp.route('/duty-slips/<int:cie_id>', methods=['GET'])
def download_duty_slips_pdf(cie_id):
    """
    Downloads individual printable duty orders for faculty members.
    Supports optional ?semester_id= parameter to generate slips for a specific semester.
    """
    cie = CIE.query.get_or_404(cie_id)
    sem_id = request.args.get('semester_id')
    selected_semester = None
    query = Duty.query.join(ExamSession).join(Semester).filter(ExamSession.cie_id == cie_id)

    if sem_id:
        selected_semester = Semester.query.get(int(sem_id))
        if selected_semester:
            query = query.filter(ExamSession.semester_id == int(sem_id))
    else:
        # Exclude 3rd semester from combined duty slips
        query = query.filter(Semester.sem_number != 3)

    duties = query.order_by(
        ExamSession.exam_date, ExamSession.start_time, ExamSession.room_number
    ).all()

    pdf_stream = ReportService.generate_faculty_duty_slips_pdf(cie, duties, selected_semester=selected_semester)
    sem_suffix = f"_{selected_semester.name.replace(' ', '_')}" if selected_semester else "_All_Semesters"
    resp = send_file(
        pdf_stream,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"{cie.name}{sem_suffix}_Faculty_Duty_Orders_{cie.academic_year}.pdf"
    )
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@report_bp.route('/calendar-ics/<int:faculty_id>', methods=['GET'])
def download_faculty_calendar_ics(faculty_id):
    """
    Generates standard RFC-5545 iCalendar (.ics) file for all assigned duties of a faculty member.
    """
    from flask import Response
    faculty = Faculty.query.get_or_404(faculty_id)
    duties = Duty.query.filter_by(faculty_id=faculty_id, status='ASSIGNED').join(ExamSession).order_by(
        ExamSession.exam_date, ExamSession.start_time
    ).all()

    ics_content = ReportService.generate_faculty_calendar_ics(faculty, duties)
    return Response(
        ics_content,
        mimetype='text/calendar',
        headers={
            'Content-Disposition': f'attachment; filename="CIE_Duties_{faculty.login_id}.ics"'
        }
    )


@report_bp.route('/duty-ics/<int:duty_id>', methods=['GET'])
def download_single_duty_ics(duty_id):
    """
    Generates standard RFC-5545 iCalendar (.ics) file for a single duty.
    """
    from flask import Response
    duty = Duty.query.get_or_404(duty_id)
    faculty = duty.faculty or Faculty.query.first()
    ics_content = ReportService.generate_faculty_calendar_ics(faculty, [duty])
    return Response(
        ics_content,
        mimetype='text/calendar',
        headers={
            'Content-Disposition': f'attachment; filename="Duty_{duty.id}.ics"'
        }
    )


@report_bp.route('/cie-data/<int:cie_id>', methods=['GET'])
def get_cie_report_data(cie_id):
    """
    Returns structured data matching the official 3-sheet college circular format:
    Page 1: Invigilation Duty Allotment (Grouped by Semester, Date, Time, Course Code, Room No, Faculty initials)
    Page 2: Squad Duty Allotment (Grouped by Semester, Date, Time, Course Code, Room No, Squad officers initials)
    Page 3: CIE Duty Allotment (Faculty-wise Roster with Sl No, Faculty Name, Date, Time, Duty, blank Signature)
    Supports optional ?semester_id= to strictly isolate reports per semester.
    """
    cie = CIE.query.get_or_404(cie_id)
    sem_id = request.args.get('semester_id')
    selected_semester = None

    # Compute available semesters for this CIE to populate filter tabs
    all_cie_duties = Duty.query.join(ExamSession).filter(ExamSession.cie_id == cie_id).all()
    sem_counter = {}
    for d in all_cie_duties:
        s = d.exam_session.semester
        if s:
            if s.id not in sem_counter:
                sem_counter[s.id] = {
                    'id': s.id,
                    'sem_number': s.sem_number,
                    'name': s.name,
                    'duty_count': 0
                }
            sem_counter[s.id]['duty_count'] += 1
    available_semesters = sorted(sem_counter.values(), key=lambda x: x['sem_number'])

    # Query all sessions for this CIE
    session_query = ExamSession.query.filter_by(cie_id=cie_id)
    if sem_id:
        selected_semester = Semester.query.get(int(sem_id))
        if selected_semester:
            session_query = session_query.filter_by(semester_id=int(sem_id))
    else:
        # Exclude 3rd semester from combined odd semester view so that only 5th & 7th are combined together
        session_query = session_query.join(Semester).filter(Semester.sem_number != 3)

    # Strictly query active faculty directory
    active_facs = Faculty.query.filter_by(is_active=True).all()
    active_dir_ids = {f.id for f in active_facs}

    sessions = session_query.order_by(ExamSession.exam_date, ExamSession.start_time).all()

    # 1. Group sessions by semester
    semesters_map = {}
    for sess in sessions:
        sem = sess.semester
        s_name = sem.name if sem else 'Academic Class'
        if s_name not in semesters_map:
            semesters_map[s_name] = {
                'semester_name': s_name,
                'semester_id': sess.semester_id,
                'sem_number': sem.sem_number if sem else 0,
                'sessions': [],
                'rooms': set(),
                'dates': set(),
            }
        semesters_map[s_name]['sessions'].append(sess)
        if sess.exam_date:
            semesters_map[s_name]['dates'].add(sess.exam_date)
        for r in sess.exam_rooms:
            semesters_map[s_name]['rooms'].add(r.room_number)
        if sess.room_number:
            semesters_map[s_name]['rooms'].add(sess.room_number)

    # 2. Build structured data for Sheet 1 (Invigilation) and Sheet 2 (Squad)
    semesters_list = []
    for s_name, s_info in sorted(semesters_map.items(), key=lambda x: x[1]['sem_number']):
        # Group sessions by exam_date
        date_sessions_map = defaultdict(list)
        for sess in s_info['sessions']:
            d_str = sess.exam_date.strftime('%d.%m.%Y')
            date_sessions_map[d_str].append(sess)

        invig_dates = []
        squad_dates = []
        total_invig_count = 0
        total_squad_count = 0

        for d_str, s_list in date_sessions_map.items():
            day_str = s_list[0].exam_date.strftime('%A')
            invig_date_entry = {
                'date': d_str,
                'day': day_str,
                'sessions': [],
                'total_rows': 0
            }
            squad_date_entry = {
                'date': d_str,
                'day': day_str,
                'sessions': [],
                'total_rows': 0
            }

            for sess in s_list:
                time_str = format_time_slot(sess.start_time, sess.end_time)
                code_str = sess.subject.code if sess.subject else ''
                cname_str = sess.subject.name if sess.subject else ''

                # Invigilation duties filtered by active directory faculty only
                invig_duties = [d for d in sess.duties if (d.duty_type or '').lower() != 'squad duty' and d.faculty_id in active_dir_ids and d.faculty and d.faculty.is_active]
                rooms_data = []

                if sess.exam_rooms:
                    for er in sess.exam_rooms:
                        matching_d = next((d for d in invig_duties if d.exam_room_id == er.id), None)
                        if not matching_d:
                            matching_d = next((d for d in invig_duties if not d.exam_room_id and d.faculty_id), None)
                        
                        fac_name = matching_d.faculty.name if (matching_d and matching_d.faculty) else 'TBD'
                        fac_init = get_faculty_initials(matching_d.faculty.name if matching_d and matching_d.faculty else None)
                        rooms_data.append({
                            'room_no': er.room_number,
                            'faculty': fac_init,
                            'faculty_name': fac_name
                        })
                        total_invig_count += 1
                elif invig_duties:
                    for d in invig_duties:
                        r_no = d.exam_room.room_number if d.exam_room else (sess.room_number or 'AI301')
                        fac_name = d.faculty.name if d.faculty else 'TBD'
                        fac_init = get_faculty_initials(d.faculty.name if d.faculty else None)
                        rooms_data.append({
                            'room_no': r_no,
                            'faculty': fac_init,
                            'faculty_name': fac_name
                        })
                        total_invig_count += 1
                else:
                    rooms_data.append({
                        'room_no': 'AI301',
                        'faculty': 'TBD',
                        'faculty_name': 'Pending'
                    })
                    rooms_data.append({
                        'room_no': 'AI302',
                        'faculty': 'TBD',
                        'faculty_name': 'Pending'
                    })
                    total_invig_count += 2

                invig_date_entry['sessions'].append({
                    'id': sess.id,
                    'time': time_str,
                    'course_code': code_str,
                    'course_name': cname_str,
                    'rooms': rooms_data
                })
                invig_date_entry['total_rows'] += len(rooms_data)

                # Squad duties filtered by active directory faculty only
                squad_duties = [d for d in sess.duties if (d.duty_type or '').lower() == 'squad duty' and d.faculty_id in active_dir_ids and d.faculty and d.faculty.is_active]
                squad_fac_initials = [get_faculty_initials(sd.faculty.name) for sd in squad_duties]
                squad_init_str = ', '.join(squad_fac_initials)
                total_squad_count += len(squad_fac_initials)

                all_rooms_list = [r.room_number for r in sess.exam_rooms] or [sess.room_number or 'AI301']
                if len(all_rooms_list) == 1 and not sess.exam_rooms:
                    all_rooms_list = ['AI301', 'AI302']

                squad_rooms_data = [{'room_no': r_no} for r_no in all_rooms_list]
                squad_date_entry['sessions'].append({
                    'id': sess.id,
                    'time': time_str,
                    'course_code': code_str,
                    'course_name': cname_str,
                    'room_no': ' / '.join(all_rooms_list),
                    'rooms': squad_rooms_data,
                    'rooms_list': all_rooms_list,
                    'faculty': squad_init_str
                })
                squad_date_entry['total_rows'] += len(squad_rooms_data)

            invig_dates.append(invig_date_entry)
            squad_dates.append(squad_date_entry)

        dates_set = s_info['dates']
        if dates_set:
            sorted_dates = sorted(list(dates_set))
            date_range_str = f"{sorted_dates[0].strftime('%d.%m.%Y')} to {sorted_dates[-1].strftime('%d.%m.%Y')}"
        else:
            date_range_str = f"{cie.start_date.strftime('%d.%m.%Y')} to {cie.end_date.strftime('%d.%m.%Y')}"

        semesters_list.append({
            'semester_id': s_info['semester_id'],
            'semester_name': s_name,
            'sem_number': s_info['sem_number'],
            'rooms': ' / '.join(sorted(list(s_info['rooms']))) if s_info['rooms'] else 'AI301 / AI302',
            'date_range': date_range_str,
            'session_count': len(s_info['sessions']),
            'total_invigilation': total_invig_count,
            'total_squad': total_squad_count,
            'total_duties': total_invig_count + total_squad_count,
            'invigilation_dates': invig_dates,
            'squad_dates': squad_dates
        })

    # 3. Build Sheet 3: Faculty-wise Duty Allotment with Signatures (Active Directory Faculty Only)
    all_duties_query = Duty.query.join(ExamSession).join(Semester).filter(ExamSession.cie_id == cie_id)
    if sem_id:
        all_duties_query = all_duties_query.filter(ExamSession.semester_id == int(sem_id))
    else:
        # Exclude 3rd semester from combined duty allotment so it only covers 5th & 7th (or 4th & 6th)
        all_duties_query = all_duties_query.filter(Semester.sem_number != 3)
    all_duties = all_duties_query.order_by(ExamSession.exam_date, ExamSession.start_time).all()

    faculty_duties_map = {}
    for d in all_duties:
        if not (d.faculty_id in active_dir_ids and d.faculty and d.faculty.is_active):
            continue
        f_name = d.faculty.name
        if f_name not in faculty_duties_map:
            faculty_duties_map[f_name] = {
                'faculty_id': d.faculty.id,
                'faculty_name': f_name,
                'designation': d.faculty.designation or 'Faculty',
                'department': d.faculty.department or 'CSE (AI & ML)',
                'invig_list': [],
                'squad_list': []
            }
        if (d.duty_type or '').lower() == 'squad duty':
            faculty_duties_map[f_name]['squad_list'].append(d)
        else:
            faculty_duties_map[f_name]['invig_list'].append(d)

    # For each faculty member, build final duties list grouped by duty type (Invigilation first, then Squad) and by date
    for f_info in faculty_duties_map.values():
        grouped_duties = []

        # 1. Invigilation entries grouped by date
        invig_by_date = defaultdict(list)
        for d in f_info['invig_list']:
            sess = d.exam_session
            invig_by_date[sess.exam_date].append((sess.start_time, format_time_slot(sess.start_time, sess.end_time), sess.semester.name if sess.semester else '', d.id))

        if invig_by_date:
            invig_dates_sorted = sorted(invig_by_date.keys())
            for d_idx, dt in enumerate(invig_dates_sorted):
                sorted_items = sorted(invig_by_date[dt], key=lambda x: x[0])
                times = [it[1] for it in sorted_items]
                grouped_duties.append({
                    'duty_id': sorted_items[0][3],
                    'date': dt.strftime('%d.%m.%Y'),
                    'time': '\n'.join(times),
                    'times_list': times,
                    'duty': 'Invigilation',
                    'semester_name': sorted_items[0][2],
                    'duty_rowspan': len(invig_dates_sorted),
                    'is_duty_first': (d_idx == 0)
                })

        # 2. Squad entries grouped by date
        squad_by_date = defaultdict(list)
        for d in f_info['squad_list']:
            sess = d.exam_session
            squad_by_date[sess.exam_date].append((sess.start_time, format_time_slot(sess.start_time, sess.end_time), sess.semester.name if sess.semester else '', d.id))

        if squad_by_date:
            squad_dates_sorted = sorted(squad_by_date.keys())
            for d_idx, dt in enumerate(squad_dates_sorted):
                sorted_items = sorted(squad_by_date[dt], key=lambda x: x[0])
                times = [it[1] for it in sorted_items]
                grouped_duties.append({
                    'duty_id': sorted_items[0][3],
                    'date': dt.strftime('%d.%m.%Y'),
                    'time': '\n'.join(times),
                    'times_list': times,
                    'duty': 'Squad',
                    'semester_name': sorted_items[0][2],
                    'duty_rowspan': len(squad_dates_sorted),
                    'is_duty_first': (d_idx == 0)
                })

        f_info['duties'] = grouped_duties
        del f_info['invig_list']
        del f_info['squad_list']

    # Sort faculty: Dr. Arjun B C first, Dr. Swathi H Y second, Mrs. Sushma, Mrs. Ankitha, Mrs. Megha, Mrs. Maseeha, Sheethal
    def fac_sort_key(f):
        name = f['faculty_name']
        if 'Arjun' in name: return 0
        if 'Swathi' in name: return 1
        if 'Sushma' in name: return 2
        if 'Ankitha' in name: return 3
        if 'Megha' in name: return 4
        if 'Maseeha' in name: return 5
        if 'Sheethal' in name: return 6
        return 9

    sorted_faculty = sorted(faculty_duties_map.values(), key=fac_sort_key)
    for idx, f_entry in enumerate(sorted_faculty, 1):
        f_entry['sl_no'] = idx

    # Compute term (Odd / Even)
    academic_term = "Even" if "even" in (cie.name or '').lower() or (cie.start_date and cie.start_date.month in (2, 3, 4, 5, 6)) else "Odd"
    academic_year_term = f"(AY {cie.academic_year or '2027-28'}) {academic_term}"

    return jsonify({
        'cie': cie.to_dict(include_stats=True),
        'academic_year': cie.academic_year or '2027-28',
        'academic_year_term': academic_year_term,
        'selected_semester': selected_semester.to_dict() if selected_semester else None,
        'available_semesters': available_semesters,
        'semesters_data': semesters_list,
        'faculty_wise_allotment': sorted_faculty,
        'duties': [d.to_dict() for d in all_duties if d.faculty_id in active_dir_ids and d.faculty and d.faculty.is_active],
        'duties_raw': [d.to_dict() for d in all_duties if d.faculty_id in active_dir_ids and d.faculty and d.faculty.is_active],
        'total_duties': sum(1 for d in all_duties if d.faculty_id in active_dir_ids and d.faculty and d.faculty.is_active),
        'signatories': {
            'coordinator': {'name': 'Mrs. Ankitha S', 'role': 'CIE Coordinator'},
            'chairman_boe': {'name': 'Dr. Swathi H Y', 'role': 'Chairman, BOE'},
            'hod': {'name': 'Dr. Arjun B C', 'role': 'HOD'}
        }
    })
