"""
WebSocket mejorado con heartbeat, audio streaming y mejor manejo de conexiones
"""

import logging
import threading
import time
import numpy as np
from flask_socketio import emit

logger = logging.getLogger(__name__)

_streaming_active = {}
_audio_demodulator = None
_client_heartbeat = {}
_heartbeat_interval = 5
_heartbeat_timeout = 15


def init_socketio(socketio, scanner, sdr_manager, audio_handler=None):
    """Inicializa WebSocket con scanner, sdr_manager y audio"""
    global _audio_demodulator, _sdr_manager, _streaming_active, _client_heartbeat

    _sdr_manager = sdr_manager
    _audio_demodulator = audio_handler

    if _audio_demodulator:
        logger.info("AudioHandler inicializado correctamente")
    else:
        logger.warning("AudioHandler no disponible")    


    @socketio.on("connect")
    def handle_connect():
        client_id = id(socketio)
        logger.info(f"Cliente conectado: {client_id}")
        _streaming_active[client_id] = False
        _client_heartbeat[client_id] = time.time()
        emit("status", {
            "message": "Conectado",
            "timestamp": time.time(),
            "client_id": client_id,
        })

    @socketio.on("disconnect")
    def handle_disconnect():
        client_id = id(socketio)
        logger.info(f"Cliente desconectado: {client_id}")
        _streaming_active.pop(client_id, None)
        _client_heartbeat.pop(client_id, None)

    @socketio.on("heartbeat")
    def handle_heartbeat():
        client_id = id(socketio)
        _client_heartbeat[client_id] = time.time()
        emit("heartbeat_ack", {"timestamp": time.time()})

    @socketio.on("start_stream")
    def handle_start_stream(data):
        """Inicia streaming de espectro en vivo"""
        client_id = id(socketio)

        try:
            start_freq = int(data.get("start_freq", 473e6))
            stop_freq = int(data.get("stop_freq", 481e6))
            rbw = int(data.get("rbw", 100000))
            interval = float(data.get("interval", 0.5))
            stream_id = data.get("stream_id", str(client_id))

            # Validaciones
            if start_freq >= stop_freq:
                emit("error", {"message": "start_freq >= stop_freq"})
                return

            if (stop_freq - start_freq) < rbw:
                emit("error", {"message": "span < rbw"})
                return

            if interval < 0.1:
                interval = 0.1
            if interval > 10:
                interval = 10

            _streaming_active[client_id] = True

            logger.info(
                f"Stream iniciado - Cliente: {client_id}, "
                f"Rango: {start_freq/1e6:.1f}-{stop_freq/1e6:.1f} MHz"
            )
            emit("stream_started", {
                "message": "Streaming en vivo",
                "stream_id": stream_id,
                "timestamp": time.time(),
            })

            def stream_thread():
                try:
                    frame_count = 0
                    error_count = 0
                    max_errors = 5

                    while _streaming_active.get(client_id, False):
                        try:
                            _client_heartbeat[client_id] = time.time()

                            result = scanner.scan_frequency_range(
                                start_freq, stop_freq, rbw, num_averages=1
                            )

                            freqs = np.array(result["frequencies"])
                            power = np.array(result["power"])

                            if len(power) > 256:
                                indices = np.linspace(0, len(power) - 1, 256, dtype=int)
                                power = power[indices]
                                freqs = freqs[indices]

                            frame_count += 1

                            emit("spectrum_frame", {
                                "frame": frame_count,
                                "stream_id": stream_id,
                                "frequencies": freqs.tolist(),
                                "power": power.tolist(),
                                "max_power": float(np.max(power)),
                                "max_freq": float(freqs[np.argmax(power)]),
                                "noise_floor": float(np.percentile(power, 20)),
                                "timestamp": time.time(),
                                "is_real": result.get("is_real", False),
                            })

                            error_count = 0
                            time.sleep(interval)

                        except Exception as e:
                            error_count += 1
                            logger.warning(f"Error en stream (intento {error_count}): {e}")

                            if error_count >= max_errors:
                                logger.error(f"Stream fallido despues de {max_errors} errores")
                                emit("stream_error", {
                                    "message": "Demasiados errores",
                                    "error_count": error_count,
                                })
                                break

                            time.sleep(0.5)

                finally:
                    _streaming_active[client_id] = False
                    logger.info(f"Stream finalizado - Cliente: {client_id}, Frames: {frame_count}")
                    emit("stream_stopped", {
                        "message": "Stream detenido",
                        "stream_id": stream_id,
                        "frames_sent": frame_count,
                        "timestamp": time.time(),
                    })

            thread = threading.Thread(target=stream_thread, daemon=True)
            thread.start()

        except Exception as e:
            logger.error(f"Error al iniciar stream: {e}", exc_info=True)
            emit("error", {"message": f"Error: {str(e)}"})

    @socketio.on("stop_stream")
    def handle_stop_stream(data):
        """Detiene el streaming de espectro"""
        client_id = id(socketio)

        if client_id in _streaming_active:
            _streaming_active[client_id] = False

        logger.info(f"Stream detenido por cliente: {client_id}")
        emit("stream_stopped", {
            "message": "Detenido por usuario",
            "timestamp": time.time(),
        })

    @socketio.on("start_audio_stream")
    def handle_start_audio_stream(data):
        """Inicia streaming de audio con demodulacion"""
        client_id = id(socketio)

        if not _audio_demodulator:
            emit("error", {"message": "Audio demodulator no disponible"})
            return

        try:
            start_freq = int(data.get("start_freq", 98e6))
            stop_freq = int(data.get("stop_freq", 108e6))
            rbw = int(data.get("rbw", 50000))
            mode = data.get("mode", "fm")
            bandwidth_khz = float(data.get("bandwidth_khz", 200))
            interval = float(data.get("interval", 0.1))

            # Validaciones
            if start_freq >= stop_freq:
                emit("error", {"message": "start_freq >= stop_freq"})
                return

            if (stop_freq - start_freq) < rbw:
                emit("error", {"message": "span < rbw"})
                return

            if interval < 0.05:
                interval = 0.05
            if interval > 5:
                interval = 5

            _streaming_active[client_id] = True

            logger.info(
                f"Audio Stream iniciado - Cliente: {client_id}, "
                f"Modo: {mode}, Rango: {start_freq/1e6:.1f}-{stop_freq/1e6:.1f} MHz"
            )
            emit("audio_stream_started", {
                "message": "Audio streaming activo",
                "mode": mode,
                "timestamp": time.time(),
            })

            def audio_stream_thread():
                """Thread para streaming de audio"""
                try:
                    frame_count = 0
                    error_count = 0
                    max_errors = 5

                    while _streaming_active.get(client_id, False):
                        try:
                            _client_heartbeat[client_id] = time.time()

                            # Centro y span
                            center_freq = (start_freq + stop_freq) / 2
                            span_freq = stop_freq - start_freq
                            
                            # Capturar muestras IQ directas
                            # iq_samples = scanner.wrapper.get_iq_samples(
                            #     int(center_freq), 
                            #     int(span_freq),
                            #     num_samples=8192
                            # )
                            
                            iq_samples = sdr_manager.read_iq_samples(8192)
                            
                            if iq_samples is None:
                                logger.warning("No se pudieron obtener muestras IQ")
                                time.sleep(interval)
                                continue

                            # Demodular
                            audio = _audio_demodulator.demodulate(
                                iq_samples, mode, bandwidth_khz
                            )

                            if audio is None or len(audio) == 0:
                                logger.warning("Audio vacio despues de demodulacion")
                                time.sleep(interval)
                                continue

                            # Convertir a int16
                            audio_int16 = (
                                np.clip(audio * 32767, -32768, 32767)
                            ).astype(np.int16)

                            # Enviar como base64
                            import base64
                            audio_bytes = audio_int16.tobytes()
                            audio_b64 = base64.b64encode(audio_bytes).decode()

                            frame_count += 1

                            emit("audio_frame", {
                                "frame": frame_count,
                                "audio": audio_b64,
                                "sample_rate": 44100,
                                "mode": mode,
                                "timestamp": time.time(),
                            })

                            error_count = 0
                            time.sleep(interval)

                        except Exception as e:
                            error_count += 1
                            logger.warning(f"Error en audio stream (intento {error_count}): {e}")

                            if error_count >= max_errors:
                                logger.error(f"Audio stream fallido despues de {max_errors} errores")
                                emit("audio_stream_error", {
                                    "message": "Demasiados errores",
                                    "error_count": error_count,
                                })
                                break

                            time.sleep(0.5)

                finally:
                    _streaming_active[client_id] = False
                    logger.info(f"Audio stream finalizado - Cliente: {client_id}, Frames: {frame_count}")
                    emit("audio_stream_stopped", {
                        "message": "Audio stream detenido",
                        "frames_sent": frame_count,
                        "timestamp": time.time(),
                    })

            thread = threading.Thread(target=audio_stream_thread, daemon=True)
            thread.start()

        except Exception as e:
            logger.error(f"Error al iniciar audio stream: {e}", exc_info=True)
            emit("error", {"message": f"Error: {str(e)}"})

    @socketio.on("stop_audio_stream")
    def handle_stop_audio_stream():
        """Detiene el audio streaming"""
        client_id = id(socketio)

        if client_id in _streaming_active:
            _streaming_active[client_id] = False

        logger.info(f"Audio stream detenido por cliente: {client_id}")
        emit("audio_stream_stopped", {
            "message": "Detenido por usuario",
            "timestamp": time.time(),
        })

    @socketio.on("set_gain")
    def handle_set_gain(data):
        """Configura ganancia del dispositivo"""
        try:
            gain = data.get("gain", "auto")

            if scanner.wrapper.is_real and scanner.wrapper.device:
                if gain == "auto":
                    scanner.wrapper.device.gain = "auto"
                else:
                    try:
                        gain_val = int(gain)
                        scanner.wrapper.device.gain = gain_val
                    except (ValueError, TypeError):
                        emit("error", {"message": "Ganancia invalida"})
                        return

                logger.info(f"Ganancia configurada: {gain}")
                emit("gain_set", {
                    "gain": str(gain),
                    "success": True,
                    "timestamp": time.time(),
                })
            else:
                emit("gain_set", {
                    "gain": str(gain),
                    "success": False,
                    "message": "Modo simulacion",
                    "timestamp": time.time(),
                })

        except Exception as e:
            logger.error(f"Error al configurar ganancia: {e}")
            emit("error", {"message": str(e)})

    # Monitor de heartbeat
    def heartbeat_monitor():
        """Monitorea la salud de las conexiones"""
        while True:
            try:
                current_time = time.time()
                dead_clients = []

                for client_id, last_heartbeat in list(_client_heartbeat.items()):
                    if current_time - last_heartbeat > _heartbeat_timeout:
                        dead_clients.append(client_id)
                        logger.warning(f"Cliente inactivo (timeout): {client_id}")

                for client_id in dead_clients:
                    _streaming_active.pop(client_id, None)
                    _client_heartbeat.pop(client_id, None)

                time.sleep(_heartbeat_interval)

            except Exception as e:
                logger.error(f"Error en heartbeat monitor: {e}")
                time.sleep(_heartbeat_interval)

    monitor_thread = threading.Thread(target=heartbeat_monitor, daemon=True)
    monitor_thread.start()
    logger.info("Heartbeat monitor iniciado")




def create_iq_from_spectrum(frequencies, power):
    """
    Crea muestras IQ sintetizadas desde espectro
    (Para simulacion cuando no tenemos acceso a muestras IQ crudas)
    """
    try:
        # Encontrar picos en el espectro
        threshold = np.percentile(power, 80)
        peaks = np.where(power > threshold)[0]

        # Crear senal sintetizada
        num_samples = 2048
        t = np.arange(num_samples) / 2.4e6

        iq = np.zeros(num_samples, dtype=np.complex64)

        # Agregar componentes de frecuencia
        for peak_idx in peaks[:5]:  # Max 5 componentes
            freq = frequencies[peak_idx]
            mag = power[peak_idx]

            # Generar componente sinusoidal
            component = mag * np.exp(2j * np.pi * freq * t)
            iq += component

        # Normalizar
        iq = iq / (np.max(np.abs(iq)) + 1e-10)

        return iq

    except Exception as e:
        logger.error(f"Error creando IQ: {e}")
        return np.zeros(2048, dtype=np.complex64)