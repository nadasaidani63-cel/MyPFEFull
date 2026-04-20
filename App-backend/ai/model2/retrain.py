from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from model_core import FEATURE_NAMES, RUNTIME_DIR, ZONE_MAP


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
    smoke_component = max(safe_float(smoke_ppm, 0.0), 0.0) * 1.6
    co2_component = max(safe_float(co2_ppm, 0.0), 0.0) * 0.18
    return float(max(smoke_component, co2_component))


def derive_rssi(row: pd.Series) -> float:
    is_online = safe_bool(row.get("isOnline"), True)
    status = str(row.get("nodeStatus") or "normal").strip().lower()
    vibration = safe_float(row.get("vibration"), 0.0)
    active_alert_count = int(max(0.0, safe_float(row.get("activeAlertCount"), 0.0)))

    rssi = -66.0 if is_online else -88.0
    if status == "warning":
        rssi -= 5.0
    elif status == "alert":
        rssi -= 9.0
    elif status == "critical":
        rssi -= 13.0

    if vibration > 1.1:
        rssi -= 3.0

    if pd.isna(row.get("lastPing")):
        rssi -= 4.0

    rssi -= min(active_alert_count * 2.0, 8.0)
    return round(clamp(rssi, -95.0, -45.0), 2)


def load_app_dataset(app_csv_path: Path, max_rows: int) -> tuple[np.ndarray, dict[str, Any]]:
    if not app_csv_path.exists():
        return np.empty((0, len(FEATURE_NAMES)), dtype=float), {"appRows": 0}

    dataframe = pd.read_csv(app_csv_path)
    if dataframe.empty:
        return np.empty((0, len(FEATURE_NAMES)), dtype=float), {"appRows": 0}

    rename_map = {
        "recorded_at": "recordedAt",
        "node_id": "nodeId",
        "node_name": "nodeName",
        "zone_name": "zoneName",
        "node_type": "nodeType",
        "gas_level": "gasLevel",
        "node_status": "nodeStatus",
        "is_online": "isOnline",
        "last_ping": "lastPing",
        "active_alert_count": "activeAlertCount",
    }
    dataframe = dataframe.rename(columns=rename_map)
    dataframe["recordedAt"] = pd.to_datetime(dataframe["recordedAt"] if "recordedAt" in dataframe.columns else None, errors="coerce")
    dataframe["lastPing"] = pd.to_datetime(dataframe["lastPing"] if "lastPing" in dataframe.columns else None, errors="coerce")
    dataframe = dataframe.dropna(subset=["recordedAt"]).sort_values(["nodeId", "recordedAt"])

    if max_rows > 0 and len(dataframe) > max_rows:
        dataframe = dataframe.tail(max_rows)

    for column in ("humidity", "vibration", "gasLevel", "pressure", "activeAlertCount"):
        series = dataframe[column] if column in dataframe.columns else pd.Series(np.nan, index=dataframe.index)
        dataframe[column] = pd.to_numeric(series, errors="coerce")

    dataframe["nodeType"] = (
        dataframe["nodeType"] if "nodeType" in dataframe.columns else pd.Series("OTHER", index=dataframe.index)
    ).fillna("OTHER").astype(str).str.upper()
    dataframe["nodeStatus"] = (
        dataframe["nodeStatus"] if "nodeStatus" in dataframe.columns else pd.Series("normal", index=dataframe.index)
    ).fillna("normal").astype(str)
    dataframe["isOnline"] = dataframe["isOnline"] if "isOnline" in dataframe.columns else pd.Series(True, index=dataframe.index)

    dataframe["smoke_ppm"] = dataframe["gasLevel"].fillna(0.0)
    dataframe["co2_ppm"] = dataframe["pressure"].fillna(400.0)
    dataframe["gas_ppm"] = [
        derive_gas_proxy(smoke_ppm, co2_ppm)
        for smoke_ppm, co2_ppm in zip(dataframe["smoke_ppm"], dataframe["co2_ppm"])
    ]
    dataframe["roll3_gas_ppm"] = dataframe.groupby("nodeId")["gas_ppm"].transform(
        lambda series: series.rolling(3, min_periods=1).mean()
    )
    dataframe["vibration_mm_s"] = dataframe["vibration"].fillna(0.0)
    dataframe["delta_vibration_mm_s"] = dataframe.groupby("nodeId")["vibration_mm_s"].diff().fillna(0.0)
    dataframe["humidity_pct"] = dataframe["humidity"].fillna(45.0)
    dataframe["roll3_humidity_pct"] = dataframe.groupby("nodeId")["humidity_pct"].transform(
        lambda series: series.rolling(3, min_periods=1).mean()
    )
    dataframe["zone_enc"] = dataframe["nodeType"].map(zone_encode).fillna(ZONE_MAP["OTHER"]).astype(float)
    dataframe["rssi_dbm"] = dataframe.apply(derive_rssi, axis=1)

    feature_frame = dataframe[FEATURE_NAMES].fillna(0.0).astype(float)
    dataset = feature_frame.to_numpy(dtype=float)
    stats = {
        "appRows": int(len(feature_frame)),
        "nodeCount": int(dataframe["nodeId"].nunique()),
        "zoneCounts": {
            str(zone): int(count)
            for zone, count in dataframe["nodeType"].value_counts(dropna=False).sort_index().items()
        },
    }
    return dataset, stats


def train_runtime_model(payload: dict[str, Any]) -> dict[str, Any]:
    max_app_rows = int(payload.get("maxAppRows", 12000))
    min_app_rows = int(payload.get("minAppRows", 250))
    contamination = float(payload.get("contamination", 0.10))
    contamination = float(clamp(contamination, 0.02, 0.25))
    app_csv_path = Path(payload.get("appDatasetPath") or "")

    train_x, stats = load_app_dataset(app_csv_path, max_app_rows)
    if len(train_x) < min_app_rows:
        return {
            "success": False,
            "skipped": True,
            "reason": "insufficient_app_rows",
            **stats,
        }

    scaler = StandardScaler()
    train_x_scaled = scaler.fit_transform(train_x)

    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=1,
    )
    model.fit(train_x_scaled)

    decisions = model.decision_function(train_x_scaled)
    predictions = model.predict(train_x_scaled)
    anomaly_rate = float(np.mean(predictions == -1))

    metadata = {
        "version": "model2-runtime",
        "featureNames": FEATURE_NAMES,
        "runtime": {
            "trainedAt": datetime.now(timezone.utc).isoformat(),
            "appRows": int(len(train_x)),
            "nodeCount": int(stats.get("nodeCount", 0)),
            "zoneCounts": stats.get("zoneCounts", {}),
            "contamination": contamination,
            "decisionMean": round(float(np.mean(decisions)), 6),
            "decisionStd": round(float(np.std(decisions)), 6),
            "detectedAnomalyRate": round(anomaly_rate, 4),
        },
    }

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, RUNTIME_DIR / "model2_isolation_forest_runtime.pkl")
    joblib.dump(scaler, RUNTIME_DIR / "model2_scaler_runtime.pkl")
    with open(RUNTIME_DIR / "model2_metadata_runtime.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    return {
        "success": True,
        "skipped": False,
        "appRows": int(len(train_x)),
        "nodeCount": int(stats.get("nodeCount", 0)),
        "contamination": contamination,
        "detectedAnomalyRate": round(anomaly_rate, 4),
        "runtimeMetadataPath": str((RUNTIME_DIR / "model2_metadata_runtime.json").resolve()),
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
