import json
from models import db, Faculty, Subject, TimetableEntry, Semester

def seed_robotics_timetable(app):
    with app.app_context():
        sem3 = Semester.query.filter_by(sem_number=3).first()
        if not sem3:
            print("Semester 3 not found!")
            return

        robotics_dept = "Robotics & Artificial Intelligence"

        # 1. External Faculty from Department of Robotics & AI
        external_fac_data = [
            {'name': 'Mr. Adithya G N', 'designation': 'Assistant Professor', 'emp_id': 'ROB-AGN', 'login_id': 'adithya_gn'},
            {'name': 'Dr. Yashas Gowda T G', 'designation': 'Assistant Professor', 'emp_id': 'ROB-YGT', 'login_id': 'yashas_gowda'},
            {'name': 'Dr. ShivaShankar B S', 'designation': 'Associate Professor', 'emp_id': 'ROB-SSB', 'login_id': 'shivashankar_bs'},
            {'name': 'Dr. Shashank Lingappa M', 'designation': 'Assistant Professor', 'emp_id': 'ROB-SLM', 'login_id': 'shashank_lm'},
        ]

        fac_map = {}
        for ef in external_fac_data:
            fac = Faculty.query.filter_by(employee_id=ef['emp_id']).first()
            if not fac:
                fac = Faculty.query.filter(Faculty.name.ilike(ef['name'])).first()
            if not fac:
                fac = Faculty(
                    name=ef['name'],
                    employee_id=ef['emp_id'],
                    login_id=ef['login_id'],
                    designation=ef['designation'],
                    department=robotics_dept,
                    is_active=True,
                    eligible_for_duty=False, # External faculty not drafted for AI&ML exam duties
                    max_duty_capacity=0
                )
                db.session.add(fac)
                db.session.flush()
            fac_map[ef['name']] = fac

        # Our department faculty
        swathi = Faculty.query.filter(Faculty.name.ilike('%Swathi%')).first()
        maseeha = Faculty.query.filter(Faculty.name.ilike('%Maseeha%')).first()
        sheethal = Faculty.query.filter(Faculty.name.ilike('%Sheethal%')).first()
        megha = Faculty.query.filter(Faculty.name.ilike('%Megha%')).first()
        sushma = Faculty.query.filter(Faculty.name.ilike('%Sushma%')).first()

        fac_map['Dr. Swathi H Y'] = swathi
        fac_map['Mrs. Maseeha Banu'] = maseeha
        fac_map['Mrs. Sheethal D N'] = sheethal
        fac_map['Mrs. Megha H C'] = megha
        fac_map['Mrs. Sushma M V'] = sushma

        # 2. Subjects from Robotics & AI III Semester circular
        subjects_data = [
            {'code': '25RA301', 'name': 'Discrete Mathematics & Probability Theory', 'dept': robotics_dept},
            {'code': '25RA302', 'name': 'Data Structures and Algorithms', 'dept': robotics_dept},
            {'code': '25RA303', 'name': 'Mechanics of Materials', 'dept': robotics_dept},
            {'code': '25RA304', 'name': 'Digital Systems for Robotics & AI', 'dept': robotics_dept},
            {'code': '25RA305', 'name': 'Fundamentals of Industrial Robots', 'dept': robotics_dept},
            {'code': '25RAL306', 'name': 'Digital Systems for Robotics & AI LAB', 'dept': robotics_dept},
            {'code': '25RAL307', 'name': 'Computer Aided Modelling Lab', 'dept': robotics_dept},
        ]

        sub_map = {}
        for sd in subjects_data:
            sub = Subject.query.filter_by(code=sd['code']).first()
            if not sub:
                sub = Subject(
                    code=sd['code'],
                    name=sd['name'],
                    semester_id=sem3.id,
                    department=sd['dept']
                )
                db.session.add(sub)
                db.session.flush()
            sub_map[sd['code']] = sub

        # Shared subjects
        scr_sub = Subject.query.filter_by(code='25SCR').first()
        pt_sub = Subject.query.filter_by(code='25PT1').first()
        nyp_sub = Subject.query.filter_by(code='25NYP1').first()
        bcm_sub = Subject.query.filter_by(code='25BCM301').first()

        sub_map['25SCR'] = scr_sub
        sub_map['25PT1'] = pt_sub
        sub_map['25NYP1'] = nyp_sub
        sub_map['25BCM301'] = bcm_sub

        # Remove any existing Robotics timetable entries before re-inserting
        TimetableEntry.query.filter_by(department=robotics_dept).delete()
        db.session.flush()

        # 3. Timetable Entries from Official Circular (media_1791609120740_b13e1ea5.jpg)
        # Class: III Semester B.E., Classroom: MB210, Lab: MB-211 / SA-205*
        entries_data = [
            # Monday
            {'day': 'MON', 'start': '08:30', 'end': '10:30', 'code': '25RAL307', 'fac': 'Dr. Shashank Lingappa M', 'room': 'MB-211'},
            {'day': 'MON', 'start': '11:00', 'end': '12:00', 'code': '25RA304',  'fac': 'Dr. Swathi H Y',         'room': 'MB210'},
            {'day': 'MON', 'start': '12:00', 'end': '13:00', 'code': '25RA303',  'fac': 'Dr. Yashas Gowda T G',    'room': 'MB210'},
            {'day': 'MON', 'start': '14:00', 'end': '15:00', 'code': '25RA305',  'fac': 'Dr. ShivaShankar B S',    'room': 'MB210'},
            {'day': 'MON', 'start': '15:00', 'end': '16:00', 'code': '25RA302',  'fac': 'Mrs. Maseeha Banu',       'room': 'MB210'},
            {'day': 'MON', 'start': '16:00', 'end': '17:00', 'code': '25RA301',  'fac': 'Mr. Adithya G N',         'room': 'MB210'},

            # Tuesday
            {'day': 'TUE', 'start': '11:00', 'end': '12:00', 'code': '25RA303',  'fac': 'Dr. Yashas Gowda T G',    'room': 'MB210'},
            {'day': 'TUE', 'start': '12:00', 'end': '13:00', 'code': '25RA304',  'fac': 'Dr. Swathi H Y',         'room': 'MB210'},
            {'day': 'TUE', 'start': '14:00', 'end': '16:00', 'code': '25RA302',  'fac': 'Mrs. Maseeha Banu',       'room': 'SA-205'}, # 2-hr Lab in SA-205

            # Wednesday
            {'day': 'WED', 'start': '11:00', 'end': '13:00', 'code': '25RAL306', 'fac': 'Dr. Swathi H Y',         'room': 'MB-211'}, # 2-hr Lab (B2)
            {'day': 'WED', 'start': '11:00', 'end': '13:00', 'code': '25RAL306', 'fac': 'Mrs. Sheethal D N',      'room': 'MB-211'}, # Co-faculty in Lab
            {'day': 'WED', 'start': '14:00', 'end': '15:00', 'code': '25RA301',  'fac': 'Mr. Adithya G N',         'room': 'MB210'},
            {'day': 'WED', 'start': '15:00', 'end': '17:00', 'code': '25SCR',    'fac': 'Mrs. Megha H C',          'room': 'MB210'}, # 2-hr Community Project
            {'day': 'WED', 'start': '15:00', 'end': '17:00', 'code': '25SCR',    'fac': 'Mrs. Sushma M V',         'room': 'MB210'}, # Co-faculty

            # Thursday
            {'day': 'THU', 'start': '09:30', 'end': '10:30', 'code': '25RA301',  'fac': 'Mr. Adithya G N',         'room': 'MB210'},
            {'day': 'THU', 'start': '11:00', 'end': '12:00', 'code': '25RA301',  'fac': 'Mr. Adithya G N',         'room': 'MB210'},
            {'day': 'THU', 'start': '12:00', 'end': '13:00', 'code': '25RA302',  'fac': 'Mrs. Maseeha Banu',       'room': 'MB210'},
            {'day': 'THU', 'start': '14:00', 'end': '16:00', 'code': '25RAL306', 'fac': 'Dr. Swathi H Y',         'room': 'MB-211'}, # 2-hr Lab (B1)
            {'day': 'THU', 'start': '14:00', 'end': '16:00', 'code': '25RAL306', 'fac': 'Mrs. Sheethal D N',      'room': 'MB-211'}, # Co-faculty in Lab

            # Friday
            {'day': 'FRI', 'start': '09:30', 'end': '10:30', 'code': '25PT1',    'fac': 'Mrs. Megha H C',          'room': 'MB210'},
            {'day': 'FRI', 'start': '11:00', 'end': '12:00', 'code': '25RA305',  'fac': 'Dr. ShivaShankar B S',    'room': 'MB210'},
            {'day': 'FRI', 'start': '12:00', 'end': '13:00', 'code': '25RA302',  'fac': 'Mrs. Maseeha Banu',       'room': 'MB210'},

            # Saturday
            {'day': 'SAT', 'start': '09:30', 'end': '10:30', 'code': '25RA305',  'fac': 'Dr. ShivaShankar B S',    'room': 'MB210'},
            {'day': 'SAT', 'start': '11:00', 'end': '12:00', 'code': '25RA303',  'fac': 'Dr. Yashas Gowda T G',    'room': 'MB210'},
            {'day': 'SAT', 'start': '12:00', 'end': '13:00', 'code': '25RA304',  'fac': 'Dr. Swathi H Y',         'room': 'MB210'},
        ]

        created_entries = []
        for ed in entries_data:
            fac = fac_map.get(ed['fac'])
            sub = sub_map.get(ed['code'])
            if not fac or not sub:
                print(f"Skipping {ed}: fac={fac}, sub={sub}")
                continue

            entry = TimetableEntry(
                semester_id=sem3.id,
                faculty_id=fac.id,
                subject_id=sub.id,
                academic_year='2026-2027',
                is_academic_year_verified=True,
                day_of_week=ed['day'],
                start_time=ed['start'],
                end_time=ed['end'],
                room_number=ed['room'],
                department=robotics_dept
            )
            db.session.add(entry)
            created_entries.append(entry)

        db.session.commit()
        print(f"Successfully seeded {len(created_entries)} timetable entries for {robotics_dept} (III Semester)!")

if __name__ == '__main__':
    from app import create_app
    app = create_app()
    seed_robotics_timetable(app)
