from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score

from model_core import (
    APP_DEFAULT_THRESHOLDS,
    ARTIFACTS_DIR,
    LABEL_MAP,
    RUNTIME_DIR,
    build_feature_vector,
    load_model_bundle,
    predict_one,
)


def load_bootstrap_dataset(csv_path: Path) -> tuple[np.ndarray, np.ndarray]:
    dataframe = pd.read_csv(csv_path)
    required = ["temperature", "humidity", "pressure", "vibration", "gas", "d_temperature", "d_humidity", "d_pressure", "d_gas", "node_enc", "label"]
    missing = [column for column in required if column not in dataframe.columns]
    if missing:
        raise RuntimeError(f"Bootstrap dataset is missing columns: {missing}")

    nominal = load_model_bundle(prefer_runtime=False)["metadata"].get("nominal_thresholds", {})
    t_nom = nominal.get("temperature", [18.0, 27.0])
    h_nom = nominal.get("humidity", [30.0, 60.0])
    p_nom = nominal.get("pressure", [980.0, 1030.0])
    v_nom = nominal.get("vibration", [0.0, 0.6])
    g_nom = nominal.get("gas", [50.0, 500.0])

    def above(value: float, maximum: float) -> float:
        return max(0.0, float(value) - float(maximum))

    def below(value: float, minimum: float) -> float:
        return max(0.0, float(minimum) - float(value))

    features = []
    labels = []
    for row in dataframe.itertuples(index=False):
        features.append([
            float(row.temperature),
            float(row.humidity),
            float(row.pressure),
            float(row.vibration),
            float(row.gas),
            float(row.d_temperature),
            float(row.d_humidity),
            float(row.d_pressure),
            float(row.d_gas),
            above(row.temperature, t_nom[1]),
            below(row.temperature, t_nom[0]),
            above(row.humidity, h_nom[1]),
            below(row.humidity, h_nom[0]),
            above(row.pressure, p_nom[1]),
            below(row.pressure, p_nom[0]),
            above(row.vibration, v_nom[1]),
            below(row.vibration, v_nom[0]),
            above(row.gas, g_nom[1]),
            below(row.gas, g_nom[0]),
            int(row.node_enc),
        ])
        labels.append(int(row.label))
    return np.asarray(features, dtype=float), np.asarray(labels, dtype=int)


def load_app_dataset(app_csv_path: Path, bundle: dict, max_rows: int) -> tuple[np.ndarray, np.ndarray, Counter]:
    if not app_csv_path.exists():
        return np.empty((0, 20), dtype=float), np.empty((0,), dtype=int), Counter()

    dataframe = pd.read_csv(app_csv_path)
    if dataframe.empty:
        return np.empty((0, 20), dtype=float), np.empty((0,), dtype=int), Counter()

    rename_map = {
        "gas_level": "gasLevel",
        "recorded_at": "recordedAt",
        "node_type": "nodeType",
        "node_id": "nodeId",
        "node_name": "nodeName",
        "zone_name": "zoneName",
    }
    dataframe = dataframe.rename(columns=rename_map)
    dataframe["recordedAt"] = pd.to_datetime(dataframe["recordedAt"], errors="coerce")
    dataframe = dataframe.dropna(subset=["recordedAt"]).sort_values(["nodeId", "recordedAt"])
    if max_rows > 0 and len(dataframe) > max_rows:
        dataframe = dataframe.tail(max_rows)

    for metric in ("temperature", "humidity", "pressure", "vibration", "gasLevel"):
        dataframe[metric] = pd.to_numeric(dataframe[metric], errors="coerce")

    dataframe["deltaTemperature"] = dataframe.groupby("nodeId")["temperature"].diff().fillna(0.0)
    dataframe["deltaHumidity"] = dataframe.groupby("nodeId")["humidity"].diff().fillna(0.0)
    dataframe["deltaPressure"] = dataframe.groupby("nodeId")["pressure"].diff().fillna(0.0)
    dataframe["deltaGasLevel"] = dataframe.groupby("nodeId")["gasLevel"].diff().fillna(0.0)
    dataframe["deltaVibration"] = dataframe.groupby("nodeId")["vibration"].diff().fillna(0.0)

    features = []
    labels = []
    counts = Counter()
    for row in dataframe.itertuples(index=False):
        payload = {
            "temperature": getattr(row, "temperature", None),
            "humidity": getattr(row, "humidity", None),
            "pressure": getattr(row, "pressure", None),
            "vibration": getattr(row, "vibration", None),
            "gasLevel": getattr(row, "gasLevel", None),
            "deltaTemperature": getattr(row, "deltaTemperature", 0.0),
            "deltaHumidity": getattr(row, "deltaHumidity", 0.0),
            "deltaPressure": getattr(row, "deltaPressure", 0.0),
            "deltaGasLevel": getattr(row, "deltaGasLevel", 0.0),
            "deltaVibration": getattr(row, "deltaVibration", 0.0),
            "nodeType": getattr(row, "nodeType", "OTHER"),
            "thresholds": APP_DEFAULT_THRESHOLDS,
        }
        prediction = predict_one(bundle, payload)
        vector, _ = build_feature_vector(bundle, payload)
        features.append(vector[0])
        labels.append(int(prediction["stateCode"]))
        counts[prediction["state"]] += 1

    return np.asarray(features, dtype=float), np.asarray(labels, dtype=int), counts


def train_runtime_model(payload: dict) -> dict:
    max_app_rows = int(payload.get("maxAppRows", 12000))
    min_app_rows = int(payload.get("minAppRows", 250))
    bootstrap_csv_path = Path(payload.get("bootstrapCsvPath") or (ARTIFACTS_DIR / "synthetic_maintenance_v2.csv"))
    app_csv_path = Path(payload.get("appDatasetPath") or "")

    bootstrap_x, bootstrap_y = load_bootstrap_dataset(bootstrap_csv_path)
    bundle = load_model_bundle(prefer_runtime=True)
    app_x, app_y, app_counts = load_app_dataset(app_csv_path, bundle, max_app_rows)

    if len(app_y) < min_app_rows:
        return {
            "success": False,
            "skipped": True,
            "reason": "insufficient_app_rows",
            "bootstrapRows": int(len(bootstrap_y)),
            "appRows": int(len(app_y)),
        }

    train_x = np.vstack([bootstrap_x, app_x])
    train_y = np.concatenate([bootstrap_y, app_y])

    model = RandomForestClassifier(
        n_estimators=220,
        max_depth=20,
        min_samples_leaf=4,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=42,
    )
    model.fit(train_x, train_y)

    train_pred = model.predict(train_x)
    train_accuracy = float(accuracy_score(train_y, train_pred))
    train_f1 = float(f1_score(train_y, train_pred, average="macro"))

    metadata = bundle["metadata"].copy()
    metadata["version"] = f"{bundle['metadata'].get('version', '3.0')}-runtime"
    metadata["runtime"] = {
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "bootstrapRows": int(len(bootstrap_y)),
        "appRows": int(len(app_y)),
        "trainAccuracy": round(train_accuracy, 4),
        "trainF1Macro": round(train_f1, 4),
        "appLabelCounts": {key: int(value) for key, value in sorted(app_counts.items())},
    }

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, RUNTIME_DIR / "model1_rf_runtime.pkl")
    joblib.dump(bundle["encoder"], RUNTIME_DIR / "model1_le_node_runtime.pkl")
    with open(RUNTIME_DIR / "model1_metadata_runtime.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    return {
        "success": True,
        "skipped": False,
        "bootstrapRows": int(len(bootstrap_y)),
        "appRows": int(len(app_y)),
        "trainAccuracy": round(train_accuracy, 4),
        "trainF1Macro": round(train_f1, 4),
        "appLabelCounts": {key: int(value) for key, value in sorted(app_counts.items())},
        "runtimeMetadataPath": str((RUNTIME_DIR / "model1_metadata_runtime.json").resolve()),
    }


def main() -> int:
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}
    result = train_runtime_model(payload)
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        sys.stderr.write(str(exc))
        raise

