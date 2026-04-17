"""
=============================================================================
FastAPI — Model 1: Alert Classification Endpoint
=============================================================================
Endpoints:
  POST /classify       → classify a single sensor reading
  POST /classify/batch → classify a list of readings (up to 100)
  GET  /health         → health check + model metadata
  GET  /thresholds     → return the nominal threshold table

Run locally:
  pip install fastapi uvicorn
  python api_model1.py
  → http://localhost:8000/docs
=============================================================================
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, validator
from typing import Optional, List
import numpy as np
import joblib
import json
import os
from datetime import datetime

# ─── Load model ──────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

model   = joblib.load(os.path.join(BASE_DIR, "model1_rf_v2.pkl"))
le_node = joblib.load(os.path.join(BASE_DIR, "model1_le_node.pkl"))
with open(os.path.join(BASE_DIR, "model1_metadata_v2.json")) as f:
    METADATA = json.load(f)

LABEL_MAP     = {0: "Normal", 1: "Alerte", 2: "Critique", 3: "Maintenance"}
FEATURES      = METADATA["features"]
NOMINAL       = METADATA["nominal_thresholds"]

RECOMMENDATIONS = {
    "Normal":      "Aucune action requise — système nominal.",
    "Alerte":      "Surveiller de près. Vérifier le capteur concerné et planifier une inspection.",
    "Critique":    "ACTION IMMÉDIATE REQUISE — seuil critique dépassé. Intervenir maintenant.",
    "Maintenance": "Planifier une maintenance préventive — dérive progressive détectée.",
}

ROOT_CAUSE_RULES = [
    # (condition_fn, root_cause_label)
    (lambda r: r["temperature"] >= 38,              "high_temperature_critical"),
    (lambda r: r["temperature"] <= 12,              "low_temperature_critical"),
    (lambda r: r["humidity"] >= 82,                 "high_humidity_critical"),
    (lambda r: r["humidity"] <= 12,                 "low_humidity_critical"),
    (lambda r: r["vibration"] >= 1.0,               "high_vibration_critical"),
    (lambda r: r["gas"] >= 2500,                    "high_gas_critical"),
    (lambda r: abs(r.get("delta_temperature", 0)) >= 4, "rapid_temperature_change"),
    (lambda r: abs(r.get("delta_gas", 0)) >= 400,   "rapid_gas_change"),
    (lambda r: r["temperature"] >= 28,              "high_temperature_alert"),
    (lambda r: r["temperature"] <= 16,              "low_temperature_alert"),
    (lambda r: r["humidity"] >= 68,                 "high_humidity_alert"),
    (lambda r: r["humidity"] <= 22,                 "low_humidity_alert"),
    (lambda r: r["vibration"] >= 0.7,               "high_vibration_alert"),
    (lambda r: r["gas"] >= 800,                     "high_gas_alert"),
    (lambda r: abs(r.get("delta_temperature", 0)) >= 1.5, "temperature_drift_alert"),
    (lambda r: abs(r.get("delta_humidity", 0)) >= 8, "humidity_drift_alert"),
]


# ─── Pydantic schemas ─────────────────────────────────────────────────────────
class SensorReading(BaseModel):
    temperature:       float  = Field(..., ge=-40, le=100,  description="Température en °C")
    humidity:          float  = Field(..., ge=0,   le=100,  description="Humidité relative en %")
    pressure:          float  = Field(1013.0, ge=800, le=1200, description="Pression atmosphérique en hPa")
    vibration:         float  = Field(0.3,    ge=0,   le=20,   description="Vibration en mm/s")
    gas:               float  = Field(200.0,  ge=0,   le=100000, description="Concentration gaz en ppm")
    delta_temperature: float  = Field(0.0,    description="ΔTempérature depuis dernière mesure (°C)")
    delta_humidity:    float  = Field(0.0,    description="ΔHumidité depuis dernière mesure (%)")
    delta_pressure:    float  = Field(0.0,    description="ΔPression depuis dernière mesure (hPa)")
    delta_gas:         float  = Field(0.0,    description="ΔGaz depuis dernière mesure (ppm)")
    node_type:         str    = Field("SRV",  description="Type de nœud (SRV/NET/UPS/PDU/COOL/STOR)")
    node_id:           Optional[str] = Field(None, description="Identifiant du nœud")
    datacenter:        Optional[str] = Field(None, description="Nom du datacenter")


class PredictionResult(BaseModel):
    state:           str
    state_code:      int
    confidence:      float
    probabilities:   dict
    root_cause:      str
    recommendation:  str
    node_id:         Optional[str]
    datacenter:      Optional[str]
    timestamp:       str


class BatchRequest(BaseModel):
    readings: List[SensorReading] = Field(..., max_items=100)


class BatchResult(BaseModel):
    results:         List[PredictionResult]
    summary:         dict
    processing_time_ms: float


# ─── Helper functions ─────────────────────────────────────────────────────────
def build_feature_vector(reading: SensorReading) -> np.ndarray:
    """Convert a SensorReading into the model's feature vector."""
    t, h, p, v, g = reading.temperature, reading.humidity, reading.pressure, reading.vibration, reading.gas
    dt = reading.delta_temperature
    dh = reading.delta_humidity
    dp = reading.delta_pressure
    dg = reading.delta_gas

    def above(val, hi): return max(0.0, val - hi)
    def below(val, lo): return max(0.0, lo - val)

    nom_t, nom_h, nom_p, nom_v, nom_g = NOMINAL["temperature"], NOMINAL["humidity"], \
        NOMINAL["pressure"], NOMINAL["vibration"], NOMINAL["gas"]

    node_upper = reading.node_type.upper()
    if node_upper not in le_node.classes_:
        node_upper = "OTHER"
    node_enc = int(le_node.transform([node_upper])[0])

    return np.array([[
        t, h, p, v, g,
        dt, dh, dp, dg,
        above(t, nom_t[1]), below(t, nom_t[0]),
        above(h, nom_h[1]), below(h, nom_h[0]),
        above(p, nom_p[1]), below(p, nom_p[0]),
        above(v, nom_v[1]), below(v, nom_v[0]),
        above(g, nom_g[1]), below(g, nom_g[0]),
        node_enc,
    ]])


def detect_root_cause(reading_dict: dict) -> str:
    """Return the first matching root cause rule."""
    for condition, cause in ROOT_CAUSE_RULES:
        try:
            if condition(reading_dict):
                return cause
        except Exception:
            continue
    return "none"


def run_inference(reading: SensorReading) -> PredictionResult:
    features     = build_feature_vector(reading)
    state_idx    = int(model.predict(features)[0])
    proba        = model.predict_proba(features)[0]

    # Map probabilities to all 4 classes (model might not have seen all)
    classes      = list(model.classes_)
    prob_dict    = {LABEL_MAP[i]: 0.0 for i in range(4)}
    for ci, cls in enumerate(classes):
        prob_dict[LABEL_MAP[cls]] = round(float(proba[ci]), 4)

    state_name   = LABEL_MAP[state_idx]
    confidence   = round(float(max(proba)), 4)

    reading_dict = reading.dict()
    root_cause   = detect_root_cause(reading_dict)

    return PredictionResult(
        state          = state_name,
        state_code     = state_idx,
        confidence     = confidence,
        probabilities  = prob_dict,
        root_cause     = root_cause,
        recommendation = RECOMMENDATIONS[state_name],
        node_id        = reading.node_id,
        datacenter     = reading.datacenter,
        timestamp      = datetime.utcnow().isoformat() + "Z",
    )


# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(
    title        = "Datacenter AI — Model 1: Classification des alertes",
    description  = "Classifie chaque lecture capteur en Normal / Alerte / Critique / Maintenance",
    version      = "2.0",
)


@app.get("/health", summary="Health check & model info")
def health():
    return {
        "status":       "ok",
        "model":        "RandomForestClassifier",
        "version":      METADATA.get("version", "2.0"),
        "accuracy":     METADATA["metrics"]["accuracy"],
        "f1_macro":     METADATA["metrics"]["f1_macro"],
        "classes":      list(LABEL_MAP.values()),
        "n_features":   len(FEATURES),
        "n_estimators": METADATA.get("n_estimators", 200),
    }


@app.get("/thresholds", summary="Nominal operating thresholds")
def thresholds():
    result = {}
    for sensor, (lo, hi) in NOMINAL.items():
        result[sensor] = {"nominal_min": lo, "nominal_max": hi, "unit": {
            "temperature": "°C", "humidity": "%", "pressure": "hPa",
            "vibration": "mm/s", "gas": "ppm",
        }.get(sensor, "")}
    return result


@app.post("/classify", response_model=PredictionResult, summary="Classify a single sensor reading")
def classify(reading: SensorReading):
    """
    Classify a single sensor reading and return:
    - **state**: Normal / Alerte / Critique / Maintenance
    - **confidence**: model confidence score (0–1)
    - **probabilities**: per-class probabilities
    - **root_cause**: most likely sensor responsible for the state
    - **recommendation**: action to take
    """
    try:
        return run_inference(reading)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@app.post("/classify/batch", response_model=BatchResult, summary="Classify up to 100 readings at once")
def classify_batch(batch: BatchRequest):
    """Batch classify multiple sensor readings in a single request (max 100)."""
    import time
    start = time.time()

    results = [run_inference(r) for r in batch.readings]

    counts = {"Normal": 0, "Alerte": 0, "Critique": 0, "Maintenance": 0}
    for r in results:
        counts[r.state] = counts.get(r.state, 0) + 1

    elapsed_ms = round((time.time() - start) * 1000, 2)

    return BatchResult(
        results             = results,
        summary             = {
            "total":           len(results),
            "counts":          counts,
            "critical_count":  counts.get("Critique", 0),
            "alert_count":     counts.get("Alerte", 0),
        },
        processing_time_ms  = elapsed_ms,
    )


# ─── Standalone run ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
