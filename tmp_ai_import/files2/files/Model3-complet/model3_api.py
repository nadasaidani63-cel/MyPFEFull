
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import numpy as np
from datetime import datetime
import uvicorn

# Initialisation FastAPI
app = FastAPI(
    title="Datacenter AI - Model 3 API",
    description="API d'analyse des risques datacenter — capteurs MQ2 (fumée + CO2)",
    version="1.1.0"
)

# Chargement des modèles au démarrage
try:
    model_risk  = joblib.load("model3_realistic_final.pkl")
    scaler_risk = joblib.load("model3_realistic_scaler.pkl")
    print("✅ Modèles chargés avec succès")
except Exception as e:
    print(f"❌ Erreur chargement modèles: {e}")
    model_risk  = None
    scaler_risk = None

# Modèles de données Pydantic
class SensorData(BaseModel):
    temperature_c:  float
    humidity_pct:   float
    smoke_ppm:      float   # MQ2 — détection fumée
    co2_ppm:        float   # MQ2 — concentration CO2
    vibration_mm_s: float
    gas_ppm:        float
    rssi_dbm:       float
    zone_enc:       int     # 0=SRV, 1=NET, 2=UPS, 3=ENV

    class Config:
        schema_extra = {
            "example": {
                "temperature_c":  28.5,
                "humidity_pct":   52.0,
                "smoke_ppm":      120.0,
                "co2_ppm":        550.0,
                "vibration_mm_s": 0.42,
                "gas_ppm":        310.0,
                "rssi_dbm":       -68.0,
                "zone_enc":       1
            }
        }

class RiskPrediction(BaseModel):
    success:       bool
    model:         str
    version:       str
    risk_level:    str
    risk_code:     int
    confidence:    float
    color:         str
    action:        str
    probabilities: dict
    timestamp:     str
    error:         str = None

# Fonction de prédiction
def predict_datacenter_risk(temperature, humidity, smoke, co2, vibration, gas, rssi, zone):
    """Prédiction du niveau de risque datacenter"""

    if model_risk is None or scaler_risk is None:
        raise HTTPException(status_code=500, detail="Modèles non chargés")

    # Validation des entrées
    if not (10 <= temperature <= 60):
        raise HTTPException(status_code=400, detail="Température hors limites (10-60°C)")
    if not (0 <= humidity <= 100):
        raise HTTPException(status_code=400, detail="Humidité hors limites (0-100%)")
    if not (0 <= smoke <= 2000):
        raise HTTPException(status_code=400, detail="Fumée hors limites (0-2000 ppm)")
    if not (300 <= co2 <= 5000):
        raise HTTPException(status_code=400, detail="CO2 hors limites (300-5000 ppm)")
    if not (0 <= vibration <= 3):
        raise HTTPException(status_code=400, detail="Vibration hors limites (0-3 mm/s)")
    if not (0 <= gas <= 2000):
        raise HTTPException(status_code=400, detail="Gaz hors limites (0-2000 ppm)")
    if not (-100 <= rssi <= -30):
        raise HTTPException(status_code=400, detail="RSSI hors limites (-100 à -30 dBm)")
    if zone not in [0, 1, 2, 3]:
        raise HTTPException(status_code=400, detail="Zone invalide (0-3)")

    # Préparer les features (ordre identique à l'entraînement)
    features        = np.array([[temperature, humidity, smoke, co2, vibration, gas, rssi, zone]])
    features_scaled = scaler_risk.transform(features)

    # Prédiction
    prediction    = model_risk.predict(features_scaled)[0]
    probabilities = model_risk.predict_proba(features_scaled)[0]
    confidence    = max(probabilities) * 100

    risk_mapping = {
        0: {"level": "FAIBLE",   "color": "🟢", "action": "Surveillance normale"},
        1: {"level": "MOYEN",    "color": "🟡", "action": "Surveillance renforcée - Planifier inspection"},
        2: {"level": "ÉLEVÉ",    "color": "🟠", "action": "Intervention rapide - Vérifier sous 4h"},
        3: {"level": "CRITIQUE", "color": "🔴", "action": "INTERVENTION IMMÉDIATE - Sécurité"}
    }

    result = risk_mapping[prediction]

    return {
        "risk_level":    result["level"],
        "risk_code":     int(prediction),
        "confidence":    round(confidence, 1),
        "color":         result["color"],
        "action":        result["action"],
        "probabilities": {
            "FAIBLE":   round(probabilities[0] * 100, 1),
            "MOYEN":    round(probabilities[1] * 100, 1),
            "ÉLEVÉ":    round(probabilities[2] * 100, 1),
            "CRITIQUE": round(probabilities[3] * 100, 1)
        }
    }

# Routes API
@app.get("/")
def home():
    return {
        "message":     "Datacenter AI - Model 3 API",
        "version":     "1.1.0",
        "description": "API d'analyse des risques datacenter",
        "sensors_mq2": {
            "smoke_ppm": "Détection fumée en ppm",
            "co2_ppm":   "Concentration CO2 en ppm"
        },
        "endpoints": [
            "/predict        — Prédiction du niveau de risque",
            "/batch_predict  — Prédiction en lot (max 100)",
            "/health         — État de l'API",
            "/docs           — Documentation interactive Swagger"
        ]
    }

@app.get("/health")
def health_check():
    return {
        "status":        "healthy" if model_risk is not None else "error",
        "timestamp":     datetime.now().isoformat(),
        "model_loaded":  model_risk is not None,
        "scaler_loaded": scaler_risk is not None
    }

@app.post("/predict", response_model=RiskPrediction)
def predict_risk(data: SensorData):
    """
    Prédiction du niveau de risque datacenter.

    Le capteur MQ2 fournit deux métriques distinctes :
    - smoke_ppm : concentration de particules de fumée
    - co2_ppm   : concentration de CO2 ambiant

    Returns:
        Niveau de risque FAIBLE / MOYEN / ÉLEVÉ / CRITIQUE
        avec score de confiance et action recommandée.
    """
    try:
        result = predict_datacenter_risk(
            temperature=data.temperature_c,
            humidity=data.humidity_pct,
            smoke=data.smoke_ppm,
            co2=data.co2_ppm,
            vibration=data.vibration_mm_s,
            gas=data.gas_ppm,
            rssi=data.rssi_dbm,
            zone=data.zone_enc
        )
        return RiskPrediction(
            success=True,
            model="Model 3 - Risk Analysis",
            version="1.1.0",
            risk_level=result["risk_level"],
            risk_code=result["risk_code"],
            confidence=result["confidence"],
            color=result["color"],
            action=result["action"],
            probabilities=result["probabilities"],
            timestamp=datetime.now().isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de prédiction: {str(e)}")

@app.post("/batch_predict")
def batch_predict(data_list: list[SensorData]):
    """Prédiction en lot pour plusieurs mesures (max 100)."""
    if len(data_list) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 prédictions par lot")

    results = []
    for i, data in enumerate(data_list):
        try:
            result = predict_datacenter_risk(
                data.temperature_c, data.humidity_pct,
                data.smoke_ppm,     data.co2_ppm,
                data.vibration_mm_s, data.gas_ppm,
                data.rssi_dbm,       data.zone_enc
            )
            results.append({"index": i, "success": True, "result": result})
        except Exception as e:
            results.append({"index": i, "success": False, "error": str(e)})

    return {
        "batch_size": len(data_list),
        "results":    results,
        "timestamp":  datetime.now().isoformat()
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
