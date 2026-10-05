from flask import Blueprint, jsonify
from models import Duty, ExamSession, Faculty, AllocationExplanation
from allocation.engine import AllocationEngine

conflict_bp = Blueprint('conflict_bp', __name__)

@conflict_bp.route('', methods=['GET'])
def get_conflicts():
    """
    Returns categorized conflicts across all examination duties and faculty:
    - CRITICAL: Unallocated duties, hard timetable collisions
    - WARNING: Near capacity, manual overrides with potential timetable clashes
    - RESOLVED: Handled duties
    """
    critical = []
    warning = []
    resolved = []

    # 1. Unallocated / Pending Duties (CRITICAL)
    pending_duties = Duty.query.filter_by(status='PENDING').all()
    for d in pending_duties:
        sess = d.exam_session
        critical.append({
            'id': f"CRIT-DUTY-{d.id}",
            'type': 'INSUFFICIENT_ELIGIBLE_FACULTY',
            'severity': 'CRITICAL',
            'title': 'Unallocated Examination Duty',
            'duty_id': d.id,
            'session_id': sess.id if sess else None,
            'details': (
                f"{sess.subject.code} in Room {sess.room_number} on {sess.exam_date.isoformat()} "
                f"({sess.start_time}-{sess.end_time}) could not be allocated automatically due to timetable buffer collisions."
                if sess else "Session information unavailable"
            ),
            'status': 'BLOCKED',
            'remediation': 'Manually reassign faculty using administrative override or adjust exam timetable.'
        })

    # 2. Manual Overrides (WARNING)
    override_duties = Duty.query.filter_by(is_manual_override=True).all()
    for d in override_duties:
        sess = d.exam_session
        warning.append({
            'id': f"WARN-OVERRIDE-{d.id}",
            'type': 'MANUAL_OVERRIDE_ACTIVE',
            'severity': 'WARNING',
            'title': 'Manual Override Assignment',
            'duty_id': d.id,
            'faculty_name': d.faculty.name if d.faculty else "None",
            'details': (
                f"Duty assigned manually to {d.faculty.name if d.faculty else 'N/A'}. "
                f"Reason logged: '{d.override_reason or 'None'}'."
            ),
            'status': 'ACKNOWLEDGED',
            'remediation': 'Review faculty timetable clearance to prevent lecture conflicts.'
        })

    # 3. Faculty Nearing Maximum Duty Capacity (> 80%)
    all_active_faculty = Faculty.query.filter_by(is_active=True).all()
    for fac in all_active_faculty:
        valid_duties = [d for d in fac.duties if d.status != 'CANCELLED']
        duty_count = len(valid_duties)
        capacity = fac.max_duty_capacity
        ratio = duty_count / capacity if capacity > 0 else 1.0

        if ratio >= 0.8 and ratio < 1.0:
            warning.append({
                'id': f"WARN-CAP-{fac.id}",
                'type': 'CAPACITY_APPROACHING_MAX',
                'severity': 'WARNING',
                'title': 'Faculty Workload Capacity High',
                'faculty_id': fac.id,
                'faculty_name': fac.name,
                'details': f"{fac.name} has been assigned {duty_count}/{capacity} maximum allowed duties ({round(ratio*100, 1)}%).",
                'status': 'MONITORING',
                'remediation': 'Consider shifting upcoming assignments to lower-workload faculty.'
            })
        elif ratio >= 1.0:
            critical.append({
                'id': f"CRIT-CAP-{fac.id}",
                'type': 'CAPACITY_EXCEEDED',
                'severity': 'CRITICAL',
                'title': 'Maximum Capacity Reached',
                'faculty_id': fac.id,
                'faculty_name': fac.name,
                'details': f"{fac.name} has reached the maximum allowed limit of {capacity} duties.",
                'status': 'BLOCKED',
                'remediation': 'No further duties can be assigned to this faculty member.'
            })

    # 4. Completed / Resolved Duties
    completed_duties = Duty.query.filter_by(status='COMPLETED').count()
    resolved.append({
        'id': 'RES-COMPLETED-SUMMARY',
        'type': 'DUTIES_COMPLETED',
        'severity': 'RESOLVED',
        'title': 'Completed Examination Duties',
        'details': f"{completed_duties} duties have been successfully completed and reconciled.",
        'status': 'RESOLVED'
    })

    return jsonify({
        'critical': critical,
        'warning': warning,
        'resolved': resolved,
        'counts': {
            'critical': len(critical),
            'warning': len(warning),
            'resolved': len(resolved)
        }
    })

