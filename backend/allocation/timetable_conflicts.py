from .buffer_rules import BufferRuleEvaluator

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

    @classmethod
    def get_day_of_week(cls, exam_date):
        """Converts date object to 'MON', 'TUE', etc."""
        return cls.DAY_MAP.get(exam_date.weekday(), 'MON')

    @classmethod
    def check_faculty_timetable_conflicts(cls, faculty, exam_session, regular_semester_ids, buffer_minutes=60):
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

        # Filter timetable entries for this faculty on this day belonging to regular semesters
        relevant_entries = [
            entry for entry in faculty.timetable_entries
            if entry.day_of_week == day_str and entry.semester_id in regular_semester_ids
        ]

        checked_count = len(relevant_entries)

        for entry in relevant_entries:
            eval_result = BufferRuleEvaluator.check_buffer_conflict(
                class_start_str=entry.start_time,
                class_end_str=entry.end_time,
                exam_start_str=exam_session.start_time,
                exam_end_str=exam_session.end_time,
                buffer_minutes=buffer_minutes
            )

            if eval_result['conflict']:
                conflicts.append({
                    'semester_name': entry.semester.name if entry.semester else f"Semester ID {entry.semester_id}",
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
            'checked_classes_count': checked_count
        }

