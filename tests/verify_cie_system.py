import os
import sys
import unittest
import json

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app import create_app
from config import Config
from models import db, Faculty, ExamSession, CIE, Duty

class TestCIESystemIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class IntegrationTestConfig(Config):
            TESTING = True
            SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'

        cls.app = create_app(IntegrationTestConfig)
        cls.client = cls.app.test_client()

    def test_01_health_check(self):
        res = self.client.get('/api/health')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data['status'], 'healthy')

    def test_02_faculty_endpoints(self):
        res = self.client.get('/api/faculty')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertGreater(data['total'], 0)

        # Check Mr. Manikantha Prasad J is excluded
        manikantha = next((f for f in data['faculty'] if f['name'] == 'Mr. Manikantha Prasad J'), None)
        self.assertIsNotNone(manikantha)
        self.assertFalse(manikantha['eligible_for_duty'])

        # Profile endpoint
        prof_res = self.client.get(f"/api/faculty/{manikantha['id']}")
        self.assertEqual(prof_res.status_code, 200)
        prof_data = prof_res.get_json()
        self.assertIn('upcoming_duties', prof_data)
        self.assertIn('duty_history', prof_data)

    def test_03_academic_endpoints(self):
        # Semesters
        sem_res = self.client.get('/api/academic/semesters')
        self.assertEqual(sem_res.status_code, 200)
        sems = sem_res.get_json()
        self.assertEqual(len(sems), 3)

        # Timetables
        tt_res = self.client.get('/api/academic/timetables')
        self.assertEqual(tt_res.status_code, 200)
        entries = tt_res.get_json()
        self.assertGreater(len(entries), 0)

    def test_04_cie_and_sessions(self):
        cie_res = self.client.get('/api/cie')
        self.assertEqual(cie_res.status_code, 200)
        cies = cie_res.get_json()
        self.assertEqual(len(cies), 3)

        cie1 = next(c for c in cies if c['name'] == 'CIE-1')
        sess_res = self.client.get(f"/api/cie/{cie1['id']}/sessions")
        self.assertEqual(sess_res.status_code, 200)
        sessions = sess_res.get_json()
        self.assertGreater(len(sessions), 0)

    def test_05_allocation_pipeline_and_explainability(self):
        cie_res = self.client.get('/api/cie')
        cie1 = next(c for c in cie_res.get_json() if c['name'] == 'CIE-1')

        # 1. Preview
        prev_res = self.client.get(f"/api/allocation/preview/{cie1['id']}")
        self.assertEqual(prev_res.status_code, 200)
        prev = prev_res.get_json()
        self.assertGreater(prev['total_required_duties'], 0)

        # 2. Generate allocation
        gen_res = self.client.post('/api/allocation/generate', json={'cie_id': cie1['id']})
        self.assertEqual(gen_res.status_code, 200)
        gen = gen_res.get_json()
        self.assertIn(gen['status'], ('SUCCESS', 'PARTIAL'))

        # 3. Fetch results
        res_res = self.client.get(f"/api/allocation/results/{cie1['id']}")
        self.assertEqual(res_res.status_code, 200)
        results = res_res.get_json()
        self.assertGreater(len(results['duties']), 0)

        # 4. Check Explainability on an allocated duty
        allocated_duty = next(d for d in results['duties'] if d['faculty_id'] is not None)
        exp_res = self.client.get(f"/api/allocation/duty/{allocated_duty['id']}/explanation")
        self.assertEqual(exp_res.status_code, 200)
        exp = exp_res.get_json()
        self.assertIn('explanation_summary', exp)
        self.assertGreater(len(exp['hard_constraints_checked']), 0)
        self.assertGreater(len(exp['rejected_candidates']), 0)

    def test_06_manual_override_with_conflict_guard(self):
        cie_res = self.client.get('/api/cie')
        cie1 = next(c for c in cie_res.get_json() if c['name'] == 'CIE-1')
        results = self.client.get(f"/api/allocation/results/{cie1['id']}").get_json()
        duty = results['duties'][0]

        # Get excluded faculty Mr. Manikantha Prasad J
        fac_res = self.client.get('/api/faculty').get_json()
        manikantha = next(f for f in fac_res['faculty'] if f['name'] == 'Mr. Manikantha Prasad J')

        # Attempt override without force_override flag -> Expect 409 Conflict
        override_res = self.client.post('/api/allocation/override', json={
            'duty_id': duty['id'],
            'faculty_id': manikantha['id'],
            'force_override': False
        })
        self.assertEqual(override_res.status_code, 409)
        warning_data = override_res.get_json()
        self.assertTrue(warning_data['requires_force'])
        self.assertTrue(any('excluded' in err.lower() for err in warning_data['errors']))

        # Confirm with force_override = True
        force_res = self.client.post('/api/allocation/override', json={
            'duty_id': duty['id'],
            'faculty_id': manikantha['id'],
            'force_override': True,
            'override_reason': 'Special Administrative Approval for testing'
        })
        self.assertEqual(force_res.status_code, 200)
        self.assertTrue(force_res.get_json()['success'])

    def test_07_conflict_center(self):
        conf_res = self.client.get('/api/conflicts')
        self.assertEqual(conf_res.status_code, 200)
        data = conf_res.get_json()
        self.assertIn('critical', data)
        self.assertIn('warning', data)
        self.assertIn('resolved', data)

    def test_08_analytics_endpoints(self):
        # Dashboard KPIs
        dash_res = self.client.get('/api/analytics/dashboard')
        self.assertEqual(dash_res.status_code, 200)
        dash = dash_res.get_json()
        self.assertIn('kpis', dash)
        self.assertIn('faculty_workloads', dash)
        self.assertIn('cie_distribution', dash)

        # Workload analytics
        workload_res = self.client.get('/api/analytics/workload')
        self.assertEqual(workload_res.status_code, 200)
        w_data = workload_res.get_json()
        self.assertIn('summary', w_data)

        # CIE comparison
        cie_comp = self.client.get('/api/analytics/cie')
        self.assertEqual(cie_comp.status_code, 200)
        self.assertEqual(len(cie_comp.get_json()), 3)

    def test_09_reports_generation(self):
        cie_res = self.client.get('/api/cie')
        cie1 = next(c for c in cie_res.get_json() if c['name'] == 'CIE-1')

        # Excel download
        excel_res = self.client.get(f"/api/reports/cie-excel/{cie1['id']}")
        self.assertEqual(excel_res.status_code, 200)
        self.assertEqual(
            excel_res.mimetype,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

        # PDF download
        pdf_res = self.client.get(f"/api/reports/cie-pdf/{cie1['id']}")
        self.assertEqual(pdf_res.status_code, 200)
        self.assertEqual(pdf_res.mimetype, 'application/pdf')

        # Printable JSON data
        data_res = self.client.get(f"/api/reports/cie-data/{cie1['id']}")
        self.assertEqual(data_res.status_code, 200)
        self.assertIn('duties', data_res.get_json())

    def test_10_audit_logs_and_settings(self):
        # Audit Logs
        logs_res = self.client.get('/api/audit/logs')
        self.assertEqual(logs_res.status_code, 200)
        logs = logs_res.get_json()
        self.assertGreater(len(logs), 0)

        # Settings
        set_res = self.client.get('/api/audit/settings')
        self.assertEqual(set_res.status_code, 200)
        settings = set_res.get_json()
        self.assertIn('buffer_minutes', settings)
        self.assertEqual(settings['buffer_minutes']['value'], '60')

        # Update setting
        up_res = self.client.put('/api/audit/settings', json={'buffer_minutes': '60'})
        self.assertEqual(up_res.status_code, 200)
        self.assertTrue(up_res.get_json()['success'])


if __name__ == '__main__':
    unittest.main()

