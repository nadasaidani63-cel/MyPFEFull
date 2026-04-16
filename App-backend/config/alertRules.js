// Chaque règle retourne le "niveau" en fonction de la valeur
// niveau: "normal" | "warning" | "critical"
function levelTemp(v) {
  if (v < 15 || v > 30) return "critical";
  if ((v >= 27 && v <= 30) || (v >= 15 && v < 18)) return "warning";
  if (v >= 18 && v < 27) return "normal";
  return "normal";
}

function levelHum(v) {
  if (v < 30 || v > 70) return "critical";
  if ((v >= 30 && v < 40) || (v > 60 && v <= 70)) return "warning";
  if (v >= 40 && v <= 60) return "normal";
  return "normal";
}

function levelGas(v) {
  if (v > 500) return "critical";
  if (v >= 300 && v <= 500) return "warning";
  return "normal";
}

function levelPressure(v) {
  if (v < 970 || v > 1050) return "critical";
  if ((v >= 970 && v < 990) || (v > 1030 && v <= 1050)) return "warning";
  if (v >= 990 && v <= 1030) return "normal";
  return "normal";
}

// Vibration: baseline + %
// Ici on reçoit v (RMS) + baseline calculé (moyenne 10 min)
function levelVibration(v, baseline) {
  if (!baseline || baseline <= 0) return "normal";
  const ratio = v / baseline; // ex: 1.2 = +20%
  if (ratio > 1.5) return "critical";
  if (ratio > 1.2) return "warning";
  return "normal";
}

module.exports = {
  rules: [
    { key: "temp", type: "TEMP_DHT22", levelFn: (v) => levelTemp(v) },
    { key: "hum", type: "HUM_DHT22", levelFn: (v) => levelHum(v) },
    { key: "gas", type: "GAS_MQ2", levelFn: (v) => levelGas(v) },
    { key: "pressure", type: "PRESSURE_BMP280", levelFn: (v) => levelPressure(v) },
    // vibration est traitée à part car dépend baseline
  ],
  levelVibration,
};