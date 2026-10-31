import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from services.timetable_ocr_service import _extract_period_schedule


class TestTimetableOcr(unittest.TestCase):
    def test_extracts_period_times_and_skips_break_columns(self):
        centers = [808, 1013, 1222, 1497, 1705, 1875, 2137, 2361]
        labels = [
            ('09:30-', '10.30'),
            ('10.30', '11.00'),
            ('11.00-', '12.00'),
            ('12.00-', '1.00'),
            ('1.00-', '2.00'),
            ('2.30-', '3.30'),
            ('3.30-', '4.30'),
            ('4.30-', '5.30')
        ]
        words = []
        for center, (start, end) in zip(centers, labels):
            words.extend([
                {'cx': center, 'y': 720, 'text': start},
                {'cx': center, 'y': 780, 'text': end}
            ])

        schedule = _extract_period_schedule(words, first_day_y=920)

        self.assertEqual(schedule['p1']['start_time'], '09:30')
        self.assertEqual(schedule['p1']['end_time'], '10:30')
        self.assertEqual(schedule['p2']['start_time'], '11:00')
        self.assertEqual(schedule['p2']['end_time'], '12:00')
        self.assertEqual(schedule['p4']['start_time'], '14:30')
        self.assertEqual(schedule['p4']['end_time'], '15:30')
        self.assertEqual(schedule['p6']['start_time'], '16:30')
        self.assertEqual(schedule['p6']['end_time'], '17:30')


if __name__ == '__main__':
    unittest.main()
