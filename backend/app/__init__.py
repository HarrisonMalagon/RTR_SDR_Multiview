"""Paquete de aplicación Flask"""

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
import logging

logger = logging.getLogger(__name__)

def create_app(config_name="development"):
    app = Flask(__name__)
    app.config['JSON_SORT_KEYS'] = False
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    from app.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    @app.route('/health', methods=['GET'])
    def health():
        return {'status': 'ok', 'version': '0.1.0'}, 200
    
    logger.info("Aplicación Flask creada")
    return app, socketio
