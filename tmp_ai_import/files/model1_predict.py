"""
model1_predict.py  —  Model 1: Alert Classification
Production inference module.  Import and call predict_state().

Architecture: Random Forest + threshold guard layer
  Layer 1 (hard rules): if safety thresholds are clearly breached → force Critique or Alerte
  Layer 2 (ML model):   Random Forest for nuanced classification
"""

import numpy as np
import joblib
import json
import os
from datetime import datetime, timezone

_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Load artifacts ────────────────────────────────────────────────────────────
_model   = joblib.load(os.path.join(_DIR, "model1_rf_final.pkl"))
_le_node = joblib.load(os.path.join(_DIR, "model1_le_node_final.pkl"))
with open(os.path.join(_DIR, "model1_metadata_final.json")) as f:
    _META = json.load(f)

# ── Constants ─────────────────────────────────────────────────────────────────
LABEL_MAP = {0: "Normal", 1: "Alerte", 2: "Critique", 3: "Maintenance"}
NOMINAL   = _META["nominal_thresholds"]
FEATURES  = _META["features"]

RECOMMENDATIONS = {
    "Normal":      "Aucune action requise — système nominal.",
    "Alerte":      (
        "Surveiller de près — seuil d'alerte atteint. "
        "Planifier une vérification du capteur concerné."
    ),
    "Critique":    (
        "ACTION IMMÉDIATE REQUISE — seuil critique dépassé. "
        "Intervenir maintenant pour éviter une panne."
    ),
    "Maintenance": (
        "Planifier une maintenance préventive — dérive progressive détectée. "
        "Inspecter les capteurs de température et d'humidité."
    ),
}

# ── Threshold guard ──────────────────────────────────────────────────────────
def _threshold_override(t, h, p, v, g, dt, dh, dp, dg):
    """
    Deterministic rule layer applied BEFORE the ML model.
    Returns forced state (0-3) or None if no override applies.
    """
    # Hard Critique
    if (t >= 38 or t <= 12 or
            h >= 82 or h <= 12 or
            v >= 1.0 or
            g >= 2500 or
            abs(dt) >= 4 or
            abs(dg) >= 400):
        return 2, "threshold_override_critique"

    # Hard Alerte  (model is unreliable in the range 28–38°C with drift)
    if (t >= 28 or t <= 16 or
            h >= 68 or h <= 22 or
            v >= 0.7 or
            g >= 800 or
            abs(dt) >= 1.5 or
            abs(dh) >= 8 or
            p < 975 or p > 1045):
        return 1, "threshold_override_alerte"

    return None, None


def _root_cause(t, h, p, v, g, dt, dh, dg):
    """Heuristic: identify the most likely faulty sensor."""
    if t >= 38 or t <= 12:   return "temperature_out_of_range"
    if abs(dt) >= 4:         return "rapid_temperature_change"
    if h >= 82 or h <= 12:   return "humidity_out_of_range"
    if abs(dh) >= 8:         return "rapid_humidity_change"
    if v >= 1.0:             return "high_vibration"
    if g >= 2500:            return "high_gas_concentration"
    if abs(dg) >= 400:       return "rapid_gas_change"
    if t >= 28:              return "high_temperature"
    if t <= 16:              return "low_temperature"
    if h >= 68:              return "high_humidity"
    if h <= 22:              return "low_humidity"
    if v >= 0.7:             return "elevated_vibration"
    if g >= 800:             return "elevated_gas"
    if abs(dt) >= 1.5:       return "temperature_drift"
    if abs(dh) >= 5:         return "humidity_drift"
    if p < 975 or p > 1045:  return "pressure_anomaly"
    return "none"


# ── Main inference function ───────────────────────────────────────────────────
def predict_state(
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
    node_id: str = None,
    datacenter: str = None,
    confidence_threshold: float = 0.0,
) -> dict:
    """
    Classify a sensor reading into one of 4 states.

    Args:
        temperature:       °C
        humidity:          %
        pressure:          hPa (default 1013)
        vibration:         mm/s (default 0.3)
        gas:               ppm (default 200)
        delta_temperature: ΔT since last reading (°C)
        delta_humidity:    ΔH since last reading (%)
        delta_pressure:    ΔP since last reading (hPa)
        delta_gas:         ΔGas since last reading (ppm)
        node_type:         SRV / NET / UPS / PDU / COOL / STOR
        node_id:           optional node identifier (for tracing)
        datacenter:        optional datacenter name (for tracing)
        confidence_threshold: if model confidence < this, escalate one level

    Returns:
        dict with keys: state, state_code, confidence, probabilities,
                        root_cause, recommendation, node_id, datacenter, timestamp
    """
    t,  h,  p,  v,  g  = temperature, humidity, pressure, vibration, gas
    dt, dh, dp, dg = delta_temperature, delta_humidity, delta_pressure, delta_gas

    # ── Layer 1: threshold guard ──────────────────────────────────────────────
    forced_state, override_reason = _threshold_override(t, h, p, v, g, dt, dh, dp, dg)

    if forced_state is not None:
        state_code  = forced_state
        state_name  = LABEL_MAP[state_code]
        confidence  = 1.0
        prob_dict   = {LABEL_MAP[i]: 0.0 for i in range(4)}
        prob_dict[state_name] = 1.0
        method      = "rule_based"
    else:
        # ── Layer 2: ML model ─────────────────────────────────────────────────
        def ab(val, hi): return max(0.0, val - hi)
        def be(val, lo): return max(0.0, lo - val)
        nt = NOMINAL

        node = node_type.upper()
        if node not in _le_node.classes_:
            node = "OTHER"
        ne = int(_le_node.transform([node])[0])

        x = np.array([[
            t, h, p, v, g,
            dt, dh, dp, dg,
            ab(t, nt["temperature"][1]), be(t, nt["temperature"][0]),
            ab(h, nt["humidity"][1]),    be(h, nt["humidity"][0]),
            ab(p, nt["pressure"][1]),    be(p, nt["pressure"][0]),
            ab(v, nt["vibration"][1]),   be(v, nt["vibration"][0]),
            ab(g, nt["gas"][1]),         be(g, nt["gas"][0]),
            ne,
        ]])

        state_code = int(_model.predict(x)[0])
        proba      = _model.predict_proba(x)[0]
        classes    = list(_model.classes_)
        confidence = float(max(proba))

        prob_dict  = {LABEL_MAP[i]: 0.0 for i in range(4)}
        for ci, cls in enumerate(classes):
            prob_dict[LABEL_MAP[int(cls)]] = round(float(proba[ci]), 4)

        # Escalate if confidence is below threshold
        if confidence < confidence_threshold and state_code < 2:
            state_code += 1

        state_name = LABEL_MAP[state_code]
        method     = "ml_model"

    rc = _root_cause(t, h, p, v, g, dt, dh, dg)

    return {
        "state":          LABEL_MAP[state_code],
        "state_code":     state_code,
        "confidence":     round(confidence, 4),
        "probabilities":  prob_dict,
        "root_cause":     rc,
        "recommendation": RECOMMENDATIONS[LABEL_MAP[state_code]],
        "method":         method,
        "node_id":        node_id,
        "datacenter":     datacenter,
        "timestamp":      datetime.now(timezone.utc).isoformat(),
    }


# ── Convenience: batch predict ────────────────────────────────────────────────
def predict_batch(readings: list) -> list:
    """
    Classify a list of sensor reading dicts.
    Each dict has the same keys as predict_state() arguments.
    Returns a list of result dicts.
    """
    return [predict_state(**r) for r in readings]


# ── Quick self-test ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    TESTS = [
        ("Normal",            dict(temperature=24,  humidity=45,  vibration=0.3,  gas=200,  delta_temperature=0.1), "Normal"),
        ("Alert hot server",  dict(temperature=32,  humidity=45,  vibration=0.3,  gas=200,  delta_temperature=1.6), "Alerte"),
        ("Critical overheat", dict(temperature=42,  humidity=50,  vibration=0.5,  gas=300,  delta_temperature=5.5), "Critique"),
        ("Critical gas",      dict(temperature=24,  humidity=45,  vibration=0.3,  gas=3200, delta_gas=500),          "Critique"),
        ("Maintenance T",     dict(temperature=27,  humidity=45,  vibration=0.3,  gas=200,  delta_temperature=1.0),  "Maintenance"),
        ("Maintenance H",     dict(temperature=24,  humidity=65,  vibration=0.3,  gas=200,  delta_humidity=2.5),     "Maintenance"),
        ("Alert humidity",    dict(temperature=24,  humidity=71,  vibration=0.3,  gas=200),                          "Alerte"),
        ("Critical vib",      dict(temperature=24,  humidity=45,  vibration=1.1,  gas=200),                          "Critique"),
    ]

    print("=" * 65)
    print("  MODEL 1 — SELF TEST")
    print("=" * 65)
    passed = 0
    for name, kwargs, expected in TESTS:
        r   = predict_state(**kwargs)
        ok  = r["state"] == expected
        sym = "✓" if ok else "✗"
        if ok: passed += 1
        print(f"  {sym} {name:22s} → {r['state']:12s}  conf={r['confidence']:.2f}  [{r['method']}]")

    print(f"\n  {passed}/{len(TESTS)} tests passed")
    if passed == len(TESTS):
        print("  ✅ ALL PASS")
    else:
        print("  ⚠️  Some failures above")
