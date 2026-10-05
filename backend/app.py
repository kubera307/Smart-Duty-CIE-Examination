import os
from flask import Flask, jsonify, send_from_directory, redirect
from flask_cors import CORS
from config import Config
from models import db
from routes import register_routes
from services.seed_service import seed_database

def create_app(config_class=Config):
    dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))
    app = Flask(__name__, static_folder=dist_dir, static_url_path='')
    app.config.from_object(config_class)

    # Enable Cross-Origin Resource Sharing for React frontend
    allowed_origins = [origin.strip() for origin in app.config['CORS_ORIGINS'].split(',') if origin.strip()]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # Initialize Database
    db.init_app(app)

    # Register API Route Blueprints
    register_routes(app)

    # Health Check Endpoint
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({
            'status': 'healthy',
            'product': 'CIE Examination Duty Allocation & Intelligent Workload System',
            'version': '1.0.0',
            'database': 'connected'
        })

    # Serve built React UI or redirect to Vite dev server
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        if path.startswith('api/'):
            return jsonify({'error': 'Resource not found', 'status_code': 404}), 404
        if path != "" and os.path.exists(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)
        elif os.path.exists(os.path.join(dist_dir, 'index.html')):
            return send_from_directory(dist_dir, 'index.html')
        else:
            return redirect('http://localhost:5173')

    # Error Handlers
    @app.errorhandler(404)
    def not_found_error(error):
        return jsonify({'error': 'Resource not found', 'status_code': 404}), 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return jsonify({
            'error': 'An unexpected server error occurred. Please contact the administrator.',
            'status_code': 500
        }), 500

    # Auto-initialize and seed database within app context
    with app.app_context():
        db.create_all()
        seed_database()

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting CIE Examination Duty Allocation & Intelligent Workload System on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
