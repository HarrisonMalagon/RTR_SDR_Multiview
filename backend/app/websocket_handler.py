"""
WebSocket para actualizaciones en tiempo real del espectro
"""

import logging
import threading
import time
from flask_socketio import emit

logger = logging.getLogger(__name__)

_streaming_active = False

def init_socketio(socketio, scanner):
    """Inicializa WebSocket con el scanner"""
    
    @socketio.on('connect')
    def handle_connect():
        logger.info("Cliente conectado")
        emit('status', {'message': 'Conectado', 'timestamp': time.time()})
    
    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info("Cliente desconectado")
        global _streaming_active
        _streaming_active = False
    
    @socketio.on('start_stream')
    def handle_start_stream(data):
        """Inicia streaming continuo"""
        global _streaming_active
        
        try:
            start_freq = int(data.get('start_freq', 473e6))
            stop_freq = int(data.get('stop_freq', 481e6))
            rbw = int(data.get('rbw', 100000))
            interval = float(data.get('interval', 0.5))
            
            _streaming_active = True
            
            logger.info(f"Stream: {start_freq/1e6:.1f}-{stop_freq/1e6:.1f} MHz")
            emit('stream_started', {'message': 'En vivo'})
            
            def stream_thread():
                try:
                    frame_count = 0
                    while _streaming_active:
                        try:
                            result = scanner.scan_frequency_range(
                                start_freq, stop_freq, rbw, num_averages=1
                            )
                            
                            import numpy as np
                            freqs = np.array(result['frequencies'])
                            power = np.array(result['power'])
                            
                            if len(power) > 256:
                                indices = np.linspace(0, len(power)-1, 256, dtype=int)
                                power = power[indices]
                                freqs = freqs[indices]
                            
                            frame_count += 1
                            
                            emit('spectrum_frame', {
                                'frame': frame_count,
                                'frequencies': freqs.tolist(),
                                'power': power.tolist(),
                                'max_power': float(np.max(power)),
                                'max_freq': float(freqs[np.argmax(power)]),
                                'timestamp': time.time(),
                                'is_real': result.get('is_real', False)
                            })
                            
                            time.sleep(interval)
                            
                        except Exception as e:
                            logger.error(f"Error: {e}")
                            time.sleep(0.1)
                
                finally:
                    emit('stream_stopped', {'message': 'Detenido'})
            
            thread = threading.Thread(target=stream_thread, daemon=True)
            thread.start()
        
        except Exception as e:
            logger.error(f"Error stream: {e}")
            emit('error', {'message': str(e)})
    
    @socketio.on('stop_stream')
    def handle_stop_stream():
        global _streaming_active
        _streaming_active = False
        logger.info("Stream detenido")
        emit('stream_stopped', {'message': 'Detenido'})
    
    @socketio.on('set_gain')
    def handle_set_gain(data):
        try:
            gain = data.get('gain', 'auto')
            
            if scanner.wrapper.is_real and scanner.wrapper.device:
                if gain == 'auto':
                    scanner.wrapper.device.gain = 'auto'
                else:
                    scanner.wrapper.device.gain = int(gain)
                
                logger.info(f"Ganancia: {gain}")
                emit('gain_set', {'gain': gain, 'success': True})
            else:
                emit('gain_set', {'gain': gain, 'success': False})
        
        except Exception as e:
            logger.error(f"Error ganancia: {e}")