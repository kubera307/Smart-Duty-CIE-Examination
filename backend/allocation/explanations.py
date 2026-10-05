import json

class ExplanationEngine:
    """
    Generates transparent, audit-ready explanations for every duty assignment.
    
    Produces:
    1. Positive selection justification for the chosen faculty.
    2. Comprehensive rejection provenance for all non-selected candidates,
       documenting exact violated constraints or workload ranking differences.
    """

    @classmethod
    def generate_explanation(cls, selected_candidate, disqualified_candidates, eligible_candidates, exam_session, regular_sem_names):
        """
        Args:
            selected_candidate: dict or None (if unallocated)
            disqualified_candidates: list of dicts {faculty, reasons, conflict_details}
            eligible_candidates: list of scored eligible candidates
            exam_session: ExamSession object
            regular_sem_names: list of str
            
        Returns:
            dict: {
                'explanation_summary': str,
                'hard_constraints_checked': list of str,
                'soft_metrics': dict,
                'rejected_candidates': list of dict
            }
        """
        if not selected_candidate:
            summary = (
                f"UNALLOCATED: No faculty could be allocated to {exam_session.room_number} for "
                f"{exam_session.subject.code} on {exam_session.exam_date.isoformat()} ({exam_session.start_time}-{exam_session.end_time}). "
                f"All {len(disqualified_candidates)} candidate faculty members violated hard constraints "
                f"(timetable conflict with 1h buffer, leave, exclusion, or simultaneous duty)."
            )
            return {
                'explanation_summary': summary,
                'hard_constraints_checked': [
                    "Active faculty status",
                    "Exclusion flag (eligible_for_duty)",
                    "Faculty availability & leave records",
                    "Simultaneous slot commitments",
                    f"Timetable clearance in regular semesters ({', '.join(regular_sem_names)}) with 1h buffer",
                    "Workload capacity limits"
                ],
                'soft_metrics': {},
                'rejected_candidates': [
                    {
                        'faculty_id': c['faculty'].id,
                        'faculty_name': c['faculty'].name,
                        'employee_id': c['faculty'].employee_id,
                        'designation': c['faculty'].designation,
                        'reasons': c['reasons'],
                        'conflict_details': c.get('conflict_details', []),
                        'category': 'HARD_DISQUALIFICATION'
                    }
                    for c in disqualified_candidates
                ]
            }

        fac = selected_candidate['faculty']
        score_info = selected_candidate['score_info']

        exp_str = f"Experience: {fac.experience_years}y" if fac.experience_years is not None else "Experience: Not provided"
        desig_str = f" ({fac.designation})" if fac.designation and fac.designation != 'Not provided' else ""

        summary = (
            f"{fac.name}{desig_str} was selected for {exam_session.subject.code} in {exam_session.room_number}. "
            f"Candidate satisfies all hard constraints (active, available, no conflicting regular lectures in "
            f"{', '.join(regular_sem_names)} with 1h buffer) and holds the optimal workload fairness score "
            f"(Cumulative duties: {score_info['cumulative_duties']}, Current CIE duties: {score_info['current_cie_duties']}, "
            f"{exp_str})."
        )

        hard_checks = [
            "Active faculty status verified",
            "Eligible for exam duty allocation (eligible_for_duty = True)",
            "Available on exam date (no conflicting leave or official engagements)",
            "No simultaneous exam duty in this session",
            f"Protected 1-hour timetable buffer satisfied across regular semesters ({', '.join(regular_sem_names)})",
            f"Workload capacity within limits ({score_info['cumulative_duties']}/{fac.max_duty_capacity})"
        ]

        rejected_list = []

        # 1. Hard disqualified candidates
        for c in disqualified_candidates:
            rejected_list.append({
                'faculty_id': c['faculty'].id,
                'faculty_name': c['faculty'].name,
                'employee_id': c['faculty'].employee_id,
                'designation': c['faculty'].designation,
                'reasons': c['reasons'],
                'conflict_details': c.get('conflict_details', []),
                'category': 'HARD_DISQUALIFICATION'
            })

        # 2. Eligible candidates who were not selected due to higher workload/penalty
        for ec in eligible_candidates:
            if ec['faculty'].id != fac.id:
                esc = ec['score_info']
                rejected_list.append({
                    'faculty_id': ec['faculty'].id,
                    'faculty_name': ec['faculty'].name,
                    'employee_id': ec['faculty'].employee_id,
                    'designation': ec['faculty'].designation,
                    'reasons': [
                        f"Eligible and cleared all timetable buffers, but has higher cumulative workload "
                        f"({esc['cumulative_duties']} duties vs selected {score_info['cumulative_duties']} duties; "
                        f"Penalty score: {esc['penalty_score']} vs selected {score_info['penalty_score']})."
                    ],
                    'conflict_details': [],
                    'category': 'WORKLOAD_OPTIMIZATION_SUBORDINATE'
                })

        return {
            'explanation_summary': summary,
            'hard_constraints_checked': hard_checks,
            'soft_metrics': score_info,
            'rejected_candidates': rejected_list
        }
