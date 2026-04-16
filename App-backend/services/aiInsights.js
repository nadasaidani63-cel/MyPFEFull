import Alert from "../models/Alert.js";

export const AI_METRICS = [
  { key: "temperature", label: "Température", unit: "°C" },
  { key: "humidity", label: "Humidité", unit: "%" },
  { key: "pressure", label: "Gaz CO2", unit: "ppm" },
  { key: "vibration", label: "Vibration", unit: "mm/s" },
  { key: "gasLevel", label: "Fumee", unit: "ppm" },
];

const STATE_LABELS = {
  stable: "Stable",
  watch: "À surveiller",
  alert: "Alerte",
  critical: "Critique",
  maintenance: "Maintenance",
};

const STATE_ORDER = { stable: 0, watch: 1, alert: 2, maintenance: 2, critical: 3 };

function mean(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFinite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function getMetricThresholdTarget(value, threshold) {
  const candidates = [
    threshold?.warningMin,
    threshold?.warningMax,
    threshold?.alertMin,
    threshold?.alertMax,
  ].filter((item) => item !== null && item !== undefined && Number.isFinite(item));

  if (!candidates.length) return null;
  if (value === null || value === undefined) return candidates[0];

  let best = candidates[0];
  let bestDistance = Math.abs(value - best);
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(value - candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function evaluateThresholdState(value, threshold) {
  if (value === null || value === undefined) return "stable";

  const belowAlert = threshold?.alertMin !== null && threshold?.alertMin !== undefined && value < threshold.alertMin;
  const aboveAlert = threshold?.alertMax !== null && threshold?.alertMax !== undefined && value > threshold.alertMax;
  if (belowAlert || aboveAlert) return "critical";

  const belowWarn = threshold?.warningMin !== null && threshold?.warningMin !== undefined && value < threshold.warningMin;
  const aboveWarn = threshold?.warningMax !== null && threshold?.warningMax !== undefined && value > threshold.warningMax;
  if (belowWarn || aboveWarn) return "alert";

  const target = getMetricThresholdTarget(value, threshold);
  if (target !== null) {
    const range = Math.max(Math.abs(target) * 0.08, 1);
    if (Math.abs(value - target) <= range) {
      return "watch";
    }
  }

  return "stable";
}

function computeTrend(values) {
  if (values.length < 3) return { slope: 0, label: "stable" };
  const recent = values.slice(-Math.min(values.length, 6));
  const first = recent[0];
  const last = recent[recent.length - 1];
  const slope = (last - first) / Math.max(recent.length - 1, 1);
  const span = Math.max(Math.abs(mean(recent) || 1) * 0.02, 0.15);

  if (slope > span) return { slope, label: "up" };
  if (slope < -span) return { slope, label: "down" };
  return { slope, label: "stable" };
}

function buildSeries(history, metricKey, points = 18, forecastPoints = 6) {
  const rows = history
    .map((row) => ({
      time: new Date(row.recordedAt),
      value: toFinite(row[metricKey]),
    }))
    .filter((row) => row.value !== null)
    .sort((a, b) => a.time - b.time);

  if (!rows.length) {
    return { series: [], actualValues: [], forecastValues: [], latestValue: null, predictedValue: null, trend: { slope: 0, label: "stable" } };
  }

  const from = rows[0].time.getTime();
  const to = rows[rows.length - 1].time.getTime();
  const totalDuration = Math.max(to - from, 1);
  const bucketSize = Math.max(1, Math.ceil(totalDuration / Math.max(points, 1)));
  const buckets = new Map();

  for (const row of rows) {
    const bucketIndex = Math.min(points - 1, Math.floor((row.time.getTime() - from) / bucketSize));
    if (!buckets.has(bucketIndex)) buckets.set(bucketIndex, []);
    buckets.get(bucketIndex).push(row.value);
  }

  const actual = [];
  for (let i = 0; i < points; i += 1) {
    const values = buckets.get(i) || [];
    if (!values.length) continue;
    const avg = mean(values);
    const t = new Date(from + i * bucketSize);
    actual.push({
      time: t.toISOString(),
      label: t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      actual: Number(avg.toFixed(2)),
    });
  }

  if (!actual.length) {
    const only = rows.slice(-Math.min(rows.length, points)).map((row) => ({
      time: row.time.toISOString(),
      label: row.time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      actual: Number(row.value.toFixed(2)),
    }));
    return buildSeries(
      only.map((item) => ({ recordedAt: item.time, [metricKey]: item.actual })),
      metricKey,
      Math.min(points, only.length || points),
      forecastPoints,
    );
  }

  const actualValues = actual.map((item) => item.actual);
  const trend = computeTrend(actualValues);
  const baseline = actualValues[actualValues.length - 1];
  const slope = clamp(trend.slope, -Math.abs(baseline || 1) * 0.08, Math.abs(baseline || 1) * 0.08);
  const forecast = [];
  const step = Math.max(bucketSize, Math.ceil(totalDuration / Math.max(actual.length, 1)));

  for (let i = 1; i <= forecastPoints; i += 1) {
    const predicted = baseline + slope * i;
    const t = new Date(to + step * i);
    forecast.push({
      time: t.toISOString(),
      label: t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      predicted: Number(predicted.toFixed(2)),
    });
  }

  const series = [
    ...actual,
    ...forecast.map((item, index) => ({
      time: item.time,
      label: item.label,
      predicted: item.predicted,
      actual: index === 0 ? Number(baseline.toFixed(2)) : undefined,
    })),
  ];

  return {
    series,
    actualValues,
    forecastValues: forecast.map((item) => item.predicted),
    latestValue: baseline,
    predictedValue: forecast.length ? forecast[forecast.length - 1].predicted : baseline,
    trend,
  };
}

function computeRisk({ currentValue, predictedValue, threshold, alertCount = 0, offlineRatio = 0, state }) {
  if (state === "maintenance") return clamp(55 + offlineRatio * 100, 45, 85);
  if (currentValue === null && predictedValue === null) return 0;

  const target = getMetricThresholdTarget(predictedValue ?? currentValue, threshold);
  let proximityScore = 0;
  if (target !== null) {
    const base = Math.abs(target) || 1;
    const diff = Math.abs((predictedValue ?? currentValue) - target);
    proximityScore = clamp(100 - (diff / base) * 240, 0, 100);
  }

  const stateBoost = {
    stable: 0,
    watch: 12,
    alert: 28,
    maintenance: 30,
    critical: 48,
  }[state] || 0;

  const alertBoost = Math.min(alertCount * 8, 24);
  const offlineBoost = Math.min(Math.round(offlineRatio * 50), 18);
  return clamp(Math.round(proximityScore * 0.45 + stateBoost + alertBoost + offlineBoost), 0, 99);
}

function metricRecommendation({ label, state, trend, threshold, currentValue, predictedValue, offlineRatio }) {
  if (state === "maintenance") {
    return `Planifier une maintenance préventive sur ${label.toLowerCase()} et vérifier la connectivité des nœuds.`;
  }
  if (state === "critical") {
    return `Intervenir immédiatement sur ${label.toLowerCase()} : la valeur actuelle/prévue dépasse le seuil critique.`;
  }
  if (state === "alert") {
    return `Programmer une action corrective sur ${label.toLowerCase()} avant le prochain cycle de surcharge.`;
  }
  if (state === "watch") {
    return trend === "up"
      ? `${label} se rapproche d'un seuil. Renforcer la surveillance dans les prochaines minutes.`
      : `${label} reste proche d'un seuil. Contrôler l'évolution et confirmer la stabilité.`;
  }

  if (offlineRatio > 0.1) {
    return `Le système reste stable, mais quelques nœuds sont hors ligne. Vérifier la disponibilité réseau.`;
  }

  const target = getMetricThresholdTarget(predictedValue ?? currentValue, threshold);
  return target === null
    ? `${label} reste dans la plage attendue.`
    : `${label} reste dans la plage attendue. Conserver la surveillance standard.`;
}

function severityFromAlert(alert) {
  if (!alert) return "info";
  if (alert.severity === "critical" || alert.severity === "alert") return "critical";
  if (alert.severity === "warning") return "warning";
  return "info";
}

function stateFromAlerts(alerts) {
  const severities = alerts.map((alert) => severityFromAlert(alert));
  if (severities.includes("critical")) return "critical";
  if (severities.includes("warning")) return "alert";
  return "stable";
}

export async function buildAiInsights({
  datacenter,
  thresholds,
  history,
  latestReadings,
  nodes,
  activeAlerts,
  hours = 6,
  points = 18,
}) {
  const totalNodes = nodes.length;
  const onlineNodes = nodes.filter((node) => node.isOnline).length;
  const offlineNodes = Math.max(totalNodes - onlineNodes, 0);
  const offlineRatio = totalNodes ? offlineNodes / totalNodes : 0;
  const dataCoverage = totalNodes ? latestReadings.length / totalNodes : 0;

  const metrics = AI_METRICS.map((metric) => {
    const threshold = thresholds?.[metric.key] || {};
    const latestValues = latestReadings
      .map((row) => toFinite(row[metric.key]))
      .filter((value) => value !== null);
    const currentValue = mean(latestValues);
    const metricAlerts = activeAlerts.filter((alert) => alert.metricName === metric.key || (metric.key === "gasLevel" && alert.metricName === "gas_level"));
    const { series, actualValues, predictedValue, trend } = buildSeries(history, metric.key, points, 6);

    let state = evaluateThresholdState(currentValue, threshold);
    const predictedState = evaluateThresholdState(predictedValue, threshold);
    if (STATE_ORDER[predictedState] > STATE_ORDER[state]) state = predictedState;

    const alertState = stateFromAlerts(metricAlerts);
    if (STATE_ORDER[alertState] > STATE_ORDER[state]) state = alertState;

    const metricCoverage = latestValues.length / Math.max(totalNodes, 1);
    if ((dataCoverage < 0.55 || metricCoverage < 0.5 || offlineRatio >= 0.35) && state !== "critical") {
      state = "maintenance";
    }

    const riskScore = computeRisk({
      currentValue,
      predictedValue,
      threshold,
      alertCount: metricAlerts.length,
      offlineRatio,
      state,
    });

    const targetValue = getMetricThresholdTarget(predictedValue ?? currentValue, threshold);

    return {
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      state,
      stateLabel: STATE_LABELS[state],
      currentValue: currentValue !== null ? Number(currentValue.toFixed(metric.key === "pressure" ? 0 : 2)) : null,
      predictedValue: predictedValue !== null ? Number(predictedValue.toFixed(metric.key === "pressure" ? 0 : 2)) : null,
      riskScore,
      trend: trend.label,
      trendLabel: trend.label === "up" ? "Hausse" : trend.label === "down" ? "Baisse" : "Stable",
      alertCount: metricAlerts.length,
      recommendation: metricRecommendation({
        label: metric.label,
        state,
        trend: trend.label,
        threshold,
        currentValue,
        predictedValue,
        offlineRatio,
      }),
      threshold: {
        ...threshold,
        targetValue,
      },
      series: series.map((item) => ({
        time: item.time,
        label: item.label,
        actual: item.actual,
        predicted: item.predicted,
        warningMin: threshold.warningMin ?? null,
        warningMax: threshold.warningMax ?? null,
        alertMin: threshold.alertMin ?? null,
        alertMax: threshold.alertMax ?? null,
      })),
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  const anomalies = activeAlerts.slice(0, 8).map((alert) => ({
    id: String(alert._id),
    severity: severityFromAlert(alert),
    metricKey: alert.metricName,
    metricLabel: AI_METRICS.find((item) => item.key === alert.metricName)?.label || alert.metricName || "Métrique",
    title: alert.message || `${alert.metricName || "Métrique"} hors seuil détecté(e)`,
    detail: alert.metricValue !== null && alert.metricValue !== undefined
      ? `${AI_METRICS.find((item) => item.key === alert.metricName)?.label || alert.metricName || "Valeur"}: ${Number(alert.metricValue).toFixed(alert.metricName === "pressure" ? 0 : 2)}`
      : "Analyse d'écart détectée par Sentinel.",
    source: [alert.zoneId?.name, alert.nodeId?.name].filter(Boolean).join(" / ") || datacenter?.name || "Système",
    createdAt: alert.createdAt,
    time: new Date(alert.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  }));

  if (offlineRatio >= 0.35) {
    anomalies.unshift({
      id: "maintenance-offline",
      severity: "warning",
      metricKey: "maintenance",
      metricLabel: "Maintenance",
      title: "Disponibilité des nœuds dégradée",
      detail: `${offlineNodes} nœud(s) hors ligne sur ${totalNodes}. Une maintenance préventive est recommandée.`,
      source: datacenter?.name || "Datacenter",
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    });
  }

  const recommendations = metrics
    .filter((metric) => metric.state !== "stable")
    .slice(0, 5)
    .map((metric) => ({
      id: `rec-${metric.key}`,
      priority: metric.state === "critical" ? "urgent" : metric.state === "maintenance" ? "important" : metric.state === "alert" ? "important" : "normal",
      title: metric.recommendation,
      detail:
        metric.state === "maintenance"
          ? `Couverture des données: ${Math.round(dataCoverage * 100)}% • Nœuds hors ligne: ${offlineNodes}`
          : `${metric.label} actuel${metric.currentValue !== null ? `: ${metric.currentValue} ${metric.unit}` : ""}${metric.predictedValue !== null ? ` • Prévu: ${metric.predictedValue} ${metric.unit}` : ""}`,
      target: datacenter?.name || "Datacenter",
      metricKey: metric.key,
    }));

  if (!recommendations.length) {
    recommendations.push({
      id: "rec-stable",
      priority: "normal",
      title: "Le système reste stable sur l'ensemble des métriques supervisées.",
      detail: "Aucune dérive critique n'a été détectée sur l'horizon d'analyse courant.",
      target: datacenter?.name || "Datacenter",
      metricKey: null,
    });
  }

  const globalState = metrics.reduce((best, metric) => (STATE_ORDER[metric.state] > STATE_ORDER[best] ? metric.state : best), "stable");
  const highestMetric = metrics[0] || null;
  const summary = highestMetric
    ? `${STATE_LABELS[globalState]} — ${highestMetric.label} ${highestMetric.currentValue !== null ? `à ${highestMetric.currentValue} ${highestMetric.unit}` : "avec données limitées"}. ${highestMetric.recommendation}`
    : "Aucune donnée suffisante pour produire une analyse IA.";

  return {
    generatedAt: new Date().toISOString(),
    horizonHours: hours,
    datacenter: datacenter ? { id: String(datacenter._id), name: datacenter.name, status: datacenter.status, location: datacenter.location || null } : null,
    globalState,
    globalLabel: STATE_LABELS[globalState],
    summary,
    nodeHealth: {
      total: totalNodes,
      online: onlineNodes,
      offline: offlineNodes,
      dataCoverage: Math.round(dataCoverage * 100),
    },
    metrics,
    anomalies,
    recommendations,
  };
}

export async function fetchActiveAlertsForAi(datacenterId) {
  if (!datacenterId) return [];
  return Alert.find({ datacenterId, status: "active" })
    .sort({ createdAt: -1 })
    .limit(12)
    .populate("nodeId", "name isOnline")
    .populate("zoneId", "name")
    .lean();
}
