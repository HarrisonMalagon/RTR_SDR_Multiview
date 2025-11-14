import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import "./App.css";

const TDT_CHANNELS = [
  {
    multiplex: 14,
    freq: 473,
    name: "MX14 (Caracol, Kalle)",
    channels: "Caracol/La Kalle",
  },
  { multiplex: 15, freq: 479, name: "MX15 (RCN)", channels: "RCN" },
  {
    multiplex: 16,
    freq: 485,
    name: "MX16 (Señal Colombia)",
    channels: "Señal Colombia",
  },
  {
    multiplex: 17,
    freq: 491,
    name: "MX17 (Telecaribe/Antioquia)",
    channels: "Telecaribe/Antioquia",
  },
  {
    multiplex: 18,
    freq: 497,
    name: "MX18 (Telepacífico/Telecafé)",
    channels: "Telepacífico/Telecafé",
  },
  {
    multiplex: 19,
    freq: 503,
    name: "MX19 (TRO/Teleislas)",
    channels: "TRO/Teleislas",
  },
  {
    multiplex: 20,
    freq: 509,
    name: "MX20 (Canal Trece)",
    channels: "Canal Trece",
  },
  { multiplex: 22, freq: 521, name: "MX22 (Citytv)", channels: "Citytv" },
  {
    multiplex: 23,
    freq: 527,
    name: "MX23 (Canal Capital)",
    channels: "Canal Capital",
  },
  { multiplex: 24, freq: 533, name: "MX24 (Cali TV)", channels: "Cali TV" },
];

function App() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [presets, setPresets] = useState([]);
  const [showTDT, setShowTDT] = useState(false);
  const socketRef = useRef(null);

  const API_URL = "http://localhost:5000/api";

  useEffect(() => {
    // Conectar WebSocket
    socketRef.current = io("http://localhost:5000", {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current.on("connect", () => {
      console.log("✓ WebSocket conectado");
    });

    socketRef.current.on("error", (error) => {
      console.error("Error WebSocket:", error);
    });

    fetchDeviceInfo();
    fetchPresets();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const fetchDeviceInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/device-info`);
      const data = await response.json();
      setDeviceInfo(data);
    } catch (error) {
      console.error("Error fetching device info:", error);
    }
  };

  const fetchPresets = async () => {
    try {
      const response = await fetch(`${API_URL}/presets`);
      const data = await response.json();
      setPresets(data);
    } catch (error) {
      console.error("Error fetching presets:", error);
    }
  };

  const handleAddTDTChannel = (channel) => {
    const newCarrier = {
      id: Date.now(),
      start_freq: channel.freq * 1e6,
      stop_freq: (channel.freq + 8) * 1e6,
      rbw: 50000,
      name: channel.name,
      gain: "auto",
      streaming: false,
      data: null,
      isTDT: true,
    };
    setCarriers([...carriers, newCarrier]);
  };

  const handleAddPreset = (preset) => {
    const newCarrier = {
      id: Date.now(),
      start_freq: preset.start_freq,
      stop_freq: preset.stop_freq,
      rbw: preset.rbw,
      name: preset.name,
      gain: "auto",
      streaming: false,
      data: null,
    };
    setCarriers([...carriers, newCarrier]);
  };

  const handleRemoveCarrier = (id) => {
    setCarriers(carriers.filter((c) => c.id !== id));
  };

  const handleUpdateCarrier = (id, updates) => {
    setCarriers(carriers.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const formatFrequency = (hz) => {
    if (hz >= 1e9) return (hz / 1e9).toFixed(3) + " GHz";
    if (hz >= 1e6) return (hz / 1e6).toFixed(3) + " MHz";
    return (hz / 1e3).toFixed(3) + " kHz";
  };

  const getDeviceStatus = () => {
    if (!deviceInfo) return { text: "Cargando...", color: "#888" };
    if (deviceInfo.is_simulated)
      return { text: "🔄 SIMULACIÓN", color: "#ff6b00" };
    return { text: "✓ DISPOSITIVO REAL", color: "#00ff00" };
  };

  const status = getDeviceStatus();

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>📡 RTL-SDR Spectrum Analyzer Pro</h1>
            {deviceInfo && (
              <p className="device-status">
                <span style={{ color: status.color, fontWeight: "bold" }}>
                  {status.text}
                </span>{" "}
                | {deviceInfo.device} | {deviceInfo.tuner}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="main-container">
        <aside className="sidebar">
          <h3>⚙️ Controles</h3>

          <button
            onClick={() =>
              handleAddPreset({
                start_freq: 900e6,
                stop_freq: 910e6,
                rbw: 100000,
                name: "Nueva Portadora",
              })
            }
            className="btn btn-primary btn-block"
          >
            + Nueva Portadora
          </button>

          <hr />

          <h3>📺 Canales TDT Colombia</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showTDT}
              onChange={(e) => setShowTDT(e.target.checked)}
            />
            Mostrar Canales
          </label>

          {showTDT && (
            <div className="tdt-channels">
              {TDT_CHANNELS.map((channel) => (
                <button
                  key={channel.multiplex}
                  onClick={() => handleAddTDTChannel(channel)}
                  className="btn btn-tdt"
                  title={`${channel.name}: ${channel.freq} MHz`}
                >
                  {channel.multiplex}
                </button>
              ))}
            </div>
          )}

          <hr />

          <h3>📋 Presets</h3>
          <div className="presets-list">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => handleAddPreset(preset)}
                className="btn btn-preset"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <hr />

          <h3>📊 Estadísticas</h3>
          <div className="stats">
            <div className="stat-item">
              <span>Portadoras:</span>
              <strong>{carriers.length}</strong>
            </div>
            <div className="stat-item">
              <span>En streaming:</span>
              <strong>{carriers.filter((c) => c.streaming).length}</strong>
            </div>
          </div>

          {carriers.length > 0 && (
            <button
              onClick={() => setCarriers([])}
              className="btn btn-danger btn-block"
              style={{ marginTop: "20px" }}
            >
              🗑️ Limpiar Todo
            </button>
          )}
        </aside>

        <main className="main-content">
          {carriers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h2>No hay portadoras</h2>
              <p>Selecciona un canal TDT o crea una portadora manual</p>
            </div>
          ) : (
            <div className="carrier-grid">
              {carriers.map((carrier) => (
                <CarrierTile
                  key={carrier.id}
                  carrier={carrier}
                  onRemove={() => handleRemoveCarrier(carrier.id)}
                  onUpdate={(updates) =>
                    handleUpdateCarrier(carrier.id, updates)
                  }
                  formatFrequency={formatFrequency}
                  socket={socketRef.current}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CarrierTile({ carrier, onRemove, onUpdate, formatFrequency, socket }) {
  const [editing, setEditing] = useState(false);
  const canvasRef = useRef(null);
  const waterfalltRef = useRef([]);

  useEffect(() => {
    if (!socket) return;

    const handleFrame = (data) => {
      // Dibujar en canvas
      if (canvasRef.current) {
        drawSpectrum(data);
      }

      // Agregar al waterfall
      waterfalltRef.current.push(data.power);
      if (waterfalltRef.current.length > 100) {
        waterfalltRef.current.shift();
      }
    };

    const drawSpectrum = (data) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = width;
      canvas.height = height;

      const power = data.power;
      const minPower = Math.min(...power);
      const maxPower = Math.max(...power);
      const range = maxPower - minPower || 1;

      // Limpiar
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (height / 4) * i);
        ctx.lineTo(width, (height / 4) * i);
        ctx.stroke();
      }

      // Waterfall (historial en fondo)
      if (waterfalltRef.current.length > 1) {
        const historyHeight = height / 4;
        for (let h = 0; h < waterfalltRef.current.length; h++) {
          const histPower = waterfalltRef.current[h];
          const y =
            height -
            historyHeight +
            (h / waterfalltRef.current.length) * historyHeight;

          for (let i = 0; i < histPower.length; i++) {
            const x = (i / histPower.length) * width;
            const hue = ((histPower[i] - minPower) / range) * 120;
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.fillRect(x, y, width / histPower.length, 2);
          }
        }
      }

      // Línea actual (verde brillante)
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(0, 255, 0, 0.5)";
      ctx.shadowBlur = 10;
      ctx.beginPath();

      power.forEach((p, i) => {
        const x = (i / (power.length - 1)) * width;
        const y = height * 0.75 - ((p - minPower) / range) * (height * 0.7);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Información
      ctx.fillStyle = "#00ff00";
      ctx.font = "bold 14px monospace";
      ctx.fillText(`Max: ${data.max_power.toFixed(1)} dBm`, 10, 25);
      ctx.fillText(`${formatFrequency(data.max_freq)}`, 10, 45);
    };

    socket.on("spectrum_frame", handleFrame);
    return () => {
      socket.off("spectrum_frame", handleFrame);
    };
  }, [socket, formatFrequency]);

  const toggleStream = () => {
    if (carrier.streaming) {
      socket.emit("stop_stream");
      onUpdate({ streaming: false });
    } else {
      socket.emit("start_stream", {
        start_freq: carrier.start_freq,
        stop_freq: carrier.stop_freq,
        rbw: carrier.rbw,
        gain: carrier.gain,
        interval: 0.2,
      });
      onUpdate({ streaming: true });
    }
  };

  return (
    <div className="carrier-tile">
      <div className="tile-header">
        <div>
          <h3>{carrier.name}</h3>
          {carrier.isTDT && <span className="tdt-badge">📺 TDT</span>}
          <span
            className={`stream-indicator ${carrier.streaming ? "active" : ""}`}
          >
            {carrier.streaming ? "🔴 EN VIVO" : "⚫ Inactivo"}
          </span>
        </div>
        <button onClick={onRemove} className="close-btn">
          ✕
        </button>
      </div>

      <div className="tile-controls">
        {!editing ? (
          <>
            <button
              onClick={() => setEditing(true)}
              className="btn btn-sm btn-info"
            >
              ✏️ Ajustar
            </button>
            <label className="gain-label">
              Ganancia:
              <select
                value={carrier.gain}
                onChange={(e) => {
                  onUpdate({ gain: e.target.value });
                  socket.emit("set_gain", { gain: e.target.value });
                }}
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
          </>
        ) : (
          <>
            <div className="control-group">
              <label>Inicio (MHz):</label>
              <input
                type="number"
                step="0.1"
                value={carrier.start_freq / 1e6}
                onChange={(e) =>
                  onUpdate({ start_freq: parseFloat(e.target.value) * 1e6 })
                }
                className="input-freq"
              />
            </div>
            <div className="control-group">
              <label>Fin (MHz):</label>
              <input
                type="number"
                step="0.1"
                value={carrier.stop_freq / 1e6}
                onChange={(e) =>
                  onUpdate({ stop_freq: parseFloat(e.target.value) * 1e6 })
                }
                className="input-freq"
              />
            </div>
            <button
              onClick={() => setEditing(false)}
              className="btn btn-sm btn-success"
            >
              ✓ Hecho
            </button>
          </>
        )}
      </div>

      <div className="tile-info">
        <div className="info-row">
          <span>Rango:</span>
          <span className="freq-value">
            {formatFrequency(carrier.start_freq)} -{" "}
            {formatFrequency(carrier.stop_freq)}
          </span>
        </div>
        <div className="info-row">
          <span>Ancho:</span>
          <span>
            {((carrier.stop_freq - carrier.start_freq) / 1e6).toFixed(1)} MHz
          </span>
        </div>
      </div>

      <canvas ref={canvasRef} className="tile-chart" />

      <button
        onClick={toggleStream}
        className={`btn btn-stream ${
          carrier.streaming ? "btn-stop" : "btn-scan"
        }`}
      >
        {carrier.streaming ? "⏹️ Detener" : "▶️ Iniciar En Vivo"}
      </button>
    </div>
  );
}

export default App;
