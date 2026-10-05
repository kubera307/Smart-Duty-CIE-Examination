from flask import Blueprint, request, jsonify, current_app
from models import Faculty, db
from werkzeug.security import check_password_hash

auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    role = data.get('role')
    username = (data.get('username') or data.get('login_id') or '').strip()
    password = (data.get('password') or '').strip()
    faculty_id = data.get('faculty_id')

    if not username and not faculty_id:
        return jsonify({'success': False, 'error': 'Please enter your Username / Login ID'}), 400

    # Administrator access
    if role == 'admin':
        admin_username = current_app.config.get('ADMIN_USERNAME', 'admin')
        admin_password_hash = current_app.config.get('ADMIN_PASSWORD_HASH')

        is_valid_admin = False
        if username == admin_username:
            if admin_password_hash:
                is_valid_admin = check_password_hash(admin_password_hash, password)
            else:
                is_valid_admin = (password in ['admin123', 'admin', 'password123'])

        if is_valid_admin:
            return jsonify({
                'success': True,
                'role': 'admin',
                'user': {
                    'username': 'admin',
                    'name': 'CIE Exam Coordinator',
                    'role': 'Exam Coordinator',
                    'department': 'Department of CSE (AI & ML)',
                    'institution': 'Malnad College of Engineering, Hassan'
                }
            })
        return jsonify({'success': False, 'error': 'Invalid administrator credentials'}), 401

    # Staff / Faculty verification
    faculty = None
    if faculty_id:
        faculty = Faculty.query.get(faculty_id)
    elif username:
        faculty = Faculty.query.filter(
            (Faculty.login_id.ilike(username)) |
            (Faculty.employee_id.ilike(username)) |
            (Faculty.email.ilike(username)) |
            (Faculty.name.ilike(f"%{username}%"))
        ).first()

    if not faculty:
        return jsonify({'success': False, 'error': 'Account not found. Please verify your Login ID.'}), 404

    if not faculty.check_password(password):
        return jsonify({'success': False, 'error': 'Incorrect password. Please try again.'}), 401

    return jsonify({
        'success': True,
        'role': 'staff',
        'faculty': faculty.to_dict(),
        'user': {
            'id': faculty.id,
            'login_id': faculty.login_id,
            'name': faculty.name,
            'designation': faculty.designation,
            'department': faculty.department,
            'role': 'Faculty Member'
        }
    })

@auth_bp.route('/staff-directory', methods=['GET'])
def get_staff_directory():
    faculty = Faculty.query.filter_by(is_active=True).order_by(Faculty.name).all()
    return jsonify({
        'success': True,
        'faculty': [f.to_dict() for f in faculty]
    })

