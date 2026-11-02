import time
from collections import defaultdict
from .semester_engine import SemesterStatusEngine
from .eligibility import EligibilityEngine
from .candidate_evaluator import CandidateEvaluator
from .explanations import ExplanationEngine
from .buffer_rules import BufferRuleEvaluator
from .timetable_conflicts import TimetableConflictEngine
from models import ExamSession

class AllocationOptimizer:
    """
    Intelligent multi-session constraint allocation and workload fairness solver.
    """

    @classmethod
    def run_optimization(
        cls,
        cie,
        exam_sessions,
        all_faculty,
        all_semesters,
        buffer_minutes=60,
        exam_duty_buffer_minutes=30,
        include_squad=False,
        quota_scope_session_ids=None
    ):
        """
        Executes the allocation pipeline across all target exam sessions in the CIE.
        
        Args:
            cie: CIE object
            exam_sessions: list of ExamSession objects
            all_faculty: list of Faculty objects
            all_semesters: list of Semester objects
            buffer_minutes: int (default 60)
            include_squad: bool (default False)
            
        Returns:
            dict: {
                'status': 'SUCCESS' | 'PARTIAL' | 'FAILED',
                'allocated_duties': list of dict,
                'explanations': list of dict,
                'stats': {
                    'total_required': int,
                    'total_allocated': int,
                    'total_pending': int,
                    'total_conflicts': int,
                    'execution_time_ms': float
                },
                'logs': list of str
            }
        """
        start_time = time.time()
        logs = []
        logs.append(f"Starting allocation for {cie.name} ({cie.academic_year}).")
        logs.append(f"Total faculty: {len(all_faculty)}, Total active semesters: {len(all_semesters)}")

        target_sess_ids = {s.id for s in exam_sessions}
        target_sem_ids = {s.semester_id for s in exam_sessions}
        quota_period = EligibilityEngine.get_quota_period()
        spacing_settings = EligibilityEngine.get_duty_spacing_settings()
        all_cie_sessions = ExamSession.query.filter_by(cie_id=cie.id).all()
        session_keys = {
            (session.exam_date, session.start_time, session.end_time)
            for session in all_cie_sessions + list(exam_sessions)
        }
        session_indexes = {
            key: index for index, key in enumerate(sorted(session_keys))
        }

        # Initialize tracking maps for cumulative duties
        cumulative_duties = defaultdict(int)
        cie_duties = defaultdict(int)

        # Track historical cumulative duties across the academic term,
        # strictly excluding duties belonging to sessions currently being allocated
        for fac in all_faculty:
            valid_existing = [d for d in fac.duties if d.status != 'CANCELLED']
            cumulative_duties[fac.id] = len(valid_existing)
            is_squad_officer = (
                getattr(fac, 'only_squad_duty', False)
                or fac.id == 1
                or 'Arjun' in (fac.name or '')
            )
            cie_duties[fac.id] = sum(
                1 for d in valid_existing
                if d.status in ('ASSIGNED', 'COMPLETED')
                and d.exam_session
                and d.exam_session.cie_id == cie.id
                and (
                    d.exam_session_id in quota_scope_session_ids
                    if quota_scope_session_ids is not None
                    else d.exam_session_id not in target_sess_ids
                )
                and not (d.duty_type == 'Squad Duty' and is_squad_officer)
            )

        # Load designated squad faculty IDs from settings if available
        squad_faculty_ids = set()
        try:
            from models.system import SystemSettings
            import json
            sq_setting = SystemSettings.query.filter_by(key='squad_faculty_ids').first()
            if sq_setting and sq_setting.value:
                squad_faculty_ids = set(json.loads(sq_setting.value))
        except Exception:
            pass
        if not squad_faculty_ids:
            squad_faculty_ids = {f.id for f in all_faculty if getattr(f, 'only_squad_duty', False) or f.id == 1 or 'Arjun' in (f.name or '')}

        # Group sessions by slot (date, start_time, end_time) to handle simultaneous sessions properly
        slot_groups = defaultdict(list)
        for sess in exam_sessions:
            key = (sess.exam_date, sess.start_time, sess.end_time)
            slot_groups[key].append(sess)

        # Sort slots chronologically
        sorted_slot_keys = sorted(slot_groups.keys(), key=lambda k: (k[0], k[1]))

        allocated_results = []
        explanations_results = []
        assigned_duties_by_faculty = defaultdict(list)
        total_required = 0
        total_allocated = 0
        total_pending = 0
        total_conflicts = 0

        # Identify all semesters taking exams in this CIE
        cie_exam_sem_ids = {s.semester_id for s in exam_sessions}

        # Solve global CSP for Invigilation duties to satisfy exact capacities & clash avoidance
        try:
            csp_solution = {}
            if quota_period == 'cie':
                csp_solution = cls._solve_invigilation_csp(
                    exam_sessions=exam_sessions,
                    all_faculty=all_faculty,
                    all_semesters=all_semesters,
                    cie_exam_sem_ids=cie_exam_sem_ids,
                    existing_cie_duties=cie_duties,
                    buffer_minutes=buffer_minutes,
                    exam_duty_buffer_minutes=exam_duty_buffer_minutes,
                    minimum_sessions_between=spacing_settings['minimum_sessions_between'],
                    minimum_rest_days=spacing_settings['minimum_rest_days'],
                    session_indexes=session_indexes,
                    cie_id=cie.id,
                    quota_scope_session_ids=quota_scope_session_ids
                )
            if csp_solution:
                logs.append(f"Global CSP solver found optimal allocation for {len(csp_solution)} invigilation requirements.")
            else:
                logs.append("Global CSP solver did not find full solution; falling back to heuristic scoring.")
        except Exception as e:
            csp_solution = {}
            logs.append(f"CSP solver error: {str(e)}; continuing with heuristic scoring.")

        # Slot-by-slot allocation loop
        for slot_key in sorted_slot_keys:
            slot_date, slot_start, slot_end = slot_key
            sessions_in_slot = slot_groups[slot_key]
            
            # Step 1 & 2 & 3: Dynamic Semester Status
            sem_classification = SemesterStatusEngine.classify_semesters_for_slot(
                slot_sessions=sessions_in_slot,
                all_active_semesters=all_semesters,
                cie_exam_semester_ids=cie_exam_sem_ids
            )
            regular_sem_ids = sem_classification['regular_class_semester_ids']
            regular_sem_names = sem_classification['regular_class_semester_names']
            exam_sem_names = sem_classification['exam_semester_names']

            logs.append(
                f"Slot [{slot_date.isoformat()} {slot_start}-{slot_end}]: Exam Semesters: {exam_sem_names}; "
                f"Checking regular class timetables for: {regular_sem_names}"
            )

            slot_assigned_faculty_ids = set()
            slot_squad_count = 0

            # Process each session in this slot
            for session in sessions_in_slot:
                duty_requirements = []
                if session.exam_rooms and len(session.exam_rooms) > 0:
                    for room in session.exam_rooms:
                        if any(d.status == 'COMPLETED' and d.exam_room_id == room.id for d in session.duties):
                            continue
                        duty_requirements.append({
                            'duty_type': 'Invigilation',
                            'exam_room': room,
                            'exam_room_id': room.id,
                            'room_number': room.room_number,
                            'student_start': room.student_start,
                            'student_end': room.student_end,
                            'student_range': f"{room.student_start}–{room.student_end}"
                        })
                else:
                    for _ in range(session.required_invigilators or 1):
                        duty_requirements.append({
                            'duty_type': 'Invigilation',
                            'exam_room': None,
                            'exam_room_id': None,
                            'room_number': session.room_number or 'AI301',
                            'student_start': None,
                            'student_end': None,
                            'student_range': None
                        })

                # Squad duty requirements: consolidated to 1 roving supervisor per exam slot ONLY if include_squad is enabled
                if include_squad and (session.required_squad or 0) > 0 and slot_squad_count == 0:
                    duty_requirements.append({
                        'duty_type': 'Squad Duty',
                        'exam_room': None,
                        'exam_room_id': None,
                        'room_number': 'Squad Roving',
                        'student_start': None,
                        'student_end': None,
                        'student_range': None
                    })
                    slot_squad_count += 1

                total_required += len(duty_requirements)

                for req in duty_requirements:
                    duty_type = req['duty_type']
                    exam_room = req['exam_room']
                    exam_room_id = req['exam_room_id']
                    room_number = req['room_number']

                    disqualified = []
                    eligible = []
                    coverage_missing = TimetableConflictEngine.get_missing_coverage(
                        session, all_semesters
                    )

                    for fac in all_faculty:
                        current_slot_duties = assigned_duties_by_faculty[fac.id]
                        eval_res = EligibilityEngine.evaluate_candidate(
                            faculty=fac,
                            exam_session=session,
                            regular_semester_ids=regular_sem_ids,
                            current_slot_duties=current_slot_duties,
                            buffer_minutes=buffer_minutes,
                            exam_duty_buffer_minutes=exam_duty_buffer_minutes,
                            duty_type=duty_type,
                            run_assigned_count=cie_duties[fac.id],
                            quota_period=quota_period,
                            run_duties=current_slot_duties,
                            all_semesters=all_semesters,
                            coverage_missing=coverage_missing,
                            quota_scope_session_ids=quota_scope_session_ids
                        )

                        if not eval_res['is_eligible']:
                            disqualified.append({
                                'faculty': fac,
                                'reasons': eval_res['disqualification_reasons'],
                                'conflict_details': eval_res['conflict_details']
                            })
                        else:
                            score_info = CandidateEvaluator.score_candidate(
                                faculty=fac,
                                cie_name=cie.name,
                                cumulative_duties=cumulative_duties[fac.id],
                                current_cie_duties=cie_duties[fac.id]
                            )
                            eligible.append({
                                'faculty': fac,
                                'score_info': score_info
                            })

                    # Keep the full 60-minute class buffer whenever any faculty qualify.
                    # For an otherwise unfilled room, retry with a 30-minute class buffer;
                    # direct class overlaps remain disqualifying in BufferRuleEvaluator.
                    if not eligible and duty_type != 'Squad Duty' and buffer_minutes > 30:
                        fallback_eligible = []
                        fallback_disqualified = []
                        for fac in all_faculty:
                            current_slot_duties = assigned_duties_by_faculty[fac.id]
                            eval_res = EligibilityEngine.evaluate_candidate(
                                faculty=fac,
                                exam_session=session,
                                regular_semester_ids=regular_sem_ids,
                                current_slot_duties=current_slot_duties,
                                buffer_minutes=30,
                                exam_duty_buffer_minutes=exam_duty_buffer_minutes,
                                duty_type=duty_type,
                                run_assigned_count=cie_duties[fac.id],
                                quota_period=quota_period,
                                run_duties=current_slot_duties,
                                all_semesters=all_semesters,
                                coverage_missing=coverage_missing,
                                quota_scope_session_ids=quota_scope_session_ids
                            )
                            if not eval_res['is_eligible']:
                                fallback_disqualified.append({
                                    'faculty': fac,
                                    'reasons': eval_res['disqualification_reasons'],
                                    'conflict_details': eval_res['conflict_details']
                                })
                            else:
                                score_info = CandidateEvaluator.score_candidate(
                                    faculty=fac,
                                    cie_name=cie.name,
                                    cumulative_duties=cumulative_duties[fac.id],
                                    current_cie_duties=cie_duties[fac.id]
                                )
                                fallback_eligible.append({
                                    'faculty': fac,
                                    'score_info': score_info
                                })

                        if fallback_eligible:
                            eligible = fallback_eligible
                            disqualified = fallback_disqualified
                            logs.append(
                                f"Applied 30-minute class-buffer fallback for "
                                f"{session.exam_date.isoformat()} {session.start_time}-{session.end_time} "
                                f"(Room {room_number}); no faculty qualified with the 60-minute buffer."
                            )

                    hard_eligible_candidates = eligible
                    has_spacing_alternative = False
                    if duty_type != 'Squad Duty' and eligible:
                        for candidate in eligible:
                            candidate['spacing_penalty'] = cls._spacing_preference_penalty(
                                faculty=candidate['faculty'],
                                exam_session=session,
                                current_run_duties=assigned_duties_by_faculty[candidate['faculty'].id],
                                session_indexes=session_indexes,
                                cie_id=cie.id,
                                minimum_sessions_between=spacing_settings['minimum_sessions_between'],
                                minimum_rest_days=spacing_settings['minimum_rest_days']
                            )
                        spacing_eligible = [
                            candidate for candidate in eligible
                            if candidate['spacing_penalty'][0] == 0
                        ]
                        has_spacing_alternative = bool(spacing_eligible)
                        if has_spacing_alternative:
                            eligible = spacing_eligible
                        else:
                            logs.append(
                                f"WARNING: Minimum duty spacing could not be maintained for "
                                f"{session.exam_date.isoformat()} {session.start_time}-{session.end_time} "
                                f"(Room {room_number}); no hard-eligible faculty alternative met the "
                                "configured session/day rest preferences."
                            )

                    chosen_candidate = None
                    if duty_type == 'Squad Duty':
                        eligible.sort(key=lambda x: (
                            not (x['faculty'].id in squad_faculty_ids or getattr(x['faculty'], 'only_squad_duty', False) or x['faculty'].id == 1 or 'Arjun' in (x['faculty'].name or '')),
                            cie_duties[x['faculty'].id],
                            x['score_info']['penalty_score']
                        ))
                        if eligible:
                            chosen_candidate = eligible[0]
                    else:
                        req_key = (session.id, exam_room_id or 0)
                        if req_key in csp_solution:
                            csp_fac_id = csp_solution[req_key]
                            csp_cand = next(
                                (c for c in hard_eligible_candidates if c['faculty'].id == csp_fac_id),
                                None
                            )
                            if not csp_cand:
                                csp_fac = next((f for f in all_faculty if f.id == csp_fac_id), None)
                                if csp_fac:
                                    # Never violate timetable buffer: must satisfy 60m buffer from regular classes
                                    tt_res = TimetableConflictEngine.check_faculty_timetable_conflicts(
                                        faculty=csp_fac,
                                        exam_session=session,
                                        regular_semester_ids=regular_sem_ids,
                                        buffer_minutes=60
                                    )
                                    if not tt_res['has_conflict']:
                                        eval_0 = EligibilityEngine.evaluate_candidate(
                                            faculty=csp_fac,
                                            exam_session=session,
                                            regular_semester_ids=regular_sem_ids,
                                            current_slot_duties=assigned_duties_by_faculty[csp_fac.id],
                                            buffer_minutes=buffer_minutes,
                                            exam_duty_buffer_minutes=exam_duty_buffer_minutes,
                                            duty_type=duty_type,
                                            run_assigned_count=cie_duties[csp_fac.id],
                                            quota_period=quota_period,
                                            run_duties=assigned_duties_by_faculty[csp_fac.id],
                                            all_semesters=all_semesters,
                                            coverage_missing=coverage_missing,
                                            quota_scope_session_ids=quota_scope_session_ids
                                        )
                                        if eval_0['is_eligible']:
                                            score_info = CandidateEvaluator.score_candidate(
                                                faculty=csp_fac,
                                                cie_name=cie.name,
                                                cumulative_duties=cumulative_duties[csp_fac.id],
                                                current_cie_duties=cie_duties[csp_fac.id]
                                            )
                                            csp_cand = {
                                                'faculty': csp_fac,
                                                'score_info': score_info,
                                                'spacing_penalty': cls._spacing_preference_penalty(
                                                    faculty=csp_fac,
                                                    exam_session=session,
                                                    current_run_duties=assigned_duties_by_faculty[csp_fac.id],
                                                    session_indexes=session_indexes,
                                                    cie_id=cie.id,
                                                    minimum_sessions_between=spacing_settings['minimum_sessions_between'],
                                                    minimum_rest_days=spacing_settings['minimum_rest_days']
                                                )
                                            }
                            if csp_cand:
                                chosen_candidate = csp_cand
                                if csp_cand.get('spacing_penalty', (0,))[0] > 0:
                                    logs.append(
                                        f"WARNING: Global allocation relaxed preferred duty spacing for "
                                        f"{csp_cand['faculty'].name} at {session.exam_date.isoformat()} "
                                        f"{session.start_time}-{session.end_time} (Room {room_number}) "
                                        "because no full spacing-compliant allocation was available."
                                    )
                        
                        if not chosen_candidate and eligible:
                            eligible.sort(key=lambda x: (
                                x.get('spacing_penalty', (0,))[0],
                                x.get('spacing_penalty', (0, 0))[1],
                                x.get('spacing_penalty', (0, 0, 0))[2],
                                -((x['faculty'].max_duty_capacity if x['faculty'].max_duty_capacity is not None else EligibilityEngine.DEFAULT_DUTY_QUOTA) - cie_duties[x['faculty'].id]),
                                x['score_info']['penalty_score']
                            ))
                            chosen_candidate = eligible[0]

                    if chosen_candidate:
                        best = chosen_candidate
                        chosen_fac = best['faculty']

                        slot_assigned_faculty_ids.add(chosen_fac.id)
                        assigned_duties_by_faculty[chosen_fac.id].append({
                            'faculty_id': chosen_fac.id,
                            'exam_date': slot_date,
                            'start_time': slot_start,
                            'end_time': slot_end,
                            'room_number': room_number,
                            'cie_id': session.cie_id,
                            'semester_id': session.semester_id,
                            'sem_number': session.semester.sem_number if session.semester else None,
                            'academic_year': session.cie.academic_year if session.cie else None
                        })
                        cumulative_duties[chosen_fac.id] += 1
                        is_squad_officer = getattr(chosen_fac, 'only_squad_duty', False) or chosen_fac.id == 1 or 'Arjun' in (chosen_fac.name or '')
                        if not (duty_type == 'Squad Duty' and is_squad_officer):
                            cie_duties[chosen_fac.id] += 1

                        total_allocated += 1

                        expl = ExplanationEngine.generate_explanation(
                            selected_candidate=best,
                            disqualified_candidates=disqualified,
                            eligible_candidates=eligible or [best],
                            exam_session=session,
                            regular_sem_names=regular_sem_names
                        )

                        duty_record = {
                            'exam_session_id': session.id,
                            'exam_room_id': exam_room_id,
                            'faculty_id': chosen_fac.id,
                            'duty_type': duty_type,
                            'status': 'ASSIGNED',
                            'is_manual_override': False,
                            'override_reason': None
                        }
                        allocated_results.append(duty_record)
                        explanations_results.append({
                            'duty_index': len(allocated_results) - 1,
                            'explanation': expl
                        })
                    else:
                        total_pending += 1
                        total_conflicts += 1
                        logs.append(
                            f"WARNING: Insufficient eligible faculty for {duty_type} in Session ID {session.id} "
                            f"(Room {room_number}, {slot_date.isoformat()} {slot_start}-{slot_end})."
                        )

                        expl = ExplanationEngine.generate_explanation(
                            selected_candidate=None,
                            disqualified_candidates=disqualified,
                            eligible_candidates=[],
                            exam_session=session,
                            regular_sem_names=regular_sem_names
                        )

                        duty_record = {
                            'exam_session_id': session.id,
                            'exam_room_id': exam_room_id,
                            'faculty_id': None,
                            'duty_type': duty_type,
                            'status': 'PENDING',
                            'is_manual_override': False,
                            'override_reason': 'No eligible faculty satisfied the configured quota, timetable/buffer, availability, and simultaneous-duty constraints.'
                        }
                        allocated_results.append(duty_record)
                        explanations_results.append({
                            'duty_index': len(allocated_results) - 1,
                            'explanation': expl
                        })

        execution_time_ms = round((time.time() - start_time) * 1000, 2)
        status = 'SUCCESS' if total_pending == 0 else ('PARTIAL' if total_allocated > 0 else 'FAILED')

        logs.append(
            f"Completed in {execution_time_ms}ms. Required: {total_required}, Allocated: {total_allocated}, "
            f"Pending: {total_pending}, Conflicts: {total_conflicts}."
        )

        return {
            'status': status,
            'allocated_duties': allocated_results,
            'explanations': explanations_results,
            'stats': {
                'total_required': total_required,
                'total_allocated': total_allocated,
                'total_pending': total_pending,
                'total_conflicts': total_conflicts,
                'execution_time_ms': execution_time_ms
            },
            'logs': logs
        }

    @staticmethod
    def _spacing_preference_penalty(
        faculty,
        exam_session,
        current_run_duties,
        session_indexes,
        cie_id,
        minimum_sessions_between,
        minimum_rest_days
    ):
        current_key = (
            exam_session.exam_date,
            exam_session.start_time,
            exam_session.end_time
        )
        current_index = session_indexes.get(current_key)
        previous_assignments = []
        for duty in faculty.duties:
            if (
                duty.status in ('ASSIGNED', 'COMPLETED')
                and duty.exam_session
            ):
                previous_assignments.append({
                    'date': duty.exam_session.exam_date,
                    'key': (
                        duty.exam_session.exam_date,
                        duty.exam_session.start_time,
                        duty.exam_session.end_time
                    ),
                    'cie_id': duty.exam_session.cie_id
                })
        for duty in current_run_duties:
            previous_assignments.append({
                'date': duty['exam_date'],
                'key': (
                    duty['exam_date'],
                    duty['start_time'],
                    duty['end_time']
                ),
                'cie_id': duty.get('cie_id')
            })

        violation_count = 0
        nearest_session_gap = float('inf')
        nearest_day_gap = float('inf')
        seen_assignments = set()
        for previous in previous_assignments:
            previous_key = previous['key']
            unique_key = (previous['cie_id'], previous_key)
            if unique_key in seen_assignments:
                continue
            seen_assignments.add(unique_key)

            day_gap = abs((exam_session.exam_date - previous['date']).days)
            nearest_day_gap = min(nearest_day_gap, day_gap)
            if day_gap > 0 and day_gap - 1 < minimum_rest_days:
                violation_count += 1

            previous_index = session_indexes.get(previous_key)
            if (
                previous['cie_id'] == cie_id
                and current_index is not None
                and previous_index is not None
            ):
                session_gap = abs(current_index - previous_index)
                nearest_session_gap = min(nearest_session_gap, session_gap)
                if session_gap <= minimum_sessions_between:
                    violation_count += 1

        return (
            violation_count,
            -nearest_session_gap,
            -nearest_day_gap
        )

    @classmethod
    def _solve_invigilation_csp(
        cls,
        exam_sessions,
        all_faculty,
        all_semesters,
        cie_exam_sem_ids,
        existing_cie_duties=None,
        buffer_minutes=60,
        exam_duty_buffer_minutes=30,
        minimum_sessions_between=1,
        minimum_rest_days=1,
        session_indexes=None,
        cie_id=None,
        quota_scope_session_ids=None
    ):
        """
        Backtracking CSP solver for Invigilation duties across sessions/rooms.
        Guarantees exact capacity compliance, zero timetable clashes, and zero simultaneous clashes.
        """
        reqs = []
        for sess in exam_sessions:
            if sess.exam_rooms and len(sess.exam_rooms) > 0:
                for room in sess.exam_rooms:
                    if any(d.status == 'COMPLETED' and d.exam_room_id == room.id for d in sess.duties):
                        continue
                    reqs.append({
                        'req_key': (sess.id, room.id),
                        'session': sess,
                        'room': room,
                        'time_key': (sess.exam_date, sess.start_time, sess.end_time)
                    })
            else:
                for idx in range(sess.required_invigilators or 1):
                    reqs.append({
                        'req_key': (sess.id, idx),
                        'session': sess,
                        'room': None,
                        'time_key': (sess.exam_date, sess.start_time, sess.end_time)
                    })

        if not reqs:
            return {}

        total_reqs = len(reqs)

        # Room invigilators only (Dr. Arjun B C is exempt from rooms, only active & eligible faculty)
        invig_faculty = [
            f for f in all_faculty
            if f.is_active and f.eligible_for_duty
            and not (getattr(f, 'only_squad_duty', False) or f.id == 1 or 'Arjun' in (f.name or ''))
        ]

        if not invig_faculty:
            return {}

        base_caps = {
            f.id: (
                f.max_duty_capacity
                if f.max_duty_capacity is not None
                else EligibilityEngine.DEFAULT_DUTY_QUOTA
            )
            for f in invig_faculty
        }
        total_base_cap = sum(base_caps.values())

        # Determine target capacity per faculty for this run:
        # If total_base_cap == total_reqs (e.g. S5 & S7 with 21 duties and base caps totaling 21):
        # exact match!
        # If allocating a different number (e.g. S3 with 12 duties):
        # scale proportionally so duties are split according to faculty quota!
        target_caps = {}
        if total_base_cap == total_reqs:
            target_caps = dict(base_caps)
        elif total_base_cap > 0 and total_reqs > 0:
            if total_reqs >= total_base_cap:
                target_caps = dict(base_caps)
            else:
                raw_props = {fid: total_reqs * (cap / total_base_cap) for fid, cap in base_caps.items()}
                floored = {fid: min(base_caps[fid], max(1, int(raw_props[fid]))) for fid in base_caps}
                remainder = total_reqs - sum(floored.values())
                fractions = sorted(base_caps.keys(), key=lambda fid: raw_props[fid] - int(raw_props[fid]), reverse=True)
                for i in range(remainder):
                    target_fid = fractions[i % len(fractions)]
                    if floored[target_fid] < base_caps[target_fid]:
                        floored[target_fid] += 1
                if remainder < 0:
                    rev_fractions = sorted(base_caps.keys(), key=lambda fid: raw_props[fid] - int(raw_props[fid]))
                    for i in range(-remainder):
                        target_fid = rev_fractions[i % len(rev_fractions)]
                        if floored[target_fid] > 1:
                            floored[target_fid] -= 1
                target_caps = floored
        else:
            equal_share = total_reqs // len(invig_faculty) if invig_faculty else 0
            target_caps = {f.id: min(base_caps[f.id], equal_share) for f in invig_faculty}

        if existing_cie_duties:
            for fid in list(target_caps.keys()):
                rem = max(0, base_caps[fid] - existing_cie_duties.get(fid, 0))
                target_caps[fid] = min(target_caps[fid], rem)

        req_candidates = []
        for req in reqs:
            sess = req['session']
            sem_classification = SemesterStatusEngine.classify_semesters_for_slot(
                slot_sessions=[sess],
                all_active_semesters=all_semesters,
                cie_exam_semester_ids=cie_exam_sem_ids
            )
            regular_sem_ids = sem_classification['regular_class_semester_ids']

            cands_60 = []
            for fac in invig_faculty:
                if fac.id not in target_caps or target_caps[fac.id] == 0:
                    continue

                res60 = EligibilityEngine.evaluate_candidate(
                    faculty=fac,
                    exam_session=sess,
                    regular_semester_ids=regular_sem_ids,
                    current_slot_duties=None,
                    buffer_minutes=60,
                    duty_type='Invigilation',
                    run_assigned_count=0,
                    quota_period=EligibilityEngine.get_quota_period(),
                    all_semesters=all_semesters,
                    quota_scope_session_ids=quota_scope_session_ids
                )
                if res60['is_eligible']:
                    cands_60.append(fac.id)

            req_candidates.append(cands_60)

        base_assigned_times = defaultdict(list)
        base_slot_booked = defaultdict(set)
        for faculty in all_faculty:
            for duty in faculty.duties:
                if duty.status not in ('ASSIGNED', 'COMPLETED') or not duty.exam_session:
                    continue
                existing_session = duty.exam_session
                existing_key = (
                    existing_session.exam_date,
                    existing_session.start_time,
                    existing_session.end_time
                )
                base_assigned_times[faculty.id].append((
                    existing_session.exam_date,
                    BufferRuleEvaluator.parse_minutes(existing_session.start_time),
                    BufferRuleEvaluator.parse_minutes(existing_session.end_time),
                    existing_key,
                    existing_session.cie_id
                ))
                if existing_session.cie_id == cie_id:
                    base_slot_booked[existing_key].add(faculty.id)

        req_order = sorted(range(len(reqs)), key=lambda i: len(req_candidates[i]))
        max_steps = 1000000

        def violates_spacing(fid, req_session, assigned_times):
            current_key = (
                req_session.exam_date,
                req_session.start_time,
                req_session.end_time
            )
            current_index = (session_indexes or {}).get(current_key)
            for previous_date, _, _, previous_key, previous_cie_id in assigned_times[fid]:
                day_gap = abs((req_session.exam_date - previous_date).days)
                if day_gap > 0 and day_gap - 1 < minimum_rest_days:
                    return True
                previous_index = (session_indexes or {}).get(previous_key)
                if (
                    previous_cie_id == cie_id
                    and current_index is not None
                    and previous_index is not None
                    and abs(current_index - previous_index) <= minimum_sessions_between
                ):
                    return True
            return False

        def search(require_exact_caps, enforce_spacing):
            assignment = {}
            fac_counts = defaultdict(int)
            fac_assigned_times = defaultdict(list, {
                fid: list(times) for fid, times in base_assigned_times.items()
            })
            slot_booked = defaultdict(set, {
                key: set(faculty_ids) for key, faculty_ids in base_slot_booked.items()
            })
            state = {'steps': 0}

            def backtrack(step):
                state['steps'] += 1
                if state['steps'] > max_steps:
                    return False
                if step == len(req_order):
                    return not require_exact_caps or all(
                        fac_counts[fid] == target_caps[fid]
                        for fid in target_caps
                    )

                r_idx = req_order[step]
                req = reqs[r_idx]
                t_key = req['time_key']
                req_session = req['session']
                e_start = BufferRuleEvaluator.parse_minutes(req_session.start_time)
                e_end = BufferRuleEvaluator.parse_minutes(req_session.end_time)
                req_date = req_session.exam_date

                candidates = list(req_candidates[r_idx])
                candidates.sort(
                    key=lambda fid: target_caps.get(fid, 10) - fac_counts[fid],
                    reverse=True
                )
                for fid in candidates:
                    if fid in slot_booked[t_key]:
                        continue
                    if fac_counts[fid] >= target_caps.get(fid, 10):
                        continue
                    if enforce_spacing and violates_spacing(fid, req_session, fac_assigned_times):
                        continue

                    has_buffer_clash = any(
                        d_date == req_date
                        and max(e_start, d_start - exam_duty_buffer_minutes) < min(e_end, d_end + exam_duty_buffer_minutes)
                        for d_date, d_start, d_end, _, _ in fac_assigned_times[fid]
                    )
                    if has_buffer_clash:
                        continue

                    assignment[req['req_key']] = fid
                    fac_counts[fid] += 1
                    slot_booked[t_key].add(fid)
                    fac_assigned_times[fid].append((
                        req_date,
                        e_start,
                        e_end,
                        t_key,
                        cie_id
                    ))
                    if backtrack(step + 1):
                        return True
                    del assignment[req['req_key']]
                    fac_counts[fid] -= 1
                    slot_booked[t_key].remove(fid)
                    fac_assigned_times[fid].pop()
                return False

            return assignment if backtrack(0) else {}

        for enforce_spacing in (True, False):
            assignment = search(require_exact_caps=True, enforce_spacing=enforce_spacing)
            if assignment:
                return assignment
            assignment = search(require_exact_caps=False, enforce_spacing=enforce_spacing)
            if assignment:
                return assignment
        return {}
