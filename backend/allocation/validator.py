from .eligibility import EligibilityEngine
from .semester_engine import SemesterStatusEngine

class AllocationValidator:
    """
    Independent validation engine for verifying allocations and auditing manual overrides.
    """

    @classmethod
    def validate_manual_assignment(cls, faculty, exam_session, all_active_semesters, buffer_minutes=60, duty_type='Invigilation'):
        """
        Validates a proposed manual assignment or reassignment.
        
        Returns:
            dict: {
                'can_assign': bool,
                'has_warnings': bool,
                'warnings': list of str,
                'errors': list of str,
                'conflict_details': list of dict
            }
        """
        # Determine regular semesters for this session
        sem_status = SemesterStatusEngine.classify_semesters_for_slot(
            slot_sessions=[exam_session],
            all_active_semesters=all_active_semesters
        )

        eval_result = EligibilityEngine.evaluate_candidate(
            faculty=faculty,
            exam_session=exam_session,
            regular_semester_ids=sem_status['regular_class_semester_ids'],
            buffer_minutes=buffer_minutes,
            duty_type=duty_type
        )

        errors = []
        warnings = []

        if not eval_result['is_eligible']:
            for r in eval_result['disqualification_reasons']:
                if 'Timetable Conflict' in r or 'Simultaneous' in r or 'excluded' in r.lower():
                    errors.append(r)
                else:
                    warnings.append(r)

        return {
            'can_assign': eval_result['is_eligible'],
            'has_warnings': len(warnings) > 0,
            'warnings': warnings,
            'errors': errors,
            'conflict_details': eval_result['conflict_details']
        }

