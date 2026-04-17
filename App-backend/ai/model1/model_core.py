from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np


BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
RUNTIME_DIR = BASE_DIR / "runtime"

LABEL_MAP = {
    0: "Normal",
    1: "Alerte",
    2: "Critique",
    3: "Maintenance",
}

STATE_ORDER = {
    "Normal": 0,
    "Alerte": 1,
    "Maintenance": 2,
    "Critique": 3,
}

APP_DEFAULT_THRESHOLDS = {
    "temperature": {"warningMin": 18.0, "warningMax": 27.0, "alertMin": 15.0, "alertMax": 30.0},
    "humidity": {"warningMin": 40.0, "warningMax": 60.0, "alertMin": 30.0, "alertMax": 70.0},
    "pressure": {"warningMin": 450.0, "warningMax": 900.0, "alertMin": 350.0, "alertMax": 1100.0},
    "vibration": {"warningMin": 0.0, "warningMax": 1.2, "alertMin": 0.0, "alertMax": 1.5},
    "gasLevel": {"warningMin": 0.0, "warningMax": 90.0, "alertMin": 0.0, "alertMax": 130.0},
}

MODEL_SPACE = {
    "temperature": {"nominal": (18.0, 27.0), "alert": (12.0, 38.0)},
    "humidity": {"nominal": (30.0, 60.0), "alert": (12.0, 82.0)},
    "pressure": {"nominal": (980.0, 1030.0), "alert": (975.0, 1045.0)},
    "vibration": {"nominal": (0.0, 0.6), "alert": (0.0, 1.0)},
    "gas": {"nominal": (50.0, 500.0), "alert": (0.0, 2500.0)},
}

CAUSE_LABELS = {
    "temperature": "temperature",
    "humidity": "humidite",
    "pressure": "gaz_co2",
    "vibration": "vibration",
    "gasLevel": "fumee",
}


def safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None:
            return default
        value = float(value)
        if np.isnan(value):
            return default
        return value
    except Exception:
        return default


def lerp(start: float, end: float, ratio: float) -> float:
    return start + (end - start) * ratio


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def load_model_bundle(prefer_runtime: bool = True) -> dict[str, Any]:
    runtime_files = {
        "model": RUNTIME_DIR / "model1_rf_runtime.pkl",
        "encoder": RUNTIME_DIR / "model1_le_node_runtime.pkl",
        "metadata": RUNTIME_DIR / "model1_metadata_runtime.json",
    }
    artifact_files = {
        "model": ARTIFACTS_DIR / "model1_rf_final.pkl",
        "encoder": ARTIFACTS_DIR / "model1_le_node_final.pkl",
        "metadata": ARTIFACTS_DIR / "model1_metadata_final.json",
    }

    files = runtime_files if prefer_runtime and all(path.exists() for path in runtime_files.values()) else artifact_files
    model = joblib.load(files["model"])
    encoder = joblib.load(files["encoder"])
    with open(files["metadata"], "r", encoding="utf-8") as handle:
        metadata = json.load(handle)

    return {
        "model": model,
        "encoder": encoder,
        "metadata": metadata,
        "source": "runtime" if files is runtime_files else "artifact",
        "version": metadata.get("version", "unknown"),
    }


def merge_thresholds(custom: dict[str, Any] | None = None) -> dict[str, dict[str, float]]:
    merged = {key: value.copy() for key, value in APP_DEFAULT_THRESHOLDS.items()}
    if not custom:
        return merged

    for key in merged:
        section = custom.get(key) or {}
        for field in ("warningMin", "warningMax", "alertMin", "alertMax"):
            if section.get(field) is not None:
                merged[key][field] = float(section[field])
    return merged


def piecewise_map(
    value: float | None,
    source_nominal: tuple[float, float],
    source_alert: tuple[float, float],
    target_nominal: tuple[float, float],
    target_alert: tuple[float, float],
) -> float:
    if value is None:
        return float(sum(target_nominal) / 2.0)

    src_low, src_high = source_nominal
    src_alert_low, src_alert_high = source_alert
    tgt_low, tgt_high = target_nominal
    tgt_alert_low, tgt_alert_high = target_alert

    if value < src_low:
        denom = max(src_low - src_alert_low, 1e-6)
        ratio = clamp((src_low - value) / denom, 0.0, 1.6)
        return lerp(tgt_low, tgt_alert_low, ratio)

    if value > src_high:
        denom = max(src_alert_high - src_high, 1e-6)
        ratio = clamp((value - src_high) / denom, 0.0, 1.6)
        return lerp(tgt_high, tgt_alert_high, ratio)

    ratio = clamp((value - src_low) / max(src_high - src_low, 1e-6), 0.0, 1.0)
    return lerp(tgt_low, tgt_high, ratio)


def map_delta(
    delta_value: float | None,
    source_nominal: tuple[float, float],
    target_nominal: tuple[float, float],
) -> float:
    if delta_value is None:
        return 0.0
    source_span = max(source_nominal[1] - source_nominal[0], 1e-6)
    target_span = max(target_nominal[1] - target_nominal[0], 1e-6)
    return float(delta_value) * (target_span / source_span)


def evaluate_metric_state(value: float | None, threshold: dict[str, float]) -> str:
    if value is None:
        return "Normal"
    if threshold.get("alertMin") is not None and value < threshold["alertMin"]:
        return "Critique"
    if threshold.get("alertMax") is not None and value > threshold["alertMax"]:
        return "Critique"
    if threshold.get("warningMin") is not None and value < threshold["warningMin"]:
        return "Alerte"
    if threshold.get("warningMax") is not None and value > threshold["warningMax"]:
        return "Alerte"
    return "Normal"


def metric_delta_limits(metric_name: str, threshold: dict[str, float]) -> tuple[float, float]:
    span = max(float(threshold["warningMax"]) - float(threshold["warningMin"]), 1.0)
    if metric_name == "temperature":
        return max(span * 0.12, 0.8), max(span * 0.28, 2.5)
    if metric_name == "humidity":
        return max(span * 0.14, 3.0), max(span * 0.3, 7.0)
    if metric_name == "pressure":
        return max(span * 0.08, 18.0), max(span * 0.18, 45.0)
    if metric_name == "gasLevel":
        return max(span * 0.1, 6.0), max(span * 0.24, 18.0)
    if metric_name == "vibration":
        return max(span * 0.15, 0.08), max(span * 0.3, 0.2)
    return 0.0, 0.0


def threshold_guard(payload: dict[str, Any], thresholds: dict[str, dict[str, float]]) -> tuple[str | None, str | None]:
    warning_hits = []
    critical_hits = []
    maintenance_hits = []

    delta_fields = {
        "temperature": safe_float(payload.get("deltaTemperature"), 0.0),
        "humidity": safe_float(payload.get("deltaHumidity"), 0.0),
        "pressure": safe_float(payload.get("deltaPressure"), 0.0),
        "gasLevel": safe_float(payload.get("deltaGasLevel"), 0.0),
        "vibration": safe_float(payload.get("deltaVibration"), 0.0),
    }

    for metric_name, threshold in thresholds.items():
        raw_value = safe_float(payload.get(metric_name))
        metric_state = evaluate_metric_state(raw_value, threshold)
        if metric_state == "Critique":
            critical_hits.append(metric_name)
        elif metric_state == "Alerte":
            warning_hits.append(metric_name)

        delta_warning, delta_critical = metric_delta_limits(metric_name, threshold)
        delta_value = abs(delta_fields.get(metric_name, 0.0) or 0.0)
        if delta_value >= delta_critical:
            critical_hits.append(metric_name)
        elif delta_value >= delta_warning:
            maintenance_hits.append(metric_name)

    if critical_hits:
        return "Critique", critical_hits[0]
    if warning_hits:
        return "Alerte", warning_hits[0]

    unique_maintenance = sorted(set(maintenance_hits))
    if len(unique_maintenance) >= 2:
        return "Maintenance", unique_maintenance[0]
    return None, None


def estimate_root_cause(payload: dict[str, Any], thresholds: dict[str, dict[str, float]]) -> str:
    best_metric = "none"
    best_score = 0.0

    delta_fields = {
        "temperature": safe_float(payload.get("deltaTemperature"), 0.0),
        "humidity": safe_float(payload.get("deltaHumidity"), 0.0),
        "pressure": safe_float(payload.get("deltaPressure"), 0.0),
        "gasLevel": safe_float(payload.get("deltaGasLevel"), 0.0),
        "vibration": safe_float(payload.get("deltaVibration"), 0.0),
    }

    for metric_name, threshold in thresholds.items():
        raw_value = safe_float(payload.get(metric_name))
        if raw_value is None:
            continue

        span = max(float(threshold["warningMax"]) - float(threshold["warningMin"]), 1e-6)
        score = 0.0
        if raw_value < threshold["warningMin"]:
            score = (threshold["warningMin"] - raw_value) / span
        elif raw_value > threshold["warningMax"]:
            score = (raw_value - threshold["warningMax"]) / span

        delta_warning, _ = metric_delta_limits(metric_name, threshold)
        delta_value = abs(delta_fields.get(metric_name, 0.0) or 0.0)
        if delta_warning > 0:
            score = max(score, delta_value / delta_warning)

        if score > best_score:
            best_score = score
            best_metric = metric_name

    return CAUSE_LABELS.get(best_metric, best_metric)


def build_feature_vector(bundle: dict[str, Any], payload: dict[str, Any]) -> tuple[np.ndarray, dict[str, float]]:
    thresholds = merge_thresholds(payload.get("thresholds"))
    metadata = bundle["metadata"]
    encoder = bundle["encoder"]

    raw_temperature = safe_float(payload.get("temperature"))
    raw_humidity = safe_float(payload.get("humidity"))
    raw_pressure = safe_float(payload.get("pressure"))
    raw_vibration = safe_float(payload.get("vibration"))
    raw_gas = safe_float(payload.get("gasLevel"))

    mapped_temperature = piecewise_map(
        raw_temperature,
        (thresholds["temperature"]["warningMin"], thresholds["temperature"]["warningMax"]),
        (thresholds["temperature"]["alertMin"], thresholds["temperature"]["alertMax"]),
        MODEL_SPACE["temperature"]["nominal"],
        MODEL_SPACE["temperature"]["alert"],
    )
    mapped_humidity = piecewise_map(
        raw_humidity,
        (thresholds["humidity"]["warningMin"], thresholds["humidity"]["warningMax"]),
        (thresholds["humidity"]["alertMin"], thresholds["humidity"]["alertMax"]),
        MODEL_SPACE["humidity"]["nominal"],
        MODEL_SPACE["humidity"]["alert"],
    )
    mapped_pressure = piecewise_map(
        raw_pressure,
        (thresholds["pressure"]["warningMin"], thresholds["pressure"]["warningMax"]),
        (thresholds["pressure"]["alertMin"], thresholds["pressure"]["alertMax"]),
        MODEL_SPACE["pressure"]["nominal"],
        MODEL_SPACE["pressure"]["alert"],
    )
    mapped_vibration = piecewise_map(
        raw_vibration,
        (thresholds["vibration"]["warningMin"], thresholds["vibration"]["warningMax"]),
        (thresholds["vibration"]["alertMin"], thresholds["vibration"]["alertMax"]),
        MODEL_SPACE["vibration"]["nominal"],
        MODEL_SPACE["vibration"]["alert"],
    )
    mapped_gas = piecewise_map(
        raw_gas,
        (thresholds["gasLevel"]["warningMin"], thresholds["gasLevel"]["warningMax"]),
        (thresholds["gasLevel"]["alertMin"], thresholds["gasLevel"]["alertMax"]),
        MODEL_SPACE["gas"]["nominal"],
        MODEL_SPACE["gas"]["alert"],
    )

    mapped_d_temperature = map_delta(
        safe_float(payload.get("deltaTemperature"), 0.0),
        (thresholds["temperature"]["warningMin"], thresholds["temperature"]["warningMax"]),
        MODEL_SPACE["temperature"]["nominal"],
    )
    mapped_d_humidity = map_delta(
        safe_float(payload.get("deltaHumidity"), 0.0),
        (thresholds["humidity"]["warningMin"], thresholds["humidity"]["warningMax"]),
        MODEL_SPACE["humidity"]["nominal"],
    )
    mapped_d_pressure = map_delta(
        safe_float(payload.get("deltaPressure"), 0.0),
        (thresholds["pressure"]["warningMin"], thresholds["pressure"]["warningMax"]),
        MODEL_SPACE["pressure"]["nominal"],
    )
    mapped_d_gas = map_delta(
        safe_float(payload.get("deltaGasLevel"), 0.0),
        (thresholds["gasLevel"]["warningMin"], thresholds["gasLevel"]["warningMax"]),
        MODEL_SPACE["gas"]["nominal"],
    )

    node_type = str(payload.get("nodeType") or "OTHER").upper().strip()
    if node_type not in set(map(str, encoder.classes_)):
        node_type = "OTHER"
    node_enc = int(encoder.transform([node_type])[0])

    nominal = metadata.get("nominal_thresholds", {})
    t_nom = nominal.get("temperature", [18.0, 27.0])
    h_nom = nominal.get("humidity", [30.0, 60.0])
    p_nom = nominal.get("pressure", [980.0, 1030.0])
    v_nom = nominal.get("vibration", [0.0, 0.6])
    g_nom = nominal.get("gas", [50.0, 500.0])

    def above(value: float, maximum: float) -> float:
        return max(0.0, value - maximum)

    def below(value: float, minimum: float) -> float:
        return max(0.0, minimum - value)

    vector = np.array(
        [[
            mapped_temperature,
            mapped_humidity,
            mapped_pressure,
            mapped_vibration,
            mapped_gas,
            mapped_d_temperature,
            mapped_d_humidity,
            mapped_d_pressure,
            mapped_d_gas,
            above(mapped_temperature, t_nom[1]),
            below(mapped_temperature, t_nom[0]),
            above(mapped_humidity, h_nom[1]),
            below(mapped_humidity, h_nom[0]),
            above(mapped_pressure, p_nom[1]),
            below(mapped_pressure, p_nom[0]),
            above(mapped_vibration, v_nom[1]),
            below(mapped_vibration, v_nom[0]),
            above(mapped_gas, g_nom[1]),
            below(mapped_gas, g_nom[0]),
            node_enc,
        ]],
        dtype=float,
    )

    mapped_inputs = {
        "temperature": round(mapped_temperature, 4),
        "humidity": round(mapped_humidity, 4),
        "pressure": round(mapped_pressure, 4),
        "vibration": round(mapped_vibration, 4),
        "gas": round(mapped_gas, 4),
        "d_temperature": round(mapped_d_temperature, 4),
        "d_humidity": round(mapped_d_humidity, 4),
        "d_pressure": round(mapped_d_pressure, 4),
        "d_gas": round(mapped_d_gas, 4),
        "node_enc": node_enc,
    }
    return vector, mapped_inputs


def recommendation_for(state_name: str, root_cause: str) -> str:
    if state_name == "Critique":
        return f"Intervenir immediatement sur {root_cause.replace('_', ' ')} et verifier le noeud concerne."
    if state_name == "Alerte":
        return f"Surveiller {root_cause.replace('_', ' ')} et preparer une action corrective rapide."
    if state_name == "Maintenance":
        return f"Planifier une maintenance preventive autour de {root_cause.replace('_', ' ')}."
    return "Aucune action urgente n'est requise. Continuer la surveillance standard."


def predict_one(bundle: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    model = bundle["model"]
    thresholds = merge_thresholds(payload.get("thresholds"))
    root_cause = estimate_root_cause(payload, thresholds)

    forced_state, forced_metric = threshold_guard(payload, thresholds)
    vector, mapped_inputs = build_feature_vector(bundle, payload)

    if forced_state is None:
        raw_prediction = int(model.predict(vector)[0])
        probabilities = model.predict_proba(vector)[0]
        state_name = LABEL_MAP.get(raw_prediction, "Normal")
        probability_map = {LABEL_MAP[i]: 0.0 for i in LABEL_MAP}
        for index, cls in enumerate(model.classes_):
            probability_map[LABEL_MAP[int(cls)]] = round(float(probabilities[index]), 4)
        confidence = round(float(max(probabilities)), 4)
        method = "model1"

        if state_name == "Normal":
            maintenance_signal, _ = threshold_guard(
                {
                    **payload,
                    "thresholds": thresholds,
                },
                thresholds,
            )
            if confidence < 0.45:
                state_name = "Maintenance"
                method = "model1_low_confidence"
            elif maintenance_signal == "Maintenance":
                state_name = "Maintenance"
                method = "model1_drift_guard"
    else:
        state_name = forced_state
        confidence = 1.0
        method = f"threshold_guard:{forced_metric or 'system'}"
        probability_map = {LABEL_MAP[i]: 0.0 for i in LABEL_MAP}
        state_code = next((code for code, label in LABEL_MAP.items() if label == state_name), 0)
        probability_map[LABEL_MAP[state_code]] = 1.0

    final_state = state_name
    state_code = next((code for code, label in LABEL_MAP.items() if label == final_state), 0)

    if final_state == "Normal" and root_cause != "none":
        for metric_name, threshold in thresholds.items():
            raw_value = safe_float(payload.get(metric_name))
            if evaluate_metric_state(raw_value, threshold) != "Normal":
                final_state = "Alerte"
                state_code = 1
                probability_map["Alerte"] = max(probability_map.get("Alerte", 0.0), 0.65)
                break

    return {
        "readingId": payload.get("readingId"),
        "nodeId": payload.get("nodeId"),
        "nodeName": payload.get("nodeName"),
        "zoneName": payload.get("zoneName"),
        "datacenter": payload.get("datacenter"),
        "nodeType": payload.get("nodeType"),
        "state": final_state,
        "stateCode": state_code,
        "confidence": confidence,
        "probabilities": probability_map,
        "rootCause": root_cause,
        "recommendation": recommendation_for(final_state, root_cause),
        "method": method,
        "modelVersion": bundle["version"],
        "modelSource": bundle["source"],
        "mappedInputs": mapped_inputs,
    }


def predict_batch(bundle: dict[str, Any], readings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [predict_one(bundle, reading) for reading in readings]

