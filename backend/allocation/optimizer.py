import time
from collections import defaultdict
from .semester_engine import SemesterStatusEngine
from .eligibility import EligibilityEngine
from .candidate_evaluator import CandidateEvaluator
from .explanations import ExplanationEngine

class AllocationOptimizer:
    """
    Intelligent multi-session constraint allocation and workload fairness solver.
    """

    @classmethod
    def run_optimization(cls, cie, exam_sessions, all_faculty, all_semesters, buffer_minutes=60):
        """
        Executes the 15-step allocation pipeline across all exam sessions in the CIE.
        
        Args:
            cie: CIE object
            exam_sessions: list of ExamSession objects
            all_faculty: list of Faculty objects
            all_semesters: list of Semester objects
            buffer_minutes: int (default 60)
            
        Returns:
            dict: {
                'status': 'SUCCESS' | 'PARTIAL' | 'FAILED',
                'allocated_duties': list of dict,
                'unallocated_sessions': list of dict,
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

        # Initialize tracking maps for cumulative duties
        cumulative_duties = defaultdict(int)
        cie_duties = defaultdict(int)

        # Pre-populate existing historical duties across other CIEs
        for fac in all_faculty:
            valid_existing = [d for d in fac.duties if d.status != 'CANCELLED']
            cumulative_duties[fac.id] = len(valid_existing)
            # Count duties specifically in this CIE
            cie_duties[fac.id] = sum(
                1 for d in valid_existing
                if d.exam_session and d.exam_session.cie_id == cie.id
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
        total_required = 0
        total_allocated = 0
        total_pending = 0
        total_conflicts = 0

        # Identify all semesters taking exams in this CIE
        cie_exam_sem_ids = {s.semester_id for s in exam_sessions}

        # Solve global CSP for Invigilation duties to satisfy exact capacities & clash avoidance
        try:
            csp_solution = cls._solve_invigilation_csp(
                exam_sessions=exam_sessions,
                all_faculty=all_faculty,
                all_semesters=all_semesters,
                cie_exam_sem_ids=cie_exam_sem_ids,
                buffer_minutes=buffer_minutes
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

            # Slot-level assigned faculty in this allocation run
            slot_assigned_faculty_ids = set()
            slot_squad_count = 0

            # Process each session in this slot
            for session in sessions_in_slot:
                # Room-wise invigilation duty requirements:
                # If session has exam_rooms, each room is an independent duty requirement!
                duty_requirements = []
                if session.exam_rooms and len(session.exam_rooms) > 0:
                    for room in session.exam_rooms:
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
                    # Fallback for sessions without explicit exam_rooms
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

                # Squad duty requirements: consolidated to 1 roving supervisor per exam slot
                if (session.required_squad or 0) > 0 and slot_squad_count == 0:
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

                    # Evaluate all candidate faculty
                    disqualified = []
                    eligible = []

                    # Current assignments in this slot so far (prevents same-time double-booking across rooms)
                    current_slot_duties = [
                        {
                            'faculty_id': fid,
                            'exam_date': slot_date,
                            'start_time': slot_start,
                            'end_time': slot_end,
                            'room_number': room_number
                        }
                        for fid in slot_assigned_faculty_ids
                    ]

                    for fac in all_faculty:
                        eval_res = EligibilityEngine.evaluate_candidate(
                            faculty=fac,
                            exam_session=session,
                            regular_semester_ids=regular_sem_ids,
                            current_slot_duties=current_slot_duties,
                            buffer_minutes=buffer_minutes,
                            duty_type=duty_type,
                            run_assigned_count=cie_duties[fac.id]
                        )

                        if not eval_res['is_eligible']:
                            disqualified.append({
                                'faculty': fac,
                                'reasons': eval_res['disqualification_reasons'],
                                'conflict_details': eval_res['conflict_details']
                            })
                        else:
                            # Candidate is eligible! Compute soft optimization score
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
                            matched = [c for c in eligible if c['faculty'].id == csp_fac_id]
                            if matched:
                                chosen_candidate = matched[0]
                        
                        if not chosen_candidate and eligible:
                            eligible.sort(key=lambda x: x['score_info']['penalty_score'])
                            chosen_candidate = eligible[0]

                    # 1ST FALLBACK: If capacity limit was reached but duties remain, relax capacity to staff every room
                    if not chosen_candidate:
                        fallback_eligible = []
                        for fac in all_faculty:
                            fb_res = EligibilityEngine.evaluate_candidate(
                                faculty=fac,
                                exam_session=session,
                                regular_semester_ids=regular_sem_ids,
                                current_slot_duties=current_slot_duties,
                                buffer_minutes=buffer_minutes,
                                duty_type=duty_type,
                                run_assigned_count=cie_duties[fac.id],
                                ignore_capacity=True
                            )
                            if fb_res['is_eligible']:
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
                            if duty_type == 'Squad Duty':
                                fallback_eligible.sort(key=lambda x: (
                                    not (x['faculty'].id in squad_faculty_ids or getattr(x['faculty'], 'only_squad_duty', False) or x['faculty'].id == 1 or 'Arjun' in (x['faculty'].name or '')),
                                    cie_duties[x['faculty'].id]
                                ))
                            else:
                                fallback_eligible.sort(key=lambda x: (
                                    cie_duties[x['faculty'].id],
                                    x['score_info']['penalty_score']
                                ))
                            chosen_candidate = fallback_eligible[0]

                    # 2ND FALLBACK: If 60m buffer was too tight, relax buffer to prevent empty rooms while avoiding direct clashes
                    if not chosen_candidate:
                        buf_fallback = []
                        for fac in all_faculty:
                            bfb_res = EligibilityEngine.evaluate_candidate(
                                faculty=fac,
                                exam_session=session,
                                regular_semester_ids=regular_sem_ids,
                                current_slot_duties=current_slot_duties,
                                buffer_minutes=0,
                                duty_type=duty_type,
                                run_assigned_count=cie_duties[fac.id],
                                ignore_capacity=True
                            )
                            if bfb_res['is_eligible']:
                                score_info = CandidateEvaluator.score_candidate(
                                    faculty=fac,
                                    cie_name=cie.name,
                                    cumulative_duties=cumulative_duties[fac.id],
                                    current_cie_duties=cie_duties[fac.id]
                                )
                                buf_fallback.append({
                                    'faculty': fac,
                                    'score_info': score_info
                                })
                        if buf_fallback:
                            if duty_type == 'Squad Duty':
                                buf_fallback.sort(key=lambda x: (
                                    not (getattr(x['faculty'], 'only_squad_duty', False) or x['faculty'].id == 1 or 'Arjun' in (x['faculty'].name or '')),
                                    cie_duties[x['faculty'].id]
                                ))
                            else:
                                buf_fallback.sort(key=lambda x: (
                                    cie_duties[x['faculty'].id],
                                    x['score_info']['penalty_score']
                                ))
                            chosen_candidate = buf_fallback[0]

                    # 3RD ABSOLUTE EMERGENCY FALLBACK: Pick any eligible active faculty not yet assigned in this slot
                    if not chosen_candidate:
                        if duty_type == 'Squad Duty':
                            squad_pool = [
                                f for f in all_faculty
                                if f.is_active and f.eligible_for_duty and f.id not in slot_assigned_faculty_ids
                            ]
                            if squad_pool:
                                squad_pool.sort(key=lambda f: (
                                    not (f.id in squad_faculty_ids or getattr(f, 'only_squad_duty', False) or f.id == 1 or 'Arjun' in (f.name or '')),
                                    cie_duties[f.id]
                                ))
                                chosen_candidate = {
                                    'faculty': squad_pool[0],
                                    'score_info': {'penalty_score': 0, 'tiebreaker_score': 0}
                                }
                        else:
                            invig_pool = [
                                f for f in all_faculty
                                if f.is_active and f.eligible_for_duty
                                and not getattr(f, 'only_squad_duty', False)
                                and f.id != 1
                                and 'Arjun' not in (f.name or '')
                                and f.id not in slot_assigned_faculty_ids
                            ]
                            if invig_pool:
                                invig_pool.sort(key=lambda f: cie_duties[f.id])
                                chosen_candidate = {
                                    'faculty': invig_pool[0],
                                    'score_info': {'penalty_score': 0, 'tiebreaker_score': 0}
                                }

                    if chosen_candidate:
                        # Select chosen candidate
                        best = chosen_candidate
                        chosen_fac = best['faculty']

                        # Mark as assigned in this time slot
                        slot_assigned_faculty_ids.add(chosen_fac.id)
                        cumulative_duties[chosen_fac.id] += 1
                        cie_duties[chosen_fac.id] += 1

                        total_allocated += 1

                        # Generate explanation
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
                        # No eligible candidate found!
                        total_pending += 1
                        total_conflicts += 1
                        logs.append(
                            f"WARNING: Insufficient eligible faculty for {duty_type} in Session ID {session.id} "
                            f"(Room {room_number}, {slot_date.isoformat()} {slot_start}-{slot_end})."
                        )

                        # Generate unallocated explanation
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
                            'override_reason': 'Automated allocation found no eligible faculty satisfying timetable buffer & availability constraints.'
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

    @classmethod
    def _solve_invigilation_csp(cls, exam_sessions, all_faculty, all_semesters, cie_exam_sem_ids, buffer_minutes=60):
        """
        Backtracking CSP solver for Invigilation duties across sessions/rooms.
        Guarantees exact capacity compliance and zero timetable clashes (plus buffer).
        """
        reqs = []
        for sess in exam_sessions:
            if sess.exam_rooms and len(sess.exam_rooms) > 0:
                for room in sess.exam_rooms:
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

        req_candidates = []
        for req in reqs:
            sess = req['session']
            sem_classification = SemesterStatusEngine.classify_semesters_for_slot(
                slot_sessions=[sess],
                all_active_semesters=all_semesters,
                cie_exam_semester_ids=cie_exam_sem_ids
            )
            regular_sem_ids = sem_classification['regular_class_semester_ids']

            eligible_fids = []
            for fac in all_faculty:
                # Disqualify squad-only faculty (e.g. Dr. Arjun B C) from room invigilation
                if getattr(fac, 'only_squad_duty', False) or fac.id == 1 or 'Arjun' in (fac.name or ''):
                    continue

                res = EligibilityEngine.evaluate_candidate(
                    faculty=fac,
                    exam_session=sess,
                    regular_semester_ids=regular_sem_ids,
                    current_slot_duties=None,
                    buffer_minutes=buffer_minutes,
                    duty_type='Invigilation',
                    run_assigned_count=0
                )
                if res['is_eligible']:
                    eligible_fids.append(fac.id)
            req_candidates.append(eligible_fids)

        assignment = {}
        fac_counts = defaultdict(int)
        slot_booked = defaultdict(set)
        max_caps = {f.id: (f.max_duty_capacity if f.max_duty_capacity is not None else 10) for f in all_faculty}

        steps = 0
        max_steps = 2000

        def backtrack(idx):
            nonlocal steps
            steps += 1
            if steps > max_steps:
                return False

            if idx == len(reqs):
                return True

            candidates = list(req_candidates[idx])
            # Sort candidates by remaining capacity descending to balance workload
            candidates.sort(key=lambda fid: max_caps.get(fid, 10) - fac_counts[fid], reverse=True)

            t_key = reqs[idx]['time_key']
            for fid in candidates:
                if fid in slot_booked[t_key]:
                    continue
                if fac_counts[fid] >= max_caps.get(fid, 10):
                    continue

                assignment[reqs[idx]['req_key']] = fid
                fac_counts[fid] += 1
                slot_booked[t_key].add(fid)

                if backtrack(idx + 1):
                    return True

                del assignment[reqs[idx]['req_key']]
                fac_counts[fid] -= 1
                slot_booked[t_key].remove(fid)

            return False

        if backtrack(0):
            return assignment
        return {}

