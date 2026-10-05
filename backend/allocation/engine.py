import json
from datetime import datetime
from models import (
    db, CIE, ExamSession, Faculty, Semester, Duty,
    AllocationRun, AllocationExplanation, SystemSettings, AuditLog
)
from .optimizer import AllocationOptimizer

class AllocationEngine:
    """
    High-level service coordinating the full allocation generation pipeline.
    """

    @classmethod
    def get_system_buffer_minutes(cls):
        setting = SystemSettings.query.filter_by(key='buffer_minutes').first()
        return int(setting.value) if setting and setting.value.isdigit() else 60

    @classmethod
    def get_pre_allocation_audit(cls, cie_id, semester_id=None, semester_ids=None):
        """
        Gathers diagnostic statistics before running allocation:
        - CIE info
        - Exam session count & required duties (optionally filtered by semester or multiple semesters)
        - Eligible vs excluded faculty
        - Potential schedule bottlenecks
        """
        cie = CIE.query.get(cie_id)
        if not cie:
            return {'error': 'CIE not found'}

        target_sem_ids = []
        if semester_ids:
            target_sem_ids = [int(s) for s in semester_ids]
        elif semester_id:
            target_sem_ids = [int(semester_id)]

        query = ExamSession.query.filter_by(cie_id=cie_id)
        if target_sem_ids:
            query = query.filter(ExamSession.semester_id.in_(target_sem_ids))

        sessions = query.all()
        total_required = sum((len(s.exam_rooms) if s.exam_rooms else s.required_invigilators) + (s.required_squad or 0) for s in sessions)
        all_faculty = Faculty.query.all()
        active_faculty = [f for f in all_faculty if f.is_active]
        eligible_faculty = [f for f in active_faculty if f.eligible_for_duty]
        excluded_faculty = [f for f in active_faculty if not f.eligible_for_duty]

        # Check existing duties in this CIE
        duty_query = Duty.query.join(ExamSession).filter(
            ExamSession.cie_id == cie_id,
            Duty.status.in_(['ASSIGNED', 'COMPLETED'])
        )
        if target_sem_ids:
            duty_query = duty_query.filter(ExamSession.semester_id.in_(target_sem_ids))
        existing_duties_count = duty_query.count()

        target_semester = None
        if len(target_sem_ids) == 1:
            sem_obj = Semester.query.get(target_sem_ids[0])
            if sem_obj:
                target_semester = {'id': sem_obj.id, 'name': sem_obj.name, 'sem_number': sem_obj.sem_number}
        elif len(target_sem_ids) > 1:
            sems = Semester.query.filter(Semester.id.in_(target_sem_ids)).all()
            target_semester = {'id': 'multiple', 'name': ', '.join([f"{s.sem_number}th Sem" for s in sems]), 'sem_number': None}

        return {
            'cie': cie.to_dict(),
            'target_semester': target_semester,
            'total_sessions': len(sessions),
            'total_required_duties': total_required,
            'existing_allocated_duties': existing_duties_count,
            'total_faculty_count': len(all_faculty),
            'active_faculty_count': len(active_faculty),
            'eligible_faculty_count': len(eligible_faculty),
            'excluded_faculty_count': len(excluded_faculty),
            'excluded_faculty_names': [f.name for f in excluded_faculty],
            'buffer_minutes': cls.get_system_buffer_minutes()
        }

    @classmethod
    def generate_cie_allocation(cls, cie_id, user_identifier="Admin", semester_id=None, semester_ids=None):
        """
        Executes end-to-end allocation generation for a given CIE.
        Supports optional semester_id or semester_ids to allocate for specific semesters without interrupting other semesters.
        """
        cie = CIE.query.get(cie_id)
        if not cie:
            raise ValueError(f"CIE with ID {cie_id} not found.")

        target_sem_ids = []
        if semester_ids:
            target_sem_ids = [int(s) for s in semester_ids]
        elif semester_id:
            target_sem_ids = [int(semester_id)]

        query = ExamSession.query.filter_by(cie_id=cie_id)
        if target_sem_ids:
            query = query.filter(ExamSession.semester_id.in_(target_sem_ids))

        exam_sessions = query.order_by(
            ExamSession.exam_date, ExamSession.start_time
        ).all()

        if not exam_sessions:
            target_desc = f"Semesters {target_sem_ids}" if target_sem_ids else "any semester"
            raise ValueError(f"No examination sessions found for {cie.name} ({target_desc}). Please add sessions first.")

        all_faculty = Faculty.query.all()
        exam_sem_ids = {s.semester_id for s in exam_sessions}
        exam_sems = Semester.query.filter(Semester.id.in_(exam_sem_ids)).all()
        is_odd_cycle = any(s.sem_number % 2 == 1 for s in exam_sems) if exam_sems else True
        is_even_cycle = any(s.sem_number % 2 == 0 for s in exam_sems) if exam_sems else False

        all_active_sems = Semester.query.filter_by(is_active=True).all()
        if is_odd_cycle and not is_even_cycle:
            all_semesters = [s for s in all_active_sems if s.sem_number % 2 == 1]
        elif is_even_cycle and not is_odd_cycle:
            all_semesters = [s for s in all_active_sems if s.sem_number % 2 == 0]
        else:
            all_semesters = all_active_sems

        buffer_minutes = cls.get_system_buffer_minutes()

        # Clear existing non-completed duties for this CIE ONLY for the target semesters being allocated
        # so other semesters' duty data is NEVER interrupted!
        duty_query = Duty.query.join(ExamSession).filter(
            ExamSession.cie_id == cie_id,
            Duty.status.in_(['ASSIGNED', 'PENDING'])
        )
        if target_sem_ids:
            duty_query = duty_query.filter(ExamSession.semester_id.in_(target_sem_ids))

        existing_duties = duty_query.all()
        existing_duty_ids = [d.id for d in existing_duties]
        if existing_duty_ids:
            AllocationExplanation.query.filter(AllocationExplanation.duty_id.in_(existing_duty_ids)).delete(synchronize_session=False)
        for d in existing_duties:
            db.session.delete(d)
        db.session.flush()

        # Clean any orphaned explanations
        valid_duty_ids = [d.id for d in Duty.query.all()]
        if valid_duty_ids:
            AllocationExplanation.query.filter(~AllocationExplanation.duty_id.in_(valid_duty_ids)).delete(synchronize_session=False)
        db.session.flush()

        # Execute optimization engine
        result = AllocationOptimizer.run_optimization(
            cie=cie,
            exam_sessions=exam_sessions,
            all_faculty=all_faculty,
            all_semesters=all_semesters,
            buffer_minutes=buffer_minutes
        )

        # Persist new duties and explanations
        duty_objs = []
        for i, d_data in enumerate(result['allocated_duties']):
            duty = Duty(
                exam_session_id=d_data['exam_session_id'],
                exam_room_id=d_data.get('exam_room_id'),
                faculty_id=d_data['faculty_id'],
                duty_type=d_data['duty_type'],
                status=d_data['status'],
                is_manual_override=d_data['is_manual_override'],
                override_reason=d_data['override_reason'],
                allocated_at=datetime.utcnow()
            )
            db.session.add(duty)
            duty_objs.append(duty)

        db.session.flush()

        # Persist explanations
        for exp_info in result['explanations']:
            idx = exp_info['duty_index']
            exp_data = exp_info['explanation']
            target_duty = duty_objs[idx]

            explanation = AllocationExplanation(
                duty_id=target_duty.id,
                selected_faculty_id=target_duty.faculty_id,
                explanation_summary=exp_data['explanation_summary'],
                hard_constraints_checked=json.dumps(exp_data['hard_constraints_checked']),
                soft_metrics=json.dumps(exp_data['soft_metrics']),
                rejected_candidates=json.dumps(exp_data['rejected_candidates'])
            )
            db.session.add(explanation)

        # Record AllocationRun
        run_record = AllocationRun(
            cie_id=cie.id,
            run_timestamp=datetime.utcnow(),
            status=result['status'],
            total_required=result['stats']['total_required'],
            total_allocated=result['stats']['total_allocated'],
            total_pending=result['stats']['total_pending'],
            total_conflicts=result['stats']['total_conflicts'],
            execution_time_ms=result['stats']['execution_time_ms'],
            algorithm_log="\n".join(result['logs'])
        )
        db.session.add(run_record)

        # Log Audit entry
        audit = AuditLog(
            action='ALLOCATION_GENERATED',
            user_identifier=user_identifier,
            entity_type='CIE',
            entity_id=cie.id,
            details=(
                f"Generated allocation for {cie.name}. Status: {result['status']}. "
                f"Allocated: {result['stats']['total_allocated']}/{result['stats']['total_required']}, "
                f"Pending: {result['stats']['total_pending']} in {result['stats']['execution_time_ms']}ms."
            )
        )
        db.session.add(audit)

        db.session.commit()

        return {
            'run_id': run_record.id,
            'status': result['status'],
            'stats': result['stats'],
            'logs': result['logs']
        }
