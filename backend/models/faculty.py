import json
from datetime import datetime
from werkzeug.security import check_password_hash, generate_password_hash
from . import db

class Faculty(db.Model):
    __tablename__ = 'faculties'

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.String(50), unique=True, nullable=True, index=True)
    login_id = db.Column(db.String(50), unique=True, nullable=True, index=True)
    password = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    department = db.Column(db.String(100), default='CSE (AI & ML)')
    designation = db.Column(db.String(100), nullable=True, default='Not provided')
    experience_years = db.Column(db.Float, nullable=True)
    skills = db.Column(db.Text, default='[]')  # JSON array
    max_duty_capacity = db.Column(db.Integer, default=15)
    is_active = db.Column(db.Boolean, default=True)
    eligible_for_duty = db.Column(db.Boolean, default=True)  # Set to False to exclude faculty from automated exam duties
    only_squad_duty = db.Column(db.Boolean, default=False)  # Set to True for Dr. Arjun B C (HOD - Squad Duty only)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def check_password(self, password_attempt):
        if not password_attempt:
            return False
        stored_password = (self.password or '').strip()
        if stored_password.startswith(('pbkdf2:', 'scrypt:')):
            return check_password_hash(stored_password, password_attempt)
        return stored_password == password_attempt

    def set_password(self, password):
        self.password = generate_password_hash(password)

    # Relationships
    timetable_entries = db.relationship('TimetableEntry', backref='faculty', lazy=True, cascade='all, delete-orphan')
    duties = db.relationship('Duty', backref='faculty', lazy=True)
    availabilities = db.relationship('FacultyAvailability', backref='faculty', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_stats=False):
        parsed_skills = []
        if self.skills:
            try:
                parsed_skills = json.loads(self.skills)
            except Exception:
                parsed_skills = [s.strip() for s in self.skills.split(',') if s.strip()]

        data = {
            'id': self.id,
            'employee_id': self.employee_id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'department': self.department or 'CSE (AI & ML)',
            'designation': self.designation if self.designation else 'Not provided',
            'experience_years': self.experience_years,
            'skills': parsed_skills,
            'max_duty_capacity': self.max_duty_capacity,
            'max_duties': self.max_duty_capacity,
            'is_active': self.is_active,
            'active': self.is_active,
            'eligible_for_duty': self.eligible_for_duty,
            'only_squad_duty': bool(self.only_squad_duty),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_stats:
            valid_duties = [d for d in self.duties if d.status != 'CANCELLED']
            total_assigned = len(valid_duties)
            completed = sum(1 for d in valid_duties if d.status == 'COMPLETED')
            remaining = total_assigned - completed
            completion_rate = round((completed / total_assigned * 100), 1) if total_assigned > 0 else 0.0

            cie_counts = {'CIE-1': 0, 'CIE-2': 0, 'CIE-3': 0}
            for d in valid_duties:
                if d.exam_session and d.exam_session.cie:
                    c_name = d.exam_session.cie.name
                    if c_name in cie_counts:
                        cie_counts[c_name] += 1

            duty_types = {'invigilation': 0, 'squad': 0}
            for d in valid_duties:
                d_type = (d.duty_type or 'Invigilation').lower()
                if 'squad' in d_type:
                    duty_types['squad'] += 1
                else:
                    duty_types['invigilation'] += 1

            # Teaching Semesters & Subjects derived from timetable
            teaching_sems = sorted(list({
                entry.semester.name for entry in self.timetable_entries if entry.semester
            }))
            teaching_subjects = sorted(list({
                f"{entry.subject.code} - {entry.subject.name}" for entry in self.timetable_entries if entry.subject
            }))

            # Timetable slots count per semester
            semester_wise_slots = {}
            for entry in self.timetable_entries:
                s_name = entry.semester.name if entry.semester else 'Other'
                semester_wise_slots[s_name] = semester_wise_slots.get(s_name, 0) + 1

            data.update({
                'total_assigned': total_assigned,
                'completed': completed,
                'remaining': remaining,
                'completion_rate': completion_rate,
                'remaining_capacity': max(0, self.max_duty_capacity - total_assigned),
                'cie_breakdown': cie_counts,
                'duty_types': duty_types,
                'teaching_semesters': teaching_sems,
                'subjects': teaching_subjects,
                'timetable_summary': {
                    'total_slots': len(self.timetable_entries),
                    'semester_wise': semester_wise_slots
                }
            })

        return data


class FacultyAvailability(db.Model):
    __tablename__ = 'faculty_availabilities'

    id = db.Column(db.Integer, primary_key=True)
    faculty_id = db.Column(db.Integer, db.ForeignKey('faculties.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.String(5), default='09:00', nullable=False)  # HH:MM
    end_time = db.Column(db.String(5), default='17:00', nullable=False)    # HH:MM
    is_available = db.Column(db.Boolean, default=False)
    reason = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'faculty_id': self.faculty_id,
            'date': self.date.isoformat() if self.date else None,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'is_available': self.is_available,
            'reason': self.reason
        }
