import os
import sys
import unittest
from datetime import date, timedelta

from flask import Flask

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from models import (
    db, AllocationExplanation, CIE, Duty, DutySwapRequest, ExamSession,
    ExamRoom, Faculty, Semester, Subject, TimetableCoverage, TimetableEntry
)
from routes.cie_routes import _delete_duties, cie_bp
from routes.academic_routes import academic_bp
from routes.allocation_routes import allocation_bp
from routes.report_routes import report_bp
from routes.faculty_routes import faculty_bp
from allocation.eligibility import EligibilityEngine
from services.seed_service import seed_database


class TestDatabaseSafety(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(
            SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
            SQLALCHEMY_TRACK_MODIFICATIONS=False
        )
        db.init_app(self.app)
        self.app.register_blueprint(report_bp, url_prefix='/reports')
        self.app.register_blueprint(faculty_bp, url_prefix='/api/faculty')
        self.app.register_blueprint(academic_bp, url_prefix='/api/academic')
        self.app.register_blueprint(allocation_bp, url_prefix='/api/allocation')
        self.app.register_blueprint(cie_bp, url_prefix='/api/cie')
        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_seed_does_not_replace_partially_populated_database(self):
        with self.app.app_context():
            faculty = Faculty(name='Existing Faculty', password='existing')
            db.session.add(faculty)
            db.session.commit()
            faculty_id = faculty.id

            seed_database()

            self.assertEqual(Faculty.query.count(), 1)
            self.assertEqual(db.session.get(Faculty, faculty_id).name, 'Existing Faculty')
            self.assertEqual(CIE.query.count(), 0)

    def test_bulk_duty_deletion_removes_dependent_records(self):
        with self.app.app_context():
            semester = Semester(sem_number=3, name='III Semester', academic_year='2026-27')
            faculty = Faculty(name='Existing Faculty', password='existing')
            db.session.add_all([semester, faculty])
            db.session.flush()

            subject = Subject(code='TEST301', name='Test Subject', semester_id=semester.id)
            cie = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date(2026, 9, 10),
                end_date=date(2026, 9, 12)
            )
            db.session.add_all([subject, cie])
            db.session.flush()

            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date(2026, 9, 10),
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add(session)
            db.session.flush()

            duty = Duty(exam_session_id=session.id, faculty_id=faculty.id)
            db.session.add(duty)
            db.session.flush()
            db.session.add_all([
                DutySwapRequest(
                    duty_id=duty.id,
                    requesting_faculty_id=faculty.id,
                    substitute_faculty_id=faculty.id
                ),
                AllocationExplanation(
                    duty_id=duty.id,
                    explanation_summary='Test explanation'
                )
            ])
            db.session.commit()

            _delete_duties(Duty.query.filter_by(exam_session_id=session.id))
            db.session.commit()

            self.assertEqual(Duty.query.count(), 0)
            self.assertEqual(DutySwapRequest.query.count(), 0)
            self.assertEqual(AllocationExplanation.query.count(), 0)

    def test_report_filter_keeps_duties_in_selected_semester_only(self):
        with self.app.app_context():
            semester4 = Semester(sem_number=4, name='IV Semester', academic_year='2026-27')
            semester6 = Semester(sem_number=6, name='VI Semester', academic_year='2026-27')
            faculty = Faculty(name='Existing Faculty', password='existing')
            cie = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date(2026, 9, 10),
                end_date=date(2026, 9, 12)
            )
            db.session.add_all([semester4, semester6, faculty, cie])
            db.session.flush()

            subject4 = Subject(code='TEST401', name='Test Subject 4', semester_id=semester4.id)
            subject6 = Subject(code='TEST601', name='Test Subject 6', semester_id=semester6.id)
            db.session.add_all([subject4, subject6])
            db.session.flush()

            session4 = ExamSession(
                cie_id=cie.id,
                semester_id=semester4.id,
                subject_id=subject4.id,
                exam_date=date(2026, 9, 10),
                start_time='09:00',
                end_time='10:00'
            )
            session6 = ExamSession(
                cie_id=cie.id,
                semester_id=semester6.id,
                subject_id=subject6.id,
                exam_date=date(2026, 9, 11),
                start_time='11:00',
                end_time='12:00'
            )
            db.session.add_all([session4, session6])
            db.session.flush()
            db.session.add_all([
                Duty(exam_session_id=session4.id, faculty_id=faculty.id),
                Duty(exam_session_id=session6.id, faculty_id=faculty.id)
            ])
            db.session.commit()
            cie_id = cie.id
            semester4_id = semester4.id

        response = self.app.test_client().get(
            f'/reports/cie-data/{cie_id}?semester_ids={semester4_id}'
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual([sem['sem_number'] for sem in data['semesters_data']], [4])
        self.assertEqual([duty['sem_number'] for duty in data['duties_raw']], [4])

    def test_report_marks_unfilled_room_and_squad_positions(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            faculty = Faculty(name='Assigned Faculty', password='existing')
            cie = CIE(
                name='CIE-II',
                academic_year='2026-27',
                start_date=date.today() + timedelta(days=2),
                end_date=date.today() + timedelta(days=12)
            )
            db.session.add_all([semester, faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST502', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=cie.start_date,
                start_time='09:00',
                end_time='10:00',
                required_squad=2
            )
            db.session.add(session)
            db.session.flush()
            first_room = ExamRoom(
                exam_session_id=session.id,
                room_number='AI301',
                student_start=1,
                student_end=30,
                student_count=30
            )
            second_room = ExamRoom(
                exam_session_id=session.id,
                room_number='AI302',
                student_start=31,
                student_end=60,
                student_count=30
            )
            db.session.add_all([first_room, second_room])
            db.session.flush()
            db.session.add_all([
                Duty(
                    exam_session_id=session.id,
                    exam_room_id=first_room.id,
                    faculty_id=faculty.id,
                    duty_type='Invigilation',
                    status='ASSIGNED'
                ),
                Duty(
                    exam_session_id=session.id,
                    faculty_id=faculty.id,
                    duty_type='Squad Duty',
                    status='ASSIGNED'
                )
            ])
            db.session.commit()
            cie_id = cie.id

        response = self.app.test_client().get(f'/reports/cie-data/{cie_id}')

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['allocation_summary']['required_positions'], 4)
        self.assertEqual(data['allocation_summary']['assigned_positions'], 2)
        self.assertEqual(data['allocation_summary']['unfilled_positions'], 2)
        invig_rooms = data['semesters_data'][0]['invigilation_dates'][0]['sessions'][0]['rooms']
        self.assertEqual([room['faculty'] for room in invig_rooms], ['AF', 'UNFILLED'])
        squad_faculty = data['semesters_data'][0]['squad_dates'][0]['sessions'][0]['faculty']
        self.assertIn('UNFILLED (1)', squad_faculty)
        for report_format in ('pdf', 'excel'):
            report_response = self.app.test_client().get(
                f'/reports/cie-{report_format}/{cie_id}'
            )
            self.assertEqual(report_response.status_code, 200)

    def test_optional_squad_positions_do_not_make_room_only_report_partial(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            faculty = Faculty(name='Assigned Faculty', password='existing')
            cie = CIE(
                name='CIE-II',
                academic_year='2026-27',
                start_date=date(2026, 9, 10),
                end_date=date(2026, 9, 12)
            )
            db.session.add_all([semester, faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST503', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date(2026, 9, 10),
                start_time='09:00',
                end_time='10:00',
                required_squad=1
            )
            db.session.add(session)
            db.session.flush()
            rooms = [
                ExamRoom(
                    exam_session_id=session.id,
                    room_number=room_number,
                    student_start=start,
                    student_end=end,
                    student_count=end - start + 1
                )
                for room_number, start, end in (
                    ('AI301', 1, 30),
                    ('AI302', 31, 60)
                )
            ]
            db.session.add_all(rooms)
            db.session.flush()
            db.session.add_all([
                Duty(
                    exam_session_id=session.id,
                    exam_room_id=room.id,
                    faculty_id=faculty.id,
                    duty_type='Invigilation',
                    status='ASSIGNED'
                )
                for room in rooms
            ])
            db.session.commit()
            cie_id = cie.id
            session_id = session.id

        response = self.app.test_client().get(f'/reports/cie-data/{cie_id}')

        self.assertEqual(response.status_code, 200)
        summary = response.get_json()['allocation_summary']
        self.assertEqual(summary['status'], 'FULLY_ALLOCATED')
        self.assertEqual(summary['required_positions'], 2)
        self.assertEqual(summary['assigned_positions'], 2)
        self.assertEqual(summary['unfilled_positions'], 0)
        with self.app.app_context():
            session = db.session.get(ExamSession, session_id)
            counts = session.get_allocation_counts()
            self.assertEqual(counts['required_squad'], 0)
            self.assertEqual(counts['required_invigilators'], 2)

    def test_squad_duty_does_not_fulfill_invigilation_position(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            faculty = Faculty(name='Assigned Faculty', password='existing')
            cie = CIE(
                name='CIE-II',
                academic_year='2026-27',
                start_date=date.today() + timedelta(days=2),
                end_date=date.today() + timedelta(days=12)
            )
            db.session.add_all([semester, faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST502', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=cie.start_date,
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add(session)
            db.session.flush()
            room = ExamRoom(
                exam_session_id=session.id,
                room_number='AI301',
                student_start=1,
                student_end=30,
                student_count=30
            )
            db.session.add(room)
            db.session.flush()
            db.session.add(Duty(
                exam_session_id=session.id,
                faculty_id=faculty.id,
                duty_type='Squad Duty',
                status='ASSIGNED'
            ))
            db.session.commit()

            session_data = session.to_dict()

        self.assertEqual(session_data['allocated_count'], 0)
        self.assertEqual(session_data['status'], 'UNALLOCATED')

    def test_recreating_room_duty_replaces_faculty_in_profile(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            reserved_squad_faculty = Faculty(name='Reserved Squad Faculty', password='existing')
            old_faculty = Faculty(name='Old Faculty', password='existing')
            new_faculty = Faculty(name='New Faculty', password='existing')
            cie = CIE(
                name='CIE-II',
                academic_year='2026-27',
                start_date=date.today() + timedelta(days=2),
                end_date=date.today() + timedelta(days=12)
            )
            db.session.add_all([semester, reserved_squad_faculty, old_faculty, new_faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST502', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.commit()
            assignment = {
                'semester_id': semester.id,
                'subject_id': subject.id,
                'cie_id': cie.id,
                'exam_date': (date.today() + timedelta(days=5)).isoformat(),
                'start_time': '09:00',
                'end_time': '10:00',
                'rooms': [{
                    'room_number': 'A501',
                    'student_start': 1,
                    'student_end': 30,
                    'faculty_id': old_faculty.id
                }]
            }
            old_faculty_id = old_faculty.id
            new_faculty_id = new_faculty.id
            cie_id = cie.id
            semester_id = semester.id

        client = self.app.test_client()
        first_response = client.post('/api/allocation/duty', json=assignment)
        self.assertEqual(first_response.status_code, 201, first_response.get_json())

        assignment['rooms'][0]['faculty_id'] = new_faculty_id
        second_response = client.post('/api/allocation/duty', json=assignment)
        self.assertEqual(second_response.status_code, 201, second_response.get_json())
        self.assertEqual(second_response.get_json()['duties_count'], 1)

        with self.app.app_context():
            duty = Duty.query.one()
            self.assertEqual(duty.faculty_id, new_faculty_id)
            self.assertEqual(duty.status, 'ASSIGNED')
            self.assertEqual(duty.exam_session.semester_id, semester_id)

        old_profile = client.get(f'/api/faculty/{old_faculty_id}/profile').get_json()
        new_profile = client.get(f'/api/faculty/{new_faculty_id}/profile').get_json()
        self.assertEqual(old_profile['upcoming_duties'], [])
        self.assertEqual(len(new_profile['upcoming_duties']), 1)
        self.assertEqual(new_profile['upcoming_duties'][0]['faculty_id'], new_faculty_id)
        report_response = client.get(
            f'/reports/cie-pdf/{cie_id}?semesters={semester_id}'
        )
        self.assertEqual(report_response.status_code, 200)
        self.assertEqual(report_response.mimetype, 'application/pdf')

    def test_timetable_coverage_verification_api_and_invalidation(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-2027')
            faculty = Faculty(name='Existing Faculty', password='existing')
            db.session.add_all([semester, faculty])
            db.session.flush()
            subject = Subject(code='TEST501', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            entry = TimetableEntry(
                semester_id=semester.id,
                faculty_id=faculty.id,
                subject_id=subject.id,
                academic_year='2026-2027',
                day_of_week='MON',
                start_time='09:00',
                end_time='10:00',
                department='CSE (AI & ML)'
            )
            db.session.add(entry)
            db.session.commit()
            semester_id = semester.id
            entry_id = entry.id

        client = self.app.test_client()
        verified = client.post('/api/academic/timetable-coverage', json={
            'academic_year': '2026-27',
            'semester_id': semester_id,
            'department': 'CSE (AI & ML)',
            'is_verified': True
        })
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.get_json()['entry_count'], 1)

        client.put(f'/api/academic/timetables/{entry_id}', json={'section': 'B'})
        coverage = client.get('/api/academic/timetable-coverage?academic_year=2026-27&semester_id=' + str(semester_id))
        cse_row = next(row for row in coverage.get_json()['coverage'] if row['department'] == 'CSE (AI & ML)')
        self.assertFalse(cse_row['is_verified'])
        self.assertEqual(cse_row['entry_count'], 1)

    def test_manual_override_uses_available_timetable_without_coverage_gate(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            reserved_faculty = Faculty(name='Reserved Squad Faculty', password='existing')
            faculty = Faculty(name='Existing Faculty', password='existing', max_duty_capacity=3)
            cie = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date.today() + timedelta(days=2),
                end_date=date.today() + timedelta(days=4)
            )
            db.session.add_all([semester, reserved_faculty, faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST501', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date.today() + timedelta(days=2),
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add(session)
            db.session.flush()
            duty = Duty(exam_session_id=session.id, faculty_id=faculty.id, status='ASSIGNED')
            db.session.add(duty)
            db.session.commit()
            duty_id = duty.id
            faculty_id = faculty.id

        response = self.app.test_client().post('/api/allocation/override', json={
            'duty_id': duty_id,
            'faculty_id': faculty_id,
            'force_override': True,
            'override_reason': 'Test'
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['duty']['status'], 'ASSIGNED')

    def test_cie_session_assignment_uses_available_timetable_without_coverage_gate(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            reserved_faculty = Faculty(name='Reserved Squad Faculty', password='existing')
            faculty = Faculty(name='Existing Faculty', password='existing', max_duty_capacity=3)
            cie = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date.today() + timedelta(days=2),
                end_date=date.today() + timedelta(days=4)
            )
            db.session.add_all([semester, reserved_faculty, faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST501', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date.today() + timedelta(days=2),
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add(session)
            db.session.commit()
            session_id = session.id
            faculty_id = faculty.id

        response = self.app.test_client().put(
            f'/api/cie/sessions/{session_id}',
            json={
                'rooms': [{
                    'room_number': 'AI301',
                    'faculty_id': faculty_id,
                    'duty_type': 'Invigilation'
                }],
                'auto_reassign_conflicts': False
            }
        )
        self.assertEqual(response.status_code, 200)

    def test_past_exam_date_allows_manual_assignment(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            reserved_faculty = Faculty(
                name='Reserved Squad Faculty',
                password='existing',
                only_squad_duty=True
            )
            faculty = Faculty(name='Existing Faculty', password='existing', max_duty_capacity=3)
            cie = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date.today() - timedelta(days=5),
                end_date=date.today() - timedelta(days=3)
            )
            db.session.add_all([semester, reserved_faculty, faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST501', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date.today() - timedelta(days=4),
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add(session)
            db.session.flush()
            duty = Duty(exam_session_id=session.id, status='PENDING')
            db.session.add(duty)
            db.session.commit()
            duty_id = duty.id
            faculty_id = faculty.id

        response = self.app.test_client().post('/api/allocation/override', json={
            'duty_id': duty_id,
            'faculty_id': faculty_id
        })
        self.assertEqual(response.status_code, 200)

        with self.app.app_context():
            duty = db.session.get(Duty, duty_id)
            self.assertEqual(duty.status, 'ASSIGNED')
            self.assertEqual(duty.faculty_id, faculty_id)

    def test_past_exam_date_allows_allocation_generation(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            reserved_faculty = Faculty(
                name='Reserved Squad Faculty',
                password='existing',
                only_squad_duty=True
            )
            faculty = Faculty(name='Existing Faculty', password='existing', max_duty_capacity=3)
            cie = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date.today() - timedelta(days=5),
                end_date=date.today() - timedelta(days=3)
            )
            db.session.add_all([semester, reserved_faculty, faculty, cie])
            db.session.flush()
            subject = Subject(code='TEST501', name='Test Subject', semester_id=semester.id)
            db.session.add(subject)
            db.session.flush()
            session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date.today() - timedelta(days=4),
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add(session)
            db.session.flush()
            duty = Duty(exam_session_id=session.id, faculty_id=faculty.id, status='ASSIGNED')
            db.session.add(duty)
            db.session.commit()
            cie_id = cie.id
            duty_id = duty.id

        response = self.app.test_client().post('/api/allocation/generate', json={
            'cie_id': cie_id
        })
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(response.get_json()['stats']['total_allocated'], 1)
        self.assertEqual(response.get_json()['stats']['total_pending'], 0)

        with self.app.app_context():
            duties = Duty.query.join(ExamSession).filter(ExamSession.cie_id == cie_id).all()
            self.assertEqual(len(duties), 1)
            self.assertEqual(duties[0].status, 'ASSIGNED')

    def test_combined_semester_schedule_uses_requested_default_times(self):
        with self.app.app_context():
            semester5 = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            semester7 = Semester(sem_number=7, name='VII Semester', academic_year='2026-27')
            cie = CIE(
                name='CIE-II',
                academic_year='2026-27',
                start_date=date.today() + timedelta(days=10),
                end_date=date.today() + timedelta(days=12)
            )
            db.session.add_all([semester5, semester7, cie])
            db.session.flush()
            subjects = [
                Subject(code=code, name=code, semester_id=semester5.id)
                for code in ('24AI501', '24AI502', '24AI503', '24AI504', '24AI505A', '24AI508')
            ] + [
                Subject(code=code, name=code, semester_id=semester7.id)
                for code in ('23AI701', '23AI702', '23AI703', '23AI704D', '23OEAI75x')
            ]
            db.session.add_all(subjects)
            db.session.commit()
            cie_id = cie.id
            start_date = (date.today() + timedelta(days=10)).isoformat()

        response = self.app.test_client().post(
            f'/api/cie/{cie_id}/setup-all-semesters',
            json={
                'start_date': start_date,
                'included_semesters': [5, 7],
                'clear_existing': True
            }
        )
        self.assertEqual(response.status_code, 201)

        with self.app.app_context():
            actual = {
                (session.semester.sem_number, session.start_time, session.end_time)
                for session in ExamSession.query.filter_by(cie_id=cie_id).all()
            }
            self.assertEqual(
                actual,
                {
                    (5, '09:30', '10:30'),
                    (5, '14:30', '15:30'),
                    (7, '12:00', '13:00'),
                    (7, '16:00', '17:00')
                }
            )

    def test_schedule_creation_rejects_semester_from_another_academic_year(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            cie = CIE(
                name='CIE-II',
                academic_year='2027-28',
                start_date=date(2027, 10, 22),
                end_date=date(2027, 10, 24)
            )
            db.session.add_all([semester, cie])
            db.session.flush()
            subject = Subject(
                code='24AI501',
                name='Data Structures',
                semester_id=semester.id
            )
            db.session.add(subject)
            db.session.flush()
            existing_session = ExamSession(
                cie_id=cie.id,
                semester_id=semester.id,
                subject_id=subject.id,
                exam_date=date(2026, 11, 3),
                start_time='09:30',
                end_time='10:30'
            )
            db.session.add(existing_session)
            db.session.commit()
            cie_id = cie.id
            semester_id = semester.id
            subject_id = subject.id
            existing_session_id = existing_session.id

        client = self.app.test_client()
        manual_response = client.post(
            f'/api/cie/{cie_id}/sessions',
            json={
                'semester_id': semester_id,
                'subject_id': subject_id,
                'exam_date': '2026-11-04',
                'start_time': '09:30',
                'end_time': '10:30'
            }
        )
        self.assertEqual(manual_response.status_code, 400)

        bulk_response = client.post(
            f'/api/cie/{cie_id}/setup-all-semesters',
            json={
                'start_date': '2027-10-22',
                'included_semesters': [5],
                'clear_existing': True
            }
        )
        self.assertEqual(bulk_response.status_code, 400)
        self.assertIn('academic year', bulk_response.get_json()['error'].lower())

        with self.app.app_context():
            sessions = ExamSession.query.filter_by(cie_id=cie_id).all()
            self.assertEqual([session.id for session in sessions], [existing_session_id])

    def test_month_quota_counts_confirmed_duties_across_cies(self):
        with self.app.app_context():
            semester = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            faculty = Faculty(name='Existing Faculty', password='existing', max_duty_capacity=1)
            cie_a = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date(2026, 9, 10),
                end_date=date(2026, 9, 12)
            )
            cie_b = CIE(
                name='CIE-II',
                academic_year='2026-27',
                start_date=date(2026, 9, 20),
                end_date=date(2026, 9, 22)
            )
            db.session.add_all([semester, faculty, cie_a, cie_b])
            db.session.flush()
            subject_a = Subject(code='TEST501', name='Test Subject A', semester_id=semester.id)
            subject_b = Subject(code='TEST502', name='Test Subject B', semester_id=semester.id)
            db.session.add_all([subject_a, subject_b])
            db.session.flush()
            existing_session = ExamSession(
                cie_id=cie_a.id,
                semester_id=semester.id,
                subject_id=subject_a.id,
                exam_date=date(2026, 9, 10),
                start_time='09:00',
                end_time='10:00'
            )
            target_session = ExamSession(
                cie_id=cie_b.id,
                semester_id=semester.id,
                subject_id=subject_b.id,
                exam_date=date(2026, 9, 20),
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add_all([existing_session, target_session])
            db.session.flush()
            db.session.add(Duty(
                exam_session_id=existing_session.id,
                faculty_id=faculty.id,
                status='ASSIGNED'
            ))
            for sem_number in (3, 5, 7):
                for department in ('CSE (AI & ML)', 'Robotics & Artificial Intelligence'):
                    db.session.add(TimetableCoverage(
                        academic_year='2026-27',
                        sem_number=sem_number,
                        department=department,
                        is_verified=True
                    ))
            db.session.commit()

            result = EligibilityEngine.evaluate_candidate(
                faculty=faculty,
                exam_session=target_session,
                quota_period='month'
            )
            self.assertFalse(result['is_eligible'])
            self.assertTrue(any('quota full' in reason.lower() for reason in result['disqualification_reasons']))

    def test_third_semester_cross_department_class_buffer_blocks_senior_assignment(self):
        with self.app.app_context():
            semester5 = Semester(sem_number=5, name='V Semester', academic_year='2026-27')
            semester3 = Semester(sem_number=3, name='III Semester', academic_year='2026-27')
            reserved_faculty = Faculty(name='Reserved Squad Faculty', password='existing')
            faculty = Faculty(name='Existing Faculty', password='existing', max_duty_capacity=5)
            cie = CIE(
                name='CIE-I',
                academic_year='2026-27',
                start_date=date(2026, 9, 10),
                end_date=date(2026, 9, 12)
            )
            db.session.add_all([semester5, semester3, reserved_faculty, faculty, cie])
            db.session.flush()
            target_subject = Subject(code='TEST501', name='Target Subject', semester_id=semester5.id)
            peer_subject = Subject(
                code='ROBOT301',
                name='Robotics Theory',
                semester_id=semester3.id,
                department='Robotics & Artificial Intelligence'
            )
            db.session.add_all([target_subject, peer_subject])
            db.session.flush()
            target_session = ExamSession(
                cie_id=cie.id,
                semester_id=semester5.id,
                subject_id=target_subject.id,
                exam_date=date(2026, 9, 10),
                start_time='09:00',
                end_time='10:00'
            )
            db.session.add(target_session)
            db.session.flush()
            db.session.add(TimetableEntry(
                semester_id=semester3.id,
                faculty_id=faculty.id,
                subject_id=peer_subject.id,
                academic_year='2026-2027',
                day_of_week='THU',
                start_time='08:00',
                end_time='09:00',
                department='Robotics & Artificial Intelligence'
            ))
            for sem_number in (3, 5, 7):
                for department in ('CSE (AI & ML)', 'Robotics & Artificial Intelligence'):
                    db.session.add(TimetableCoverage(
                        academic_year='2026-27',
                        sem_number=sem_number,
                        department=department,
                        is_verified=True
                    ))
            db.session.commit()

            result = EligibilityEngine.evaluate_candidate(
                faculty=faculty,
                exam_session=target_session
            )
            self.assertFalse(result['is_eligible'])
            self.assertTrue(any(
                conflict['subject_name'] == 'Robotics Theory'
                for conflict in result['conflict_details']
            ))


if __name__ == '__main__':
    unittest.main()
