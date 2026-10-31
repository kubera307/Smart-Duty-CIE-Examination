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
    def get_regular_class_semesters(exam_semesters, all_semesters):
        exam_semesters = [semester for semester in exam_semesters if semester]
        exam_semester_ids = {semester.id for semester in exam_semesters}
        exam_cycles = {semester.sem_number % 2 for semester in exam_semesters}

        if not exam_cycles:
            return [semester for semester in all_semesters if semester.id not in exam_semester_ids]

        return [
            semester for semester in all_semesters
            if semester.id not in exam_semester_ids
            and semester.sem_number % 2 in exam_cycles
        ]

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
        
        # The semesters participating in exams during this specific slot / exam date
        slot_exam_sem_ids = {
            session.semester_id
            for session in slot_sessions
            if session.semester_id in all_sem_map
        }

        # Check all semesters that have exams on this exam date in this CIE cycle
        if slot_sessions and hasattr(slot_sessions[0], 'exam_date') and hasattr(slot_sessions[0], 'cie_id'):
            s0 = slot_sessions[0]
            try:
                from models.exam import ExamSession
                date_sessions = ExamSession.query.filter_by(
                    cie_id=s0.cie_id,
                    exam_date=s0.exam_date
                ).all()
                for ds in date_sessions:
                    if ds.semester_id in all_sem_map:
                        slot_exam_sem_ids.add(ds.semester_id)
            except Exception:
                pass

        if not slot_exam_sem_ids and cie_exam_semester_ids:
            slot_exam_sem_ids = {sid for sid in cie_exam_semester_ids if sid in all_sem_map}

        exam_semesters = [all_sem_map[semester_id] for semester_id in slot_exam_sem_ids]
        regular_semesters = SemesterStatusEngine.get_regular_class_semesters(
            exam_semesters,
            all_active_semesters
        )
        regular_sem_ids = {semester.id for semester in regular_semesters}

        return {
            'exam_semester_ids': slot_exam_sem_ids,
            'regular_class_semester_ids': regular_sem_ids,
            'exam_semester_names': [all_sem_map[sid].name for sid in sorted(slot_exam_sem_ids)],
            'regular_class_semester_names': [semester.name for semester in regular_semesters]
        }
