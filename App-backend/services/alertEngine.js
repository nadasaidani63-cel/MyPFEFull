import Alert from "../models/Alert.js";

const MIN_DURATION = { warning: 30_000, critical: 10_000 }; // ms
const COOLDOWN = 60_000; // ms

// mémoire: suivi des anomalies avant déclenchement + anti-spam
// key = `${nodeId}:${metricName}`
const trackers = new Map();

function nowMs() { return Date.now(); }

function getLevelAndThreshold(metricName, value, baseline) {
  // DHT22 Temp
  if (metricName === "temperature") {
    if (value < 15 || value > 30) return { severity: "critical", thresholdExceeded: value < 15 ? 15 : 30 };
    if ((value >= 27 && value <= 30) || (value >= 15 && value < 18)) return { severity: "warning", thresholdExceeded: value >= 27 ? 27 : 18 };
    return { severity: "normal" };
  }

  // DHT22 Humidity
  if (metricName === "humidity") {
    if (value < 30 || value > 70) return { severity: "critical", thresholdExceeded: value < 30 ? 30 : 70 };
    if ((value >= 30 && value < 40) || (value > 60 && value <= 70)) return { severity: "warning", thresholdExceeded: value >= 60 ? 60 : 40 };
    return { severity: "normal" };
  }

  // MQ-2 Gas raw
  if (metricName === "gasLevel") {
    if (value > 130) return { severity: "critical", thresholdExceeded: 130 };
    if (value >= 90) return { severity: "warning", thresholdExceeded: 90 };
    return { severity: "normal" };
  }

  // CO2
  if (metricName === "pressure") {
    if (value < 350 || value > 1100) return { severity: "critical", thresholdExceeded: value < 350 ? 350 : 1100 };
    if ((value >= 350 && value < 450) || (value > 900 && value <= 1100)) return { severity: "warning", thresholdExceeded: value > 900 ? 900 : 450 };
    return { severity: "normal" };
  }

  // Piezo Vibration (baseline + ratios)
  if (metricName === "vibration") {
    if (!baseline || baseline <= 0) return { severity: "normal" };
    const ratio = value / baseline; // 1.2 = +20%
    if (ratio > 1.5) return { severity: "critical", thresholdExceeded: baseline * 1.5 };
    if (ratio > 1.2) return { severity: "warning", thresholdExceeded: baseline * 1.2 };
    return { severity: "normal" };
  }

  return { severity: "normal" };
}

export async function processMetric({ nodeId, zoneId, metricName, value, baseline }) {
  const k = `${nodeId}:${metricName}`;
  const t = trackers.get(k) || { firstBadAt: null, lastNotifyAt: 0, currentSeverity: "normal", vibBadSince: null };

  const { severity, thresholdExceeded } = getLevelAndThreshold(metricName, value, baseline);

  // extra règle vibration: "critical si vibration continue > 30s"
  if (metricName === "vibration" && severity !== "normal") {
    if (!t.vibBadSince) t.vibBadSince = nowMs();
    if (nowMs() - t.vibBadSince >= 30_000) {
      // force critical
      t.currentSeverity = "critical";
    }
  } else {
    t.vibBadSince = null;
  }

  // Normal -> resolve alert si existante
  if (severity === "normal") {
    t.firstBadAt = null;
    t.currentSeverity = "normal";

    const active = await Alert.findOne({ nodeId, metricName, status: "active" });
    if (active) {
      active.status = "resolved";
      active.resolvedAt = new Date();
      await active.save();
      trackers.set(k, t);
      return { type: "resolved", alert: active };
    }

    trackers.set(k, t);
    return null;
  }

  // severity warning/critical
  if (!t.firstBadAt || t.currentSeverity !== severity) {
    // reset timer quand on change de niveau
    t.firstBadAt = nowMs();
    t.currentSeverity = severity;
  }

  const minDur = MIN_DURATION[severity] ?? 30_000;
  const mature = (nowMs() - t.firstBadAt) >= minDur;
  const canNotify = (nowMs() - t.lastNotifyAt) >= COOLDOWN;

  if (!mature) {
    trackers.set(k, t);
    return null;
  }

  // mature -> créer/mettre à jour alert (avec cooldown)
  const active = await Alert.findOne({ nodeId, metricName, status: "active" });

  const msg =
    metricName === "temperature" ? "Température hors plage"
    : metricName === "humidity" ? "Humidité hors plage"
    : metricName === "gasLevel" ? "Gaz/Fumée détecté (MQ-2)"
    : metricName === "pressure" ? "Pression anormale (BMP280)"
    : metricName === "vibration" ? "Vibrations anormales (Piézo)"
    : "Alerte";

  if (!active) {
    if (!canNotify) { trackers.set(k, t); return null; }

    const created = await Alert.create({
      nodeId,
      zoneId,
      metricName,
      metricValue: value,
      thresholdExceeded: thresholdExceeded ?? null,
      message: `${msg} | valeur=${Number(value).toFixed(2)}`,
      severity,
      status: "active",
    });

    t.lastNotifyAt = nowMs();
    trackers.set(k, t);
    return { type: "notified", alert: created };
  }

  // déjà active: update valeur, et notifier seulement si cooldown OK
  const prevSeverity = active.severity;
  active.metricValue = value;
  active.thresholdExceeded = thresholdExceeded ?? active.thresholdExceeded;
  active.severity = severity;
  active.message = `${msg} | valeur=${Number(value).toFixed(2)}`;
  await active.save();

  if (canNotify) {
    t.lastNotifyAt = nowMs();
    trackers.set(k, t);
    return { type: "notified", alert: active };
  }

  // No notification due to cooldown, but alert may have changed severity/value => update UI/status anyway
  trackers.set(k, t);
  const changed = prevSeverity !== severity;
  if (changed) {
    return { type: "updated", alert: active };
  }
  return null;
}
