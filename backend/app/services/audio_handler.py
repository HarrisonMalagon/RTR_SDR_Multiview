import numpy as np
import logging

logger = logging.getLogger(__name__)

class AudioHandler:
    def __init__(self):
        logger.info("AudioHandler inicializado")

    def demodulate(self, iq_samples, mode='fm', bandwidth_khz=200):
        """
        Demodula muestras IQ a audio.
        """
        try:
            if mode == 'fm':
                return self.demodulate_fm(iq_samples, bandwidth_khz)
            elif mode == 'am':
                return self.demodulate_am(iq_samples)
            else:
                logger.warning(f"Modo de demodulación no soportado: {mode}")
                return None
        except Exception as e:
            logger.error(f"Error en demodulación: {e}")
            return None

    def demodulate_fm(self, iq_samples, bandwidth_khz=200):
        """
        Demodulación FM.
        """
        # Calcula la diferencia de fase
        phase = np.angle(iq_samples)
        demodulated = np.diff(phase)
        # Ajuste de ganancia
        demodulated = demodulated * (bandwidth_khz * 1000) / (2 * np.pi)
        # Filtrado paso bajo (simulado)
        # En una implementación real, se aplicaría un filtro paso bajo
        return demodulated

    def demodulate_am(self, iq_samples):
        """
        Demodulación AM.
        """
        # Envolvente de la señal
        demodulated = np.abs(iq_samples)
        # Restar el offset DC (aproximadamente la media)
        demodulated = demodulated - np.mean(demodulated)
        return demodulated