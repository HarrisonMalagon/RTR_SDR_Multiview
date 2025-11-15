import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Activity, Settings, Wifi, Play, Pause } from 'lucide-react';

const useWebSocketSpectrum = (centerFreq: number, bandwidth: number) => {
  const [spectrum, setSpectrum] = useState<Float32Array | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws`);

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "config",
          centerFreq,
          bandwidth,
        })
      );
    };

    ws.onmessage = (event) => {
      const data = event.data as ArrayBuffer;
      const view = new DataView(data);

      // Parse header
      const msgType = view.getUint8(1);
      const payloadLen = view.getUint32(24, true);

      if (msgType === 1) {
        const spectrumData = new Float32Array(data, 32, payloadLen / 4);
        setSpectrum(spectrumData);
      }
    };

    return () => ws.close();
  }, [centerFreq, bandwidth]);

  return spectrum;
};

const SpectrumWaterfall = () => {
  const [centerFreq, setCenterFreq] = useState(101.9e6); // 101.9 MHz
  const [bandwidth, setBandwidth] = useState(2e6); // 2 MHz
  const [mode, setMode] = useState('WFM');
  const [gain, setGain] = useState(35);
  const [squelch, setSquelch] = useState(20);
  const [isRunning, setIsRunning] = useState(true);

  // Spectrum data from WebSocket
  const spectrum = useWebSocketSpectrum(centerFreq, bandwidth);
  
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const waterfallCanvasRef = useRef<HTMLCanvasElement>(null);

  const getColor = useCallback((value: number) => {
    const normalized = Math.max(0, Math.min(1, (value + 120) / 100));
    let r, g, b;

    if (normalized < 0.5) {
      const t = normalized * 2;
      r = Math.floor(t * 255);
      g = 0;
      b = 0;
    } else {
      const t = (normalized - 0.5) * 2;
      r = 255;
      g = Math.floor(t * 255);
      b = 0;
    }

    return { r, g, b };
  }, []);

  const drawSpectrum = useCallback((spectrum, canvas) => {
    // Same implementation as before...
  }, [centerFreq, bandwidth]);

  const drawWaterfall = useCallback((spectrum, canvas) => {
    // Same implementation as before...
  }, [getColor]);

  // Draw on new spectrum data
  useEffect(() => {
    if (!isRunning || !spectrum) return;

    if (spectrumCanvasRef.current) {
      drawSpectrum(spectrum, spectrumCanvasRef.current);
    }

    if (waterfallCanvasRef.current) {
      drawWaterfall(spectrum, waterfallCanvasRef.current);
    }
  }, [isRunning, spectrum, drawSpectrum, drawWaterfall]);

  const formatFreq = (freq: number) => {
    if (freq >= 1e9) return `${(freq / 1e9).toFixed(3)} GHz`;
    if (freq >= 1e6) return `${(freq / 1e6).toFixed(3)} MHz`;
    if (freq >= 1e3) return `${(freq / 1e3).toFixed(3)} kHz`;
    return `${freq.toFixed(0)} Hz`;
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Left sidebar and other UI elements remain unchanged... */}
      {/* Place your full JSX here */}
    </div>
  );
};

export default SpectrumWaterfall;
