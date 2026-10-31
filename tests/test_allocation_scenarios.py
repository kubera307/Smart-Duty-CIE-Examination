import unittest
import os
import sys
from datetime import date, datetime
from types import SimpleNamespace

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app import create_app
from models import (
    db, Faculty, Semester, Subject, TimetableEntry,
    CIE, ExamSession, Duty, FacultyAvailability
)
from allocation.buffer_rules import BufferRuleEvaluator
from allocation.eligibility import EligibilityEngine
from allocation.candidate_evaluator import CandidateEvaluator
from allocation.engine import AllocationEngine
from allocation.optimizer import AllocationOptimizer
from allocation.semester_engine import SemesterStatusEngine
from allocation.timetable_conflicts import TimetableConflictEngine


from config import Config

class TestAllocationScenarios(unittest.TestCase):
    """
    Comprehensive test suite verifying institutional constraints, timetable conflict detection,
    and allocation rules.
    """

    @classmethod
    def setUpClass(cls):
        class ScenarioTestConfig(Config):
            TESTING = True
            SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'

        cls.app = create_app(ScenarioTestConfig)
        cls.app_context = cls.app.app_context()
        cls.app_context.push()

    @classmethod
    def tearDownClass(cls):
        cls.app_context.pop()

    def test_01_direct_lecture_collision_rejected(self):
        """Scenario 1: Direct lecture overlap -> Reject."""
        c_start = BufferRuleEvaluator.parse_minutes("10:00")
        c_end = BufferRuleEvaluator.parse_minutes("11:00")
        e_start = BufferRuleEvaluator.parse_minutes("10:30")
        e_end = BufferRuleEvaluator.parse_minutes("11:30")
        has_overlap = max(e_start, c_start) < min(e_end, c_end)
        self.assertTrue(has_overlap)

    def test_02_pre_exam_buffer_violation_rejected(self):
        """Scenario 2: Class ends at 09:30, Exam starts at 10:00 -> 30 min gap < 60 min -> Reject."""
        res = BufferRuleEvaluator.check_buffer_conflict(
            class_start_str="08:30", class_end_str="09:30",
            exam_start_str="10:00", exam_end_str="11:00",
            buffer_minutes=60
        )
        self.assertTrue(res['conflict'])
        self.assertIn("buffer", res['reason'].lower())

    def test_03_post_exam_buffer_violation_rejected(self):
        """Scenario 3: Exam ends at 11:00, Class starts at 11:30 -> 30 min gap < 60 min -> Reject."""
        res = BufferRuleEvaluator.check_buffer_conflict(
            class_start_str="11:30", class_end_str="12:30",
            exam_start_str="10:00", exam_end_str="11:00",
            buffer_minutes=60
        )
        self.assertTrue(res['conflict'])
        self.assertIn("buffer", res['reason'].lower())

    def test_04_regular_class_outside_buffer_allowed(self):
        """Scenario 4: Class 14:00-15:00, Exam 10:00-11:00 -> 3h gap > 60m -> Allowed."""
        res = BufferRuleEvaluator.check_buffer_conflict(
            class_start_str="14:00", class_end_str="15:00",
            exam_start_str="10:00", exam_end_str="11:00",
            buffer_minutes=60
        )
        self.assertFalse(res['conflict'])

    def test_05_faculty_another_exam_duty_rejected(self):
        """Scenario 5: Faculty has another examination duty -> Reject."""
        fac = Faculty.query.filter_by(eligible_for_duty=True).first()
        sess = ExamSession.query.first()
        
        # Simulate faculty already assigned in this slot
        current_slot_duties = [{
            'faculty_id': fac.id,
            'exam_date': sess.exam_date,
            'start_time': sess.start_time,
            'end_time': sess.end_time,
            'room_number': 'LH-101'
        }]

        eval_res = EligibilityEngine.evaluate_candidate(
            faculty=fac,
            exam_session=sess,
            regular_semester_ids=set(),
            current_slot_duties=current_slot_duties,
            buffer_minutes=60
        )
        self.assertFalse(eval_res['is_eligible'])
        self.assertTrue(any('duty buffer violation' in r.lower() for r in eval_res['disqualification_reasons']))

    def test_05b_exam_duty_buffer_rejects_under_one_hour_and_allows_exact_hour(self):
        faculty = Faculty(
            name="Exam Duty Gap Boundary Faculty",
            max_duty_capacity=5,
            is_active=True,
            eligible_for_duty=True
        )
        db.session.add(faculty)
        db.session.flush()
        exam_date = date(2027, 1, 10)

        def evaluate(start_time):
            session = SimpleNamespace(
                exam_date=exam_date,
                start_time=start_time,
                end_time='12:00'
            )
            return EligibilityEngine.evaluate_candidate(
                faculty=faculty,
                exam_session=session,
                regular_semester_ids=set(),
                current_slot_duties=[{
                    'faculty_id': faculty.id,
                    'exam_date': exam_date,
                    'start_time': '09:00',
                    'end_time': '10:00',
                    'room_number': 'LH-101'
                }],
                buffer_minutes=60
            )

        try:
            self.assertFalse(evaluate('10:30')['is_eligible'])
            self.assertTrue(evaluate('11:00')['is_eligible'])
        finally:
            db.session.delete(faculty)
            db.session.commit()

    def test_06_faculty_unavailable_rejected(self):
        """Scenario 6: Faculty is unavailable / on leave -> Reject."""
        fac = Faculty.query.filter_by(eligible_for_duty=True).first()
        sess = ExamSession.query.first()

        # Add temporary leave
        leave = FacultyAvailability(
            faculty_id=fac.id,
            date=sess.exam_date,
            start_time='09:00',
            end_time='17:00',
            is_available=False,
            reason='Academic conference'
        )
        db.session.add(leave)
        db.session.commit()

        try:
            eval_res = EligibilityEngine.evaluate_candidate(
                faculty=fac,
                exam_session=sess,
                regular_semester_ids=set(),
                buffer_minutes=60
            )
            self.assertFalse(eval_res['is_eligible'])
            self.assertTrue(any('unavailable' in r.lower() for r in eval_res['disqualification_reasons']))
        finally:
            db.session.delete(leave)
            db.session.commit()

    def test_07_excluded_faculty_manikantha_rejected(self):
        """Scenario 7: Excluded faculty (eligible_for_duty = False) -> Reject."""
        fac = Faculty.query.filter_by(eligible_for_duty=False).first()
        self.assertIsNotNone(fac)
        self.assertFalse(fac.eligible_for_duty)

        sess = ExamSession.query.first()
        eval_res = EligibilityEngine.evaluate_candidate(
            faculty=fac,
            exam_session=sess,
            regular_semester_ids=set(),
            buffer_minutes=60
        )
        self.assertFalse(eval_res['is_eligible'])
        self.assertTrue(any('excluded' in r.lower() for r in eval_res['disqualification_reasons']))

    def test_08_faculty_max_capacity_rejected(self):
        """Scenario 8: Faculty reaches maximum capacity -> Reject."""
        fac = Faculty.query.filter_by(eligible_for_duty=True).first()
        sess = ExamSession.query.first()
        
        old_cap = fac.max_duty_capacity
        fac.max_duty_capacity = 0
        try:
            eval_res = EligibilityEngine.evaluate_candidate(
                faculty=fac,
                exam_session=sess,
                regular_semester_ids=set(),
                buffer_minutes=60
            )
            self.assertFalse(eval_res['is_eligible'])
            self.assertTrue(any('capacity' in r.lower() for r in eval_res['disqualification_reasons']))
        finally:
            fac.max_duty_capacity = old_cap

    def test_08b_optimizer_never_exceeds_faculty_quota(self):
        """A quota is a hard limit; excess duties remain pending instead of bypassing it."""
        cie = CIE.query.first()
        semester = Semester.query.first()
        subject = Subject.query.filter_by(semester_id=semester.id).first()
        faculty = Faculty(
            name="Quota Limit Regression Faculty",
            max_duty_capacity=1,
            is_active=True,
            eligible_for_duty=True
        )
        db.session.add(faculty)
        db.session.flush()

        sessions = [
            ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date(2027, 1, day),
                start_time="09:00",
                end_time="10:00",
                required_invigilators=1,
                required_squad=0
            )
            for day in (10, 11)
        ]
        db.session.add_all(sessions)
        db.session.flush()
        previous_session = None

        try:
            result = AllocationOptimizer.run_optimization(
                cie=cie,
                exam_sessions=sessions,
                all_faculty=[faculty],
                all_semesters=[semester],
                buffer_minutes=60
            )

            assigned = [
                duty for duty in result['allocated_duties']
                if duty['faculty_id'] == faculty.id and duty['status'] == 'ASSIGNED'
            ]
            pending = [
                duty for duty in result['allocated_duties']
                if duty['status'] == 'PENDING'
            ]

            self.assertEqual(len(assigned), 1)
            self.assertEqual(len(pending), 1)
            self.assertLessEqual(len(assigned), faculty.max_duty_capacity)

            previous_session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date(2027, 1, 9),
                start_time="09:00",
                end_time="10:00",
                required_invigilators=1,
                required_squad=0
            )
            previous_session.duties.append(Duty(
                faculty=faculty,
                status='ASSIGNED',
                duty_type='Invigilation'
            ))
            db.session.add(previous_session)
            db.session.commit()
            db.session.expire(faculty, ['duties'])

            rerun_result = AllocationOptimizer.run_optimization(
                cie=cie,
                exam_sessions=sessions,
                all_faculty=[faculty],
                all_semesters=[semester],
                buffer_minutes=60
            )
            rerun_assigned = [
                duty for duty in rerun_result['allocated_duties']
                if duty['faculty_id'] == faculty.id and duty['status'] == 'ASSIGNED'
            ]
            rerun_pending = [
                duty for duty in rerun_result['allocated_duties']
                if duty['status'] == 'PENDING'
            ]

            self.assertEqual(len(rerun_assigned), 0)
            self.assertEqual(len(rerun_pending), 2)
        finally:
            if previous_session is not None:
                db.session.delete(previous_session)
            for session in sessions:
                db.session.delete(session)
            db.session.delete(faculty)
            db.session.commit()

    def test_08c_optimizer_tracks_duty_buffer_across_slots(self):
        cie = CIE.query.first()
        semester = Semester.query.first()
        subject = Subject.query.filter_by(semester_id=semester.id).first()
        faculty = Faculty(
            name="Duty Buffer Regression Faculty",
            max_duty_capacity=2,
            is_active=True,
            eligible_for_duty=True
        )
        db.session.add(faculty)
        db.session.flush()
        sessions = [
            ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date(2027, 1, 10),
                start_time=start_time,
                end_time=end_time,
                required_invigilators=1,
                required_squad=0
            )
            for start_time, end_time in (('09:00', '10:00'), ('10:30', '11:30'))
        ]
        db.session.add_all(sessions)
        db.session.flush()

        try:
            result = AllocationOptimizer.run_optimization(
                cie=cie,
                exam_sessions=sessions,
                all_faculty=[faculty],
                all_semesters=[semester],
                buffer_minutes=60
            )

            assigned = [
                duty for duty in result['allocated_duties']
                if duty['faculty_id'] == faculty.id and duty['status'] == 'ASSIGNED'
            ]
            pending = [
                duty for duty in result['allocated_duties']
                if duty['status'] == 'PENDING'
            ]
            self.assertEqual(len(assigned), 1)
            self.assertEqual(len(pending), 1)
        finally:
            for session in sessions:
                db.session.delete(session)
            db.session.delete(faculty)
            db.session.commit()

    def test_09_two_eligible_faculty_prefer_lower_workload(self):
        """Scenario 9: Two eligible faculty with different workloads -> Prefer lower workload."""
        eligible_fac = Faculty.query.filter_by(eligible_for_duty=True).limit(2).all()
        fac1, fac2 = eligible_fac[0], eligible_fac[1]

        score_high = CandidateEvaluator.score_candidate(fac1, 'CIE-1', cumulative_duties=6, current_cie_duties=2)
        score_low = CandidateEvaluator.score_candidate(fac2, 'CIE-1', cumulative_duties=1, current_cie_duties=0)

        self.assertLess(score_low['penalty_score'], score_high['penalty_score'])

    def test_10_lower_workload_faculty_with_conflict_not_selected(self):
        """Scenario 10: Lower-workload faculty has timetable conflict -> Do NOT select them."""
        # Dr. Arjun B C has 3rd semester lecture on Thursday 11:00-12:00 in AI302.
        # Exam is 10:00-11:00 on Thursday 10 September 2026 for 5th Sem.
        # The 11:00 class immediately follows the exam (0-min buffer < 60-min buffer requirement) -> Disqualified!
        fac_conflict = Faculty.query.filter(Faculty.name.like("%Arjun%")).first()
        sess_thu_morning = ExamSession.query.filter_by(
            exam_date=date(2026, 9, 10)
        ).first()

        sem3 = Semester.query.filter_by(sem_number=3).first()

        eval_res = EligibilityEngine.evaluate_candidate(
            faculty=fac_conflict,
            exam_session=sess_thu_morning,
            regular_semester_ids={sem3.id},
            buffer_minutes=60
        )
        self.assertFalse(eval_res['is_eligible'])

    def test_10b_exam_semester_protects_peer_semester_timetables(self):
        """Only peer semesters in the same odd/even cycle block exam duty."""
        semesters = {
            semester.sem_number: semester
            for semester in Semester.query.filter(Semester.sem_number.in_([3, 5, 7])).all()
        }
        all_semesters = Semester.query.all()
        expected_regular = {
            3: {5, 7},
            5: {3, 7},
            7: {3, 5}
        }

        faculty = Faculty(
            name="Cross Semester Timetable Test Faculty",
            max_duty_capacity=10,
            is_active=True,
            eligible_for_duty=True
        )
        db.session.add(faculty)
        db.session.flush()

        subjects = {}
        for sem_number, semester in semesters.items():
            subject = Subject(
                code=f"TTTEST{sem_number}",
                name=f"Timetable Test Subject {sem_number}",
                semester_id=semester.id
            )
            db.session.add(subject)
            subjects[sem_number] = subject
        db.session.flush()

        for sem_number, semester in semesters.items():
            db.session.add(TimetableEntry(
                semester_id=semester.id,
                faculty_id=faculty.id,
                subject_id=subjects[sem_number].id,
                day_of_week='MON',
                start_time='09:00',
                end_time='10:00'
            ))
        db.session.flush()

        try:
            for exam_sem_number, exam_semester in semesters.items():
                session = SimpleNamespace(
                    semester_id=exam_semester.id,
                    semester=exam_semester,
                    exam_date=date(2027, 1, 11),
                    start_time='09:00',
                    end_time='10:00'
                )
                classification = SemesterStatusEngine.classify_semesters_for_slot(
                    [session],
                    all_semesters
                )
                actual_regular = {
                    semester.sem_number
                    for semester in all_semesters
                    if semester.id in classification['regular_class_semester_ids']
                }
                self.assertEqual(actual_regular, expected_regular[exam_sem_number])

                conflicts = TimetableConflictEngine.check_faculty_timetable_conflicts(
                    faculty=faculty,
                    exam_session=session,
                    regular_semester_ids=classification['regular_class_semester_ids'],
                    buffer_minutes=60
                )['conflicts']
                conflict_semesters = {
                    semester.sem_number
                    for semester in all_semesters
                    if any(
                        semester.name == conflict['semester_name']
                        for conflict in conflicts
                    )
                }
                self.assertEqual(conflict_semesters, expected_regular[exam_sem_number])

                response = self.app.test_client().get(
                    '/api/allocation/check-faculty-conflicts',
                    query_string={
                        'date': '2027-01-11',
                        'start_time': '09:00',
                        'end_time': '10:00',
                        'semester_id': exam_semester.id
                    }
                )
                self.assertEqual(response.status_code, 200)
                response_data = response.get_json()
                self.assertEqual(
                    set(response_data['respected_regular_semesters']),
                    {
                        semesters[sem_number].name
                        for sem_number in expected_regular[exam_sem_number]
                    }
                )
                faculty_result = next(
                    item for item in response_data['faculty_analysis']
                    if item['faculty_id'] == faculty.id
                )
                self.assertTrue(faculty_result['has_clash'])
        finally:
            db.session.delete(faculty)
            for subject in subjects.values():
                db.session.delete(subject)
            db.session.commit()

    def test_10c_third_semester_duty_checks_peer_cse_and_robotics_buffers(self):
        semesters = {
            semester.sem_number: semester
            for semester in Semester.query.filter(Semester.sem_number.in_([3, 5, 7])).all()
        }
        faculty = Faculty(
            name="Third Semester Buffer Regression Faculty",
            max_duty_capacity=5,
            is_active=True,
            eligible_for_duty=True
        )
        peer_subject = Subject(
            code="TTPEER5",
            name="Peer CSE Timetable Buffer Test",
            semester_id=semesters[5].id,
            department="Computer Science & Engineering (AI & ML)"
        )
        robotics_subject = Subject(
            code="TTROBOT3",
            name="Robotics Timetable Buffer Test",
            semester_id=semesters[3].id,
            department="Robotics & Artificial Intelligence"
        )
        db.session.add_all([faculty, peer_subject, robotics_subject])
        db.session.flush()
        db.session.add_all([
            TimetableEntry(
                semester_id=semesters[5].id,
                faculty_id=faculty.id,
                subject_id=peer_subject.id,
                department="CSE (AI & ML)",
                day_of_week="MON",
                start_time="08:30",
                end_time="09:30"
            ),
            TimetableEntry(
                semester_id=semesters[3].id,
                faculty_id=faculty.id,
                subject_id=robotics_subject.id,
                department="Robotics & Artificial Intelligence",
                day_of_week="MON",
                start_time="11:30",
                end_time="12:30"
            )
        ])
        db.session.flush()

        exam_session = SimpleNamespace(
            semester_id=semesters[3].id,
            semester=semesters[3],
            exam_date=date(2027, 1, 11),
            start_time="10:00",
            end_time="11:00"
        )
        classification = SemesterStatusEngine.classify_semesters_for_slot(
            [exam_session],
            list(semesters.values())
        )
        self.assertIn(semesters[5].id, classification['regular_class_semester_ids'])

        try:
            result = TimetableConflictEngine.check_faculty_timetable_conflicts(
                faculty=faculty,
                exam_session=exam_session,
                regular_semester_ids=classification['regular_class_semester_ids'],
                buffer_minutes=60
            )
            self.assertTrue(result['has_conflict'])
            self.assertEqual(result['checked_classes_count'], 2)
            self.assertEqual(len(result['conflicts']), 2)
            self.assertTrue(any(
                semesters[5].name in conflict['semester_name']
                for conflict in result['conflicts']
            ))
            self.assertTrue(any("Robotics" in conflict['semester_name'] for conflict in result['conflicts']))
        finally:
            db.session.delete(faculty)
            db.session.delete(peer_subject)
            db.session.delete(robotics_subject)
            db.session.commit()

    def test_10d_exactly_one_hour_from_class_is_allowed(self):
        before = BufferRuleEvaluator.check_buffer_conflict(
            class_start_str="08:00",
            class_end_str="09:00",
            exam_start_str="10:00",
            exam_end_str="11:00",
            buffer_minutes=60
        )
        after = BufferRuleEvaluator.check_buffer_conflict(
            class_start_str="12:00",
            class_end_str="13:00",
            exam_start_str="10:00",
            exam_end_str="11:00",
            buffer_minutes=60
        )
        self.assertFalse(before['conflict'])
        self.assertFalse(after['conflict'])

    def test_10e_only_actual_pe_subjects_are_exempted(self):
        pe_entry = SimpleNamespace(
            subject=SimpleNamespace(code="PE101", name="Physical Education")
        )
        peer_entry = SimpleNamespace(
            subject=SimpleNamespace(code="CSE501", name="Peer-to-Peer Systems")
        )
        self.assertTrue(TimetableConflictEngine.is_nss_yoga_pe(pe_entry))
        self.assertFalse(TimetableConflictEngine.is_nss_yoga_pe(peer_entry))

    def test_11_duty_completed_updates_profile(self):
        """Scenario 11: Duty changes to COMPLETED -> Update Staff Profile remaining count."""
        fac = Faculty(name="Isolated Test Faculty", max_duty_capacity=15)
        db.session.add(fac)
        db.session.flush()

        sess = ExamSession.query.first()
        duty = Duty(
            exam_session_id=sess.id,
            faculty_id=fac.id,
            status='ASSIGNED'
        )
        db.session.add(duty)
        db.session.commit()

        profile_before = fac.to_dict(include_stats=True)
        self.assertEqual(profile_before['completed'], 0)
        self.assertEqual(profile_before['remaining'], 1)

        # Mark COMPLETED
        duty.status = 'COMPLETED'
        db.session.commit()

        profile_after = fac.to_dict(include_stats=True)
        self.assertEqual(profile_after['remaining'], 0)
        self.assertEqual(profile_after['completed'], 1)
        self.assertEqual(profile_after['completion_rate'], 100.0)

        # Cleanup
        db.session.delete(duty)
        db.session.delete(fac)
        db.session.commit()

    def test_12_duty_cancelled_updates_statistics(self):
        """Scenario 12: Duty is CANCELLED -> Update statistics correctly."""
        fac = Faculty(name="Isolated Test Faculty 2", max_duty_capacity=15)
        db.session.add(fac)
        db.session.flush()

        sess = ExamSession.query.first()
        duty = Duty(
            exam_session_id=sess.id,
            faculty_id=fac.id,
            status='ASSIGNED'
        )
        db.session.add(duty)
        db.session.commit()

        profile_assigned = fac.to_dict(include_stats=True)
        self.assertEqual(profile_assigned['total_assigned'], 1)

        # Cancel duty
        duty.status = 'CANCELLED'
        db.session.commit()

        profile_cancelled = fac.to_dict(include_stats=True)
        self.assertEqual(profile_cancelled['total_assigned'], 0)

        # Cleanup
        db.session.delete(duty)
        db.session.delete(fac)
        db.session.commit()

    def test_13_end_to_end_allocation_run_cie1(self):
        """Test full allocation run for CIE-1."""
        cie1 = CIE.query.filter(CIE.name.in_(['CIE-1', 'CIE-I'])).first()
        result = AllocationEngine.generate_cie_allocation(cie1.id, user_identifier="TestRunner")

        self.assertIn(result['status'], ('SUCCESS', 'PARTIAL'))
        self.assertGreater(result['stats']['total_allocated'], 0)

        # Ensure excluded faculty was NOT allocated any duty
        excluded_fac = Faculty.query.filter_by(eligible_for_duty=False).first()
        if excluded_fac:
            excluded_duties = [d for d in excluded_fac.duties if d.status != 'CANCELLED']
            self.assertEqual(len(excluded_duties), 0, f"Excluded faculty {excluded_fac.name} must have 0 allocated duties!")

        # Verify explanation was generated for duties
        sample_duty = Duty.query.join(ExamSession).filter(
            ExamSession.cie_id == cie1.id,
            Duty.faculty_id.isnot(None),
            Duty.status == 'ASSIGNED'
        ).first()
        self.assertIsNotNone(sample_duty)
        self.assertIsNotNone(sample_duty.explanation)
        self.assertIn("satisfies all hard constraints", sample_duty.explanation.explanation_summary)


if __name__ == '__main__':
    unittest.main()
