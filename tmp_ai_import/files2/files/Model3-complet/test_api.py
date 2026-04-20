
import requests
import json

# Configuration
BASE_URL = "http://localhost:8000"

def test_api():
    """Test complet de l'API Model 3"""
    print("🧪 TEST API MODEL 3")
    print("=" * 30)

    # Test 1: Health check
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"✅ Health: {response.json()['status']}")
    except Exception:
        print("❌ API non accessible — lancez d'abord ./start_api.sh")
        return

    # Test 2: Prédiction normale (risque FAIBLE)
    normal_data = {
        "temperature_c":  22.5,
        "humidity_pct":   48.0,
        "smoke_ppm":      75.0,    # MQ2 — faible fumée
        "co2_ppm":        410.0,   # MQ2 — CO2 ambiant normal
        "vibration_mm_s": 0.18,
        "gas_ppm":        140.0,
        "rssi_dbm":       -62.0,
        "zone_enc":       1
    }
    response = requests.post(f"{BASE_URL}/predict", json=normal_data)
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Normal    → {result['risk_level']:8s} ({result['confidence']}%) | {result['action']}")
    else:
        print(f"❌ Erreur: {response.status_code} — {response.text}")

    # Test 3: Prédiction alerte (risque MOYEN)
    alert_data = {
        "temperature_c":  30.5,
        "humidity_pct":   62.0,
        "smoke_ppm":      230.0,   # MQ2 — fumée détectée
        "co2_ppm":        750.0,   # MQ2 — CO2 élevé
        "vibration_mm_s": 0.50,
        "gas_ppm":        420.0,
        "rssi_dbm":       -72.0,
        "zone_enc":       0
    }
    response = requests.post(f"{BASE_URL}/predict", json=alert_data)
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Alerte    → {result['risk_level']:8s} ({result['confidence']}%) | {result['action']}")
    else:
        print(f"❌ Erreur: {response.status_code}")

    # Test 4: Prédiction critique (risque CRITIQUE)
    critical_data = {
        "temperature_c":  43.0,
        "humidity_pct":   68.0,
        "smoke_ppm":      540.0,   # MQ2 — forte fumée
        "co2_ppm":        1350.0,  # MQ2 — CO2 très élevé
        "vibration_mm_s": 1.40,
        "gas_ppm":        890.0,
        "rssi_dbm":       -82.0,
        "zone_enc":       0
    }
    response = requests.post(f"{BASE_URL}/predict", json=critical_data)
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Critique  → {result['risk_level']:8s} ({result['confidence']}%) | {result['action']}")
    else:
        print(f"❌ Erreur: {response.status_code}")

    # Test 5: Batch predict
    print("\n--- Batch predict (3 lectures) ---")
    batch = [normal_data, alert_data, critical_data]
    response = requests.post(f"{BASE_URL}/batch_predict", json=batch)
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Batch: {result['batch_size']} prédictions traitées")
        for r in result["results"]:
            lvl = r["result"]["risk_level"] if r["success"] else "ERREUR"
            print(f"   [{r['index']}] → {lvl}")
    else:
        print(f"❌ Erreur batch: {response.status_code}")

    print("\n🎉 Tests terminés!")

if __name__ == "__main__":
    test_api()
