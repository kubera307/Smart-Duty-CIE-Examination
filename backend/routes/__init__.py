from .faculty_routes import faculty_bp
from .academic_routes import academic_bp
from .cie_routes import cie_bp
from .allocation_routes import allocation_bp
from .conflict_routes import conflict_bp
from .analytics_routes import analytics_bp
from .report_routes import report_bp
from .audit_routes import audit_bp
from .auth_routes import auth_bp

def register_routes(app):
    app.register_blueprint(faculty_bp, url_prefix='/api/faculty')
    app.register_blueprint(academic_bp, url_prefix='/api/academic')
    app.register_blueprint(cie_bp, url_prefix='/api/cie')
    app.register_blueprint(allocation_bp, url_prefix='/api/allocation')
    app.register_blueprint(conflict_bp, url_prefix='/api/conflicts')
    app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
    app.register_blueprint(report_bp, url_prefix='/api/reports')
    app.register_blueprint(audit_bp, url_prefix='/api/audit')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

