"""
WebSocket mejorado con heartbeat y mejor manejo de conexiones
"""

import logging
import threading
import time
from flask_socketio import emit, disconnect
from collections import defaultdict

logger = logging.getLogger(__name__)

_streaming_active = {}
_client_heartbeat = {}
_heartbeat_interval = 5  # segundos
_heartbeat_timeout = 15  # segundos

def init_socketio(socketio, scanner):
    """Inicializa WebSocket con el scanner"""
    
    @socketio.on('connect')
    def handle_connect():
        client_id = id(socketio)
        logger.info(f"Cliente conectado: {client_id}")
        _streaming_active[client_id] = False
        _client_heartbeat[client_id] = time.time()
        emit('status', {
            'message': 'Conectado',
            'timestamp': time.time(),
            'client_id': client_id
        })
    
    @socketio.on('disconnect')
    def handle_disconnect():
        client_id = id(socketio)
        logger.info(f"Cliente desconectado: {client_id}")
        _streaming_active.pop(client_id, None)
        _client_heartbeat.pop(client_id, None)
    
    @socketio.on('heartbeat')
    def handle_heartbeat():
        """Responde a heartbeat del cliente"""
        client_id = id(socketio)
        _client_heartbeat[client_id] = time.time()
        emit('heartbeat_ack', {'timestamp': time.time()})
    
    @socketio.on('start_stream')
    def handle_start_stream(data):
        """Inicia streaming continuo con validaciones"""
        client_id = id(socketio)
        
        try:
            start_freq = int(data.get('start_freq', 473e6))
            stop_freq = int(data.get('stop_freq', 481e6))
            rbw = int(data.get('rbw', 100000))
            interval = float(data.get('interval', 0.5))
            stream_id = data.get('stream_id', str(client_id))
            
            # Validaciones
            if start_freq >= stop_freq:
                emit('error', {'message': 'start_freq >= stop_freq'})
                return
            
            if (stop_freq - start_freq) < rbw:
                emit('error', {'message': 'span < rbw'})
                return
            
            if interval < 0.1:
                interval = 0.1
            if interval > 10:
                interval = 10
            
            _streaming_active[client_id] = True
            
            logger.info(
                f"Stream iniciado - Cliente: {client_id}, "
                f"Rango: {start_freq/1e6:.1f}-{stop_freq/1e6:.1f} MHz, "
                f"Intervalo: {interval}s"
            )
            emit('stream_started', {
                'message': 'Streaming en vivo',
                'stream_id': stream_id,
                'timestamp': time.time()
            })
            
            def stream_thread():
                """Thread del streaming con mejor manejo de errores"""
                try:
                    frame_count = 0
                    error_count = 0
                    max_errors = 5
                    
                    while _streaming_active.get(client_id, False):
                        try:
                            # Actualizar heartbeat
                            _client_heartbeat[client_id] = time.time()
                            
                            # Escanear
                            result = scanner.scan_frequency_range(
                                start_freq, stop_freq, rbw, num_averages=1
                            )
                            
                            import numpy as np
                            freqs = np.array(result['frequencies'])
                            power = np.array(result['power'])
                            
                            # Downsampling a 256 puntos para transmisión eficiente
                            if len(power) > 256:
                                indices = np.linspace(0, len(power)-1, 256, dtype=int)
                                power = power[indices]
                                freqs = freqs[indices]
                            
                            frame_count += 1
                            
                            emit('spectrum_frame', {
                                'frame': frame_count,
                                'stream_id': stream_id,
                                'frequencies': freqs.tolist(),
                                'power': power.tolist(),
                                'max_power': float(np.max(power)),
                                'max_freq': float(freqs[np.argmax(power)]),
                                'noise_floor': float(np.percentile(power, 20)),
                                'timestamp': time.time(),
                                'is_real': result.get('is_real', False)
                            })
                            
                            error_count = 0
                            time.sleep(interval)
                            
                        except Exception as e:
                            error_count += 1
                            logger.warning(f"Error en stream (intento {error_count}): {e}")
                            
                            if error_count >= max_errors:
                                logger.error(f"Stream fallido después de {max_errors} errores")
                                emit('stream_error', {
                                    'message': 'Demasiados errores',
                                    'error_count': error_count
                                })
                                break
                            
                            time.sleep(0.5)
                
                finally:
                    _streaming_active[client_id] = False
                    logger.info(f"Stream finalizado - Cliente: {client_id}, Frames: {frame_count}")
                    emit('stream_stopped', {
                        'message': 'Stream detenido',
                        'stream_id': stream_id,
                        'frames_sent': frame_count,
                        'timestamp': time.time()
                    })
            
            # Iniciar thread
            thread = threading.Thread(target=stream_thread, daemon=True)
            thread.start()
        
        except Exception as e:
            logger.error(f"Error al iniciar stream: {e}", exc_info=True)
            emit('error', {'message': f'Error: {str(e)}'})
    
    @socketio.on('stop_stream')
    def handle_stop_stream(data):
        """Detiene el streaming"""
        client_id = id(socketio)
        stream_id = data.get('stream_id', 'unknown')
        
        if client_id in _streaming_active:
            _streaming_active[client_id] = False
        
        logger.info(f"Stream detenido por cliente: {stream_id}")
        emit('stream_stopped', {
            'message': 'Detenido por usuario',
            'stream_id': stream_id,
            'timestamp': time.time()
        })
    
    @socketio.on('set_gain')
    def handle_set_gain(data):
        """Configura ganancia del dispositivo"""
        try:
            gain = data.get('gain', 'auto')
            
            if scanner.wrapper.is_real and scanner.wrapper.device:
                if gain == 'auto':
                    scanner.wrapper.device.gain = 'auto'
                else:
                    try:
                        gain_val = int(gain)
                        scanner.wrapper.device.gain = gain_val
                    except (ValueError, TypeError):
                        emit('error', {'message': 'Ganancia inválida'})
                        return
                
                logger.info(f"Ganancia configurada: {gain}")
                emit('gain_set', {
                    'gain': str(gain),
                    'success': True,
                    'timestamp': time.time()
                })
            else:
                logger.warning("Intento de configurar ganancia sin dispositivo real")
                emit('gain_set', {
                    'gain': str(gain),
                    'success': False,
                    'message': 'Modo simulación',
                    'timestamp': time.time()
                })
        
        except Exception as e:
            logger.error(f"Error al configurar ganancia: {e}")
            emit('error', {'message': str(e)})
    
    @socketio.on('get_presets')
    def handle_get_presets():
        """Envía presets disponibles"""
        presets = [
            {
                'name': 'FM Radio',
                'start_freq': 88e6,
                'stop_freq': 108e6,
                'rbw': 50e3,
                'description': 'Banda FM comercial'
            },
            {
                'name': 'Aviación (ADS-B)',
                'start_freq': 1090e6,
                'stop_freq': 1090.5e6,
                'rbw': 25e3,
                'description': 'Señales de aviación'
            },
            {
                'name': 'GSM-900 DL',
                'start_freq': 935e6,
                'stop_freq': 960e6,
                'rbw': 100e3,
                'description': 'GSM Downlink 900 MHz'
            },
            {
                'name': 'WiFi 2.4 GHz',
                'start_freq': 2400e6,
                'stop_freq': 2500e6,
                'rbw': 1e6,
                'description': 'Banda WiFi'
            },
        ]
        emit('presets_list', {'presets': presets})
    
    # Thread de monitoreo de heartbeat
    def heartbeat_monitor():
        """Monitorea la salud de las conexiones"""
        while True:
            try:
                current_time = time.time()
                dead_clients = []
                
                for client_id, last_heartbeat in list(_client_heartbeat.items()):
                    if current_time - last_heartbeat > _heartbeat_timeout:
                        dead_clients.append(client_id)
                        logger.warning(f"Cliente inactivo (timeout): {client_id}")
                
                for client_id in dead_clients:
                    _streaming_active.pop(client_id, None)
                    _client_heartbeat.pop(client_id, None)
                
                time.sleep(_heartbeat_interval)
            
            except Exception as e:
                logger.error(f"Error en heartbeat monitor: {e}")
                time.sleep(_heartbeat_interval)
    
    # Iniciar monitor en background
    monitor_thread = threading.Thread(target=heartbeat_monitor, daemon=True)
    monitor_thread.start()
    logger.info("Heartbeat monitor iniciado")