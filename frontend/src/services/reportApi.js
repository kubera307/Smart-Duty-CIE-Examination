import api from './api';

export const reportApi = {
  getCieReportData: (cieId, semesterId) =>
    api.get(`/reports/cie-data/${cieId}`, {
      params: semesterId ? { semester_id: semesterId } : {}
    }),
  downloadExcelUrl: (cieId, semesterId) =>
    `/api/reports/cie-excel/${cieId}?t=${Date.now()}${semesterId ? `&semester_id=${semesterId}` : ''}`,
  downloadPdfUrl: (cieId, semesterId) =>
    `/api/reports/cie-pdf/${cieId}?t=${Date.now()}${semesterId ? `&semester_id=${semesterId}` : ''}`,
  downloadDutySlipsPdfUrl: (cieId, semesterId) =>
    `/api/reports/duty-slips/${cieId}?t=${Date.now()}${semesterId ? `&semester_id=${semesterId}` : ''}`,
  downloadFacultyCalendarIcsUrl: (facultyId) => `/api/reports/calendar-ics/${facultyId}`,
  downloadDutyIcsUrl: (dutyId) => `/api/reports/duty-ics/${dutyId}`,
};
