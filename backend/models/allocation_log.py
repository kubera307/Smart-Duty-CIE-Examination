import json
from datetime import datetime
from . import db

class AllocationRun(db.Model):
    __tablename__ = 'allocation_runs'

    id = db.Column(db.Integer, primary_key=True)
    cie_id = db.Column(db.Integer, db.ForeignKey('cies.id'), nullable=False)
    run_timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    status = db.Column(db.String(20), default='SUCCESS')  # SUCCESS, PARTIAL, FAILED
    total_required = db.Column(db.Integer, default=0)
    total_allocated = db.Column(db.Integer, default=0)
    total_pending = db.Column(db.Integer, default=0)
    total_conflicts = db.Column(db.Integer, default=0)
    execution_time_ms = db.Column(db.Float, default=0.0)
    algorithm_log = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'cie_id': self.cie_id,
            'cie_name': self.cie.name if self.cie else None,
            'run_timestamp': self.run_timestamp.isoformat() if self.run_timestamp else None,
            'status': self.status,
            'total_required': self.total_required,
            'total_allocated': self.total_allocated,
            'total_pending': self.total_pending,
            'total_conflicts': self.total_conflicts,
            'execution_time_ms': self.execution_time_ms,
            'algorithm_log': self.algorithm_log
        }


class AllocationExplanation(db.Model):
    __tablename__ = 'allocation_explanations'

    id = db.Column(db.Integer, primary_key=True)
    duty_id = db.Column(db.Integer, db.ForeignKey('duties.id'), nullable=False)
    selected_faculty_id = db.Column(db.Integer, db.ForeignKey('faculties.id'), nullable=True)
    explanation_summary = db.Column(db.Text, nullable=False)
    hard_constraints_checked = db.Column(db.Text, default='[]')  # JSON list
    soft_metrics = db.Column(db.Text, default='{}')              # JSON dict
    rejected_candidates = db.Column(db.Text, default='[]')       # JSON list of disqualified candidates

    # Relationships
    selected_faculty = db.relationship('Faculty', foreign_keys=[selected_faculty_id])

    def to_dict(self):
        return {
            'id': self.id,
            'duty_id': self.duty_id,
            'selected_faculty_id': self.selected_faculty_id,
            'selected_faculty_name': self.selected_faculty.name if self.selected_faculty else 'None',
            'explanation_summary': self.explanation_summary,
            'hard_constraints_checked': json.loads(self.hard_constraints_checked) if self.hard_constraints_checked else [],
            'soft_metrics': json.loads(self.soft_metrics) if self.soft_metrics else {},
            'rejected_candidates': json.loads(self.rejected_candidates) if self.rejected_candidates else []
        }
