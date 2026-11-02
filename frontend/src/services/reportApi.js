import api from './api';

export const reportApi = {
  getCieReportData: (cieId, semesterId, semesterIds) =>
    api.get(`/reports/cie-data/${cieId}`, {
      params: semesterId
        ? { semester_id: semesterId }
        : semesterIds !== undefined
          ? { semester_ids: semesterIds.join(',') }
          : {}
    }),
  downloadExcelUrl: (cieId, semesterId, semesterIds) =>
    `/api/reports/cie-excel/${cieId}?t=${Date.now()}${semesterId ? `&semester_id=${semesterId}` : semesterIds !== undefined ? `&semesters=${semesterIds.join(',')}` : ''}`,
  downloadPdfUrl: (cieId, semesterId, semesterIds) =>
    `/api/reports/cie-pdf/${cieId}?t=${Date.now()}${semesterId ? `&semester_id=${semesterId}` : semesterIds !== undefined ? `&semesters=${semesterIds.join(',')}` : ''}`,
  downloadDutySlipsPdfUrl: (cieId, semesterId, semesterIds) =>
    `/api/reports/duty-slips/${cieId}?t=${Date.now()}${semesterId ? `&semester_id=${semesterId}` : semesterIds !== undefined ? `&semesters=${semesterIds.join(',')}` : ''}`,
  downloadFacultyCalendarIcsUrl: (facultyId) => `/api/reports/calendar-ics/${facultyId}`,
  downloadDutyIcsUrl: (dutyId) => `/api/reports/duty-ics/${dutyId}`,
};
