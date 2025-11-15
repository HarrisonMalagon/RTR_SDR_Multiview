# backend/sdr_service.py
from rtlsdr import RtlSdr
import numpy as np

class SDRService:
    def __init__(self, ringbuffer):
        self.sdr = RtlSdr()
        self.ringbuffer = ringbuffer
        self.running = False
    
    def configure(self, center_freq, sample_rate, gain):
        self.sdr.center_freq = center_freq
        self.sdr.sample_rate = sample_rate
        self.sdr.gain = gain
    
    async def start_streaming(self):
        self.running = True
        
        async def callback(samples, context):
            # Escribir directamente al ringbuffer
            self.ringbuffer.write(samples)
        
        await self.sdr.read_samples_async(callback, num_samples=2048)