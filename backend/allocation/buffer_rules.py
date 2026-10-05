class BufferRuleEvaluator:
    """
    Enforces the institutional protected timetable buffer rule.
    
    Rule:
    A faculty member cannot be assigned to an examination duty if they have a
    regular class whose time window, expanded by a mandatory 1-hour pre-class buffer
    and 1-hour post-class buffer, overlaps with the examination window.
    
    Protected Class Interval: [class_start - buffer, class_end + buffer]
    Exam Interval: [exam_start, exam_end]
    Conflict Condition: max(exam_start, class_start - buffer) < min(exam_end, class_end + buffer)
    """

    @staticmethod
    def parse_minutes(time_str):
        """Converts 'HH:MM' string to minutes since midnight."""
        parts = time_str.strip().split(':')
        return int(parts[0]) * 60 + int(parts[1])

    @staticmethod
    def format_minutes(minutes):
        """Converts minutes since midnight back to 'HH:MM' format."""
        h = (minutes // 60) % 24
        m = minutes % 60
        return f"{h:02d}:{m:02d}"

    @classmethod
    def check_buffer_conflict(cls, class_start_str, class_end_str, exam_start_str, exam_end_str, buffer_minutes=60):
        """
        Evaluates whether a class period and an exam period violate the protected buffer rule.
        
        Args:
            class_start_str: 'HH:MM'
            class_end_str: 'HH:MM'
            exam_start_str: 'HH:MM'
            exam_end_str: 'HH:MM'
            buffer_minutes: int (default 60 minutes)
            
        Returns:
            dict: {
                'conflict': bool,
                'is_direct_overlap': bool,
                'reason': str,
                'class_protected_window': str,
                'exam_window': str
            }
        """
        c_start = cls.parse_minutes(class_start_str)
        c_end = cls.parse_minutes(class_end_str)
        e_start = cls.parse_minutes(exam_start_str)
        e_end = cls.parse_minutes(exam_end_str)

        # Direct overlap check (class and exam overlap directly)
        direct_overlap = max(e_start, c_start) < min(e_end, c_end)

        # Buffer expanded class window
        protected_start = max(0, c_start - buffer_minutes)
        protected_end = c_end + buffer_minutes

        # Buffer conflict check
        buffer_overlap = max(e_start, protected_start) < min(e_end, protected_end)

        if direct_overlap:
            reason = (
                f"Direct lecture conflict: Class ({class_start_str}-{class_end_str}) "
                f"directly collides with exam session ({exam_start_str}-{exam_end_str})."
            )
        elif buffer_overlap:
            reason = (
                f"Timetable buffer violation: Class ({class_start_str}-{class_end_str}) requires "
                f"a protected window ({cls.format_minutes(protected_start)}-{cls.format_minutes(protected_end)}) "
                f"with {buffer_minutes}m buffer, which overlaps with exam ({exam_start_str}-{exam_end_str})."
            )
        else:
            reason = "No timetable conflict. Buffer constraint satisfied."

        return {
            'conflict': buffer_overlap,
            'is_direct_overlap': direct_overlap,
            'reason': reason,
            'class_protected_window': f"{cls.format_minutes(protected_start)} - {cls.format_minutes(protected_end)}",
            'exam_window': f"{exam_start_str} - {exam_end_str}"
        }
