"""
Wrapper para usar RTL-SDR real o simulado
"""

import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# ✅ ESTABLECER PATH ANTES DE IMPORTAR
lib_path = Path(__file__).parent.parent.parent / 'lib'
if lib_path.exists():
    lib_str = str(lib_path.absolute())
    os.environ['PATH'] = lib_str + ';' + os.environ.get('PATH', '')
    sys.path.insert(0, lib_str)
    logger.info(f"PATH actualizado con: {lib_str}")

class RTLSDRWrapper:
    """Wrapper que intenta usar hardware real, sino simula"""
    
    def __init__(self):
        self.device = None
        self.is_real = False
        self.tuner_type = "Simulado"
        self._try_real_connection()
    
    def _try_real_connection(self):
        """Intenta conectar con hardware real"""
        try:
            from rtlsdr import RtlSdr
            
            dev = RtlSdr()
            self.device = dev
            self.is_real = True
            self.tuner_type = dev.get_tuner_type()
            logger.info(f"✓✓✓ RTL-SDR REAL CONECTADO: {self.tuner_type} ✓✓✓")
            return True
            
        except Exception as e:
            logger.warning(f"No se pudo conectar: {e}")
            self.is_real = False
            return False
    
    def scan_frequency_range(self, start_freq, stop_freq, rbw=100000, num_averages=2):
        """Escanea - real o simulado"""
        
        if self.is_real and self.device:
            return self._scan_real(start_freq, stop_freq, rbw, num_averages)
        else:
            return self._scan_simulated(start_freq, stop_freq, rbw, num_averages)
    
    def _scan_real(self, start_freq, stop_freq, rbw, num_averages):
        """Escaneo real"""
        try:
            import numpy as np
            import time
            from scipy import signal
            
            center = int((start_freq + stop_freq) / 2)
            self.device.center_freq = center
            self.device.sample_rate = int(2.4e6)
            self.device.gain = 'auto'
            time.sleep(0.05)
            
            span = stop_freq - start_freq
            num_points = max(512, min(1024, int(span / rbw)))
            
            power_avg = None
            
            for avg in range(num_averages):
                samples = self.device.read_samples(num_points * 4)
                window = signal.windows.hann(len(samples))
                samples = samples * window
                
                fft = np.fft.fft(samples, n=num_points)
                power = np.abs(fft[:num_points//2]) ** 2
                power_db = 10 * np.log10(power + 1e-10)
                
                if power_avg is None:
                    power_avg = np.copy(power_db)
                else:
                    power_avg = (power_avg * avg + power_db) / (avg + 1)
            
            freq = np.fft.fftfreq(num_points, d=1/self.device.sample_rate)
            freq = freq[:num_points//2] + center
            
            mask = (freq >= start_freq) & (freq <= stop_freq)
            freq_f = freq[mask]
            power_f = power_avg[mask]
            
            max_idx = np.argmax(power_f)
            
            return {
                'start_freq': float(start_freq),
                'stop_freq': float(stop_freq),
                'center_freq': float(center),
                'frequencies': freq_f.tolist(),
                'power': power_f.tolist(),
                'max_power': float(power_f[max_idx]),
                'max_freq': float(freq_f[max_idx]),
                'timestamp': time.time(),
                'rbw': rbw,
                'num_points': num_points,
                'carriers_found': [],
                'noise_floor': float(np.percentile(power_f, 20)),
                'is_real': True
            }
            
        except Exception as e:
            logger.error(f"Error escaneo real: {e}")
            return self._scan_simulated(start_freq, stop_freq, rbw, num_averages)
    
    def _scan_simulated(self, start_freq, stop_freq, rbw, num_averages):
        """Escaneo simulado"""
        import numpy as np
        import time
        
        span = stop_freq - start_freq
        num_points = max(512, min(1024, int(span / rbw)))
        freq = np.linspace(start_freq, stop_freq, num_points)
        
        noise = -90 + np.random.normal(0, 2, num_points)
        power = np.copy(noise)
        
        # Portadoras
        for i in range(3):
            c_freq = start_freq + span * (0.2 + i * 0.3)
            distance = np.abs(freq - c_freq)
            gaussian = np.exp(-((distance**2) / (2 * (100e3/4)**2)))
            power += (-20 + i*5) * gaussian
        
        max_idx = np.argmax(power)
        
        return {
            'start_freq': float(start_freq),
            'stop_freq': float(stop_freq),
            'center_freq': float((start_freq + stop_freq) / 2),
            'frequencies': freq.tolist(),
            'power': power.tolist(),
            'max_power': float(power[max_idx]),
            'max_freq': float(freq[max_idx]),
            'timestamp': time.time(),
            'rbw': rbw,
            'num_points': num_points,
            'carriers_found': [],
            'noise_floor': float(np.percentile(power, 20)),
            'is_real': False
        }
    
    def get_device_info(self):
        """Información del dispositivo"""
        status = "DISPOSITIVO REAL" if self.is_real else "SIMULACION"
        return {
            'status': 'connected',
            'device': f'RTL-SDR ({status})',
            'tuner': self.tuner_type,
            'tuner_gains': [0, 10, 20, 30, 40],
            'sample_rate': 2.4e6,
            'center_freq': 1e9,
            'gain': 'auto',
            'freq_range': {'min': 24e6, 'max': 1766e6},
            'is_simulated': not self.is_real,
            'is_real': self.is_real
        }
    
    def close(self):
        """Cierra dispositivo"""
        if self.device and self.is_real:
            try:
                self.device.close()
                logger.info("Dispositivo cerrado")
            except:
                pass