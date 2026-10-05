from datetime import datetime
from . import db

class CIE(db.Model):
    __tablename__ = 'cies'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)  # 'CIE-1', 'CIE-2', 'CIE-3'
    academic_year = db.Column(db.String(20), default='2026-2027', nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default='UPCOMING')  # UPCOMING, ACTIVE, COMPLETED
    is_current = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    exam_sessions = db.relationship('ExamSession', backref='cie', lazy=True, cascade='all, delete-orphan')
    allocation_runs = db.relationship('AllocationRun', backref='cie', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_stats=False):
        data = {
            'id': self.id,
            'name': self.name,
            'academic_year': self.academic_year,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'status': self.status,
            'is_current': self.is_current,
            'session_count': len(self.exam_sessions)
        }

        if include_stats:
            total_required = 0
            allocated = 0
            completed = 0
            pending = 0
            for session in self.exam_sessions:
                needed = (len(session.exam_rooms) if session.exam_rooms else session.required_invigilators) + (session.required_squad or 0)
                total_required += needed
                for duty in session.duties:
                    if duty.status == 'COMPLETED':
                        completed += 1
                        allocated += 1
                    elif duty.status == 'ASSIGNED':
                        allocated += 1
                    elif duty.status == 'PENDING':
                        pending += 1
            
            actual_pending = max(pending, total_required - allocated)

            data.update({
                'total_required': total_required,
                'allocated': allocated,
                'completed': completed,
                'pending': actual_pending
            })

        return data


class ExamSession(db.Model):
    __tablename__ = 'exam_sessions'

    id = db.Column(db.Integer, primary_key=True)
    cie_id = db.Column(db.Integer, db.ForeignKey('cies.id'), nullable=False)
    semester_id = db.Column(db.Integer, db.ForeignKey('semesters.id'), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    exam_date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.String(5), nullable=False)  # HH:MM e.g. '09:00'
    end_time = db.Column(db.String(5), nullable=False)    # HH:MM e.g. '10:00'
    total_students = db.Column(db.Integer, default=60)
    room_number = db.Column(db.String(50), nullable=True) # Primary/fallback room
    required_invigilators = db.Column(db.Integer, default=1)
    required_squad = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    exam_rooms = db.relationship('ExamRoom', backref='exam_session', lazy=True, cascade='all, delete-orphan')
    duties = db.relationship('Duty', backref='exam_session', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        allocated_duties = [d for d in self.duties if d.status in ('ASSIGNED', 'COMPLETED') and d.faculty_id is not None]
        rooms_list = [r.to_dict() for r in self.exam_rooms]
        req_invig = len(self.exam_rooms) if self.exam_rooms else self.required_invigilators
        total_needed = req_invig + (self.required_squad or 0)
        squad_d = next((d for d in self.duties if d.duty_type == 'Squad Duty' and d.status in ('ASSIGNED', 'COMPLETED') and d.faculty_id is not None), None)

        return {
            'id': self.id,
            'cie_id': self.cie_id,
            'cie_name': self.cie.name if self.cie else None,
            'semester_id': self.semester_id,
            'semester_name': self.semester.name if self.semester else None,
            'sem_number': self.semester.sem_number if self.semester else None,
            'subject_id': self.subject_id,
            'subject_code': self.subject.code if self.subject else None,
            'subject_name': self.subject.name if self.subject else None,
            'exam_date': self.exam_date.isoformat() if self.exam_date else None,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'total_students': self.total_students or (sum(r['student_count'] for r in rooms_list) if rooms_list else 60),
            'room_number': self.room_number or (rooms_list[0]['room_number'] if rooms_list else 'AI301'),
            'rooms_count': len(rooms_list),
            'exam_rooms': rooms_list,
            'required_invigilators': len(self.exam_rooms) if self.exam_rooms else self.required_invigilators,
            'required_squad': self.required_squad or 0,
            'total_required': total_needed,
            'allocated_count': len(allocated_duties),
            'status': 'FULLY_ALLOCATED' if len(allocated_duties) >= total_needed else ('PARTIALLY_ALLOCATED' if allocated_duties else 'UNALLOCATED'),
            'squad_faculty_id': squad_d.faculty_id if squad_d else None,
            'squad_faculty_name': squad_d.faculty.name if (squad_d and squad_d.faculty) else None,
            'squad_faculty_designation': squad_d.faculty.designation if (squad_d and squad_d.faculty) else None,
            'squad_faculty': {
                'id': squad_d.faculty.id,
                'name': squad_d.faculty.name,
                'designation': squad_d.faculty.designation
            } if (squad_d and squad_d.faculty) else None,
            'duties': [d.to_dict() for d in self.duties]
        }


class ExamRoom(db.Model):
    __tablename__ = 'exam_rooms'

    id = db.Column(db.Integer, primary_key=True)
    exam_session_id = db.Column(db.Integer, db.ForeignKey('exam_sessions.id'), nullable=False)
    room_number = db.Column(db.String(50), nullable=False) # e.g. 'AI301', 'AI302'
    student_start = db.Column(db.Integer, nullable=False, default=1)
    student_end = db.Column(db.Integer, nullable=False, default=30)
    student_count = db.Column(db.Integer, nullable=False, default=30)
    room_capacity = db.Column(db.Integer, default=30)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    duties = db.relationship('Duty', backref='exam_room', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        allocated_faculty = None
        allocated_status = 'UNALLOCATED'
        duty_id = None
        attendance_status = 'PENDING'
        check_in_time = None
        for d in self.duties:
            duty_id = d.id
            attendance_status = d.attendance_status or 'PENDING'
            check_in_time = d.check_in_time.isoformat() if d.check_in_time else None
            if d.faculty and d.status in ('ASSIGNED', 'COMPLETED'):
                allocated_faculty = {
                    'id': d.faculty.id,
                    'name': d.faculty.name,
                    'designation': d.faculty.designation
                }
                allocated_status = d.status
                break

        # Calculate student count: end - start + 1
        calc_count = max(0, (self.student_end - self.student_start + 1)) if (self.student_end and self.student_start) else (self.student_count or 0)

        return {
            'id': self.id,
            'exam_session_id': self.exam_session_id,
            'duty_id': duty_id,
            'attendance_status': attendance_status,
            'check_in_time': check_in_time,
            'room_number': self.room_number,
            'student_start': self.student_start,
            'student_end': self.student_end,
            'student_count': calc_count,
            'student_range': f"{self.student_start}–{self.student_end}" if (self.student_start and self.student_end) else None,
            'room_capacity': self.room_capacity,
            'allocated_faculty': allocated_faculty,
            'status': allocated_status
        }


class Duty(db.Model):
    __tablename__ = 'duties'

    id = db.Column(db.Integer, primary_key=True)
    exam_session_id = db.Column(db.Integer, db.ForeignKey('exam_sessions.id'), nullable=False)
    exam_room_id = db.Column(db.Integer, db.ForeignKey('exam_rooms.id'), nullable=True) # Direct link to specific room
    faculty_id = db.Column(db.Integer, db.ForeignKey('faculties.id'), nullable=True)  # Nullable if unallocated
    duty_type = db.Column(db.String(50), default='Invigilation')  # Invigilation, Squad Duty
    status = db.Column(db.String(20), default='ASSIGNED')  # ASSIGNED, COMPLETED, CANCELLED, PENDING
    attendance_status = db.Column(db.String(20), default='PENDING')  # PENDING, REPORTED, PRESENT, LATE, ABSENT
    check_in_time = db.Column(db.DateTime, nullable=True)
    is_manual_override = db.Column(db.Boolean, default=False)
    override_reason = db.Column(db.Text, nullable=True)
    allocated_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    explanation = db.relationship('AllocationExplanation', backref='duty', uselist=False, cascade='all, delete-orphan')

    def to_dict(self, include_session=True):
        room_num = self.exam_room.room_number if self.exam_room else (self.exam_session.room_number if self.exam_session else None)
        s_start = self.exam_room.student_start if self.exam_room else None
        s_end = self.exam_room.student_end if self.exam_room else None
        s_count = (s_end - s_start + 1) if (s_start and s_end) else (self.exam_room.student_count if self.exam_room else None)
        s_range = f"{s_start}–{s_end}" if (s_start and s_end) else None

        data = {
            'id': self.id,
            'exam_session_id': self.exam_session_id,
            'exam_room_id': self.exam_room_id,
            'room_number': room_num,
            'student_start': s_start,
            'student_end': s_end,
            'student_count': s_count,
            'student_range': s_range,
            'faculty_id': self.faculty_id,
            'faculty_name': self.faculty.name if self.faculty else 'Unassigned (Pending)',
            'faculty_employee_id': self.faculty.employee_id if self.faculty else None,
            'faculty_designation': self.faculty.designation if self.faculty else None,
            'duty_type': self.duty_type or 'Invigilation',
            'status': self.status,
            'attendance_status': self.attendance_status or 'PENDING',
            'check_in_time': self.check_in_time.isoformat() if self.check_in_time else None,
            'is_manual_override': self.is_manual_override,
            'override_reason': self.override_reason,
            'allocated_at': self.allocated_at.isoformat() if self.allocated_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'has_explanation': self.explanation is not None
        }

        if include_session and self.exam_session:
            session = self.exam_session
            squad_d = next((d for d in session.duties if d.duty_type == 'Squad Duty' and d.status in ('ASSIGNED', 'COMPLETED') and d.faculty_id is not None), None)
            data.update({
                'cie_id': session.cie_id,
                'cie_name': session.cie.name if session.cie else None,
                'semester_id': session.semester_id,
                'semester_name': session.semester.name if session.semester else None,
                'sem_number': session.semester.sem_number if session.semester else None,
                'subject_id': session.subject_id,
                'subject_code': session.subject.code if session.subject else None,
                'subject_name': session.subject.name if session.subject else None,
                'exam_date': session.exam_date.isoformat() if session.exam_date else None,
                'start_time': session.start_time,
                'end_time': session.end_time,
                'total_students': session.total_students,
                'squad_faculty_id': squad_d.faculty_id if squad_d else None,
                'squad_faculty_name': squad_d.faculty.name if (squad_d and squad_d.faculty) else None,
                'squad_faculty_designation': squad_d.faculty.designation if (squad_d and squad_d.faculty) else None,
                'squad_faculty': {
                    'id': squad_d.faculty.id,
                    'name': squad_d.faculty.name,
                    'designation': squad_d.faculty.designation
                } if (squad_d and squad_d.faculty) else None,
            })

        return data


class DutySwapRequest(db.Model):
    __tablename__ = 'duty_swap_requests'

    id = db.Column(db.Integer, primary_key=True)
    duty_id = db.Column(db.Integer, db.ForeignKey('duties.id'), nullable=False)
    requesting_faculty_id = db.Column(db.Integer, db.ForeignKey('faculties.id'), nullable=False)
    substitute_faculty_id = db.Column(db.Integer, db.ForeignKey('faculties.id'), nullable=False)
    status = db.Column(db.String(20), default='PENDING')  # PENDING, APPROVED, REJECTED, CANCELLED
    reason = db.Column(db.Text, nullable=True)
    admin_notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    duty = db.relationship('Duty', backref=db.backref('swap_requests', lazy=True, cascade='all, delete-orphan'))
    requesting_faculty = db.relationship('Faculty', foreign_keys=[requesting_faculty_id], backref='swap_requests_made')
    substitute_faculty = db.relationship('Faculty', foreign_keys=[substitute_faculty_id], backref='swap_requests_received')

    def to_dict(self):
        return {
            'id': self.id,
            'duty_id': self.duty_id,
            'requesting_faculty_id': self.requesting_faculty_id,
            'requesting_faculty_name': self.requesting_faculty.name if self.requesting_faculty else None,
            'substitute_faculty_id': self.substitute_faculty_id,
            'substitute_faculty_name': self.substitute_faculty.name if self.substitute_faculty else None,
            'status': self.status,
            'reason': self.reason,
            'admin_notes': self.admin_notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'duty': self.duty.to_dict() if self.duty else None
        }

