import { useState, useEffect, useRef } from "react";
import "./App.css";

// Presets de frecuencias
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
  "BANDA CIVIL": [
    { name: "GSM-900 DL", start: 935, stop: 960, rbw: 100 },
    { name: "GSM-1800 DL", start: 1805, stop: 1880, rbw: 100 },
    { name: "4G LTE", start: 800, stop: 2600, rbw: 1000 },
  ],
  "TV DIGITAL": [
    { name: "TDT Multiplex 14", start: 473, stop: 481, rbw: 50 },
    { name: "TDT Multiplex 15", start: 479, stop: 487, rbw: 50 },
    { name: "TDT Multiplex 22", start: 521, stop: 529, rbw: 50 },
  ],
  "ISM BANDS": [
    { name: "WiFi 2.4 GHz", start: 2400, stop: 2500, rbw: 1000 },
    { name: "Bluetooth", start: 2402, stop: 2480, rbw: 100 },
    { name: "ISM 915 MHz", start: 915, stop: 928, rbw: 100 },
  ],
};

function App() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [autoScan, setAutoScan] = useState(false);
  const [scanInterval, setScanInterval] = useState(2);

  useEffect(() => {
    fetch("http://localhost:5000/api/device-info")
      .then((r) => r.json())
      .then((data) => setDeviceInfo(data))
      .catch((e) => console.error(e));
  }, []);

  const addFrequency = (preset) => {
    setCarriers([
      ...carriers,
      {
        id: Date.now(),
        name: preset.name,
        start_freq: preset.start * 1e6,
        stop_freq: preset.stop * 1e6,
        rbw: preset.rbw * 1000,
        gain: "auto",
        autoScan: false,
        waterfall: [],
      },
    ]);
  };

  const removeCarrier = (id) => {
    setCarriers(carriers.filter((c) => c.id !== id));
  };

  const updateCarrier = (id, updates) => {
    setCarriers(carriers.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>📡 RTL-SDR Spectrum Analyzer Pro</h1>
        {deviceInfo && (
          <p className="device-status">
            <span style={{ color: deviceInfo.is_real ? "#00ff00" : "#ff6b00" }}>
              {deviceInfo.is_real ? "✓ DISPOSITIVO REAL" : "🔄 SIMULACION"}
            </span>{" "}
            | {deviceInfo.device} | {deviceInfo.tuner}
          </p>
        )}
      </header>

      <div className="main-container">
        <aside className="sidebar">
          <h3>⚙️ Escaneo Automático</h3>
          <label className="auto-scan-label">
            <input
              type="checkbox"
              checked={autoScan}
              onChange={(e) => setAutoScan(e.target.checked)}
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
              <div className="empty-icon">📭</div>
              <h2>No hay portadoras activas</h2>
              <p>
                Selecciona un preset de frecuencia o crea una portadora manual
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
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SpectrumCard({ carrier, onRemove, onUpdate, autoScan, scanInterval }) {
  const canvasRef = useRef(null);
  const waterfallCanvasRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [lastData, setLastData] = useState(null);
  const scanTimeoutRef = useRef(null);

  // Escaneo automático
  useEffect(() => {
    if (!autoScan) return;

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
        });
        const data = await res.json();
        setLastData(data);

        // Agregar al waterfall
        onUpdate({
          waterfall: [...(carrier.waterfall || []), data.power].slice(-100),
        });
      } catch (e) {
        console.error("Error:", e);
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
      });
      const data = await res.json();
      setLastData(data);
      onUpdate({
        waterfall: [...(carrier.waterfall || []), data.power].slice(-100),
      });
    } catch (e) {
      console.error("Error:", e);
    } finally {
      setScanning(false);
    }
  };

  // Dibujar espectro
  useEffect(() => {
    if (!lastData) return;
    drawSpectrum();
  }, [lastData]);

  // Dibujar waterfall
  useEffect(() => {
    if (!carrier.waterfall || carrier.waterfall.length === 0) return;
    drawWaterfall();
  }, [carrier.waterfall]);

  const drawSpectrum = () => {
    if (!canvasRef.current || !lastData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    canvas.width = w;
    canvas.height = h;

    const power = lastData.power;
    const minP = Math.min(...power);
    const maxP = Math.max(...power);
    const range = maxP - minP || 1;

    // Fondo
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }

    // Gráfico
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0, 255, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.beginPath();

    power.forEach((p, i) => {
      const x = (i / (power.length - 1)) * w;
      const y = h - ((p - minP) / range) * h * 0.9;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Texto
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#00ff00";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`Max: ${lastData.max_power.toFixed(1)} dBm`, 10, 20);
    ctx.fillText(`${(lastData.max_freq / 1e6).toFixed(3)} MHz`, 10, 35);
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

    const pixelPerRow = h / carrier.waterfall.length;

    carrier.waterfall.forEach((powerData, rowIdx) => {
      const minP = Math.min(...powerData);
      const maxP = Math.max(...powerData);
      const range = maxP - minP || 1;

      powerData.forEach((p, colIdx) => {
        const x = (colIdx / (powerData.length - 1)) * w;
        const y = rowIdx * pixelPerRow;

        // Colorizar por potencia
        const normalized = (p - minP) / range;
        let hue = normalized * 120; // Verde a rojo
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(x, y, w / powerData.length, pixelPerRow);
      });
    });
  };

  const handleGainChange = (e) => {
    const gain = e.target.value;
    onUpdate({ gain });

    // Enviar al backend
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
        disabled={scanning}
        className={`btn btn-scan ${scanning ? "scanning" : ""}`}
      >
        {scanning ? "🔄 Escaneando..." : "📊 ESCANEAR AHORA"}
      </button>
    </div>
  );
}

export default App;
