import unittest
import os
import sys
from datetime import date, datetime

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
        self.assertTrue(any('simultaneous' in r.lower() for r in eval_res['disqualification_reasons']))

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
        """Scenario 7: Faculty is excluded (Mr. Manikantha Prasad J) -> Reject."""
        fac = Faculty.query.filter(Faculty.name.like("%Manikantha%")).first()
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
            exam_date=date(2026, 9, 10), start_time="10:00"
        ).first()

        sem3 = Semester.query.filter_by(sem_number=3).first()

        eval_res = EligibilityEngine.evaluate_candidate(
            faculty=fac_conflict,
            exam_session=sess_thu_morning,
            regular_semester_ids={sem3.id},
            buffer_minutes=60
        )
        self.assertFalse(eval_res['is_eligible'])
        self.assertTrue(any('timetable conflict' in r.lower() for r in eval_res['disqualification_reasons']))

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
        cie1 = CIE.query.filter_by(name='CIE-1').first()
        result = AllocationEngine.generate_cie_allocation(cie1.id, user_identifier="TestRunner")

        self.assertIn(result['status'], ('SUCCESS', 'PARTIAL'))
        self.assertGreater(result['stats']['total_allocated'], 0)

        # Ensure Mr. Manikantha Prasad J was NOT allocated any duty
        manikantha = Faculty.query.filter(Faculty.name.like("%Manikantha%")).first()
        manikantha_duties = [d for d in manikantha.duties if d.status != 'CANCELLED']
        self.assertEqual(len(manikantha_duties), 0, "Excluded faculty Mr. Manikantha Prasad J must have 0 allocated duties!")

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
