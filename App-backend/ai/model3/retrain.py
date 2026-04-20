from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler

from model_core import FEATURE_NAMES, RISK_LEVELS, RUNTIME_DIR, ZONE_MAP, load_bundle


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        value = float(value)
        if np.isnan(value):
            return default
        return value
    except Exception:
        return default


def safe_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "y"}:
        return True
    if text in {"false", "0", "no", "n"}:
        return False
    return default


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def zone_encode(node_type: Any) -> int:
    return ZONE_MAP.get(str(node_type or "OTHER").upper().strip(), ZONE_MAP["OTHER"])


def derive_gas_proxy(smoke_ppm: Any, co2_ppm: Any) -> float:
    smoke_component = max(safe_float(smoke_ppm, 0.0), 0.0) * 4.0
    co2_component = max(safe_float(co2_ppm, 0.0), 0.0) * 0.45
    return float(max(smoke_component, co2_component))


def derive_rssi(row: pd.Series) -> float:
    is_online = safe_bool(row.get("isOnline"), True)
    status = str(row.get("nodeStatus") or "normal").strip().lower()
    vibration = safe_float(row.get("vibration"), 0.0)

    rssi = -67.0 if is_online else -89.0
    if status == "warning":
        rssi -= 4.0
    elif status == "alert":
        rssi -= 8.0
    elif status == "critical":
        rssi -= 12.0

    if vibration > 1.1:
        rssi -= 3.0

    return round(clamp(rssi, -95.0, -45.0), 2)


def load_app_dataset(app_csv_path: Path, max_rows: int) -> tuple[np.ndarray, pd.DataFrame, dict[str, Any]]:
    if not app_csv_path.exists():
        return np.empty((0, len(FEATURE_NAMES)), dtype=float), pd.DataFrame(), {"appRows": 0}

    dataframe = pd.read_csv(app_csv_path)
    if dataframe.empty:
        return np.empty((0, len(FEATURE_NAMES)), dtype=float), pd.DataFrame(), {"appRows": 0}

    rename_map = {
        "recorded_at": "recordedAt",
        "node_id": "nodeId",
        "node_name": "nodeName",
        "zone_name": "zoneName",
        "node_type": "nodeType",
        "gas_level": "gasLevel",
        "node_status": "nodeStatus",
        "is_online": "isOnline",
    }
    dataframe = dataframe.rename(columns=rename_map)
    dataframe["recordedAt"] = pd.to_datetime(dataframe["recordedAt"] if "recordedAt" in dataframe.columns else None, errors="coerce")
    dataframe = dataframe.dropna(subset=["recordedAt"]).sort_values(["nodeId", "recordedAt"])

    if max_rows > 0 and len(dataframe) > max_rows:
        dataframe = dataframe.tail(max_rows)

    for column in ("temperature", "humidity", "vibration", "gasLevel", "pressure"):
        series = dataframe[column] if column in dataframe.columns else pd.Series(np.nan, index=dataframe.index)
        dataframe[column] = pd.to_numeric(series, errors="coerce")

    dataframe["nodeType"] = (
        dataframe["nodeType"] if "nodeType" in dataframe.columns else pd.Series("OTHER", index=dataframe.index)
    ).fillna("OTHER").astype(str).str.upper()
    dataframe["nodeStatus"] = (
        dataframe["nodeStatus"] if "nodeStatus" in dataframe.columns else pd.Series("normal", index=dataframe.index)
    ).fillna("normal").astype(str)
    dataframe["isOnline"] = dataframe["isOnline"] if "isOnline" in dataframe.columns else pd.Series(True, index=dataframe.index)

    dataframe["temperature_c"] = dataframe["temperature"].fillna(24.0)
    dataframe["humidity_pct"] = dataframe["humidity"].fillna(45.0)
    dataframe["co2_ppm"] = dataframe["pressure"].fillna(450.0)
    dataframe["vibration_mm_s"] = dataframe["vibration"].fillna(0.0)
    dataframe["smoke_ppm"] = dataframe["gasLevel"].fillna(0.0)
    dataframe["gas_ppm"] = [
        derive_gas_proxy(smoke_ppm, co2_ppm)
        for smoke_ppm, co2_ppm in zip(dataframe["smoke_ppm"], dataframe["co2_ppm"])
    ]
    dataframe["rssi_dbm"] = dataframe.apply(derive_rssi, axis=1)
    dataframe["zone_enc"] = dataframe["nodeType"].map(zone_encode).fillna(ZONE_MAP["OTHER"]).astype(float)

    feature_frame = dataframe[FEATURE_NAMES].fillna(0.0).astype(float)
    stats = {
        "appRows": int(len(feature_frame)),
        "nodeCount": int(dataframe["nodeId"].nunique()),
        "zoneCounts": {
            str(zone): int(count)
            for zone, count in dataframe["nodeType"].value_counts(dropna=False).sort_index().items()
        },
    }
    return feature_frame.to_numpy(dtype=float), feature_frame, stats


def heuristic_risk_score(feature_frame: pd.DataFrame) -> np.ndarray:
    temperature = feature_frame["temperature_c"].to_numpy(dtype=float)
    humidity = feature_frame["humidity_pct"].to_numpy(dtype=float)
    co2_ppm = feature_frame["co2_ppm"].to_numpy(dtype=float)
    vibration = feature_frame["vibration_mm_s"].to_numpy(dtype=float)
    gas_ppm = feature_frame["gas_ppm"].to_numpy(dtype=float)
    rssi_dbm = feature_frame["rssi_dbm"].to_numpy(dtype=float)
    zone_enc = feature_frame["zone_enc"].to_numpy(dtype=float)

    return (
        np.clip((temperature - 27.0) / 2.5, 0.0, None)
        + np.clip((18.0 - temperature) / 3.0, 0.0, None) * 0.8
        + np.clip(np.abs(humidity - 45.0) / 15.0, 0.0, None) * 0.8
        + np.clip((co2_ppm - 650.0) / 250.0, 0.0, None) * 1.1
        + np.clip((gas_ppm - 220.0) / 110.0, 0.0, None) * 1.2
        + np.clip((vibration - 0.45) / 0.22, 0.0, None) * 1.3
        + np.clip((-75.0 - rssi_dbm) / 5.0, 0.0, None) * 0.7
        + np.where(zone_enc == ZONE_MAP["UPS"], 0.25, 0.0)
        + np.where(zone_enc == ZONE_MAP["NET"], 0.15, 0.0)
    )


def labels_from_absolute_score(score: np.ndarray) -> np.ndarray:
    labels = np.zeros(len(score), dtype=int)
    labels[score >= 1.20] = 1
    labels[score >= 2.40] = 2
    labels[score >= 3.60] = 3
    return labels


def labels_from_quantiles(score: np.ndarray) -> np.ndarray:
    if len(score) < 4:
        return np.zeros(len(score), dtype=int)
    q1, q2, q3 = np.quantile(score, [0.55, 0.80, 0.93])
    return np.digitize(score, [q1, q2, q3], right=False).astype(int)


def build_pseudo_labels(train_x: np.ndarray, feature_frame: pd.DataFrame) -> tuple[np.ndarray, dict[str, int]]:
    bundle = load_bundle(prefer_runtime=True)
    current_scaled = bundle["scaler"].transform(train_x)
    current_labels = bundle["model"].predict(current_scaled).astype(int)
    current_confidence = np.max(bundle["model"].predict_proba(current_scaled), axis=1) * 100.0

    heuristic_score = heuristic_risk_score(feature_frame)
    heuristic_labels = labels_from_absolute_score(heuristic_score)
    combined = np.where(current_confidence >= 65.0, np.maximum(current_labels, heuristic_labels), heuristic_labels).astype(int)

    if len(np.unique(combined)) < 2:
        combined = labels_from_quantiles(heuristic_score)

    counts = {
        RISK_LEVELS[label]: int(np.sum(combined == label))
        for label in sorted(set(int(item) for item in combined.tolist()))
    }
    return combined, counts


def train_runtime_model(payload: dict[str, Any]) -> dict[str, Any]:
    max_app_rows = int(payload.get("maxAppRows", 12000))
    min_app_rows = int(payload.get("minAppRows", 250))
    app_csv_path = Path(payload.get("appDatasetPath") or "")

    train_x, feature_frame, stats = load_app_dataset(app_csv_path, max_app_rows)
    if len(train_x) < min_app_rows:
        return {
            "success": False,
            "skipped": True,
            "reason": "insufficient_app_rows",
            **stats,
        }

    train_y, label_counts = build_pseudo_labels(train_x, feature_frame)
    if len(np.unique(train_y)) < 2:
        return {
            "success": False,
            "skipped": True,
            "reason": "insufficient_label_diversity",
            "appRows": int(len(train_x)),
            "labelCounts": label_counts,
        }

    scaler = StandardScaler()
    train_x_scaled = scaler.fit_transform(train_x)

    model = RandomForestClassifier(
        n_estimators=160,
        max_depth=12,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=1,
    )
    model.fit(train_x_scaled, train_y)

    train_pred = model.predict(train_x_scaled)
    train_accuracy = float(accuracy_score(train_y, train_pred))
    train_f1 = float(f1_score(train_y, train_pred, average="macro"))

    metadata = {
        "version": "model3-runtime",
        "featureNames": FEATURE_NAMES,
        "runtime": {
            "trainedAt": datetime.now(timezone.utc).isoformat(),
            "appRows": int(len(train_x)),
            "nodeCount": int(stats.get("nodeCount", 0)),
            "zoneCounts": stats.get("zoneCounts", {}),
            "labelCounts": label_counts,
            "pseudoLabeling": "artifact_predictions_plus_domain_heuristics",
            "trainAccuracy": round(train_accuracy, 4),
            "trainF1Macro": round(train_f1, 4),
        },
    }

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, RUNTIME_DIR / "model3_realistic_runtime.pkl")
    joblib.dump(scaler, RUNTIME_DIR / "model3_realistic_scaler_runtime.pkl")
    with open(RUNTIME_DIR / "model3_metadata_runtime.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    return {
        "success": True,
        "skipped": False,
        "appRows": int(len(train_x)),
        "nodeCount": int(stats.get("nodeCount", 0)),
        "labelCounts": label_counts,
        "trainAccuracy": round(train_accuracy, 4),
        "trainF1Macro": round(train_f1, 4),
        "runtimeMetadataPath": str((RUNTIME_DIR / "model3_metadata_runtime.json").resolve()),
    }


def main() -> int:
    payload = json.loads(sys.stdin.read() or "{}")
    result = train_runtime_model(payload)
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        sys.stderr.write(str(exc))
        raise
