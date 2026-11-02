import re

from .buffer_rules import BufferRuleEvaluator
from models import TimetableCoverage


def normalize_academic_year(value):
    digits = ''.join(character for character in str(value or '') if character.isdigit())
    if len(digits) >= 6:
        return f'{digits[:4]}-{digits[-2:]}'
    return str(value or '').strip()

class TimetableConflictEngine:
    """
    Evaluates timetable conflicts for faculty members during specific exam sessions.
    
    Inspects all timetable entries for the regular-class semesters on the day of the exam.
    Applies the mandatory 1-hour buffer rule.
    """

    DAY_MAP = {
        0: 'MON',
        1: 'TUE',
        2: 'WED',
        3: 'THU',
        4: 'FRI',
        5: 'SAT',
        6: 'SUN'
    }

    @staticmethod
    def _department_key(department):
        return 'robot' if 'robot' in (department or '').lower() else 'cse'

    @classmethod
    def get_day_of_week(cls, exam_date):
        """Converts date object to 'MON', 'TUE', etc."""
        return cls.DAY_MAP.get(exam_date.weekday(), 'MON')

    @classmethod
    def is_nss_yoga_pe(cls, entry):
        """
        Determines whether a timetable entry is an NSS / Yoga / PE / Sports / Music / SCR session.
        CRITICAL USER RULE: These activities do not block faculty from examination duty.
        """
        if not entry:
            return False
        sub_code = (entry.subject.code if entry.subject else '').upper().strip()
        sub_name = (entry.subject.name if entry.subject else '').lower().strip()
        
        if 'NYP' in sub_code or 'SCR' in sub_code or 'PT' in sub_code:
            return True
        keywords = ['nss', 'yoga', 'physical education', 'sports', 'music', 'community project', 'societal project', 'social connect', 'placement training', 'placement']
        return any(k in sub_name for k in keywords) or bool(re.search(r'\b(pe|pt)\b', sub_name))

    @classmethod
    def get_missing_coverage(cls, exam_session, all_semesters):
        exam_semester = getattr(exam_session, 'semester', None)
        sem_number = getattr(exam_semester, 'sem_number', None)
        if sem_number is None:
            sem_number = getattr(exam_session, 'sem_number', None)
        if sem_number is None:
            return ['Exam semester is unavailable; timetable coverage cannot be verified.']

        if sem_number == 3:
            # Third-semester CIEs run concurrently with Robotics third-semester CIEs.
            # Only fifth- and seventh-semester classes remain active for invigilation checks.
            relevant_numbers = (5, 7)
        elif sem_number in (5, 7):
            relevant_numbers = (3, 5, 7)
        else:
            relevant_numbers = (4, 6)
        year = normalize_academic_year(
            getattr(getattr(exam_session, 'cie', None), 'academic_year', None)
            or getattr(exam_semester, 'academic_year', None)
        )
        coverage = TimetableCoverage.query.filter_by(academic_year=year).all()
        verified = {
            (row.sem_number, 'robot' if 'robot' in row.department.lower() else 'cse')
            for row in coverage if row.is_verified
        }
        missing = []
        for number in relevant_numbers:
            for dept_key, dept_name in (
                ('cse', 'CSE (AI & ML)'),
                ('robot', 'Robotics & Artificial Intelligence')
            ):
                if (number, dept_key) not in verified:
                    missing.append(f'{dept_name}, {number}th semester')
        return missing

    @classmethod
    def check_faculty_timetable_conflicts(cls, faculty, exam_session, regular_semester_ids=None, buffer_minutes=60, all_semesters=None, coverage_missing=None):
        """
        Args:
            faculty: Faculty object
            exam_session: ExamSession object
            regular_semester_ids: set of int (semesters that have regular classes during this session)
            buffer_minutes: int (default 60)
            
        Returns:
            dict: {
                'has_conflict': bool,
                'conflicts': list of dict,
                'checked_classes_count': int
            }
        """
        day_str = cls.get_day_of_week(exam_session.exam_date)
        conflicts = []
        checked_count = 0

        exam_semester = getattr(exam_session, 'semester', None)
        sem_number = getattr(exam_semester, 'sem_number', None)
        if sem_number is None:
            sem_number = getattr(exam_session, 'sem_number', None)
        if sem_number == 3:
            # Robotics third-semester students are also in CIE at the same time.
            # Their timetable must not block CSE third-semester invigilation.
            relevant_numbers = {5, 7}
        elif sem_number in (5, 7):
            relevant_numbers = {3, 5, 7}
        else:
            relevant_numbers = set((3, 5, 7) if sem_number and sem_number % 2 else (4, 6))
        regular_ids = set(regular_semester_ids) if regular_semester_ids is not None else None
        target_year = normalize_academic_year(
            getattr(getattr(exam_session, 'cie', None), 'academic_year', None)
            or getattr(exam_semester, 'academic_year', None)
        )

        # Check only the semester numbers that remain in regular classes for this exam.
        relevant_entries = []
        for entry in faculty.timetable_entries:
            if entry.day_of_week != day_str:
                continue
            if entry.semester and entry.semester.sem_number not in relevant_numbers:
                continue
            entry_department = (
                entry.department
                or (entry.subject.department if entry.subject else '')
            )
            target_subject = getattr(exam_session, 'subject', None)
            target_department = getattr(target_subject, 'department', '') or 'CSE (AI & ML)'
            same_exam_scope = (
                entry.semester_id == getattr(exam_session, 'semester_id', None)
                and cls._department_key(entry_department) == cls._department_key(target_department)
            )
            if entry.semester and sem_number in (3, 5, 7):
                if same_exam_scope:
                    continue
            elif entry.semester and regular_ids is not None:
                if entry.semester_id not in regular_ids and not (
                    entry.semester_id == getattr(exam_session, 'semester_id', None)
                    and not same_exam_scope
                ):
                    continue
            elif entry.semester and same_exam_scope:
                continue
            if entry.semester and target_year and normalize_academic_year(entry.academic_year) != target_year:
                continue

            # CRITICAL RULE: NEVER consider NSS / Yoga / PE / SCR as a timetable conflict!
            if cls.is_nss_yoga_pe(entry):
                continue

            is_robotics = cls._department_key(entry_department) == 'robot'

            relevant_entries.append((entry, is_robotics))

        checked_count = len(relevant_entries)

        for entry, is_robotics in relevant_entries:
            eval_result = BufferRuleEvaluator.check_buffer_conflict(
                class_start_str=entry.start_time,
                class_end_str=entry.end_time,
                exam_start_str=exam_session.start_time,
                exam_end_str=exam_session.end_time,
                buffer_minutes=buffer_minutes
            )

            if eval_result['conflict']:
                dept_label = "Robotics & AI" if is_robotics else (entry.semester.name if entry.semester else f"Semester ID {entry.semester_id}")
                sem_display = f"{dept_label} ({entry.semester.name})" if is_robotics and entry.semester else dept_label
                conflicts.append({
                    'semester_name': sem_display,
                    'subject_code': entry.subject.code if entry.subject else "N/A",
                    'subject_name': entry.subject.name if entry.subject else "N/A",
                    'class_time': f"{entry.start_time} - {entry.end_time}",
                    'room_number': entry.room_number,
                    'is_direct_overlap': eval_result['is_direct_overlap'],
                    'reason': eval_result['reason'],
                    'protected_window': eval_result['class_protected_window']
                })

        return {
            'has_conflict': len(conflicts) > 0,
            'conflicts': conflicts,
            'checked_classes_count': checked_count,
            'missing_timetable_coverage': (
                coverage_missing if coverage_missing is not None
                else cls.get_missing_coverage(exam_session, all_semesters or [])
            )
        }
