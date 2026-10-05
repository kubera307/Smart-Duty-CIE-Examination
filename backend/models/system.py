from datetime import datetime
from . import db

class SystemSettings(db.Model):
    __tablename__ = 'system_settings'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False)
    value = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value,
            'description': self.description
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    action = db.Column(db.String(50), nullable=False)  # ALLOCATION_GENERATED, DUTY_ASSIGNED, DUTY_COMPLETED, DUTY_CANCELLED, DUTY_REASSIGNED, MANUAL_OVERRIDE, FACULTY_UPDATED, TIMETABLE_UPDATED
    user_identifier = db.Column(db.String(50), default='Admin')
    entity_type = db.Column(db.String(50), nullable=True)  # Faculty, Duty, TimetableEntry, CIE, etc.
    entity_id = db.Column(db.Integer, nullable=True)
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)
    details = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'action': self.action,
            'user_identifier': self.user_identifier,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'old_value': self.old_value,
            'new_value': self.new_value,
            'details': self.details
        }

