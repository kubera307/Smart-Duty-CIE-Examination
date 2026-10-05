from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

from .faculty import Faculty, FacultyAvailability
from .academic import Semester, Subject, TimetableEntry
from .exam import CIE, ExamSession, ExamRoom, Duty, DutySwapRequest
from .allocation_log import AllocationRun, AllocationExplanation
from .system import SystemSettings, AuditLog

__all__ = [
    'db',
    'Faculty',
    'FacultyAvailability',
    'Semester',
    'Subject',
    'TimetableEntry',
    'CIE',
    'ExamSession',
    'ExamRoom',
    'Duty',
    'DutySwapRequest',
    'AllocationRun',
    'AllocationExplanation',
    'SystemSettings',
    'AuditLog'
]

