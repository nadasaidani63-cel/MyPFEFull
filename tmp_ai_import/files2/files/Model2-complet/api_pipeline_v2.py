
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ── Charger les modèles ───────────────────────────────────────
model1  = joblib.load("model1_clean_features.pkl")
model2  = joblib.load("model2_isolation_forest.pkl")
scaler2 = joblib.load("model2_scaler.pkl")

FEATURES = [
    "vibration_mm_s", "gas_ppm", "rssi_dbm", "roll3_gas_ppm",
    "delta_vibration_mm_s", "smoke_ppm", "co2_ppm",
    "humidity_pct", "roll3_humidity_pct", "zone_enc"
]

ZONE_MAP  = {"SRV": 0, "NET": 1, "UPS": 2, "ENV": 3}
LABEL_MAP = {0: "Normal", 1: "Alerte", 2: "Critique", 3: "Maintenance"}
THRESHOLDS = {
    "vibration": {"warning": 0.45, "critical": 0.65, "unit": "mm/s"},
    "gas":       {"warning": 700,  "critical": 900,  "unit": "ppm"},
    "rssi":      {"normal_min": -75, "warning": -80,  "unit": "dBm"},
    "smoke":     {"warning": 200,  "critical": 500,  "unit": "ppm",
                  "description": "Détection fumée — capteur MQ2"},
    "co2":       {"warning": 1000, "critical": 2000, "unit": "ppm",
                  "description": "Concentration CO2 — capteur MQ2"},
}

# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title       = "Datacenter AI — Pipeline Complet",
    description = "Modèle 1 (Classification) + Modèle 2 (Détection anomalies)",
    version     = "2.1.0"
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
    readings: List[SensorReading]

# ── Fonction prédiction complète ──────────────────────────────
def predict_complete(r: SensorReading):
    r3g  = r.roll3_gas_ppm      or r.gas_ppm
    r3h  = r.roll3_humidity_pct or r.humidity_pct
    zone = ZONE_MAP.get(r.zone_code.upper(), 0)

    x = np.array([[
        r.vibration_mm_s, r.gas_ppm, r.rssi_dbm,
        r3g, r.delta_vibration_mm_s,
        r.smoke_ppm, r.co2_ppm,
        r.humidity_pct, r3h, zone
    ]])

    # ── Modèle 1 : classification ─────────────────────────────
    state_code  = int(model1.predict(x)[0])
    probas1     = model1.predict_proba(x)[0]
    confidence1 = round(float(probas1[state_code]) * 100, 1)
    state_name  = LABEL_MAP[state_code]

    # ── Modèle 2 : détection anomalie ─────────────────────────
    x_scaled      = scaler2.transform(x)
    anomaly_raw   = model2.predict(x_scaled)[0]
    anomaly_score = model2.decision_function(x_scaled)[0]
    is_anomaly    = anomaly_raw == -1
    anomaly_pct   = round(max(0, min(100, (-anomaly_score + 0.1) * 200)), 1)

    # ── Logique de priorité ───────────────────────────────────
    if state_code == 0 and not is_anomaly:
        interpretation = "Système nominal — aucune action requise"
        priority       = "aucune"
        action_code    = 0
    elif state_code == 0 and is_anomaly:
        interpretation = "ATTENTION — comportement anormal non classifié"
        priority       = "haute"
        action_code    = 3
    elif state_code == 1 and not is_anomaly:
        interpretation = "Alerte standard — surveiller le capteur"
        priority       = "normale"
        action_code    = 1
    elif state_code == 1 and is_anomaly:
        interpretation = "Alerte avec anomalie — inspecter rapidement"
        priority       = "haute"
        action_code    = 3
    elif state_code == 2 and is_anomaly:
        interpretation = "CRITIQUE — anomalie confirmée par deux modèles"
        priority       = "urgente"
        action_code    = 4
    elif state_code == 2 and not is_anomaly:
        interpretation = "Critique — intervention immédiate requise"
        priority       = "urgente"
        action_code    = 4
    elif state_code == 3 and is_anomaly:
        interpretation = "Maintenance + anomalie — inspecter rapidement"
        priority       = "haute"
        action_code    = 3
    else:
        interpretation = "Maintenance préventive — planifier intervention"
        priority       = "normale"
        action_code    = 2

    return {
        "node_id":        r.node_id,
        "datacenter":     r.datacenter,
        "timestamp":      datetime.utcnow().isoformat() + "Z",
        "state":          state_name,
        "state_code":     state_code,
        "priority":       priority,
        "action_code":    action_code,
        "interpretation": interpretation,
        "model1": {
            "confidence": confidence1,
            "probabilities": {
                "Normal":      round(float(probas1[0]) * 100, 1),
                "Alerte":      round(float(probas1[1]) * 100, 1),
                "Critique":    round(float(probas1[2]) * 100, 1),
                "Maintenance": round(float(probas1[3]) * 100, 1),
            }
        },
        "model2": {
            "is_anomaly":    is_anomaly,
            "anomaly_score": anomaly_pct,
            "confidence":    round(100 - anomaly_pct, 1)
        }
    }

# ── Endpoints ─────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "service":  "Datacenter AI — Pipeline Complet",
        "version":  "2.1.0",
        "models": {
            "model1": "RandomForest (Classification)",
            "model2": "IsolationForest (Anomalie)"
        },
        "endpoints": ["/analyze", "/analyze/batch", "/health", "/models"]
    }

@app.get("/health")
def health():
    return {
        "status": "operational",
        "models": {
            "classification": {
                "type":          "RandomForestClassifier",
                "n_estimators":  300,
                "features":      10,
                "accuracy_test": "97.75%",
                "external_data": "84.85%"
            },
            "anomaly": {
                "type":              "IsolationForest",
                "n_estimators":      200,
                "test_normal":       "90.9%",
                "test_anomaly":      "95.6%",
                "external_normal":   "97.5%",
                "external_anomaly":  "96.7%"
            }
        },
        "thresholds": THRESHOLDS,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/models")
def models_info():
    return {
        "model1_classification": {
            "algorithm": "Random Forest",
            "task":      "4-class classification",
            "classes":   list(LABEL_MAP.values()),
            "features":  FEATURES,
            "performance": {
                "train_acc": "97.69%",
                "test_acc":  "97.75%",
                "external":  "84.85%"
            }
        },
        "model2_anomaly": {
            "algorithm": "Isolation Forest",
            "task":      "Anomaly detection",
            "training":  "Unsupervised (normal data only)",
            "performance": {
                "normal_detection":  "90.9%",
                "anomaly_detection": "95.6%",
                "external_normal":   "97.5%",
                "external_anomaly":  "96.7%"
            }
        }
    }

@app.post("/analyze")
def analyze_sensor(reading: SensorReading):
    """
    Analyse complète d'une lecture capteur :
    - Classification de l'état (Normal/Alerte/Critique/Maintenance)
    - Détection d'anomalie
    - Priorité et action recommandée
    """
    return predict_complete(reading)

@app.post("/analyze/batch")
def analyze_batch(batch: BatchRequest):
    """
    Analyse en lot de plusieurs lectures capteurs (max 1000).
    Retourne un résumé + alertes prioritaires.
    """
    if len(batch.readings) > 1000:
        raise HTTPException(status_code=400,
                            detail="Maximum 1000 lectures par batch")

    results  = [predict_complete(r) for r in batch.readings]
    counts   = {"aucune": 0, "normale": 0, "haute": 0, "urgente": 0}
    urgents  = []
    anomalies = []

    for res in results:
        counts[res["priority"]] += 1
        if res["priority"] == "urgente":
            urgents.append(res["node_id"])
        if res["model2"]["is_anomaly"]:
            anomalies.append(res["node_id"])

    alerts = {
        "critical_nodes":  [r["node_id"] for r in results if r["state_code"] == 2],
        "urgent_priority": urgents,
        "anomalies":       anomalies,
        "total_issues":    counts["haute"] + counts["urgente"]
    }

    return {
        "total":           len(results),
        "summary":         counts,
        "alerts":          alerts,
        "requires_action": len(urgents) > 0,
        "results":         results,
        "timestamp":       datetime.utcnow().isoformat() + "Z"
    }
