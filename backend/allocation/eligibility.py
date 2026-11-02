from .buffer_rules import BufferRuleEvaluator
from .timetable_conflicts import TimetableConflictEngine
from .timetable_conflicts import normalize_academic_year
from models import db, SystemSettings
from sqlalchemy import text, update

class EligibilityEngine:
    """
    Evaluates ALL HARD CONSTRAINTS for a candidate faculty member for a target exam session.
    
    HARD CONSTRAINTS (Zero Tolerance):
    1. Active Status: Must be active faculty (is_active == True).
    2. Exclusion Flag: Must be flagged eligible_for_duty == True.
    3. Availability / Leave: Must not have recorded unavailability/leave covering this slot.
    4. Exam Duty Buffer: Must not have simultaneous/overlapping assigned exam duties.
    5. Timetable Conflict: Must have NO class in the relevant semester/department timetables within the session time plus buffer.
    6. Duty Quota: Must not exceed max_duty_capacity in the configured quota period.
    """

    QUOTA_PERIODS = ('cie', 'month', 'semester', 'academic_term')
    DEFAULT_DUTY_QUOTA = 15

    @classmethod
    def lock_quota_window(cls):
        if db.engine.dialect.name == 'sqlite':
            db.session.execute(text(
                "INSERT OR IGNORE INTO system_settings (key, value, description) "
                "VALUES ('duty_quota_lock', '0', 'Serialized duty quota checks')"
            ))
            db.session.execute(
                update(SystemSettings)
                .where(SystemSettings.key == 'duty_quota_lock')
                .values(value=SystemSettings.value)
            )

    @classmethod
    def get_quota_period(cls):
        setting = SystemSettings.query.filter_by(key='duty_quota_period').first()
        period = (setting.value if setting else 'cie').strip().lower()
        return period if period in cls.QUOTA_PERIODS else 'cie'

    @staticmethod
    def get_duty_spacing_settings():
        session_setting = SystemSettings.query.filter_by(key='duty_spacing_sessions').first()
        day_setting = SystemSettings.query.filter_by(key='duty_spacing_days').first()
        try:
            minimum_sessions_between = max(0, int(session_setting.value)) if session_setting else 1
        except (TypeError, ValueError):
            minimum_sessions_between = 1
        try:
            minimum_rest_days = max(0, int(day_setting.value)) if day_setting else 1
        except (TypeError, ValueError):
            minimum_rest_days = 1
        return {
            'minimum_sessions_between': minimum_sessions_between,
            'minimum_rest_days': minimum_rest_days
        }

    @staticmethod
    def _same_quota_period(existing_session, target_session, period):
        if period == 'cie':
            return existing_session.cie_id == target_session.cie_id
        if period == 'month':
            return (
                existing_session.exam_date.year == target_session.exam_date.year
                and existing_session.exam_date.month == target_session.exam_date.month
            )
        if period == 'semester':
            return existing_session.semester_id == target_session.semester_id
        if period == 'academic_term':
            existing_sem = existing_session.semester
            target_sem = target_session.semester
            same_parity = (
                existing_sem is not None
                and target_sem is not None
                and existing_sem.sem_number % 2 == target_sem.sem_number % 2
            )
            existing_year = normalize_academic_year(
                existing_session.cie.academic_year if existing_session.cie else None
            )
            target_year = normalize_academic_year(
                target_session.cie.academic_year if target_session.cie else None
            )
            return same_parity and existing_year == target_year
        return False

    @classmethod
    def get_quota_usage(
        cls,
        faculty,
        exam_session,
        quota_period=None,
        run_duties=None,
        exclude_duty_id=None,
        quota_scope_session_ids=None
    ):
        period = quota_period or cls.get_quota_period()
        used = sum(
            1 for duty in faculty.duties
            if duty.id != exclude_duty_id
            and duty.status in ('ASSIGNED', 'COMPLETED')
            and duty.exam_session
            and not (
                period == 'cie'
                and quota_scope_session_ids is not None
                and duty.exam_session_id not in quota_scope_session_ids
            )
            and cls._same_quota_period(duty.exam_session, exam_session, period)
        )
        for duty_data in run_duties or []:
            if duty_data.get('faculty_id') != faculty.id:
                continue
            if period == 'cie' and duty_data.get('cie_id') == exam_session.cie_id:
                used += 1
            elif period == 'month':
                duty_date = duty_data.get('exam_date')
                if duty_date and duty_date.year == exam_session.exam_date.year and duty_date.month == exam_session.exam_date.month:
                    used += 1
            elif period == 'semester' and duty_data.get('semester_id') == exam_session.semester_id:
                used += 1
            elif period == 'academic_term':
                duty_sem_number = duty_data.get('sem_number')
                duty_year = normalize_academic_year(duty_data.get('academic_year'))
                target_year = normalize_academic_year(
                    exam_session.cie.academic_year if exam_session.cie else None
                )
                if (
                    duty_sem_number is not None
                    and exam_session.semester
                    and duty_sem_number % 2 == exam_session.semester.sem_number % 2
                    and duty_year == target_year
                ):
                    used += 1
        return used

    @classmethod
    def get_exam_duty_buffer_conflicts(
        cls,
        faculty,
        exam_session,
        buffer_minutes=30,
        current_slot_duties=None,
        exclude_duty_id=None,
        regular_semester_ids=None
    ):
        e_start = BufferRuleEvaluator.parse_minutes(exam_session.start_time)
        e_end = BufferRuleEvaluator.parse_minutes(exam_session.end_time)
        conflicts = []

        # Check duties assigned in current optimization run
        for duty_data in current_slot_duties or []:
            if duty_data.get('faculty_id') != faculty.id or duty_data.get('exam_date') != exam_session.exam_date:
                continue
            d_start = BufferRuleEvaluator.parse_minutes(duty_data['start_time'])
            d_end = BufferRuleEvaluator.parse_minutes(duty_data['end_time'])
            if max(e_start, d_start - buffer_minutes) < min(e_end, d_end + buffer_minutes):
                conflicts.append(
                    f"Exam duty buffer violation: Assigned duty ({duty_data['start_time']}-{duty_data['end_time']}) falls within the required {buffer_minutes}-minute gap."
                )

        # Check existing duties in DB
        sess_id = getattr(exam_session, 'id', None)
        sess_cie_id = getattr(exam_session, 'cie_id', None)
        sess_sem_id = getattr(exam_session, 'semester_id', None)
        for duty in faculty.duties:
            if duty.id == exclude_duty_id:
                continue
            if duty.status not in ('ASSIGNED', 'COMPLETED') or not duty.exam_session:
                continue
            if sess_id is not None and duty.exam_session_id == sess_id:
                continue
            if duty.exam_session.exam_date != exam_session.exam_date:
                continue
            # If duty belongs to a regular class semester for this exam session, skip it
            if regular_semester_ids and duty.exam_session.semester_id in regular_semester_ids:
                continue
            # If duty is in the same CIE but a different semester being allocated independently, skip it
            if sess_cie_id is not None and duty.exam_session.cie_id == sess_cie_id and sess_sem_id is not None and duty.exam_session.semester_id != sess_sem_id:
                continue
            d_start = BufferRuleEvaluator.parse_minutes(duty.exam_session.start_time)
            d_end = BufferRuleEvaluator.parse_minutes(duty.exam_session.end_time)
            if max(e_start, d_start - buffer_minutes) < min(e_end, d_end + buffer_minutes):
                conflicts.append(
                    f"Exam duty buffer violation: Existing duty ({duty.exam_session.start_time}-{duty.exam_session.end_time}) on {duty.exam_session.exam_date.isoformat()} falls within the required {buffer_minutes}-minute gap."
                )

        return sorted(set(conflicts))

    @classmethod
    def evaluate_candidate(cls, faculty, exam_session, regular_semester_ids=None, current_slot_duties=None, buffer_minutes=60, exam_duty_buffer_minutes=30, duty_type='Invigilation', run_assigned_count=0, ignore_capacity=False, exclude_duty_id=None, quota_period=None, run_duties=None, all_semesters=None, coverage_missing=None, quota_scope_session_ids=None):
        """
        Args:
            faculty: Faculty object
            exam_session: ExamSession object
            regular_semester_ids: set of int (semesters having regular classes)
            current_slot_duties: list of Duty objects already assigned in this allocation run or existing in db
            buffer_minutes: int timetable buffer (default 60)
            exam_duty_buffer_minutes: int gap between exam duties (default 30)
            duty_type: 'Invigilation' | 'Squad Duty' | 'Room Superintendent'
            run_assigned_count: legacy per-run workload count
            ignore_capacity: retained for compatibility; hard quotas are never bypassed
            
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

        # 3. Hard quota check across confirmed assignments in the configured period.
        eff_capacity = (
            faculty.max_duty_capacity
            if faculty.max_duty_capacity is not None
            else cls.DEFAULT_DUTY_QUOTA
        )
        effective_period = quota_period or cls.get_quota_period()
        total_workload = cls.get_quota_usage(
            faculty,
            exam_session,
            quota_period=effective_period,
            run_duties=run_duties,
            exclude_duty_id=exclude_duty_id,
            quota_scope_session_ids=quota_scope_session_ids
        )
        if total_workload >= eff_capacity:
            disqualifications.append(
                f"Duty capacity/quota full ({total_workload}/{eff_capacity}) for the {effective_period.replace('_', ' ')} period."
            )
        else:
            checks_passed.append(
                f"Duty quota available ({total_workload}/{eff_capacity}) for the {effective_period.replace('_', ' ')} period."
            )

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

        # 5. Exam Duty Buffer Check (Prevents simultaneous and buffer-violating duties)
        duty_conflicts = cls.get_exam_duty_buffer_conflicts(
            faculty=faculty,
            exam_session=exam_session,
            buffer_minutes=exam_duty_buffer_minutes,
            current_slot_duties=current_slot_duties,
            exclude_duty_id=exclude_duty_id,
            regular_semester_ids=regular_semester_ids
        )

        if duty_conflicts:
            disqualifications.append(
                f"Exam duty buffer violation: {', '.join(duty_conflicts)}."
            )
        else:
            checks_passed.append(
                "No conflicting simultaneous or buffer-violating assigned exam duties."
            )

        # 6. Respect active peer-semester timetables and their buffer windows.
        # Concurrent Robotics third-semester CIEs are excluded by the conflict engine.
        tt_result = TimetableConflictEngine.check_faculty_timetable_conflicts(
            faculty=faculty,
            exam_session=exam_session,
            regular_semester_ids=regular_semester_ids,
            buffer_minutes=buffer_minutes,
            all_semesters=all_semesters,
            coverage_missing=coverage_missing
        )

        if tt_result['has_conflict']:
            for conf in tt_result['conflicts']:
                conflict_details.append(conf)
                disqualifications.append(
                    f"Timetable Conflict [{conf['semester_name']}]: {conf['subject_code']} lecture "
                    f"({conf['class_time']}) violates {buffer_minutes}m buffer protection."
                )
        else:
            checks_passed.append(f"Timetable clear for the applicable peer semesters with protected {buffer_minutes}m buffer.")

        is_eligible = len(disqualifications) == 0

        return {
            'is_eligible': is_eligible,
            'disqualification_reasons': disqualifications,
            'checks_passed': checks_passed,
            'conflict_details': conflict_details,
            'current_workload': total_workload
        }
