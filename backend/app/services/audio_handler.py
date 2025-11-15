"""
Handler de Audio - Demodula FM en tiempo real
"""

import numpy as np
from scipy import signal
import logging

logger = logging.getLogger(__name__)


class AudioHandler:
    """Maneja demodulacion y reproduccion de audio"""
    
    def __init__(self, sample_rate=2.4e6, audio_rate=44100):
        self.sample_rate = sample_rate
        self.audio_rate = audio_rate
        self.decimation = int(sample_rate / audio_rate)
        
    def demodulate_fm(self, iq_samples, bandwidth_khz=200):
        """Demodula FM simple pero efectivo"""
        try:
            if iq_samples is None or len(iq_samples) < 100:
                logger.warning("No hay muestras IQ validas")
                return np.zeros(1000, dtype=np.float32)
            
            # Discriminador FM: fase del producto IQ
            iq_diff = iq_samples[1:] * np.conj(iq_samples[:-1])
            phase = np.angle(iq_diff)
            
            # Unwrap fase
            phase = np.unwrap(phase)
            
            # Normalizar audio
            audio = phase / np.pi
            
            # Filtro paso-bajo
            try:
                cutoff = min(0.99, (bandwidth_khz * 1000) / (self.sample_rate / 2))
                b, a = signal.butter(4, cutoff, btype='low')
                audio = signal.lfilter(b, a, audio)
            except Exception as e:
                logger.warning(f"Error en filtro: {e}")
            
            # Diezmar
            audio = audio[::self.decimation]
            
            # Normalizar rango [-1, 1]
            max_val = np.max(np.abs(audio)) + 1e-10
            audio = np.clip(audio / max_val, -1, 1)
            
            logger.info(f"Audio demodulado: {len(audio)} samples, rms={np.sqrt(np.mean(audio**2)):.3f}")
            
            return audio.astype(np.float32)
            
        except Exception as e:
            logger.error(f"Error demodulando FM: {e}")
            return np.zeros(8192 // self.decimation, dtype=np.float32)
    
    def demodulate_am(self, iq_samples):
        """Demodula AM (envolvente)"""
        try:
            if iq_samples is None or len(iq_samples) < 100:
                return np.zeros(1000, dtype=np.float32)
            
            # Envolvente = magnitud
            magnitude = np.abs(iq_samples)
            
            # Normalizar
            magnitude = magnitude / (np.max(magnitude) + 1e-10)
            
            # Filtro paso-bajo
            try:
                cutoff = min(0.99, 10000 / (self.sample_rate / 2))
                b, a = signal.butter(4, cutoff, btype='low')
                audio = signal.lfilter(b, a, magnitude)
            except:
                audio = magnitude
            
            # Diezmar
            audio = audio[::self.decimation]
            
            # Normalizar
            audio = np.clip(audio / (np.max(np.abs(audio)) + 1e-10), -1, 1)
            
            return audio.astype(np.float32)
            
        except Exception as e:
            logger.error(f"Error demodulando AM: {e}")
            return np.zeros(8192 // self.decimation, dtype=np.float32)
    
    def demodulate(self, iq_samples, mode='fm', bandwidth_khz=200):
        """Demodula segun modo"""
        if mode == 'fm':
            return self.demodulate_fm(iq_samples, bandwidth_khz)
        elif mode == 'am':
            return self.demodulate_am(iq_samples)
        else:
            logger.warning(f"Modo desconocido: {mode}, usando FM")
            return self.demodulate_fm(iq_samples, bandwidth_khz)