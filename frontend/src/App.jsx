import { useState, useEffect, useRef } from "react";
import "./App.css";

const TDT_CHANNELS = [
  { multiplex: 14, freq: 473, name: "MX14 (Caracol)" },
  { multiplex: 15, freq: 479, name: "MX15 (RCN)" },
  { multiplex: 16, freq: 485, name: "MX16 (Señal Colombia)" },
  { multiplex: 22, freq: 521, name: "MX22 (Citytv)" },
  { multiplex: 23, freq: 527, name: "MX23 (Canal Capital)" },
];

function App() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [carriers, setCarriers] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/device-info")
      .then((r) => r.json())
      .then((data) => {
        console.log("Device info:", data);
        setDeviceInfo(data);
      })
      .catch((e) => console.error("Error:", e));
  }, []);

  const handleAddChannel = (ch) => {
    console.log("Agregando canal:", ch);
    setCarriers([
      ...carriers,
      {
        id: Date.now(),
        name: ch.name,
        start_freq: ch.freq * 1e6,
        stop_freq: (ch.freq + 8) * 1e6,
        rbw: 50000,
        gain: "auto",
      },
    ]);
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
          <h3>⚙️ Controles</h3>
          <button
            onClick={() => handleAddChannel({ freq: 100, name: "Nueva" })}
            className="btn btn-primary"
          >
            + NUEVA PORTADORA
          </button>

          <hr />

          <h3>📺 Canales TDT Colombia</h3>
          <div className="tdt-buttons">
            {TDT_CHANNELS.map((ch) => (
              <button
                key={ch.multiplex}
                onClick={() => handleAddChannel(ch)}
                className="btn btn-tdt"
              >
                {ch.multiplex}
              </button>
            ))}
          </div>

          <hr />

          <h3>📊 Estadísticas</h3>
          <div className="stats">
            <p>
              Portadoras: <strong>{carriers.length}</strong>
            </p>
            <p>
              En streaming:{" "}
              <strong>{carriers.filter((c) => c.streaming).length}</strong>
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
              <p>Selecciona un canal TDT o crea una portadora manual</p>
            </div>
          ) : (
            <div className="carrier-grid">
              {carriers.map((c) => (
                <SpectrumCard
                  key={c.id}
                  carrier={c}
                  onRemove={() =>
                    setCarriers(carriers.filter((x) => x.id !== c.id))
                  }
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SpectrumCard({ carrier, onRemove }) {
  const canvasRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [lastData, setLastData] = useState(null);

  const handleScan = async () => {
    setScanning(true);
    try {
      console.log("Escaneando:", carrier.name);
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
      console.log("Datos recibidos:", data);
      setLastData(data);
      drawSpectrum(data);
    } catch (e) {
      console.error("Error escaneo:", e);
    } finally {
      setScanning(false);
    }
  };

  const drawSpectrum = (data) => {
    if (!data || !data.power || data.power.length === 0) {
      console.error("Sin datos para dibujar");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      console.error("Canvas no encontrado");
      return;
    }

    console.log("Dibujando en canvas...");

    const ctx = canvas.getContext("2d");
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    canvas.width = w;
    canvas.height = h;

    const power = data.power;
    const minP = Math.min(...power);
    const maxP = Math.max(...power);
    const range = maxP - minP || 1;

    // Fondo negro
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Gráfico verde
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

    // Información
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#00ff00";
    ctx.font = "bold 14px monospace";
    ctx.fillText(`Max: ${data.max_power.toFixed(1)} dBm`, 10, 25);
    ctx.fillText(`Freq: ${(data.max_freq / 1e6).toFixed(3)} MHz`, 10, 45);

    console.log("Gráfico dibujado exitosamente");
  };

  // Redibujar cuando cambia lastData
  useEffect(() => {
    if (lastData) {
      drawSpectrum(lastData);
    }
  }, [lastData]);

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

      <div className="tile-info">
        {lastData && (
          <>
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
            <p>
              Ruido: <span>{lastData.noise_floor.toFixed(2)} dBm</span>
            </p>
          </>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="tile-chart"
        style={{
          display: "block",
          width: "100%",
          height: "200px",
          backgroundColor: "#0a0a0a",
        }}
      />

      <button
        onClick={handleScan}
        disabled={scanning}
        className={`btn btn-scan ${scanning ? "scanning" : ""}`}
      >
        {scanning ? "🔄 Escaneando..." : "📊 ESCANEAR"}
      </button>
    </div>
  );
}

export default App;
