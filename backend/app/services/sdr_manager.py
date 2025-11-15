"""
SDRManager - Servicio de captura desacoplado
Lee continuamente del RTL-SDR al ring buffer
"""

import numpy as np
import threading
import logging
import time
from app.services.ring_buffer import RingBuffer

logger = logging.getLogger(__name__)


class SDRManager:
    """Gestiona captura continua de RTL-SDR"""
    
    def __init__(self, wrapper, ring_buffer_size=524288):
        """
        Args:
            wrapper: RTLSDRWrapper instance
            ring_buffer_size: Tamaño del buffer circular
        """
        self.wrapper = wrapper
        self.ring_buffer = RingBuffer(buffer_size=ring_buffer_size, chunk_size=65536)
        
        self.is_capturing = False
        self.capture_thread = None
        self.current_center_freq = None
        
        # Estadísticas
        self.metrics = {
            'total_samples': 0,
            'capture_rate': 0.0,
            'last_update': time.time(),
        }
    
    def start_capture(self, center_freq=98e6):
        """Inicia captura continua en thread separado"""
        if self.is_capturing:
            logger.warning("Captura ya activa")
            return
        
        self.current_center_freq = center_freq
        self.is_capturing = True
        
        self.capture_thread = threading.Thread(
            target=self._capture_loop,
            args=(center_freq,),
            daemon=True,
            name="SDR-Capture"
        )
        self.capture_thread.start()
        logger.info(f"Captura iniciada @ {center_freq/1e6:.1f} MHz")
    
    def stop_capture(self):
        """Detiene captura"""
        self.is_capturing = False
        if self.capture_thread:
            self.capture_thread.join(timeout=2)
        logger.info("Captura detenida")
    
    def _capture_loop(self, center_freq):
        """Loop de captura continua"""
        try:
            if not self.wrapper.is_real:
                self._capture_loop_simulated(center_freq)
            else:
                self._capture_loop_real(center_freq)
        except Exception as e:
            logger.error(f"Error en captura: {e}", exc_info=True)
            self.is_capturing = False
    
    def _capture_loop_real(self, center_freq):
        """Captura real desde RTL-SDR"""
        try:
            dev = self.wrapper.device
            dev.center_freq = int(center_freq)
            dev.sample_rate = int(2.4e6)
            dev.gain = 'auto'
            time.sleep(0.1)
            
            chunk_size = 65536
            last_log = time.time()
            
            while self.is_capturing:
                try:
                    # Leer chunk del dispositivo
                    samples = dev.read_samples(chunk_size)
                    iq_data = np.array(samples, dtype=np.complex64)
                    
                    # Escribir al ring buffer
                    written = self.ring_buffer.write(iq_data)
                    self.metrics['total_samples'] += written
                    
                    # Log cada segundo
                    now = time.time()
                    if now - last_log > 1.0:
                        stats = self.ring_buffer.get_stats()
                        logger.debug(
                            f"Capture: {written} samples, "
                            f"fill={stats['fill_level']:.1f}%, "
                            f"drops={stats['drops']}"
                        )
                        last_log = now
                
                except Exception as e:
                    logger.error(f"Error leyendo samples: {e}")
                    time.sleep(0.1)
        
        except Exception as e:
            logger.error(f"Error en captura real: {e}", exc_info=True)
    
    def _capture_loop_simulated(self, center_freq):
        """Captura simulada (para testing)"""
        chunk_size = 65536
        last_log = time.time()
        
        while self.is_capturing:
            try:
                # Generar samples simuladas (ruido blanco + tone)
                samples = np.random.normal(0, 0.1, chunk_size) + \
                         0.3 * np.exp(2j * np.pi * 0.1 * np.arange(chunk_size))
                
                iq_data = samples.astype(np.complex64)
                written = self.ring_buffer.write(iq_data)
                self.metrics['total_samples'] += written
                
                # Log
                now = time.time()
                if now - last_log > 1.0:
                    stats = self.ring_buffer.get_stats()
                    logger.debug(
                        f"Simulate: {written} samples, "
                        f"fill={stats['fill_level']:.1f}%"
                    )
                    last_log = now
                
                # Simular timing de USB
                time.sleep(0.01)
            
            except Exception as e:
                logger.error(f"Error en simulación: {e}")
                time.sleep(0.1)
    
    def read_iq_samples(self, num_samples):
        """Leer muestras IQ del buffer"""
        return self.ring_buffer.read(num_samples)
    
    def get_metrics(self):
        """Obtener métricas de captura"""
        stats = self.ring_buffer.get_stats()
        return {
            'is_capturing': self.is_capturing,
            'center_freq': self.current_center_freq,
            'total_samples': self.metrics['total_samples'],
            'buffer_stats': stats,
        }
    
    def get_ring_buffer(self):
        """Acceso directo al ring buffer"""
        return self.ring_buffer