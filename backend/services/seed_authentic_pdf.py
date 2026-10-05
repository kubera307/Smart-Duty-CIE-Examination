import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import create_app
from services.seed_service import seed_database

def seed_authentic_data():
    app = create_app()
    with app.app_context():
        seed_database(force_reseed=True)

if __name__ == '__main__':
    seed_authentic_data()
