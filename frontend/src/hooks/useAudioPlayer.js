import { useRef, useCallback, useState } from "react";

export const useAudioPlayer = () => {
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);

  // Inicializar Audio Context
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      // Nodo de ganancia
      const gainNode = audioContext.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      gainNodeRef.current = gainNode;

      console.log("✓ Audio Context inicializado");
      return audioContext;
    } catch (e) {
      console.error("Error inicializando Audio Context:", e);
      return null;
    }
  }, [volume]);

  // Cambiar volumen
  const setAudioVolume = useCallback((newVolume) => {
    setVolume(newVolume);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newVolume;
      console.log(`Volume: ${Math.round(newVolume * 100)}%`);
    }
  }, []);

  // Reproducir audio desde base64
  const playAudioFrame = useCallback(
    (audioBase64, sampleRate = 44100) => {
      try {
        const audioContext = initAudioContext();
        if (!audioContext || !gainNodeRef.current) {
          console.warn("Audio context no disponible");
          return;
        }

        // Decodificar base64
        const binaryString = atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Convertir bytes a Int16Array
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);

        // Convertir int16 a float32 [-1, 1]
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        // Crear AudioBuffer
        const audioBuffer = audioContext.createBuffer(
          1, // mono
          float32Array.length,
          sampleRate
        );

        const channelData = audioBuffer.getChannelData(0);
        channelData.set(float32Array);

        // Crear y reproducir source
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNodeRef.current);
        source.start(audioContext.currentTime);

        console.log(`▶ Reproduciendo: ${float32Array.length} samples @ ${sampleRate}Hz`);
      } catch (e) {
        console.error("Error reproduciendo audio:", e);
      }
    },
    [initAudioContext]
  );

  // Iniciar reproducción
  const startPlayback = useCallback(() => {
    const audioContext = initAudioContext();
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume().then(() => {
        console.log("Audio Context reanudado");
        setIsPlaying(true);
      });
    } else if (audioContext) {
      setIsPlaying(true);
    }
  }, [initAudioContext]);

  // Detener reproducción
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return {
    isPlaying,
    volume,
    setAudioVolume,
    playAudioFrame,
    startPlayback,
    stopPlayback,
    initAudioContext,
  };
};