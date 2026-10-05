from flask import Blueprint, jsonify, request
from models import db, Faculty, ExamSession, Duty, CIE, AuditLog, SystemSettings

analytics_bp = Blueprint('analytics_bp', __name__)

@analytics_bp.route('/dashboard', methods=['GET'])
def get_dashboard_data():
    """
    Returns high-level KPI cards and real database summaries for the main dashboard.
    Supports ?academic_year= query parameter to segregate metrics per academic cycle.
    """
    academic_year = request.args.get('academic_year')
    if not academic_year:
        setting = SystemSettings.query.filter_by(key='academic_year').first()
        if setting and setting.value:
            academic_year = setting.value

    cie_query = CIE.query
    if academic_year:
        cie_query = cie_query.filter_by(academic_year=academic_year.strip())
    cies = cie_query.order_by(CIE.start_date).all()
    cie_ids = [c.id for c in cies]

    if cie_ids:
        all_sessions = ExamSession.query.filter(ExamSession.cie_id.in_(cie_ids)).all()
    else:
        all_sessions = []
    total_sessions = len(all_sessions)
    required_duties = sum(s.required_invigilators for s in all_sessions)

    session_ids = [s.id for s in all_sessions]
    session_id_set = set(session_ids)
    if session_ids:
        all_duties = Duty.query.filter(Duty.exam_session_id.in_(session_ids)).all()
    else:
        all_duties = []

    valid_duties = [d for d in all_duties if d.status != 'CANCELLED']
    allocated_duties = sum(1 for d in valid_duties if d.status in ('ASSIGNED', 'COMPLETED') and d.faculty_id is not None)
    completed_duties = sum(1 for d in valid_duties if d.status == 'COMPLETED')
    pending_duties = max(0, required_duties - allocated_duties)

    # Conflicts count: pending duties
    conflicts_count = pending_duties

    all_faculty = Faculty.query.all()
    total_faculty = len(all_faculty)
    active_faculty = [f for f in all_faculty if f.is_active]
    eligible_faculty = sum(1 for f in active_faculty if f.eligible_for_duty)

    # Faculty Workload Distribution scoped to selected academic year
    faculty_workloads = []
    for f in active_faculty:
        if session_id_set:
            f_valid_duties = [d for d in f.duties if d.status != 'CANCELLED' and d.exam_session_id in session_id_set]
        else:
            f_valid_duties = [d for d in f.duties if d.status != 'CANCELLED']
        faculty_workloads.append({
            'faculty_id': f.id,
            'name': f.name,
            'designation': f.designation,
            'duties': len(f_valid_duties),
            'capacity': f.max_duty_capacity,
            'eligible': f.eligible_for_duty
        })

    # Sort descending by duties
    faculty_workloads.sort(key=lambda x: x['duties'], reverse=True)

    # CIE Breakdown
    cie_distribution = []
    for c in cies:
        c_req = sum(s.required_invigilators for s in c.exam_sessions)
        c_duties = [d for s in c.exam_sessions for d in s.duties if d.status != 'CANCELLED']
        c_alloc = sum(1 for d in c_duties if d.status in ('ASSIGNED', 'COMPLETED') and d.faculty_id is not None)
        c_comp = sum(1 for d in c_duties if d.status == 'COMPLETED')
        c_pend = max(0, c_req - c_alloc)
        cie_distribution.append({
            'name': c.name,
            'academic_year': c.academic_year,
            'status': c.status,
            'required': c_req,
            'allocated': c_alloc,
            'completed': c_comp,
            'pending': c_pend
        })

    # Recent activity from AuditLog
    recent_logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(8).all()

    return jsonify({
        'academic_year': academic_year,
        'kpis': {
            'total_faculty': total_faculty,
            'eligible_faculty': eligible_faculty,
            'exam_sessions': total_sessions,
            'required_duties': required_duties,
            'allocated': allocated_duties,
            'pending': pending_duties,
            'completed': completed_duties,
            'conflicts': conflicts_count
        },
        'faculty_workloads': faculty_workloads,
        'cie_distribution': cie_distribution,
        'recent_activity': [l.to_dict() for l in recent_logs]
    })


@analytics_bp.route('/workload', methods=['GET'])
def get_workload_analytics():
    """Returns detailed workload equity metrics and distribution. Supports ?academic_year= query parameter."""
    academic_year = request.args.get('academic_year')
    if not academic_year:
        setting = SystemSettings.query.filter_by(key='academic_year').first()
        if setting and setting.value:
            academic_year = setting.value

    active_faculty = Faculty.query.filter_by(is_active=True).all()
    if not active_faculty:
        return jsonify({'error': 'No active faculty found'}), 404

    # Determine session IDs for the academic year if provided
    session_id_set = None
    if academic_year:
        cie_ids = [c.id for c in CIE.query.filter_by(academic_year=academic_year.strip()).all()]
        if cie_ids:
            sess_ids = [s.id for s in ExamSession.query.filter(ExamSession.cie_id.in_(cie_ids)).all()]
            session_id_set = set(sess_ids)
        else:
            session_id_set = set()

    def get_valid_duties(f):
        if session_id_set is not None:
            return [d for d in f.duties if d.status != 'CANCELLED' and d.exam_session_id in session_id_set]
        return [d for d in f.duties if d.status != 'CANCELLED']

    counts = [len(get_valid_duties(f)) for f in active_faculty]
    avg_duties = round(sum(counts) / len(counts), 2) if counts else 0
    min_duties = min(counts) if counts else 0
    max_duties = max(counts) if counts else 0

    # Designation-wise breakdown
    desig_stats = {}
    for f in active_faculty:
        d_name = f.designation
        if d_name not in desig_stats:
            desig_stats[d_name] = {'count': 0, 'total_duties': 0}
        desig_stats[d_name]['count'] += 1
        desig_stats[d_name]['total_duties'] += len(get_valid_duties(f))

    desig_list = []
    for k, v in desig_stats.items():
        desig_list.append({
            'designation': k,
            'faculty_count': v['count'],
            'total_duties': v['total_duties'],
            'avg_duties': round(v['total_duties'] / v['count'], 2) if v['count'] > 0 else 0
        })

    # Experience vs Workload correlation points
    exp_vs_workload = [
        {
            'name': f.name,
            'experience': f.experience_years,
            'duties': len(get_valid_duties(f)),
            'designation': f.designation
        }
        for f in active_faculty
    ]

    return jsonify({
        'academic_year': academic_year,
        'summary': {
            'average_duties': avg_duties,
            'min_duties': min_duties,
            'max_duties': max_duties,
            'total_active_faculty': len(active_faculty)
        },
        'designation_breakdown': desig_list,
        'exp_vs_workload': exp_vs_workload
    })


@analytics_bp.route('/cie', methods=['GET'])
def get_cie_analytics():
    """Returns comparative metrics across CIE cycles. Supports ?academic_year= query parameter."""
    academic_year = request.args.get('academic_year')
    query = CIE.query
    if academic_year:
        query = query.filter_by(academic_year=academic_year.strip())
    cies = query.order_by(CIE.start_date).all()
    results = []
    for c in cies:
        sessions = c.exam_sessions
        req = sum(s.required_invigilators for s in sessions)
        duties = [d for s in sessions for d in s.duties if d.status != 'CANCELLED']
        alloc = sum(1 for d in duties if d.status in ('ASSIGNED', 'COMPLETED') and d.faculty_id is not None)
        comp = sum(1 for d in duties if d.status == 'COMPLETED')
        pend = max(0, req - alloc)

        results.append({
            'cie_id': c.id,
            'name': c.name,
            'academic_year': c.academic_year,
            'start_date': c.start_date.isoformat(),
            'end_date': c.end_date.isoformat(),
            'status': c.status,
            'sessions_count': len(sessions),
            'required': req,
            'allocated': alloc,
            'completed': comp,
            'pending': pend,
            'allocation_rate': round((alloc / req * 100), 1) if req > 0 else 0
        })
    return jsonify(results)

