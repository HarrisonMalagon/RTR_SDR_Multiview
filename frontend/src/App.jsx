import { useState, useEffect, useRef } from "react";
import "./App.css";

// Presets de frecuencias (UTF-8 corregido)
const FREQUENCY_PRESETS = {
  "FM RADIO": [{ name: "FM Radio", start: 88, stop: 108, rbw: 50 }],
  RADIOCOMUNICACIONES: [
    { name: "Banda Aérea Comercial", start: 118, stop: 137, rbw: 25 },
    { name: "Banda Aérea Privada", start: 137, stop: 144, rbw: 25 },
    { name: "VHF Marino", start: 156, stop: 174, rbw: 25 },
    { name: "PMR446", start: 446, stop: 447, rbw: 50 },
  ],
  AVIACIÓN: [
    { name: "ADS-B (1090 MHz)", start: 1090, stop: 1090.5, rbw: 25 },
    { name: "Mode S", start: 1030, stop: 1090, rbw: 100 },
  ],
  "TDT COLOMBIA": [
    { name: "MX14 (Caracol)", start: 473, stop: 481, rbw: 50 },
    { name: "MX15 (RCN)", start: 479, stop: 487, rbw: 50 },
    { name: "MX16 (Señal Colombia)", start: 485, stop: 493, rbw: 50 },
    { name: "MX17 (Telecaribe/Antioquia)", start: 491, stop: 499, rbw: 50 },
    { name: "MX18 (Telepacífico/Telecafé)", start: 497, stop: 505, rbw: 50 },
    { name: "MX19 (TRO/Teleislas)", start: 503, stop: 511, rbw: 50 },
    { name: "MX20 (Canal Trece)", start: 509, stop: 517, rbw: 50 },
    { name: "MX22 (Citytv)", start: 521, stop: 529, rbw: 50 },
    { name: "MX23 (Canal Capital)", start: 527, stop: 535, rbw: 50 },
    { name: "MX24 (Cali TV)", start: 533, stop: 541, rbw: 50 },
  ],
  CELULAR: [
    { name: "GSM-900 DL", start: 935, stop: 960, rbw: 100 },
    { name: "GSM-1800 DL", start: 1805, stop: 1880, rbw: 100 },
    { name: "4G LTE", start: 800, stop: 2600, rbw: 1000 },
  ],
  "ISM BANDS": [
    { name: "WiFi 2.4 GHz", start: 2400, stop: 2500, rbw: 1000 },
    { name: "Bluetooth", start: 2402, stop: 2480, rbw: 100 },
    { name: "ISM 915 MHz", start: 915, stop: 928, rbw: 100 },
  ],
};

// Utility: Downsampling
const downsampleData = (data, targetLength = 256) => {
  if (data.length <= targetLength) return data;
  const step = Math.ceil(data.length / targetLength);
  const downsampled = [];
  for (let i = 0; i < data.length; i += step) {
    downsampled.push(data[i]);
  }
  return downsampled.slice(0, targetLength);
};

function App() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [autoScan, setAutoScan] = useState(false);
  const [scanInterval, setScanInterval] = useState(2);
  const [serverStatus, setServerStatus] = useState("connecting");
  const [statusMessage, setStatusMessage] = useState("Conectando...");
  const [notification, setNotification] = useState(null);

  // Estado para formulario manual
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFreq, setManualFreq] = useState({
    name: "Frecuencia Manual",
    startFreq: 100,
    stopFreq: 200,
    rbw: 50,
  });

  // Función para mostrar notificaciones
  const showNotification = (message, type = "info", duration = 3000) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), duration);
  };

  // Verificar conexión con el servidor
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
        console.error("Error conectando:", e);
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
      start_freq: preset.start * 1e6,
      stop_freq: preset.stop * 1e6,
      rbw: preset.rbw * 1000,
      gain: "auto",
      autoScan: autoScan,
      waterfall: [],
    };
    setCarriers([...carriers, newCarrier]);
    showNotification(`📡 ${preset.name} agregado`, "success");
  };

  const addManualFrequency = () => {
    // Validaciones
    if (!manualFreq.name.trim()) {
      showNotification("⚠️ Ingresa un nombre", "error");
      return;
    }

    if (manualFreq.startFreq >= manualFreq.stopFreq) {
      showNotification("⚠️ Start debe ser menor que Stop", "error");
      return;
    }

    if (manualFreq.rbw <= 0) {
      showNotification("⚠️ RBW debe ser positivo", "error");
      return;
    }

    const span = manualFreq.stopFreq - manualFreq.startFreq;
    if (span < manualFreq.rbw) {
      showNotification("⚠️ Span debe ser mayor que RBW", "error");
      return;
    }

    const newCarrier = {
      id: Date.now(),
      name: manualFreq.name,
      start_freq: manualFreq.startFreq * 1e6,
      stop_freq: manualFreq.stopFreq * 1e6,
      rbw: manualFreq.rbw * 1000,
      gain: "auto",
      autoScan: autoScan,
      waterfall: [],
    };

    setCarriers([...carriers, newCarrier]);
    showNotification(`📡 ${manualFreq.name} agregado`, "success");
    setShowManualForm(false);

    // Reset form
    setManualFreq({
      name: "Frecuencia Manual",
      startFreq: 100,
      stopFreq: 200,
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
      {/* Notificación flotante */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}

      <header className="app-header">
        <h1>📡 RTL-SDR Spectrum Analyzer Pro</h1>
        <div className="header-info">
          {deviceInfo && (
            <p className="device-status">
              <span
                className={`status-indicator ${
                  deviceInfo.is_real ? "real" : "simulated"
                }`}
              >
                {deviceInfo.is_real ? "✓ DISPOSITIVO REAL" : "🔄 SIMULACIÓN"}
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
          <h3>⚙️ Escaneo Automático</h3>
          <label className="auto-scan-label">
            <input
              type="checkbox"
              checked={autoScan}
              onChange={(e) => setAutoScan(e.target.checked)}
              disabled={serverStatus === "disconnected"}
            />
            Activar
          </label>

          {autoScan && (
            <div className="interval-control">
              <label>Intervalo (seg):</label>
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

          {/* Botón para abrir formulario manual */}
          <button
            onClick={() => setShowManualForm(!showManualForm)}
            className="btn btn-manual-toggle"
            disabled={serverStatus === "disconnected"}
          >
            {showManualForm ? "✕ Cerrar Manual" : "➕ Frecuencia Manual"}
          </button>

          {/* Formulario manual */}
          {showManualForm && (
            <div className="manual-form">
              <h4>Rango Personalizado</h4>

              <label>
                Nombre:
                <input
                  type="text"
                  value={manualFreq.name}
                  onChange={(e) =>
                    setManualFreq({ ...manualFreq, name: e.target.value })
                  }
                  className="form-input"
                  placeholder="Mi escaneo"
                />
              </label>

              <label>
                Inicio (MHz):
                <input
                  type="number"
                  value={manualFreq.startFreq}
                  onChange={(e) =>
                    setManualFreq({
                      ...manualFreq,
                      startFreq: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="form-input"
                  step="0.1"
                />
              </label>

              <label>
                Fin (MHz):
                <input
                  type="number"
                  value={manualFreq.stopFreq}
                  onChange={(e) =>
                    setManualFreq({
                      ...manualFreq,
                      stopFreq: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="form-input"
                  step="0.1"
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
                  <strong>Span:</strong>{" "}
                  {(manualFreq.stopFreq - manualFreq.startFreq).toFixed(1)} MHz
                </p>
                <p>
                  <strong>Puntos:</strong> ~
                  {Math.ceil(
                    ((manualFreq.stopFreq - manualFreq.startFreq) * 1000) /
                      manualFreq.rbw
                  )}
                </p>
              </div>

              <button
                onClick={addManualFrequency}
                className="btn btn-success"
                style={{ width: "100%", marginTop: "10px" }}
                disabled={serverStatus === "disconnected"}
              >
                ✓ Agregar Escaneo
              </button>
            </div>
          )}

          <hr />

          <h3>📻 Presets de Frecuencia</h3>
          <div className="presets-container">
            {Object.entries(FREQUENCY_PRESETS).map(([category, presets]) => (
              <div key={category} className="preset-category">
                <h4>{category}</h4>
                {presets.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => addFrequency(preset)}
                    className="btn btn-preset"
                    title={`${preset.start} - ${preset.stop} MHz`}
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
              En escaneo:{" "}
              <strong>{carriers.filter((c) => c.autoScan).length}</strong>
            </p>
          </div>

          {carriers.length > 0 && (
            <button
              onClick={() => setCarriers([])}
              className="btn btn-danger"
              style={{ marginTop: "20px", width: "100%" }}
            >
              🗑️ LIMPIAR TODO
            </button>
          )}
        </aside>

        <main className="main-content">
          {carriers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔭</div>
              <h2>No hay portadoras activas</h2>
              <p>
                Selecciona un preset o crea una frecuencia manual en el panel
              </p>
            </div>
          ) : (
            <div className="carrier-grid">
              {carriers.map((c) => (
                <SpectrumCard
                  key={c.id}
                  carrier={c}
                  onRemove={() => removeCarrier(c.id)}
                  onUpdate={(updates) => updateCarrier(c.id, updates)}
                  autoScan={autoScan}
                  scanInterval={scanInterval}
                  serverStatus={serverStatus}
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
}) {
  const canvasRef = useRef(null);
  const waterfallCanvasRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [lastData, setLastData] = useState(null);
  const scanTimeoutRef = useRef(null);

  // Escaneo automático
  useEffect(() => {
    if (!autoScan || serverStatus === "disconnected") return;

    const performScan = async () => {
      setScanning(true);
      try {
        const res = await fetch("http://localhost:5000/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_freq: carrier.start_freq,
            stop_freq: carrier.stop_freq,
            rbw: carrier.rbw,
            num_averages: 1,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLastData(data);

        const downsampledPower = downsampleData(data.power, 256);
        onUpdate({
          waterfall: [...(carrier.waterfall || []), downsampledPower].slice(
            -50
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
    carrier.start_freq,
    carrier.stop_freq,
    carrier.rbw,
    scanInterval,
    onUpdate,
    serverStatus,
  ]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("http://localhost:5000/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_freq: carrier.start_freq,
          stop_freq: carrier.stop_freq,
          rbw: carrier.rbw,
          num_averages: 2,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLastData(data);

      const downsampledPower = downsampleData(data.power, 256);
      onUpdate({
        waterfall: [...(carrier.waterfall || []), downsampledPower].slice(-50),
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
  }, [lastData]);

  useEffect(() => {
    if (!carrier.waterfall || carrier.waterfall.length === 0) return;
    drawWaterfallOptimized();
  }, [carrier.waterfall]);

  const drawSpectrum = () => {
    if (!canvasRef.current || !lastData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    canvas.width = w;
    canvas.height = h;

    const power = downsampleData(lastData.power, 256);
    const minP = Math.min(...power);
    const maxP = Math.max(...power);
    const range = maxP - minP || 1;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }

    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0, 255, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    power.forEach((p, i) => {
      const x = (i / (power.length - 1)) * w;
      const y = h - ((p - minP) / range) * h * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#00ff00";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`Max: ${lastData.max_power.toFixed(1)} dBm`, 10, 20);
    ctx.fillText(`${(lastData.max_freq / 1e6).toFixed(3)} MHz`, 10, 35);
  };

  const drawWaterfallOptimized = () => {
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

      const colWidth = w / powerData.length;

      powerData.forEach((p, colIdx) => {
        const normalized = (p - minP) / range;
        const hue = normalized * 120;

        const rgb = hslToRgb(hue / 360, 1, 0.5);

        for (let py = 0; py < pixelPerRow; py++) {
          for (let px = 0; px < colWidth; px++) {
            const idx =
              ((rowIdx * pixelPerRow + py) * w + colIdx * colWidth + px) * 4;
            if (idx < data.length) {
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

  const handleGainChange = (e) => {
    const gain = e.target.value;
    onUpdate({ gain });

    fetch("http://localhost:5000/api/set-gain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gain }),
    }).catch((err) => console.error("Error setting gain:", err));
  };

  return (
    <div className="carrier-tile">
      <div className="tile-header">
        <div>
          <h3>{carrier.name}</h3>
          <p className="freq-range">
            {(carrier.start_freq / 1e6).toFixed(1)} -{" "}
            {(carrier.stop_freq / 1e6).toFixed(1)} MHz
          </p>
        </div>
        <button onClick={onRemove} className="close-btn">
          ✕
        </button>
      </div>

      <div className="tile-controls">
        <label className="gain-control">
          <span>Ganancia:</span>
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
        </label>

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
          <p>
            Max:{" "}
            <span className="power-val">
              {lastData.max_power.toFixed(2)} dBm
            </span>
          </p>
          <p>
            Freq:{" "}
            <span className="freq-val">
              {(lastData.max_freq / 1e6).toFixed(3)} MHz
            </span>
          </p>
          <p>Ruido: {lastData.noise_floor.toFixed(2)} dBm</p>
        </div>
      )}

      <div className="canvas-container">
        <h4>Espectro</h4>
        <canvas ref={canvasRef} className="tile-chart" />
      </div>

      <div className="canvas-container">
        <h4>Waterfall (Historial)</h4>
        <canvas ref={waterfallCanvasRef} className="waterfall-chart" />
      </div>

      <button
        onClick={handleScan}
        disabled={scanning || serverStatus === "disconnected"}
        className={`btn btn-scan ${scanning ? "scanning" : ""}`}
      >
        {scanning ? "🔄 Escaneando..." : "📊 ESCANEAR AHORA"}
      </button>
    </div>
  );
}

export default App;
