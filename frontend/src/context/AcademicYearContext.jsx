import React, { createContext, useContext, useState, useEffect } from 'react';
import { cieApi } from '../services/cieApi';

const AcademicYearContext = createContext();

export const AcademicYearProvider = ({ children }) => {
  const [academicYears, setAcademicYears] = useState(['2026-27', '2027-28']);
  const [selectedYear, setSelectedYear] = useState(() => {
    const stored = localStorage.getItem('selected_academic_year');
    if (!stored || stored === '2025-26') return '2027-28';
    return stored;
  });
  const [loadingYears, setLoadingYears] = useState(false);

  const fetchYears = async () => {
    try {
      setLoadingYears(true);
      const res = await cieApi.getAcademicYears();
      if (res.data?.academic_years && res.data.academic_years.length > 0) {
        const cleanedYears = res.data.academic_years
          .filter((y) => y !== '2025-26')
          .sort();
        setAcademicYears(cleanedYears.length > 0 ? cleanedYears : ['2026-27', '2027-28']);
        const currentYear = res.data.current_year || '2027-28';
        const stored = localStorage.getItem('selected_academic_year');
        if (stored && stored !== '2025-26' && cleanedYears.includes(stored)) {
          setSelectedYear(stored);
        } else {
          setSelectedYear(currentYear);
          localStorage.setItem('selected_academic_year', currentYear);
        }
      }
    } catch (e) {
      console.error('Failed to fetch academic years:', e);
    } finally {
      setLoadingYears(false);
    }
  };

  useEffect(() => {
    fetchYears();
  }, []);

  const changeYear = (year) => {
    setSelectedYear(year);
    localStorage.setItem('selected_academic_year', year);
    window.dispatchEvent(new CustomEvent('academic_year_changed', { detail: year }));
  };

  const createYear = async (year) => {
    try {
      await cieApi.createAcademicYear({ academic_year: year });
      await fetchYears();
      changeYear(year);
      return true;
    } catch (e) {
      console.error('Failed to create academic year:', e);
      throw e;
    }
  };

  return (
    <AcademicYearContext.Provider
      value={{
        academicYears,
        selectedYear,
        setSelectedYear: changeYear,
        createYear,
        loadingYears,
        refreshYears: fetchYears
      }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) {
    // Graceful fallback if context is not present
    return {
      academicYears: ['2026-27', '2027-28'],
      selectedYear: '2027-28',
      setSelectedYear: () => {},
      createYear: async () => {},
      loadingYears: false,
      refreshYears: async () => {}
    };
  }
  return ctx;
};
