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
    def is_nss_yoga_pe(cls, entry):
        """
        Determines whether a timetable entry is an NSS / Yoga / PE / Sports / Music / SCR session.
        CRITICAL USER RULE: These activities do not block faculty from examination duty.
        """
        if not entry:
            return False
        sub_code = (entry.subject.code if entry.subject else '').upper().strip()
        sub_name = (entry.subject.name if entry.subject else '').lower().strip()
        
        if 'NYP' in sub_code or 'SCR' in sub_code:
            return True
        keywords = ['nss', 'yoga', 'pe', 'physical education', 'sports', 'music', 'community project', 'societal project', 'social connect']
        return any(k in sub_name for k in keywords)

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

        # Filter timetable entries:
        # 1. Skip NSS / Yoga / PE / SCR (user explicit rule: do not consider NSS/Yoga/PE as clash)
        # 2. Check classes for Robotics branch (faculties take classes for Robotics branch, these are actively running)
        # 3. Check regular semester classes for AI & ML (explicitly including 5th & 7th semesters when 3rd sem has exams)
        is_3rd_sem_exam = exam_session.semester and exam_session.semester.sem_number == 3
        relevant_entries = []
        for entry in faculty.timetable_entries:
            if entry.day_of_week != day_str:
                continue

            # CRITICAL RULE: NEVER consider NSS / Yoga / PE / SCR as a timetable conflict!
            if cls.is_nss_yoga_pe(entry):
                continue

            dept = (entry.department or (entry.subject.department if entry.subject else '') or '').lower()
            is_robotics = 'robot' in dept

            # When 3rd sem has exams, 5th and 7th sem AI&ML regular timetables MUST be checked!
            is_sem5_sem7 = entry.semester and entry.semester.sem_number in [5, 7]
            if is_robotics or (is_3rd_sem_exam and is_sem5_sem7) or (entry.semester_id in regular_semester_ids):
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
            'checked_classes_count': checked_count
        }

