from __future__ import annotations

import json
import warnings
from pathlib import Path
from typing import Any

import joblib
import numpy as np

try:
    from sklearn.exceptions import InconsistentVersionWarning

    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except Exception:
    pass


BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
RUNTIME_DIR = BASE_DIR / "runtime"

ZONE_MAP = {
    "SRV": 0,
    "NET": 1,
    "UPS": 2,
    "ENV": 3,
    "OTHER": 3,
}

FEATURE_NAMES = [
    "vibration_mm_s",
    "gas_ppm",
    "rssi_dbm",
    "roll3_gas_ppm",
    "delta_vibration_mm_s",
    "co2_ppm",
    "humidity_pct",
    "roll3_humidity_pct",
    "zone_enc",
]


def read_json_if_exists(path: Path, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        if not path.exists():
            return fallback or {}
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback or {}


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


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def load_bundle(prefer_runtime: bool = True) -> dict[str, Any]:
    runtime_model_path = RUNTIME_DIR / "model2_isolation_forest_runtime.pkl"
    runtime_scaler_path = RUNTIME_DIR / "model2_scaler_runtime.pkl"
    runtime_metadata_path = RUNTIME_DIR / "model2_metadata_runtime.json"

    if prefer_runtime and runtime_model_path.exists() and runtime_scaler_path.exists():
        model = joblib.load(runtime_model_path)
        scaler = joblib.load(runtime_scaler_path)
        metadata = read_json_if_exists(runtime_metadata_path, {})
        source = "runtime"
        version = metadata.get("version", "model2-runtime")
    else:
        model = joblib.load(ARTIFACTS_DIR / "model2_isolation_forest.pkl")
        scaler = joblib.load(ARTIFACTS_DIR / "model2_scaler.pkl")
        metadata = {
            "version": "provided-model2",
            "featureNames": FEATURE_NAMES,
        }
        source = "artifact"
        version = metadata["version"]

    return {
        "model": model,
        "scaler": scaler,
        "metadata": metadata,
        "source": source,
        "version": version,
        "featureCount": int(getattr(model, "n_features_in_", 9) or 9),
    }


def zone_encode(zone_code: Any) -> int:
    return ZONE_MAP.get(str(zone_code or "OTHER").upper().strip(), 3)


def estimate_root_cause(payload: dict[str, Any]) -> str:
    vibration = safe_float(payload.get("vibration_mm_s"), 0.0) or 0.0
    gas = safe_float(payload.get("gas_ppm"), 0.0) or 0.0
    smoke = safe_float(payload.get("smoke_ppm"), 0.0) or 0.0
    co2 = safe_float(payload.get("co2_ppm"), 0.0) or 0.0
    humidity = safe_float(payload.get("humidity_pct"), 45.0) or 45.0
    rssi = safe_float(payload.get("rssi_dbm"), -68.0) or -68.0
    delta_vibration = abs(safe_float(payload.get("delta_vibration_mm_s"), 0.0) or 0.0)

    scores = {
        "vibration": max(vibration / 0.65, delta_vibration / 0.18),
        "gaz": gas / 180.0,
        "gaz_co2": co2 / 950.0,
        "fumee": smoke / 90.0,
        "humidite": max(abs(humidity - 50.0) / 18.0, 0.0),
        "connectivite": max((-rssi - 72.0) / 8.0, 0.0),
    }
    return max(scores.items(), key=lambda item: item[1])[0]


def recommendation_for(state_name: str, root_cause: str) -> str:
    if state_name == "Critique":
        return f"Anomalie forte detectee autour de {root_cause}. Une verification immediate est recommandee."
    if state_name == "Alerte":
        return f"Comportement anormal observe sur {root_cause}. Renforcer la surveillance et planifier une inspection rapide."
    if state_name == "Maintenance":
        return f"Derive faible detectee sur {root_cause}. Prevoir une maintenance preventive."
    return "Aucune anomalie significative n'est detectee actuellement."


def build_feature_vector(bundle: dict[str, Any], payload: dict[str, Any]) -> np.ndarray:
    values = np.array(
        [[
            safe_float(payload.get("vibration_mm_s"), 0.0) or 0.0,
            safe_float(payload.get("gas_ppm"), 0.0) or 0.0,
            safe_float(payload.get("rssi_dbm"), -68.0) or -68.0,
            safe_float(payload.get("roll3_gas_ppm"), safe_float(payload.get("gas_ppm"), 0.0) or 0.0) or 0.0,
            safe_float(payload.get("delta_vibration_mm_s"), 0.0) or 0.0,
            safe_float(payload.get("co2_ppm"), 400.0) or 400.0,
            safe_float(payload.get("humidity_pct"), 45.0) or 45.0,
            safe_float(payload.get("roll3_humidity_pct"), safe_float(payload.get("humidity_pct"), 45.0) or 45.0) or 45.0,
            float(zone_encode(payload.get("zone_code") or payload.get("zone_enc"))),
        ]],
        dtype=float,
    )

    feature_count = int(bundle["featureCount"])
    if values.shape[1] != feature_count:
        values = values[:, :feature_count]
    return values


def predict_one(bundle: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    vector = build_feature_vector(bundle, payload)
    scaled = bundle["scaler"].transform(vector)
    raw_prediction = int(bundle["model"].predict(scaled)[0])
    decision = float(bundle["model"].decision_function(scaled)[0])
    is_anomaly = raw_prediction == -1
    anomaly_score = round(clamp((-decision + 0.1) * 200.0, 0.0, 100.0), 1)
    root_cause = estimate_root_cause(payload)

    if is_anomaly and anomaly_score >= 70:
        state_name = "Critique"
    elif is_anomaly and anomaly_score >= 45:
        state_name = "Alerte"
    elif is_anomaly:
        state_name = "Maintenance"
    else:
        state_name = "Normal"

    confidence = round(anomaly_score if is_anomaly else max(100.0 - anomaly_score, 55.0), 1)

    return {
        "readingId": payload.get("readingId"),
        "nodeId": payload.get("nodeId"),
        "nodeName": payload.get("nodeName"),
        "zoneName": payload.get("zoneName"),
        "datacenter": payload.get("datacenter"),
        "state": state_name,
        "stateLabel": state_name,
        "isAnomaly": is_anomaly,
        "anomalyScore": anomaly_score,
        "confidence": confidence,
        "rawDecision": round(decision, 6),
        "rootCause": root_cause,
        "recommendation": recommendation_for(state_name, root_cause),
        "method": "model2",
        "modelVersion": bundle["version"],
        "modelSource": bundle["source"],
    }


def predict_batch(bundle: dict[str, Any], readings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [predict_one(bundle, reading) for reading in readings]


def health_payload(bundle: dict[str, Any]) -> dict[str, Any]:
    runtime_metadata = bundle.get("metadata", {}).get("runtime", {})
    return {
        "available": True,
        "source": bundle["source"],
        "version": bundle["version"],
        "featureCount": bundle["featureCount"],
        "featureNames": FEATURE_NAMES[: bundle["featureCount"]],
        "trainedAt": runtime_metadata.get("trainedAt"),
    }
