from datetime import datetime
from . import db

class Semester(db.Model):
    __tablename__ = 'semesters'

    id = db.Column(db.Integer, primary_key=True)
    sem_number = db.Column(db.Integer, unique=True, nullable=False)  # 3, 5, 7
    name = db.Column(db.String(50), nullable=False)  # e.g., '3rd Semester'
    academic_year = db.Column(db.String(20), default='2026-2027')
    is_active = db.Column(db.Boolean, default=True)

    # Relationships
    subjects = db.relationship('Subject', backref='semester', lazy=True, cascade='all, delete-orphan')
    timetable_entries = db.relationship('TimetableEntry', backref='semester', lazy=True, cascade='all, delete-orphan')
    exam_sessions = db.relationship('ExamSession', backref='semester', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'sem_number': self.sem_number,
            'name': self.name,
            'academic_year': self.academic_year,
            'is_active': self.is_active,
            'subject_count': len(self.subjects)
        }


class Subject(db.Model):
    __tablename__ = 'subjects'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    semester_id = db.Column(db.Integer, db.ForeignKey('semesters.id'), nullable=False)
    department = db.Column(db.String(100), default='Computer Science & Engineering (AI & ML)')

    # Relationships
    timetable_entries = db.relationship('TimetableEntry', backref='subject', lazy=True)
    exam_sessions = db.relationship('ExamSession', backref='subject', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'semester_id': self.semester_id,
            'semester_name': self.semester.name if self.semester else None,
            'sem_number': self.semester.sem_number if self.semester else None,
            'department': self.department
        }


class TimetableEntry(db.Model):
    __tablename__ = 'timetable_entries'

    id = db.Column(db.Integer, primary_key=True)
    semester_id = db.Column(db.Integer, db.ForeignKey('semesters.id'), nullable=False)
    faculty_id = db.Column(db.Integer, db.ForeignKey('faculties.id'), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    academic_year = db.Column(db.String(20), nullable=False, default='2026-2027')
    is_academic_year_verified = db.Column(db.Boolean, default=True)
    day_of_week = db.Column(db.String(10), nullable=False)  # MON, TUE, WED, THU, FRI, SAT
    start_time = db.Column(db.String(5), nullable=False)   # HH:MM (e.g., '09:00')
    end_time = db.Column(db.String(5), nullable=False)     # HH:MM (e.g., '10:00')
    room_number = db.Column(db.String(50), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'semester_id': self.semester_id,
            'semester_name': self.semester.name if self.semester else None,
            'sem_number': self.semester.sem_number if self.semester else None,
            'faculty_id': self.faculty_id,
            'faculty_name': self.faculty.name if self.faculty else None,
            'faculty_designation': self.faculty.designation if self.faculty else None,
            'subject_id': self.subject_id,
            'subject_code': self.subject.code if self.subject else None,
            'subject_name': self.subject.name if self.subject else None,
            'day_of_week': self.day_of_week,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'room_number': self.room_number
        }

