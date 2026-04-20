
import joblib
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# ── Charger le modèle ─────────────────────────────────────────
model = joblib.load("model1_clean_features.pkl")

FEATURES = [
    "vibration_mm_s", "gas_ppm", "rssi_dbm",
    "roll3_gas_ppm", "delta_vibration_mm_s",
    "smoke_ppm", "co2_ppm",
    "humidity_pct", "roll3_humidity_pct", "zone_enc"
]

ZONE_MAP   = {"SRV": 0, "NET": 1, "UPS": 2, "ENV": 3}
LABEL_MAP  = {0: "Normal", 1: "Alerte", 2: "Critique", 3: "Maintenance"}
ACTIONS    = {
    "Normal":      "Aucune action requise — système nominal.",
    "Alerte":      "Surveiller de près. Planifier une inspection.",
    "Critique":    "INTERVENTION IMMÉDIATE requise.",
    "Maintenance": "Planifier une maintenance préventive.",
}
THRESHOLDS = {
    "temperature":  {"warning": 30,  "critical": 35,  "unit": "°C"},
    "humidity":     {"warning_min": 30, "warning_max": 60,
                     "critical_min": 20, "critical_max": 70, "unit": "%"},
    "vibration":    {"warning": 0.45, "critical": 0.65, "unit": "mm/s"},
    "gas":          {"warning": 700,  "critical": 900,  "unit": "ppm"},
    "smoke":        {"warning": 200,  "critical": 500,  "unit": "ppm",
                     "description": "Détection fumée — capteur MQ2"},
    "co2":          {"warning": 1000, "critical": 2000, "unit": "ppm",
                     "description": "Concentration CO2 — capteur MQ2"},
}

# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title       = "Datacenter AI — Modèle 1",
    description = "Classification des alertes capteurs : Normal / Alerte / Critique / Maintenance",
    version     = "1.1.0"
)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# ── Schémas ───────────────────────────────────────────────────
class SensorReading(BaseModel):
    vibration_mm_s:        float
    gas_ppm:               float
    rssi_dbm:              float
    smoke_ppm:             Optional[float] = 100.0   # MQ2 — fumée
    co2_ppm:               Optional[float] = 400.0   # MQ2 — CO2
    humidity_pct:          Optional[float] = 45.0
    delta_vibration_mm_s:  Optional[float] = 0.0
    roll3_gas_ppm:         Optional[float] = None
    roll3_humidity_pct:    Optional[float] = None
    zone_code:             Optional[str]   = "SRV"
    node_id:               Optional[str]   = None
    datacenter:            Optional[str]   = None

class BatchRequest(BaseModel):
    readings: list[SensorReading]

# ── Fonction de prédiction ────────────────────────────────────
def run_prediction(r: SensorReading):
    r3g  = r.roll3_gas_ppm      if r.roll3_gas_ppm      else r.gas_ppm
    r3h  = r.roll3_humidity_pct if r.roll3_humidity_pct else r.humidity_pct
    zone = ZONE_MAP.get(r.zone_code.upper(), 0)

    x = np.array([[
        r.vibration_mm_s, r.gas_ppm, r.rssi_dbm,
        r3g, r.delta_vibration_mm_s,
        r.smoke_ppm, r.co2_ppm,
        r.humidity_pct, r3h, zone
    ]])

    state_code = int(model.predict(x)[0])
    probas     = model.predict_proba(x)[0]
    confidence = float(probas[state_code])
    classes    = list(model.classes_)

    prob_dict = {LABEL_MAP[i]: 0.0 for i in range(4)}
    for i, c in enumerate(classes):
        prob_dict[LABEL_MAP[int(c)]] = round(float(probas[i]) * 100, 1)

    alerte_p   = prob_dict.get("Alerte", 0)
    critique_p = prob_dict.get("Critique", 0)
    uncertain  = (confidence < 0.70 and
                  state_code in [1, 2] and
                  abs(alerte_p - critique_p) < 25)

    state_name = LABEL_MAP[state_code]
    if uncertain:
        display = "Non-Normal (verification manuelle)"
        action  = "Incertitude entre Alerte et Critique. Inspection manuelle recommandee."
    else:
        display = state_name
        action  = ACTIONS[state_name]

    return {
        "node_id":       r.node_id,
        "datacenter":    r.datacenter,
        "state":         display,
        "state_code":    state_code,
        "confidence":    round(confidence * 100, 1),
        "uncertain":     uncertain,
        "action":        action,
        "probabilities": prob_dict,
        "model_info": {
            "accuracy_test":  "96.71%",
            "generalization": "85.02%",
            "features_used":  10,
        },
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

# ── Endpoints ─────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "service":   "Datacenter AI — Modèle 1",
        "version":   "1.1.0",
        "status":    "operational",
        "endpoints": ["/classify", "/classify/batch", "/health", "/thresholds"]
    }

@app.get("/health")
def health():
    return {
        "status":         "ok",
        "model":          "RandomForestClassifier",
        "n_estimators":   300,
        "features":       FEATURES,
        "classes":        list(LABEL_MAP.values()),
        "accuracy_test":  "96.71%",
        "generalization": "85.02%",
        "timestamp":      datetime.utcnow().isoformat() + "Z"
    }

@app.get("/thresholds")
def thresholds():
    return THRESHOLDS

@app.post("/classify")
def classify(reading: SensorReading):
    """
    Classifier une lecture capteur unique.
    Retourne l'état, la confiance, les probabilités par classe
    et l'action recommandée.
    """
    return run_prediction(reading)

@app.post("/classify/batch")
def classify_batch(batch: BatchRequest):
    """
    Classifier plusieurs lectures en une seule requête (max 500).
    Retourne un résumé + les résultats individuels.
    """
    if len(batch.readings) > 500:
        return {"error": "Maximum 500 lectures par batch"}

    results = [run_prediction(r) for r in batch.readings]

    counts = {"Normal": 0, "Alerte": 0, "Critique": 0,
              "Maintenance": 0, "Incertain": 0}
    for res in results:
        if res["uncertain"]:
            counts["Incertain"] += 1
        elif res["state"] in counts:
            counts[res["state"]] += 1

    critiques = [r for r in results if r["state_code"] == 2]

    return {
        "total":          len(results),
        "summary":        counts,
        "has_critical":   len(critiques) > 0,
        "critical_nodes": [r["node_id"] for r in critiques if r["node_id"]],
        "results":        results,
        "timestamp":      datetime.utcnow().isoformat() + "Z"
    }
