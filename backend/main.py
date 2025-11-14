#!/usr/bin/env python3
"""
Punto de entrada de la aplicación RTL-SDR Multiview Analyzer
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Agregar backend al path
sys.path.insert(0, str(Path(__file__).parent))

from app import create_app
from app.services.sdr_scanner import SDRScanner
from app.api import set_scanner
from utils.logger import setup_logging

# Configurar logging
logger = setup_logging()

def main():
    """Función principal"""
    socketio = None
    app = None
    scanner = None
    
    try:
        logger.info("=" * 70)
        logger.info("Iniciando RTL-SDR Multiview Analyzer")
        logger.info("=" * 70)
        
        # Crear y inicializar scanner
        logger.info("Inicializando SDR Scanner...")
        scanner = SDRScanner()
        device_info = scanner.get_device_info()
        logger.info(f"   Device: {device_info.get('device', 'Unknown')}")
        logger.info(f"   Tuner: {device_info.get('tuner', 'Unknown')}")
        logger.info(f"   Real: {device_info.get('is_real', False)}")
        
        # Crear aplicación Flask
        logger.info("Creando aplicacion Flask...")
        app, socketio = create_app()
        
        # Pasar scanner a la API
        set_scanner(scanner)
        
        # Inicializar WebSocket
        from app.websocket_handler import init_socketio
        init_socketio(socketio, scanner)
        
        # Configuración del servidor
        host = os.getenv("FLASK_HOST", "127.0.0.1")
        port = int(os.getenv("FLASK_PORT", 5000))
        debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
        
        logger.info("=" * 70)
        logger.info(f"Servidor escuchando en http://{host}:{port}")
        logger.info(f"Modo debug: {debug}")
        logger.info(f"Frontend: http://localhost:5173")
        logger.info("=" * 70)
        logger.info("Presiona CTRL+C para detener\n")
        
        # Ejecutar servidor
        socketio.run(app, host=host, port=port, debug=debug, use_reloader=False)
        
    except KeyboardInterrupt:
        logger.info("\n" + "=" * 70)
        logger.info("Aplicacion detenida por usuario")
        logger.info("=" * 70)
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error fatal: {e}", exc_info=True)
        sys.exit(1)
    finally:
        if scanner:
            scanner.close()

if __name__ == "__main__":
    main()