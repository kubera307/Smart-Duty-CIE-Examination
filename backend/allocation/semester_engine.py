class SemesterStatusEngine:
    """
    Dynamically determines semester statuses for any given examination slot.
    
    CRITICAL RULE:
    If semesters A and B are writing exams during a time window:
      Semesters A & B = EXAM STATUS
      Remaining active semesters (e.g. C) = REGULAR CLASS STATUS
    Therefore, the system MUST inspect timetable entries for Semester C.
    
    This engine never hardcodes specific semester numbers and dynamically handles
    any configuration of exam and regular semesters.
    """

    @staticmethod
    def classify_semesters_for_slot(slot_sessions, all_active_semesters, cie_exam_semester_ids=None):
        """
        Args:
            slot_sessions: list of ExamSession objects scheduled in the same date/time slot.
            all_active_semesters: list of Semester objects active in the department.
            cie_exam_semester_ids: optional set of int representing semesters participating in this CIE.
            
        Returns:
            dict: {
                'exam_semester_ids': set of int,
                'regular_class_semester_ids': set of int,
                'exam_semester_names': list of str,
                'regular_class_semester_names': list of str
            }
        """
        all_sem_map = {s.id: s for s in all_active_semesters}
        
        # If CIE-wide exam semesters are known, any semester taking exams in this CIE
        # is considered an exam semester; otherwise identify from slot sessions
        if cie_exam_semester_ids:
            exam_sem_ids = {sid for sid in cie_exam_semester_ids if sid in all_sem_map}
        else:
            exam_sem_ids = {session.semester_id for session in slot_sessions if session.semester_id in all_sem_map}
        
        # The remaining active semesters are in regular class session (e.g. 3rd semester)
        regular_sem_ids = set(all_sem_map.keys()) - exam_sem_ids

        return {
            'exam_semester_ids': exam_sem_ids,
            'regular_class_semester_ids': regular_sem_ids,
            'exam_semester_names': [all_sem_map[sid].name for sid in sorted(exam_sem_ids)],
            'regular_class_semester_names': [all_sem_map[sid].name for sid in sorted(regular_sem_ids)]
        }
