"""
Ring Buffer para desacoplar captura SDR de procesamiento
Usa memoria compartida para mejor rendimiento
"""

import numpy as np
import threading
import logging
from collections import deque
from multiprocessing import Lock

logger = logging.getLogger(__name__)


class RingBuffer:
    """Buffer circular para captura/procesamiento sin drops"""
    
    def __init__(self, buffer_size=262144, chunk_size=4096):
        """
        Args:
            buffer_size: Tamaño total del buffer (samples)
            chunk_size: Tamaño de cada chunk capturado
        """
        self.buffer_size = buffer_size
        self.chunk_size = chunk_size
        
        # Buffer IQ en memoria compartida
        self.buffer = np.zeros(buffer_size, dtype=np.complex64)
        
        # Índices de lectura/escritura
        self.write_idx = 0
        self.read_idx = 0
        
        # Locks para thread-safety
        self.lock = threading.Lock()
        
        # Métricas
        self.total_written = 0
        self.total_read = 0
        self.drops = 0
        self.underruns = 0
        
    def write(self, data):
        """Escribir datos al buffer (desde captura SDR)"""
        with self.lock:
            data_len = len(data)
            
            # Verificar espacio disponible
            available = self._get_available_write_space()
            if data_len > available:
                self.drops += data_len - available
                logger.warning(f"DROP: {self.drops} samples perdidas")
                data = data[:available]
                data_len = available
            
            if data_len == 0:
                return 0
            
            # Escribir linealmente (con wraparound)
            end_idx = (self.write_idx + data_len) % self.buffer_size
            
            if end_idx > self.write_idx:
                # No hay wraparound
                self.buffer[self.write_idx:end_idx] = data
            else:
                # Hay wraparound
                first_part = self.buffer_size - self.write_idx
                self.buffer[self.write_idx:] = data[:first_part]
                self.buffer[:end_idx] = data[first_part:]
            
            self.write_idx = end_idx
            self.total_written += data_len
            
            return data_len
    
    def read(self, num_samples):
        """Leer datos del buffer (para procesamiento)"""
        with self.lock:
            available = self._get_available_read_space()
            
            if available < num_samples:
                self.underruns += 1
                logger.warning(f"UNDERRUN: solicitados {num_samples}, disponibles {available}")
                num_samples = available
            
            if num_samples == 0:
                return np.array([], dtype=np.complex64)
            
            # Leer linealmente
            end_idx = (self.read_idx + num_samples) % self.buffer_size
            
            if end_idx > self.read_idx:
                # No hay wraparound
                data = self.buffer[self.read_idx:end_idx].copy()
            else:
                # Hay wraparound
                first_part = self.buffer_size - self.read_idx
                data = np.concatenate([
                    self.buffer[self.read_idx:].copy(),
                    self.buffer[:end_idx].copy()
                ])
            
            self.read_idx = end_idx
            self.total_read += num_samples
            
            return data.astype(np.complex64)
    
    def _get_available_write_space(self):
        """Espacio disponible para escribir"""
        if self.write_idx >= self.read_idx:
            return self.buffer_size - (self.write_idx - self.read_idx) - 1
        else:
            return self.read_idx - self.write_idx - 1
    
    def _get_available_read_space(self):
        """Datos disponibles para leer"""
        if self.write_idx >= self.read_idx:
            return self.write_idx - self.read_idx
        else:
            return self.buffer_size - (self.read_idx - self.write_idx)
    
    def get_fill_level(self):
        """Porcentaje de llenado del buffer (0-100)"""
        with self.lock:
            available = self._get_available_read_space()
            return (available / self.buffer_size) * 100
    
    def get_stats(self):
        """Obtener estadísticas de rendimiento"""
        with self.lock:
            return {
                'total_written': self.total_written,
                'total_read': self.total_read,
                'drops': self.drops,
                'underruns': self.underruns,
                'fill_level': self.get_fill_level(),
                'buffer_size': self.buffer_size,
            }
    
    def reset(self):
        """Resetear buffer"""
        with self.lock:
            self.write_idx = 0
            self.read_idx = 0
            self.total_written = 0
            self.total_read = 0
            self.drops = 0
            self.underruns = 0
            logger.info("Ring buffer reseteado")