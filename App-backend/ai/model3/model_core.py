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

RISK_LEVELS = {
    0: "FAIBLE",
    1: "MOYEN",
    2: "ELEVE",
    3: "CRITIQUE",
}

RISK_SCORES = {
    "FAIBLE": 18,
    "MOYEN": 48,
    "ELEVE": 76,
    "CRITIQUE": 96,
}

RISK_ACTIONS = {
    "FAIBLE": "Surveillance normale.",
    "MOYEN": "Surveillance renforcee et inspection a planifier.",
    "ELEVE": "Intervention rapide recommandee sous quelques heures.",
    "CRITIQUE": "Intervention immediate requise pour la securite.",
}

FEATURE_NAMES = [
    "temperature_c",
    "humidity_pct",
    "co2_ppm",
    "vibration_mm_s",
    "gas_ppm",
    "rssi_dbm",
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


def load_bundle(prefer_runtime: bool = True) -> dict[str, Any]:
    runtime_model_path = RUNTIME_DIR / "model3_realistic_runtime.pkl"
    runtime_scaler_path = RUNTIME_DIR / "model3_realistic_scaler_runtime.pkl"
    runtime_metadata_path = RUNTIME_DIR / "model3_metadata_runtime.json"

    if prefer_runtime and runtime_model_path.exists() and runtime_scaler_path.exists():
        model = joblib.load(runtime_model_path)
        scaler = joblib.load(runtime_scaler_path)
        metadata = read_json_if_exists(runtime_metadata_path, {})
        source = "runtime"
        version = metadata.get("version", "model3-runtime")
    else:
        model = joblib.load(ARTIFACTS_DIR / "model3_realistic_final.pkl")
        scaler = joblib.load(ARTIFACTS_DIR / "model3_realistic_scaler.pkl")
        metadata = {
            "version": "provided-model3",
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
        "featureCount": int(getattr(model, "n_features_in_", 7) or 7),
    }


def zone_encode(zone_code: Any) -> int:
    return ZONE_MAP.get(str(zone_code or "OTHER").upper().strip(), 3)


def build_feature_vector(bundle: dict[str, Any], payload: dict[str, Any]) -> np.ndarray:
    values = np.array(
        [[
            safe_float(payload.get("temperature_c"), 24.0) or 24.0,
            safe_float(payload.get("humidity_pct"), 45.0) or 45.0,
            safe_float(payload.get("co2_ppm"), 450.0) or 450.0,
            safe_float(payload.get("vibration_mm_s"), 0.0) or 0.0,
            safe_float(payload.get("gas_ppm"), 140.0) or 140.0,
            safe_float(payload.get("rssi_dbm"), -68.0) or -68.0,
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
    predicted_code = int(bundle["model"].predict(scaled)[0])
    probabilities = bundle["model"].predict_proba(scaled)[0]
    risk_level = RISK_LEVELS.get(predicted_code, "FAIBLE")
    confidence = round(float(max(probabilities)) * 100.0, 1)
    probability_map = {label: 0.0 for label in RISK_LEVELS.values()}
    for index, class_code in enumerate(bundle["model"].classes_):
        probability_map[RISK_LEVELS[int(class_code)]] = round(float(probabilities[index]) * 100.0, 1)

    return {
        "readingId": payload.get("readingId"),
        "nodeId": payload.get("nodeId"),
        "nodeName": payload.get("nodeName"),
        "zoneName": payload.get("zoneName"),
        "datacenter": payload.get("datacenter"),
        "riskLevel": risk_level,
        "riskCode": predicted_code,
        "riskScore": RISK_SCORES[risk_level],
        "confidence": confidence,
        "action": RISK_ACTIONS[risk_level],
        "probabilities": probability_map,
        "method": "model3",
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
        "riskLevels": list(RISK_LEVELS.values()),
        "trainedAt": runtime_metadata.get("trainedAt"),
    }
