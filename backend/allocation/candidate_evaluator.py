class CandidateEvaluator:
    """
    Computes soft objective optimization scores to rank eligible candidates.
    
    Principles:
    1. Workload Equity: Faculty with fewer cumulative duties across all CIEs are strongly preferred.
    2. CIE Balance: Even distribution across CIE-1, CIE-2, and CIE-3.
    3. Capacity Preservation: Preserves capacity margin.
    4. Experience Preference (Soft): Senior faculty receive relatively fewer routine duties
       when options are otherwise equal. NEVER overrides hard constraints.
    """

    WEIGHT_CUMULATIVE = 100.0   # Highest priority: lowest cumulative duties
    WEIGHT_CIE_DUTIES = 50.0    # Second priority: lowest duties in this CIE
    WEIGHT_EXPERIENCE = 5.0     # Soft preference: higher experience gets slightly higher penalty
    WEIGHT_CAPACITY   = 2.0     # Favor more remaining capacity margin

    @classmethod
    def score_candidate(cls, faculty, cie_name, cumulative_duties, current_cie_duties):
        """
        Calculates penalty score W. Lower score = better candidate.
        
        Args:
            faculty: Faculty object
            cie_name: str e.g. 'CIE-1'
            cumulative_duties: int (all valid duties assigned so far)
            current_cie_duties: int (duties assigned in this CIE)
            
        Returns:
            dict: {
                'penalty_score': float,
                'cumulative_duties': int,
                'current_cie_duties': int,
                'experience_years': float,
                'remaining_capacity': int,
                'breakdown': dict
            }
        """
        remaining_cap = max(0, faculty.max_duty_capacity - cumulative_duties)
        
        # Experience penalty: normalized (e.g. 0 to 25 years -> 0.0 to 1.0)
        exp_val = faculty.experience_years if faculty.experience_years is not None else 0.0
        norm_exp = min(exp_val / 25.0, 1.0)

        # Penalty calculation
        p_cum = cumulative_duties * cls.WEIGHT_CUMULATIVE
        p_cie = current_cie_duties * cls.WEIGHT_CIE_DUTIES
        p_exp = norm_exp * cls.WEIGHT_EXPERIENCE
        p_cap = (1.0 / (remaining_cap + 1)) * cls.WEIGHT_CAPACITY

        penalty = p_cum + p_cie + p_exp + p_cap

        return {
            'penalty_score': round(penalty, 3),
            'cumulative_duties': cumulative_duties,
            'current_cie_duties': current_cie_duties,
            'experience_years': faculty.experience_years,
            'remaining_capacity': remaining_cap,
            'breakdown': {
                'workload_penalty': round(p_cum, 2),
                'cie_penalty': round(p_cie, 2),
                'experience_penalty': round(p_exp, 2),
                'capacity_margin_penalty': round(p_cap, 2)
            }
        }
