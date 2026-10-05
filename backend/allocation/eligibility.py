from .buffer_rules import BufferRuleEvaluator
from .timetable_conflicts import TimetableConflictEngine

class EligibilityEngine:
    """
    Evaluates ALL HARD CONSTRAINTS for a candidate faculty member for a target exam session.
    
    HARD CONSTRAINTS (Zero Tolerance):
    1. Active Status: Must be active faculty (is_active == True).
    2. Exclusion Flag: Must be flagged eligible_for_duty == True.
    3. Availability / Leave: Must not have recorded unavailability/leave covering this slot.
    4. Overlapping Exam Duty: Cannot be already booked for another exam duty in the same time window.
    5. Timetable Conflict: Must have NO regular classes in active regular-class semesters within the session time plus 1-hour buffer.
    6. Duty Capacity: Must not exceed max_duty_capacity.
    """

    @classmethod
    def evaluate_candidate(cls, faculty, exam_session, regular_semester_ids, current_slot_duties=None, buffer_minutes=60, duty_type='Invigilation', run_assigned_count=0, ignore_capacity=False):
        """
        Args:
            faculty: Faculty object
            exam_session: ExamSession object
            regular_semester_ids: set of int (semesters having regular classes)
            current_slot_duties: list of Duty objects already assigned in this allocation run or existing in db
            buffer_minutes: int (default 60)
            duty_type: 'Invigilation' | 'Squad Duty' | 'Room Superintendent'
            run_assigned_count: int (number of duties assigned to this faculty during the current CIE allocation run)
            ignore_capacity: bool (whether to bypass capacity limit to ensure all slots are staffed)
            
        Returns:
            dict: {
                'is_eligible': bool,
                'disqualification_reasons': list of str,
                'checks_passed': list of str,
                'conflict_details': list of dict
            }
        """
        disqualifications = []
        checks_passed = []
        conflict_details = []

        # 1. Active Status Check
        if not faculty.is_active:
            disqualifications.append("Faculty is inactive / on sabbatical.")
        else:
            checks_passed.append("Active faculty status verified.")

        # 2. Exclusion Flag Check
        if not faculty.eligible_for_duty:
            disqualifications.append(f"Faculty is excluded from exam duty allocation (eligible_for_duty = False).")
        else:
            checks_passed.append("Eligible for duty allocation.")

        # 2b. Squad Duty Role Restriction (CRITICAL RULE: Dr. Arjun B C is SQUAD DUTY ONLY)
        is_squad_only = getattr(faculty, 'only_squad_duty', False) or (
            faculty.id == 1 or 'Arjun' in (faculty.name or '') or 'Head of the Department' in (faculty.designation or '')
        )
        if is_squad_only and duty_type != 'Squad Duty':
            disqualifications.append(
                f"{faculty.name} is designated exclusively for Squad Duty (exempt from room invigilation)."
            )
        elif is_squad_only and duty_type == 'Squad Duty':
            checks_passed.append(f"{faculty.name} verified as designated Squad Duty officer.")

        # 3. Capacity Ceiling Check (strictly scoped to this CIE cycle's run_assigned_count)
        eff_capacity = faculty.max_duty_capacity if faculty.max_duty_capacity is not None else 10
        total_workload = run_assigned_count
        if not ignore_capacity and total_workload >= eff_capacity:
            disqualifications.append(
                f"Maximum workload capacity reached ({total_workload}/{eff_capacity} duties assigned in this CIE cycle)."
            )
        else:
            checks_passed.append(f"Duty capacity available ({total_workload}/{eff_capacity} assigned in this CIE).")

        # 4. Explicit Availability / Leave Check
        e_start = BufferRuleEvaluator.parse_minutes(exam_session.start_time)
        e_end = BufferRuleEvaluator.parse_minutes(exam_session.end_time)

        for unavail in faculty.availabilities:
            if unavail.date == exam_session.exam_date and not unavail.is_available:
                u_start = BufferRuleEvaluator.parse_minutes(unavail.start_time)
                u_end = BufferRuleEvaluator.parse_minutes(unavail.end_time)
                # Overlap between leave and exam session
                if max(e_start, u_start) < min(e_end, u_end):
                    disqualifications.append(
                        f"Faculty is unavailable on {exam_session.exam_date.isoformat()} "
                        f"({unavail.start_time}-{unavail.end_time}): {unavail.reason or 'Leave registered'}."
                    )
                    break
        else:
            checks_passed.append("No conflicting leave or availability restrictions.")

        # 5. Overlapping Exam Duty Check (Simultaneous assignment prevention)
        has_overlap = False

        # Check in current allocation run session assignments
        if current_slot_duties:
            for d in current_slot_duties:
                if d.get('faculty_id') == faculty.id and d.get('exam_date') == exam_session.exam_date:
                    d_start = BufferRuleEvaluator.parse_minutes(d.get('start_time'))
                    d_end = BufferRuleEvaluator.parse_minutes(d.get('end_time'))
                    if max(e_start, d_start) < min(e_end, d_end):
                        has_overlap = True
                        disqualifications.append(
                            f"Simultaneous slot assignment: Allocated to Room {d.get('room_number')} in this session."
                        )
                        break

        if not has_overlap:
            checks_passed.append("No simultaneous exam duty commitments.")

        # 6. Timetable & Buffer Conflict Check
        if regular_semester_ids and len(regular_semester_ids) > 0:
            tt_result = TimetableConflictEngine.check_faculty_timetable_conflicts(
                faculty=faculty,
                exam_session=exam_session,
                regular_semester_ids=regular_semester_ids,
                buffer_minutes=buffer_minutes
            )

            if tt_result['has_conflict']:
                for conf in tt_result['conflicts']:
                    conflict_details.append(conf)
                    disqualifications.append(
                        f"Timetable Conflict [{conf['semester_name']}]: {conf['subject_code']} lecture "
                        f"({conf['class_time']}) violates {buffer_minutes}m buffer protection."
                    )
            else:
                checks_passed.append(f"Timetable clear across regular semesters with protected {buffer_minutes}m buffer.")
        else:
            checks_passed.append("No regular classes active during this exam session.")

        is_eligible = len(disqualifications) == 0

        return {
            'is_eligible': is_eligible,
            'disqualification_reasons': disqualifications,
            'checks_passed': checks_passed,
            'conflict_details': conflict_details,
            'current_workload': total_workload
        }
