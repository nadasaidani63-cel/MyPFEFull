"""
=============================================================================
MODEL 1 — Alert Classification (Normal / Alerte / Critique / Maintenance)
=============================================================================
Based on the AI architecture document for datacenter sensor monitoring.

STEPS:
  0. Load & clean the raw Excel data
  1. Feature engineering  (thresholds, deltas, temporal features)
  2. Auto-labelling       (rule-based → state_label)
  3. Train / Test split
  4. Train Random Forest  (with class balancing)
  5. Evaluate             (accuracy, classification report, confusion matrix)
  6. Explain              (feature importances)
  7. Predict function     (ready for FastAPI endpoint)
  8. Save model           (joblib → model1_rf.pkl)
=============================================================================
"""

import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 0 — LOAD DATA
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 60)
print("STEP 0 — Loading data")
print("=" * 60)

# Read only the 9 real columns (the rest are empty)
USECOLS = [
    "Date/Heure",
    "Data Centre ",
    "NodeID / ZoneID",
    "Température (°C)",
    "Humidité (%)",
    "Pression (hPa)",
    "Vibration (mm/s)",
    "Gaz (ppm)",
]

df = pd.read_excel("/home/claude/historique.xlsx", usecols=range(9))
df.columns = [
    "timestamp_ms",
    "datetime",
    "datacenter",
    "node_id",
    "temperature",
    "humidity",
    "pressure",
    "vibration",
    "gas",
]

print(f"  Raw rows loaded: {len(df):,}")
print(f"  Columns: {df.columns.tolist()}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — CLEAN DATA
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 1 — Cleaning")
print("=" * 60)

# Force numeric types
for col in ["temperature", "humidity", "pressure", "vibration", "gas"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")

# Drop rows missing all sensor values
df = df.dropna(subset=["temperature", "humidity"])
print(f"  Rows after dropping NaN sensors: {len(df):,}")

# Remove physically impossible outliers  
# (the dataset has extremely large values → sensor transmission errors)
# We keep realistic datacenter ranges:
BOUNDS = {
    "temperature": (0, 80),       # °C  — datacenters typically 18–35°C
    "humidity":    (0, 100),      # %
    "pressure":    (900, 1100),   # hPa
    "vibration":   (0, 10),       # mm/s
    "gas":         (0, 10000),    # ppm
}

before = len(df)
for col, (lo, hi) in BOUNDS.items():
    df = df[df[col].between(lo, hi) | df[col].isna()]

print(f"  Rows after outlier removal: {len(df):,}  (removed {before - len(df):,})")

# Fill remaining NaNs with column median (for pressure/vibration/gas which have nulls)
for col in ["pressure", "vibration", "gas"]:
    df[col] = df[col].fillna(df[col].median())

# Parse datetime
df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce")

print(f"  Date range: {df['datetime'].min()} → {df['datetime'].max()}")
print(f"  Datacenters: {df['datacenter'].unique()}")
print(f"  Unique nodes: {df['node_id'].nunique():,}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — FEATURE ENGINEERING
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 2 — Feature engineering")
print("=" * 60)

# Sort chronologically per node for delta computation
df = df.sort_values(["node_id", "datetime"]).reset_index(drop=True)

# 2a. Delta features (rate-of-change per node)
for col in ["temperature", "humidity", "pressure", "gas"]:
    df[f"delta_{col}"] = df.groupby("node_id")[col].diff().fillna(0)

# 2b. Threshold-delta features  (how far above/below the nominal range)
NOMINAL = {
    "temperature": (18, 27),   # normal datacenter operating range
    "humidity":    (30, 60),
    "pressure":    (980, 1030),
    "vibration":   (0, 0.6),
    "gas":         (50, 500),
}
for col, (lo, hi) in NOMINAL.items():
    df[f"above_{col}"] = (df[col] - hi).clip(lower=0)
    df[f"below_{col}"] = (lo - df[col]).clip(lower=0)

# 2c. Node type encoding  (SRV / NET / UPS / SIM etc.)
def extract_node_type(node_id):
    node_id = str(node_id).upper()
    for t in ["SRV", "NET", "UPS", "PDU", "COOL", "SIM", "STOR"]:
        if t in node_id:
            return t
    return "OTHER"

df["node_type"] = df["node_id"].apply(extract_node_type)

# 2d. Hour of day (temporal context)
df["hour"] = df["datetime"].dt.hour.fillna(12).astype(int)

# Encode node_type as integer
from sklearn.preprocessing import LabelEncoder
le_node = LabelEncoder()
df["node_type_enc"] = le_node.fit_transform(df["node_type"].fillna("OTHER"))

print(f"  Node types found: {df['node_type'].value_counts().to_dict()}")
print(f"  Features created: delta_*, above_*, below_*, node_type_enc, hour")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — AUTO-LABELLING  (rule-based ground truth)
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 3 — Auto-labelling (rule-based)")
print("=" * 60)

def auto_label(row):
    """
    Rules derived from typical datacenter SLA thresholds.
    Returns (state, root_cause)
    
    Classes:
        0 = Normal
        1 = Alerte       (soft threshold breach — monitor closely)
        2 = Critique     (hard threshold breach — action required)
        3 = Maintenance  (sensor anomaly pattern or prolonged drift)
    """
    t   = row["temperature"]
    h   = row["humidity"]
    p   = row["pressure"]
    v   = row["vibration"]
    g   = row["gas"]
    dt  = row["delta_temperature"]
    dh  = row["delta_humidity"]
    dg  = row["delta_gas"]

    root_cause = "none"

    # ── CRITIQUE ─────────────────────────────────────────────────────────────
    if t >= 40:
        return 2, "high_temperature_critical"
    if t <= 10:
        return 2, "low_temperature_critical"
    if h >= 85:
        return 2, "high_humidity_critical"
    if h <= 10:
        return 2, "low_humidity_critical"
    if v >= 1.2:
        return 2, "high_vibration_critical"
    if g >= 3000:
        return 2, "high_gas_critical"
    if abs(dt) >= 5:
        return 2, "rapid_temperature_change"
    if abs(dg) >= 500:
        return 2, "rapid_gas_change"

    # ── ALERTE ────────────────────────────────────────────────────────────────
    if t >= 30:
        return 1, "high_temperature_alert"
    if t <= 15:
        return 1, "low_temperature_alert"
    if h >= 70:
        return 1, "high_humidity_alert"
    if h <= 20:
        return 1, "low_humidity_alert"
    if v >= 0.8:
        return 1, "high_vibration_alert"
    if g >= 1000:
        return 1, "high_gas_alert"
    if abs(dt) >= 2:
        return 1, "temperature_drift"
    if abs(dh) >= 10:
        return 1, "humidity_drift"
    if p < 970 or p > 1050:
        return 1, "pressure_out_of_range"

    # ── MAINTENANCE ───────────────────────────────────────────────────────────
    # (repeated minor threshold breaches → sensor needs inspection)
    if 28 <= t < 30 and abs(dt) >= 1.5:
        return 3, "temperature_maintenance_drift"
    if 65 <= h < 70 and abs(dh) >= 5:
        return 3, "humidity_maintenance_drift"

    # ── NORMAL ────────────────────────────────────────────────────────────────
    return 0, "none"

result = df.apply(auto_label, axis=1, result_type="expand")
df["state_label"]   = result[0]
df["root_cause"]    = result[1]

label_map   = {0: "Normal", 1: "Alerte", 2: "Critique", 3: "Maintenance"}
state_counts = df["state_label"].value_counts().sort_index()
print("  Label distribution:")
for k, v in state_counts.items():
    print(f"    {k} - {label_map[k]:12s}: {v:6,} ({v/len(df)*100:.1f}%)")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — PREPARE FEATURES & SPLIT
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 4 — Train / Test split")
print("=" * 60)

FEATURE_COLS = [
    "temperature", "humidity", "pressure", "vibration", "gas",
    "delta_temperature", "delta_humidity", "delta_pressure", "delta_gas",
    "above_temperature", "below_temperature",
    "above_humidity", "below_humidity",
    "above_pressure", "below_pressure",
    "above_vibration", "below_vibration",
    "above_gas", "below_gas",
    "node_type_enc",
    "hour",
]

X = df[FEATURE_COLS].fillna(0).values
y = df["state_label"].values

from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"  Training samples: {len(X_train):,}")
print(f"  Test samples:     {len(X_test):,}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — TRAIN RANDOM FOREST
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 5 — Training Random Forest")
print("=" * 60)

from sklearn.ensemble import RandomForestClassifier

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=20,
    min_samples_leaf=5,
    class_weight="balanced",   # handles imbalanced classes
    n_jobs=-1,
    random_state=42,
)

model.fit(X_train, y_train)
print("  Model trained ✓")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — EVALUATE
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 6 — Evaluation")
print("=" * 60)

from sklearn.metrics import (
    classification_report, confusion_matrix, accuracy_score
)

y_pred  = model.predict(X_test)
y_proba = model.predict_proba(X_test)

acc = accuracy_score(y_test, y_pred)
print(f"\n  Accuracy: {acc*100:.2f}%\n")
print("  Classification Report:")
print(classification_report(
    y_test, y_pred,
    target_names=[label_map[i] for i in range(4)],
    zero_division=0
))

print("  Confusion Matrix (rows=actual, cols=predicted):")
cm = confusion_matrix(y_test, y_pred)
header = "           " + "  ".join(f"{label_map[i]:11s}" for i in range(4))
print(header)
for i, row in enumerate(cm):
    print(f"  {label_map[i]:10s} " + "  ".join(f"{v:11d}" for v in row))

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — FEATURE IMPORTANCES
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 7 — Feature importances (top 10)")
print("=" * 60)

importances = model.feature_importances_
sorted_idx  = np.argsort(importances)[::-1]
for i in range(min(10, len(FEATURE_COLS))):
    idx = sorted_idx[i]
    print(f"  {i+1:2d}. {FEATURE_COLS[idx]:30s}  {importances[idx]*100:.2f}%")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — PREDICTION FUNCTION  (FastAPI-ready)
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 8 — Predict function demo")
print("=" * 60)

def predict_alert(
    temperature: float,
    humidity: float,
    pressure: float = 1013.0,
    vibration: float = 0.3,
    gas: float = 200.0,
    delta_temperature: float = 0.0,
    delta_humidity: float = 0.0,
    delta_pressure: float = 0.0,
    delta_gas: float = 0.0,
    node_type: str = "SRV",
    hour: int = 12,
) -> dict:
    """
    Predict the alert state for a single sensor reading.
    Returns state, confidence, root_cause suggestion, and recommendations.
    """
    # Compute threshold features
    def above(val, hi): return max(0, val - hi)
    def below(val, lo): return max(0, lo - val)

    features = np.array([[
        temperature, humidity, pressure, vibration, gas,
        delta_temperature, delta_humidity, delta_pressure, delta_gas,
        above(temperature, 27), below(temperature, 18),
        above(humidity, 60),    below(humidity, 30),
        above(pressure, 1030),  below(pressure, 980),
        above(vibration, 0.6),  below(vibration, 0),
        above(gas, 500),        below(gas, 50),
        le_node.transform([node_type])[0] if node_type in le_node.classes_ else 0,
        hour,
    ]])

    state_idx  = model.predict(features)[0]
    proba      = model.predict_proba(features)[0]
    confidence = float(proba[state_idx])
    state_name = label_map[state_idx]

    # Basic cause & recommendation
    recommendations = {
        0: "Aucune action requise — système nominal.",
        1: "Surveiller de près — seuil d'alerte atteint. Vérifier le capteur concerné.",
        2: "ACTION IMMÉDIATE — seuil critique dépassé. Intervenir maintenant.",
        3: "Planifier une maintenance préventive — dérive détectée.",
    }

    return {
        "state": state_name,
        "state_code": int(state_idx),
        "confidence": round(confidence, 3),
        "probabilities": {
            label_map[i]: round(float(proba[i]), 3) for i in range(4)
        },
        "recommendation": recommendations[state_idx],
    }


# Demo predictions
examples = [
    dict(temperature=24, humidity=45, pressure=1013, vibration=0.3, gas=200,
         delta_temperature=0.1, node_type="SRV", hour=14),
    dict(temperature=38, humidity=75, pressure=1013, vibration=0.5, gas=500,
         delta_temperature=3.5, node_type="SRV", hour=23),
    dict(temperature=45, humidity=90, pressure=1013, vibration=1.5, gas=4000,
         delta_temperature=8.0, delta_gas=600, node_type="SRV", hour=3),
    dict(temperature=29, humidity=66, pressure=1013, vibration=0.3, gas=400,
         delta_temperature=1.8, delta_humidity=6, node_type="NET", hour=10),
]

descriptions = ["NORMAL reading", "ALERT reading", "CRITICAL reading", "MAINTENANCE reading"]

for desc, ex in zip(descriptions, examples):
    result = predict_alert(**ex)
    print(f"\n  [{desc}]")
    print(f"    Input: T={ex['temperature']}°C  H={ex['humidity']}%  Gas={ex['gas']}ppm  ΔT={ex.get('delta_temperature',0)}")
    print(f"    → State:      {result['state']}")
    print(f"    → Confidence: {result['confidence']*100:.1f}%")
    print(f"    → Probabilities: {result['probabilities']}")
    print(f"    → Action:     {result['recommendation']}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9 — SAVE MODEL
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 9 — Saving model")
print("=" * 60)

import joblib, json

joblib.dump(model,   "/home/claude/model1_rf.pkl")
joblib.dump(le_node, "/home/claude/model1_le_node.pkl")

metadata = {
    "model": "RandomForestClassifier",
    "n_estimators": 200,
    "max_depth": 20,
    "features": FEATURE_COLS,
    "classes": label_map,
    "label_thresholds": NOMINAL,
    "accuracy_test": round(acc, 4),
    "training_samples": len(X_train),
    "test_samples": len(X_test),
}
with open("/home/claude/model1_metadata.json", "w") as f:
    json.dump(metadata, f, indent=2)

print("  Saved: model1_rf.pkl")
print("  Saved: model1_le_node.pkl")
print("  Saved: model1_metadata.json")
print("\n✅  Model 1 pipeline complete!")
