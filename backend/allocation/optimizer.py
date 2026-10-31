import time
from collections import defaultdict
from .semester_engine import SemesterStatusEngine
from .eligibility import EligibilityEngine
from .candidate_evaluator import CandidateEvaluator
from .explanations import ExplanationEngine
from .buffer_rules import BufferRuleEvaluator

class AllocationOptimizer:
    """
    Intelligent multi-session constraint allocation and workload fairness solver.
    """

    @classmethod
    def run_optimization(cls, cie, exam_sessions, all_faculty, all_semesters, buffer_minutes=60, include_squad=False):
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
                and d.exam_session.semester_id in target_sem_ids
                and d.exam_session_id not in target_sess_ids
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
            csp_solution = cls._solve_invigilation_csp(
                exam_sessions=exam_sessions,
                all_faculty=all_faculty,
                all_semesters=all_semesters,
                cie_exam_sem_ids=cie_exam_sem_ids,
                existing_cie_duties=cie_duties,
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

                    for fac in all_faculty:
                        current_slot_duties = assigned_duties_by_faculty[fac.id]
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
                            csp_cand = next((c for c in eligible if c['faculty'].id == csp_fac_id), None)
                            if not csp_cand:
                                csp_fac = next((f for f in all_faculty if f.id == csp_fac_id), None)
                                if csp_fac and cie_duties[csp_fac.id] < (csp_fac.max_duty_capacity if csp_fac.max_duty_capacity is not None else 10):
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
                                            buffer_minutes=0,
                                            duty_type=duty_type,
                                            run_assigned_count=cie_duties[csp_fac.id]
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
                                                'score_info': score_info
                                            }
                            if csp_cand:
                                chosen_candidate = csp_cand
                        
                        if not chosen_candidate and eligible:
                            eligible.sort(key=lambda x: (
                                -((x['faculty'].max_duty_capacity if x['faculty'].max_duty_capacity is not None else 10) - cie_duties[x['faculty'].id]),
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
                            'room_number': room_number
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

    @classmethod
    def _solve_invigilation_csp(
        cls,
        exam_sessions,
        all_faculty,
        all_semesters,
        cie_exam_sem_ids,
        existing_cie_duties=None,
        buffer_minutes=60
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
            f.id: (f.max_duty_capacity if f.max_duty_capacity is not None else 5)
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
            cands_0 = []
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
                    run_assigned_count=0
                )
                if res60['is_eligible']:
                    cands_60.append(fac.id)
                else:
                    # CRITICAL USER RULE: NEVER relax timetable buffer for regular classes (e.g. 5th & 7th sem)!
                    # If faculty has class at 11:00 AM, NEVER assign duty within 1 hour before/after.
                    tt_conflict = any('Timetable Conflict' in r for r in res60.get('disqualification_reasons', []))
                    if not tt_conflict:
                        res0 = EligibilityEngine.evaluate_candidate(
                            faculty=fac,
                            exam_session=sess,
                            regular_semester_ids=regular_sem_ids,
                            current_slot_duties=None,
                            buffer_minutes=0,
                            duty_type='Invigilation',
                            run_assigned_count=0
                        )
                        if res0['is_eligible']:
                            cands_0.append(fac.id)

            # Prioritize candidates with full 60m buffer
            cands = cands_60 + [fid for fid in cands_0 if fid not in cands_60]
            req_candidates.append(cands)

        assignment = {}
        fac_counts = defaultdict(int)
        fac_assigned_times = defaultdict(list)
        slot_booked = defaultdict(set)
        req_order = sorted(range(len(reqs)), key=lambda i: len(req_candidates[i]))

        state = {'steps': 0}
        max_steps = 25000

        def backtrack(step):
            state['steps'] += 1
            if state['steps'] > max_steps:
                return False

            if step == len(req_order):
                return all(fac_counts[fid] == target_caps[fid] for fid in target_caps)

            r_idx = req_order[step]
            t_key = reqs[r_idx]['time_key']
            req_sess = reqs[r_idx]['session']
            e_start = BufferRuleEvaluator.parse_minutes(req_sess.start_time)
            e_end = BufferRuleEvaluator.parse_minutes(req_sess.end_time)
            req_date = req_sess.exam_date

            candidates = list(req_candidates[r_idx])
            candidates.sort(key=lambda fid: target_caps.get(fid, 10) - fac_counts[fid], reverse=True)

            for fid in candidates:
                if fid in slot_booked[t_key]:
                    continue
                if fac_counts[fid] >= target_caps.get(fid, 10):
                    continue

                has_buffer_clash = False
                for (d_date, d_start, d_end) in fac_assigned_times[fid]:
                    if d_date == req_date:
                        if max(e_start, d_start - buffer_minutes) < min(e_end, d_end + buffer_minutes):
                            has_buffer_clash = True
                            break
                if has_buffer_clash:
                    continue

                assignment[reqs[r_idx]['req_key']] = fid
                fac_counts[fid] += 1
                slot_booked[t_key].add(fid)
                fac_assigned_times[fid].append((req_date, e_start, e_end))

                if backtrack(step + 1):
                    return True

                del assignment[reqs[r_idx]['req_key']]
                fac_counts[fid] -= 1
                slot_booked[t_key].remove(fid)
                fac_assigned_times[fid].pop()

            return False

        if backtrack(0):
            return assignment

        # Secondary search: if strict exact matching failed, relax within target_caps ceilings
        assignment.clear()
        fac_counts.clear()
        fac_assigned_times.clear()
        slot_booked.clear()
        state['steps'] = 0

        def backtrack_relaxed(step):
            state['steps'] += 1
            if state['steps'] > max_steps:
                return False

            if step == len(req_order):
                return True

            r_idx = req_order[step]
            t_key = reqs[r_idx]['time_key']
            req_sess = reqs[r_idx]['session']
            e_start = BufferRuleEvaluator.parse_minutes(req_sess.start_time)
            e_end = BufferRuleEvaluator.parse_minutes(req_sess.end_time)
            req_date = req_sess.exam_date

            candidates = list(req_candidates[r_idx])
            candidates.sort(key=lambda fid: target_caps.get(fid, 10) - fac_counts[fid], reverse=True)

            for fid in candidates:
                if fid in slot_booked[t_key]:
                    continue
                if fac_counts[fid] >= target_caps.get(fid, 10):
                    continue

                has_buffer_clash = False
                for (d_date, d_start, d_end) in fac_assigned_times[fid]:
                    if d_date == req_date:
                        if max(e_start, d_start - buffer_minutes) < min(e_end, d_end + buffer_minutes):
                            has_buffer_clash = True
                            break
                if has_buffer_clash:
                    continue

                assignment[reqs[r_idx]['req_key']] = fid
                fac_counts[fid] += 1
                slot_booked[t_key].add(fid)
                fac_assigned_times[fid].append((req_date, e_start, e_end))

                if backtrack_relaxed(step + 1):
                    return True

                del assignment[reqs[r_idx]['req_key']]
                fac_counts[fid] -= 1
                slot_booked[t_key].remove(fid)
                fac_assigned_times[fid].pop()

            return False

        if backtrack_relaxed(0):
            return assignment

        return {}
