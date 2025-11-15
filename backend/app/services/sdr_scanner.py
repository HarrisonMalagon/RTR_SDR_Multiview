"""
SDRScanner - Escanea frecuencias y captura muestras IQ
"""

from app.services.sdr_wrapper import RTLSDRWrapper
import logging
import time
import numpy as np
from threading import Lock

logger = logging.getLogger(__name__)


class SDRScanner:
    """Escanea frecuencias y captura muestras IQ"""
    
    def __init__(self):
        self.wrapper = RTLSDRWrapper()
        self.is_scanning = False
        self.lock = Lock()
        self.last_result_cache = {}
        self.cache_timeout = 2

    def scan_frequency_range(self, start_freq, stop_freq, rbw=100000, num_averages=2, callback=None):
        """
        Escanea un rango de frecuencias
        
        Args:
            start_freq: Frecuencia inicial (Hz)
            stop_freq: Frecuencia final (Hz)
            rbw: Resolution Bandwidth (Hz)
            num_averages: Numero de promedios
            callback: Funcion de progreso (opcional)
            
        Returns:
            Dict con resultados del escaneo
        """
        with self.lock:
            if self.is_scanning:
                raise RuntimeError("Ya hay un escaneo en progreso")
            self.is_scanning = True

        try:
            # Usar cache si es muy reciente
            cache_key = f"{start_freq}_{stop_freq}_{rbw}"
            if cache_key in self.last_result_cache:
                cached_time, cached_result = self.last_result_cache[cache_key]
                if time.time() - cached_time < self.cache_timeout:
                    logger.info("Usando resultado en cache")
                    return cached_result

            # Parametros optimizados
            span = stop_freq - start_freq
            num_points = max(512, min(1024, int(span / rbw)))
            num_averages = max(1, min(3, num_averages))

            if callback:
                callback({"progress": 10, "message": "Iniciando escaneo..."})

            # Realizar escaneo
            result = self.wrapper.scan_frequency_range(
                start_freq, stop_freq, rbw, num_averages
            )

            if callback:
                callback({"progress": 90, "message": "Procesando datos..."})

            # Procesar deteccion de portadoras
            power = np.array(result["power"])
            frequencies = np.array(result["frequencies"])

            noise_floor = result["noise_floor"]
            threshold = noise_floor + 10

            # Encontrar picos
            peaks = np.where(power > threshold)[0]
            carriers_found = []

            if len(peaks) > 0:
                # Agrupar picos cercanos
                groups = np.split(peaks, np.where(np.diff(peaks) > 5)[0] + 1)
                for group in groups[:5]:  # Maximo 5 portadoras
                    if len(group) > 0:
                        center_idx = group[len(group) // 2]
                        carriers_found.append({
                            "frequency": float(frequencies[center_idx]),
                            "power": float(power[center_idx]),
                            "bandwidth": float(rbw),
                        })

            result["carriers_found"] = carriers_found

            # Guardar en cache
            self.last_result_cache[cache_key] = (time.time(), result)

            if callback:
                callback({"progress": 100, "message": "Completado"})

            logger.info(
                f"Escaneo: {start_freq/1e6:.1f}-{stop_freq/1e6:.1f} MHz | "
                f"Portadoras: {len(carriers_found)} | Real: {result.get('is_real', False)}"
            )

            return result

        except Exception as e:
            logger.error(f"Error en escaneo: {e}", exc_info=True)
            raise
        finally:
            self.is_scanning = False

    def get_device_info(self):
        """Retorna informacion del dispositivo"""
        return self.wrapper.get_device_info()

    def close(self):
        """Cierra el dispositivo"""
        self.wrapper.close()