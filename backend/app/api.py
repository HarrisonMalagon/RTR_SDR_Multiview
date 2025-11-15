"""API REST mejorada para RTL-SDR Multiview con Audio"""

from flask import Blueprint, request, jsonify
import logging
import base64
import numpy as np
from app.services.sdr_scanner import SDRScanner

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__)

# Instancia global del scanner
_scanner = None
_audio_demodulator = None


def set_scanner(scanner):
    """Asigna la instancia del scanner"""
    global _scanner
    _scanner = scanner


def set_audio_demodulator(demod):
    """Asigna el demodulador de audio"""
    global _audio_demodulator
    _audio_demodulator = demod


@api_bp.route("/device-info", methods=["GET"])
def get_device_info():
    """Obtiene informacion del dispositivo RTL-SDR"""
    try:
        if _scanner is None:
            info = {"error": "Scanner no inicializado"}
            return jsonify(info), 500

        info = _scanner.get_device_info()
        return jsonify(info), 200
    except Exception as e:
        logger.error(f"Error obteniendo info: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/scan", methods=["POST"])
def scan_frequency():
    """
    Inicia un escaneo de frecuencia

    Body JSON:
    {
        "start_freq": 900000000,
        "stop_freq": 910000000,
        "rbw": 100000,
        "num_averages": 5
    }
    """
    try:
        if _scanner is None:
            return jsonify({"error": "Scanner no inicializado"}), 500

        data = request.json
        start_freq = int(data.get("start_freq", 900e6))
        stop_freq = int(data.get("stop_freq", 910e6))
        rbw = int(data.get("rbw", 100000))
        num_averages = int(data.get("num_averages", 3))

        # Validaciones
        if start_freq >= stop_freq:
            return jsonify({"error": "start_freq debe ser menor que stop_freq"}), 400

        if (stop_freq - start_freq) < rbw:
            return jsonify({"error": "El span debe ser mayor que el RBW"}), 400

        # Realizar escaneo
        result = _scanner.scan_frequency_range(
            start_freq, stop_freq, rbw, num_averages
        )

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error en API scan: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/audio", methods=["POST"])
def get_audio():
    """
    Obtiene audio demodulado

    Body JSON:
    {
        "start_freq": 98000000,
        "stop_freq": 108000000,
        "rbw": 50000,
        "mode": "fm",
        "bandwidth_khz": 200
    }
    """
    try:
        if _scanner is None or _audio_demodulator is None:
            return jsonify({"error": "Sistema no inicializado"}), 500

        data = request.json
        start_freq = int(data.get("start_freq", 98e6))
        stop_freq = int(data.get("stop_freq", 108e6))
        rbw = int(data.get("rbw", 50000))
        mode = data.get("mode", "fm")
        bandwidth_khz = float(data.get("bandwidth_khz", 200))

        # Validaciones
        if start_freq >= stop_freq:
            return jsonify({"error": "start_freq >= stop_freq"}), 400

        if (stop_freq - start_freq) < rbw:
            return jsonify({"error": "span < rbw"}), 400

        # Realizar escaneo (y captura de IQ)
        result = _scanner.scan_frequency_range(
            start_freq, stop_freq, rbw, num_averages=1
        )

        # Obtener muestras IQ
        iq_samples = _scanner.get_iq_samples()

        if iq_samples is None:
            return jsonify({"error": "No IQ samples available"}), 500

        # Demodular
        audio = _audio_demodulator.demodulate(iq_samples, mode, bandwidth_khz)

        # Convertir a int16
        audio_int16 = (np.clip(audio * 32767, -32768, 32767)).astype(np.int16)

        # Enviar como base64
        audio_bytes = audio_int16.tobytes()
        audio_b64 = base64.b64encode(audio_bytes).decode()

        return jsonify({
            "audio": audio_b64,
            "sample_rate": 44100,
            "mode": mode,
            "max_power": result.get("max_power"),
            "max_freq": result.get("max_freq"),
        }), 200

    except Exception as e:
        logger.error(f"Error en audio: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/status", methods=["GET"])
def status():
    """Estado general del sistema"""
    try:
        if _scanner is None:
            device_status = "not_initialized"
        else:
            device_status = "ready"

        return jsonify({
            "server": "running",
            "version": "0.2.0",
            "device": device_status,
            "is_simulated": False if _scanner and _scanner.wrapper.is_real else True,
        }), 200
    except Exception as e:
        logger.error(f"Error en status: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/presets", methods=["GET"])
def get_presets():
    """Obtiene presets de escaneo preconfigurados"""
    presets = [
        {
            "name": "FM Radio",
            "start_freq": 88e6,
            "stop_freq": 108e6,
            "rbw": 50e3,
            "description": "Banda FM comercial",
        },
        {
            "name": "GSM-900",
            "start_freq": 890e6,
            "stop_freq": 915e6,
            "rbw": 100e3,
            "description": "GSM Downlink 900 MHz",
        },
        {
            "name": "WiFi 2.4 GHz",
            "start_freq": 2400e6,
            "stop_freq": 2500e6,
            "rbw": 1e6,
            "description": "Banda WiFi 2.4 GHz",
        },
        {
            "name": "ISM Band",
            "start_freq": 915e6,
            "stop_freq": 928e6,
            "rbw": 100e3,
            "description": "Banda ISM 915 MHz",
        },
        {
            "name": "ADS-B (Aviacion)",
            "start_freq": 1090e6,
            "stop_freq": 1090.5e6,
            "rbw": 25e3,
            "description": "Senales de aviacion ADS-B",
        },
    ]
    return jsonify(presets), 200


@api_bp.route("/analysis", methods=["POST"])
def analyze_spectrum():
    """
    Analisis adicional del espectro

    Body JSON:
    {
        "frequencies": [...],
        "power": [...]
    }
    """
    try:
        data = request.json
        frequencies = data.get("frequencies", [])
        power = data.get("power", [])

        if not frequencies or not power:
            return jsonify({"error": "Se requieren frequencies y power"}), 400

        # Analisis basico
        power_array = np.array(power)
        freq_array = np.array(frequencies)

        analysis = {
            "max_power": float(np.max(power_array)),
            "min_power": float(np.min(power_array)),
            "mean_power": float(np.mean(power_array)),
            "std_power": float(np.std(power_array)),
            "max_freq": float(freq_array[np.argmax(power_array)]),
        }

        return jsonify(analysis), 200

    except Exception as e:
        logger.error(f"Error en analisis: {e}")
        return jsonify({"error": str(e)}), 500