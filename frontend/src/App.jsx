import { useState, useEffect, useRef } from "react";
import "./App.css";
import { useAudioPlayer } from "./hooks/useAudioPlayer";

// Paletas de colores para waterfall
const COLOR_PALETTES = {
  default: { name: "Default (Verde-Rojo)", id: "default" },
  viridis: { name: "Viridis", id: "viridis" },
  jet: { name: "Jet", id: "jet" },
  thermal: { name: "Thermal (Rojo-Blanco)", id: "thermal" },
  grayscale: { name: "Escala de Grises", id: "grayscale" },
};

// Presets de frecuencias
const FREQUENCY_PRESETS = {
  "FM RADIO": [{ name: "FM Radio", center: 98, span: 40, rbw: 50 }],
  RADIOCOMUNICACIONES: [
    { name: "Banda Aérea Comercial", center: 127.5, span: 38, rbw: 25 },
    { name: "VHF Marino", center: 165, span: 36, rbw: 25 },
    { name: "PMR446", center: 446.5, span: 2, rbw: 50 },
  ],
  AVIACIÓN: [
    { name: "ADS-B (1090 MHz)", center: 1090.25, span: 1, rbw: 25 },
    { name: "Mode S", center: 1060, span: 120, rbw: 100 },
  ],
  "TDT COLOMBIA": [
    { name: "MX14-20", center: 491, span: 36, rbw: 50 },
    { name: "MX22-24", center: 531, span: 18, rbw: 50 },
  ],
  CELULAR: [
    { name: "GSM-900 DL", center: 947.5, span: 50, rbw: 100 },
    { name: "4G LTE", center: 1700, span: 900, rbw: 1000 },
  ],
  "ISM BANDS": [
    { name: "WiFi 2.4 GHz", center: 2450, span: 100, rbw: 1000 },
    { name: "Bluetooth", center: 2441, span: 156, rbw: 100 },
  ],
};

// Downsampling
const downsampleData = (data, targetLength = 512) => {
  if (data.length <= targetLength) return data;
  const step = Math.ceil(data.length / targetLength);
  const downsampled = [];
  for (let i = 0; i < data.length; i += step) {
    downsampled.push(data[i]);
  }
  return downsampled.slice(0, targetLength);
};

// Obtener color según paleta
const getColorFromValue = (normalized, palette = "default") => {
  // normalized: 0-1
  normalized = Math.max(0, Math.min(1, normalized));

  switch (palette) {
    case "viridis":
      return viridisColor(normalized);
    case "jet":
      return jetColor(normalized);
    case "thermal":
      return thermalColor(normalized);
    case "grayscale":
      return grayscaleColor(normalized);
    default:
      return defaultColor(normalized);
  }
};

const defaultColor = (v) => {
  const h = v * 120; // 0-120 (verde a rojo)
  return hslToRgb(h / 360, 1, 0.5);
};

const viridisColor = (v) => {
  const c = [
    [68, 1, 84],
    [71, 44, 122],
    [59, 82, 139],
    [33, 145, 140],
    [253, 231, 37],
  ];
  const i = Math.floor(v * (c.length - 1));
  const i2 = Math.min(i + 1, c.length - 1);
  const f = v * (c.length - 1) - i;
  return [
    Math.round(c[i][0] * (1 - f) + c[i2][0] * f),
    Math.round(c[i][1] * (1 - f) + c[i2][1] * f),
    Math.round(c[i][2] * (1 - f) + c[i2][2] * f),
  ];
};

const jetColor = (v) => {
  const r = v < 0.5 ? 0 : 2 * (v - 0.5);
  const g = v < 0.5 ? 2 * v : 2 * (1 - v);
  const b = v < 0.5 ? 1 : 2 * (1 - v);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const thermalColor = (v) => {
  const r = v;
  const g = v * v;
  const b = Math.max(0, 2 * v - 1);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const grayscaleColor = (v) => {
  const gray = Math.round(v * 255);
  return [gray, gray, gray];
};

const hslToRgb = (h, s, l) => {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

function App() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [autoScan, setAutoScan] = useState(false);
  const [scanInterval, setScanInterval] = useState(1);
  const [serverStatus, setServerStatus] = useState("connecting");
  const [statusMessage, setStatusMessage] = useState("Conectando...");
  const [notification, setNotification] = useState(null);
  const [colorPalette, setColorPalette] = useState("default");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFreq, setManualFreq] = useState({
    name: "Escaneo Manual",
    center: 100,
    span: 20,
    rbw: 50,
  });

  const showNotification = (message, type = "info", duration = 3000) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), duration);
  };

  useEffect(() => {
    const checkServerHealth = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/device-info", {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          setDeviceInfo(data);
          setServerStatus("connected");
          setStatusMessage("Dispositivo listo");
        }
      } catch (e) {
        setServerStatus("disconnected");
        setStatusMessage("⚠️ Servidor desconectado");
      }
    };

    checkServerHealth();
    const interval = setInterval(checkServerHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const addFrequency = (preset) => {
    const newCarrier = {
      id: Date.now(),
      name: preset.name,
      center_freq: preset.center * 1e6,
      span_freq: preset.span * 1e6,
      rbw: preset.rbw * 1000,
      gain: "auto",
      autoScan: autoScan,
      waterfall: [],
    };
    setCarriers([...carriers, newCarrier]);
    showNotification(`📡 ${preset.name} agregado`, "success");
  };

  const addManualFrequency = () => {
    if (!manualFreq.name.trim()) {
      showNotification("⚠️ Ingresa un nombre", "error");
      return;
    }
    if (manualFreq.span <= 0) {
      showNotification("⚠️ Span debe ser positivo", "error");
      return;
    }
    if (manualFreq.rbw <= 0) {
      showNotification("⚠️ RBW debe ser positivo", "error");
      return;
    }
    if (manualFreq.span < manualFreq.rbw) {
      showNotification("⚠️ Span debe ser mayor que RBW", "error");
      return;
    }

    const newCarrier = {
      id: Date.now(),
      name: manualFreq.name,
      center_freq: manualFreq.center * 1e6,
      span_freq: manualFreq.span * 1e6,
      rbw: manualFreq.rbw * 1000,
      gain: "auto",
      autoScan: autoScan,
      waterfall: [],
    };

    setCarriers([...carriers, newCarrier]);
    showNotification(`📡 ${manualFreq.name} agregado`, "success");
    setShowManualForm(false);
    setManualFreq({
      name: "Escaneo Manual",
      center: 100,
      span: 20,
      rbw: 50,
    });
  };

  const removeCarrier = (id) => {
    setCarriers(carriers.filter((c) => c.id !== id));
  };

  const updateCarrier = (id, updates) => {
    setCarriers(carriers.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  return (
    <div className="app">
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}

      <header className="app-header">
        <h1>📡 RTL-SDR Spectrum Analyzer Pro - GQRX Style</h1>
        <div className="header-info">
          {deviceInfo && (
            <p className="device-status">
              <span
                className={`status-indicator ${
                  deviceInfo.is_real ? "real" : "simulated"
                }`}
              >
                {deviceInfo.is_real ? "✓ REAL" : "🔄 SIM"}
              </span>
              <span className="divider">|</span>
              <span>{deviceInfo.device}</span>
              <span className="divider">|</span>
              <span>{deviceInfo.tuner}</span>
            </p>
          )}
          <p className={`server-status status-${serverStatus}`}>
            {statusMessage}
          </p>
        </div>
      </header>

      <div className="main-container">
        <aside className="sidebar">
          <div className="sidebar-scroll">
            <h3>⚙️ Control</h3>

            <label className="auto-scan-label">
              <input
                type="checkbox"
                checked={autoScan}
                onChange={(e) => setAutoScan(e.target.checked)}
                disabled={serverStatus === "disconnected"}
              />
              Auto Escaneo
            </label>

            {autoScan && (
              <div className="interval-control">
                <label>Intervalo (s):</label>
                <input
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={scanInterval}
                  onChange={(e) => setScanInterval(parseFloat(e.target.value))}
                  className="interval-input"
                />
              </div>
            )}

            <hr />

            <h3>🎨 Paleta de Color</h3>
            <select
              value={colorPalette}
              onChange={(e) => setColorPalette(e.target.value)}
              className="color-select"
            >
              {Object.entries(COLOR_PALETTES).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.name}
                </option>
              ))}
            </select>

            <hr />

            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="btn btn-manual-toggle"
              disabled={serverStatus === "disconnected"}
            >
              {showManualForm ? "✕ Cerrar" : "➕ Manual"}
            </button>

            {showManualForm && (
              <div className="manual-form">
                <h4>Frecuencia Personalizada</h4>

                <label>
                  Nombre:
                  <input
                    type="text"
                    value={manualFreq.name}
                    onChange={(e) =>
                      setManualFreq({ ...manualFreq, name: e.target.value })
                    }
                    className="form-input"
                  />
                </label>

                <label>
                  Centro (MHz):
                  <input
                    type="number"
                    value={manualFreq.center}
                    onChange={(e) =>
                      setManualFreq({
                        ...manualFreq,
                        center: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="form-input"
                    step="0.1"
                  />
                </label>

                <label>
                  Span (MHz):
                  <input
                    type="number"
                    value={manualFreq.span}
                    onChange={(e) =>
                      setManualFreq({
                        ...manualFreq,
                        span: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="form-input"
                    step="0.1"
                    min="0.001"
                  />
                </label>

                <label>
                  RBW (kHz):
                  <input
                    type="number"
                    value={manualFreq.rbw}
                    onChange={(e) =>
                      setManualFreq({
                        ...manualFreq,
                        rbw: parseFloat(e.target.value) || 50,
                      })
                    }
                    className="form-input"
                    step="10"
                    min="10"
                  />
                </label>

                <div className="form-info">
                  <p>
                    <strong>Start:</strong>{" "}
                    {(manualFreq.center - manualFreq.span / 2).toFixed(3)} MHz
                  </p>
                  <p>
                    <strong>Stop:</strong>{" "}
                    {(manualFreq.center + manualFreq.span / 2).toFixed(3)} MHz
                  </p>
                </div>

                <button
                  onClick={addManualFrequency}
                  className="btn btn-success"
                  style={{ width: "100%", marginTop: "10px" }}
                  disabled={serverStatus === "disconnected"}
                >
                  ✓ Agregar
                </button>
              </div>
            )}

            <hr />

            <h3>📻 Presets</h3>
            <div className="presets-container">
              {Object.entries(FREQUENCY_PRESETS).map(([category, presets]) => (
                <div key={category} className="preset-category">
                  <h4>{category}</h4>
                  {presets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => addFrequency(preset)}
                      className="btn btn-preset"
                      title={`${preset.center} MHz ±${preset.span / 2} MHz`}
                      disabled={serverStatus === "disconnected"}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <hr />

            <h3>📊 Estadísticas</h3>
            <div className="stats">
              <p>
                Portadoras: <strong>{carriers.length}</strong>
              </p>
              <p>
                Escaneando:{" "}
                <strong>{carriers.filter((c) => c.autoScan).length}</strong>
              </p>
            </div>

            {carriers.length > 0 && (
              <button
                onClick={() => setCarriers([])}
                className="btn btn-danger"
                style={{ marginTop: "15px", width: "100%" }}
              >
                🗑️ LIMPIAR TODO
              </button>
            )}
          </div>
        </aside>

        <main className="main-content">
          {carriers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔭</div>
              <h2>No hay portadoras activas</h2>
              <p>Selecciona un preset o crea una frecuencia personalizada</p>
            </div>
          ) : (
            <div className="spectrum-container">
              {carriers.map((c) => (
                <SpectrumCard
                  key={c.id}
                  carrier={c}
                  onRemove={() => removeCarrier(c.id)}
                  onUpdate={(updates) => updateCarrier(c.id, updates)}
                  autoScan={autoScan}
                  scanInterval={scanInterval}
                  serverStatus={serverStatus}
                  colorPalette={colorPalette}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SpectrumCard({
  carrier,
  onRemove,
  onUpdate,
  autoScan,
  scanInterval,
  serverStatus,
  colorPalette,
}) {
  const spectrumCanvasRef = useRef(null);
  const waterfallCanvasRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [lastData, setLastData] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioPlayer = useAudioPlayer();
  const socketRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  useEffect(() => {
    if (!autoScan || serverStatus === "disconnected") return;

    const performScan = async () => {
      setScanning(true);
      try {
        const startFreq = carrier.center_freq - carrier.span_freq / 2;
        const stopFreq = carrier.center_freq + carrier.span_freq / 2;

        const res = await fetch("http://localhost:5000/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_freq: startFreq,
            stop_freq: stopFreq,
            rbw: carrier.rbw,
            num_averages: 1,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLastData(data);

        const downsampledPower = downsampleData(data.power, 512);
        onUpdate({
          waterfall: [...(carrier.waterfall || []), downsampledPower].slice(
            -100
          ),
        });
      } catch (e) {
        console.error("Error escaneo:", e);
      } finally {
        setScanning(false);
      }
    };

    performScan();
    scanTimeoutRef.current = setInterval(performScan, scanInterval * 1000);

    return () => clearInterval(scanTimeoutRef.current);
  }, [
    autoScan,
    carrier.center_freq,
    carrier.span_freq,
    carrier.rbw,
    scanInterval,
    onUpdate,
    serverStatus,
  ]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const startFreq = carrier.center_freq - carrier.span_freq / 2;
      const stopFreq = carrier.center_freq + carrier.span_freq / 2;

      const res = await fetch("http://localhost:5000/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_freq: startFreq,
          stop_freq: stopFreq,
          rbw: carrier.rbw,
          num_averages: 2,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLastData(data);

      const downsampledPower = downsampleData(data.power, 512);
      onUpdate({
        waterfall: [...(carrier.waterfall || []), downsampledPower].slice(-100),
      });
    } catch (e) {
      console.error("Error:", e);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (!lastData) return;
    drawSpectrum();
  }, [lastData, colorPalette]);

  useEffect(() => {
    if (!carrier.waterfall || carrier.waterfall.length === 0) return;
    drawWaterfall();
  }, [carrier.waterfall, colorPalette]);

  const drawSpectrum = () => {
    if (!spectrumCanvasRef.current || !lastData) return;

    const canvas = spectrumCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    canvas.width = w;
    canvas.height = h;

    const power = downsampleData(lastData.power, 512);
    const minP = Math.min(...power);
    const maxP = Math.max(...power);
    const range = maxP - minP || 1;

    // Fondo
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 5) * i);
      ctx.lineTo(w, (h / 5) * i);
      ctx.stroke();
    }

    // Etiquetas dBm
    ctx.fillStyle = "#666";
    ctx.font = "10px monospace";
    for (let i = 0; i <= 5; i++) {
      const dbm = maxP - (i * range) / 5;
      ctx.fillText(dbm.toFixed(0), 2, (h / 5) * i + 3);
    }

    // Gráfico
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0, 255, 0, 0.5)";
    ctx.shadowBlur = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    power.forEach((p, i) => {
      const x = (i / (power.length - 1)) * w;
      const y = h - ((p - minP) / range) * h;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Info
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#00ff00";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`Max: ${lastData.max_power.toFixed(1)} dBm`, 10, 15);
    ctx.fillText(`${(lastData.max_freq / 1e6).toFixed(3)} MHz`, 10, 28);
  };

  const drawWaterfall = () => {
    if (!waterfallCanvasRef.current) return;

    const canvas = waterfallCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    canvas.width = w;
    canvas.height = h;

    if (!carrier.waterfall || carrier.waterfall.length === 0) return;

    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    const pixelPerRow = h / carrier.waterfall.length;

    carrier.waterfall.forEach((powerData, rowIdx) => {
      const minP = Math.min(...powerData);
      const maxP = Math.max(...powerData);
      const range = maxP - minP || 1;

      const colWidth = Math.max(1, w / powerData.length);

      powerData.forEach((p, colIdx) => {
        const normalized = (p - minP) / range;
        const rgb = getColorFromValue(normalized, colorPalette);

        for (let py = 0; py < pixelPerRow; py++) {
          for (let px = 0; px < colWidth; px++) {
            const idx =
              ((rowIdx * pixelPerRow + py) * w + colIdx * colWidth + px) * 4;
            if (idx < data.length - 3) {
              data[idx] = rgb[0];
              data[idx + 1] = rgb[1];
              data[idx + 2] = rgb[2];
              data[idx + 3] = 255;
            }
          }
        }
      });
    });

    ctx.putImageData(imageData, 0, 0);
  };

  const handleCenterChange = (e) => {
    const newCenter = parseFloat(e.target.value) || 0;
    onUpdate({ center_freq: newCenter * 1e6 });
  };

  const handleSpanChange = (e) => {
    const newSpan = parseFloat(e.target.value) || 1;
    onUpdate({ span_freq: newSpan * 1e6 });
  };

  const handleGainChange = (e) => {
    const gain = e.target.value;
    onUpdate({ gain });

    fetch("http://localhost:5000/api/set-gain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gain }),
    }).catch((err) => console.error("Error setting gain:", err));
  };

  const initAudioContext = () => {
    if (audioContextRef.current) return;

    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    // Crear nodo de ganancia para volumen
    const gainNode = audioContext.createGain();
    gainNode.gain.value = audioVolume;
    gainNode.connect(audioContext.destination);

    sourceNodeRef.current = gainNode;
  };

  const toggleAudio = async () => {
    if (audioPlaying) {
      // Detener audio
      setAudioPlaying(false);
      if (socketRef.current) {
        socketRef.current.emit("stop_audio_stream");
      }
    } else {
      // Iniciar audio
      audioPlayer.startPlayback();
      setAudioPlaying(true);

      // Conectar WebSocket para recibir audio
      setupAudioWebSocket();
    }
  };

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    audioPlayer.setAudioVolume(vol);
  };

  const setupAudioWebSocket = () => {
    try {
      // Usar socket.io si está disponible
      if (typeof io !== "undefined") {
        const socket = io("http://localhost:5000", {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        });

        socket.on("connect", () => {
          console.log("✓ Socket.IO conectado para audio");

          // Iniciar streaming de audio
          socket.emit("start_audio_stream", {
            start_freq: carrier.center_freq - carrier.span_freq / 2,
            stop_freq: carrier.center_freq + carrier.span_freq / 2,
            rbw: carrier.rbw,
            mode: carrier.audioMode || "fm",
            bandwidth_khz: 200,
            interval: 0.1,
          });
        });

        socket.on("audio_frame", (data) => {
          try {
            // Reproducir audio recibido
            audioPlayer.playAudioFrame(data.audio, data.sample_rate);
          } catch (e) {
            console.error("Error reproduciendo frame:", e);
          }
        });

        socket.on("audio_stream_stopped", () => {
          console.log("Audio stream detenido");
          setAudioPlaying(false);
        });

        socket.on("error", (err) => {
          console.error("Error WebSocket:", err);
          setAudioPlaying(false);
        });

        socketRef.current = socket;
      } else {
        console.warn("Socket.IO no disponible");
      }
    } catch (e) {
      console.error("Error configurando WebSocket:", e);
    }
  };

  // Limpiar socket al desmontar
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.emit("stop_audio_stream");
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="spectrum-tile">
      <div className="tile-header">
        <h2>{carrier.name}</h2>
        <button onClick={onRemove} className="close-btn">
          ✕
        </button>
      </div>

      <div className="freq-controls">
        <div className="control-group">
          <label>Centro (MHz):</label>
          <input
            type="number"
            value={(carrier.center_freq / 1e6).toFixed(3)}
            onChange={handleCenterChange}
            className="freq-input"
            step="0.001"
            disabled={serverStatus === "disconnected"}
          />
        </div>

        <div className="control-group">
          <label>Span (MHz):</label>
          <input
            type="number"
            value={(carrier.span_freq / 1e6).toFixed(3)}
            onChange={handleSpanChange}
            className="freq-input"
            step="0.001"
            min="0.001"
            disabled={serverStatus === "disconnected"}
          />
        </div>

        <div className="control-group">
          <label>Ganancia:</label>
          <select
            value={carrier.gain}
            onChange={handleGainChange}
            className="gain-select"
            disabled={serverStatus === "disconnected"}
          >
            <option value="auto">Auto</option>
            <option value="0">0 dB</option>
            <option value="10">10 dB</option>
            <option value="20">20 dB</option>
            <option value="30">30 dB</option>
            <option value="40">40 dB</option>
          </select>
        </div>

        <div className="control-group">
          <label>Modo Audio:</label>
          <select
            value={carrier.audioMode || "fm"}
            onChange={(e) => onUpdate({ audioMode: e.target.value })}
            className="gain-select"
            disabled={serverStatus === "disconnected"}
          >
            <option value="fm">FM</option>
            <option value="am">AM</option>
            <option value="usb">USB</option>
            <option value="lsb">LSB</option>
          </select>
        </div>

        <label className="auto-label">
          <input
            type="checkbox"
            checked={carrier.autoScan}
            onChange={(e) => onUpdate({ autoScan: e.target.checked })}
            disabled={serverStatus === "disconnected"}
          />
          Auto
        </label>
      </div>

      {lastData && (
        <div className="tile-info">
          <span>
            Max: <strong>{lastData.max_power.toFixed(1)} dBm</strong>
          </span>
          <span>
            Pico: <strong>{(lastData.max_freq / 1e6).toFixed(3)} MHz</strong>
          </span>
          <span>
            Ruido: <strong>{lastData.noise_floor.toFixed(1)} dBm</strong>
          </span>
        </div>
      )}

      <div className="spectrum-wrapper">
        <div className="spectrum-chart-container">
          <canvas ref={spectrumCanvasRef} className="spectrum-chart" />
        </div>

        <div className="waterfall-container">
          <canvas ref={waterfallCanvasRef} className="waterfall-chart" />
        </div>
      </div>

      <button
        onClick={handleScan}
        disabled={scanning || serverStatus === "disconnected"}
        className={`btn btn-scan-large ${scanning ? "scanning" : ""}`}
      >
        {scanning ? "🔄 Escaneando..." : "📊 ESCANEAR"}
      </button>

      <div className="audio-controls">
        <button
          onClick={toggleAudio}
          className={`btn btn-audio ${audioPlaying ? "active" : ""}`}
          disabled={serverStatus === "disconnected"}
        >
          {audioPlaying ? "🔊 Audio ON" : "🔇 Audio OFF"}
        </button>

        {audioPlaying && (
          <div className="volume-control">
            <span>🔉</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={audioPlayer.volume}
              onChange={handleVolumeChange}
              className="volume-slider"
              style={{
                "--value": `${audioPlayer.volume * 100}%`,
              }}
            />
            <span>{Math.round(audioPlayer.volume * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
