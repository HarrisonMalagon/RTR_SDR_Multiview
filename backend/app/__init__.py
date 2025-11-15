"""
Factory de la aplicación Flask con Socket.IO
"""

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
import logging

logger = logging.getLogger(__name__)


def create_app():
    """Crea y configura la aplicación Flask"""
    
    app = Flask(__name__)
    
    # Configurar CORS para permitir conexiones desde el frontend
    CORS(app, resources={
        r"/api/*": {
            "origins": ["http://localhost:5173", "http://localhost:3000", "*"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type"],
        }
    })
    
    # Configurar Socket.IO con CORS
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode='threading',
        ping_timeout=60,
        ping_interval=25,
    )
    
    # Registrar blueprints
    from app.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    logger.info("Aplicación Flask creada")
    
    return app, socketio