import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD_HASH = os.environ.get('ADMIN_PASSWORD_HASH')
    FACULTY_DEFAULT_PASSWORD = os.environ.get('FACULTY_DEFAULT_PASSWORD')
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5175,http://localhost:5173,http://localhost:5176,http://127.0.0.1:5175,http://127.0.0.1:5173,http://127.0.0.1:5176')
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        f"sqlite:///{os.path.join(BASE_DIR, 'cie_exam_system.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Core Exam & Allocation Configuration Defaults
    BUFFER_MINUTES = 60  # Protected 1-hour pre/post class buffer
    MAX_DUTY_CAPACITY = 15  # Maximum duties per faculty member
    DEFAULT_ACADEMIC_YEAR = '2026-2027'
    DEFAULT_DEPARTMENT = 'Computer Science & Engineering (AI & ML)'

