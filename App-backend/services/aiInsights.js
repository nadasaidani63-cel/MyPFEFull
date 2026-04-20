import Alert from "../models/Alert.js";

export const AI_METRICS = [
  { key: "temperature", label: "Temperature", unit: "C" },
  { key: "humidity", label: "Humidite", unit: "%" },
  { key: "pressure", label: "Gaz CO2", unit: "ppm" },
  { key: "vibration", label: "Vibration", unit: "mm/s" },
  { key: "gasLevel", label: "Fumee", unit: "ppm" },
];

const STATE_LABELS = {
  stable: "Stable",
  watch: "A surveiller",
  alert: "Alerte",
  critical: "Critique",
  maintenance: "Maintenance",
};

const STATE_ORDER = {
  stable: 0,
  watch: 1,
  alert: 2,
  maintenance: 2,
  critical: 3,
};

const CLASSIFICATION_TO_STATE = {
  Normal: "stable",
  Alerte: "alert",
  Critique: "critical",
  Maintenance: "maintenance",
};

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
  return { slope: 0, label: "stable" };
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
    return {
      series: [],
      actualValues: [],
      forecastValues: [],
      latestValue: null,
      predictedValue: null,
      trend: { slope: 0, label: "stable" },
    };
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
  for (let index = 0; index < points; index += 1) {
    const values = buckets.get(index) || [];
    if (!values.length) continue;
    const avg = mean(values);
    const t = new Date(from + index * bucketSize);
    actual.push({
      time: t.toISOString(),
      label: t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      actual: Number(avg.toFixed(2)),
    });
  }

  if (!actual.length) {
    const fallback = rows.slice(-Math.min(rows.length, points)).map((row) => ({
      time: row.time.toISOString(),
      label: row.time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      actual: Number(row.value.toFixed(2)),
    }));
    const actualValues = fallback.map((item) => item.actual);
    const latestValue = actualValues[actualValues.length - 1] ?? null;
    return {
      series: fallback,
      actualValues,
      forecastValues: [],
      latestValue,
      predictedValue: latestValue,
      trend: computeTrend(actualValues),
    };
  }

  const actualValues = actual.map((item) => item.actual);
  const trend = computeTrend(actualValues);
  const baseline = actualValues[actualValues.length - 1];
  const limitedSlope = clamp(trend.slope, -Math.abs(baseline || 1) * 0.08, Math.abs(baseline || 1) * 0.08);
  const step = Math.max(bucketSize, Math.ceil(totalDuration / Math.max(actual.length, 1)));
  const forecast = [];

  for (let index = 1; index <= forecastPoints; index += 1) {
    const predicted = baseline + limitedSlope * index;
    const t = new Date(to + step * index);
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
    return `Planifier une maintenance preventive sur ${label.toLowerCase()} et verifier la connectivite des noeuds.`;
  }
  if (state === "critical") {
    return `Intervenir immediatement sur ${label.toLowerCase()} car la valeur actuelle ou prevue depasse le seuil critique.`;
  }
  if (state === "alert") {
    return `Programmer une action corrective sur ${label.toLowerCase()} avant le prochain cycle de surcharge.`;
  }
  if (state === "watch") {
    return trend === "up"
      ? `${label} se rapproche d'un seuil. Renforcer la surveillance dans les prochaines minutes.`
      : `${label} reste proche d'un seuil. Confirmer rapidement la stabilite.`;
  }

  if (offlineRatio > 0.1) {
    return "Le systeme reste stable, mais quelques noeuds sont hors ligne. Verifier la disponibilite reseau.";
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

function uiStateFromClassification(classificationState) {
  return CLASSIFICATION_TO_STATE[classificationState] || "stable";
}

function recommendationPriorityFromClassification(classificationState) {
  return {
    Normal: "normal",
    Alerte: "important",
    Maintenance: "important",
    Critique: "urgent",
  }[classificationState] || "normal";
}

function uiStateFromRiskLevel(riskLevel) {
  return {
    FAIBLE: "stable",
    MOYEN: "watch",
    ELEVE: "alert",
    CRITIQUE: "critical",
  }[riskLevel] || "stable";
}

function recommendationPriorityFromRiskLevel(riskLevel) {
  return {
    FAIBLE: "normal",
    MOYEN: "normal",
    ELEVE: "important",
    CRITIQUE: "urgent",
  }[riskLevel] || "normal";
}

export async function buildAiInsights({
  datacenter,
  thresholds,
  history,
  latestReadings,
  nodes,
  activeAlerts,
  classifications = null,
  aiModelStatus = null,
  model2Summary = null,
  model2Status = null,
  model3Summary = null,
  model3Status = null,
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
    const { series, predictedValue, trend } = buildSeries(history, metric.key, points, 6);

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
    metricLabel: AI_METRICS.find((item) => item.key === alert.metricName)?.label || alert.metricName || "Metrique",
    title: alert.message || `${alert.metricName || "Metrique"} hors seuil detecte(e)`,
    detail: alert.metricValue !== null && alert.metricValue !== undefined
      ? `${AI_METRICS.find((item) => item.key === alert.metricName)?.label || alert.metricName || "Valeur"}: ${Number(alert.metricValue).toFixed(alert.metricName === "pressure" ? 0 : 2)}`
      : "Analyse d'ecart detectee par Sentinel.",
    source: [alert.zoneId?.name, alert.nodeId?.name].filter(Boolean).join(" / ") || datacenter?.name || "Systeme",
    createdAt: alert.createdAt,
    time: new Date(alert.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  }));

  if (offlineRatio >= 0.35) {
    anomalies.unshift({
      id: "maintenance-offline",
      severity: "warning",
      metricKey: "maintenance",
      metricLabel: "Maintenance",
      title: "Disponibilite des noeuds degradee",
      detail: `${offlineNodes} noeud(s) hors ligne sur ${totalNodes}. Une maintenance preventive est recommandee.`,
      source: datacenter?.name || "Datacenter",
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    });
  }

  const model2Anomalies = (model2Summary?.nodes || [])
    .filter((item) => item.isAnomaly)
    .slice(0, 4)
    .map((item, index) => ({
      id: `model2-${item.nodeId || index}`,
      severity: item.state === "Critique" ? "critical" : "warning",
      metricKey: "model2",
      metricLabel: "Detection d'anomalies",
      title: `Anomalie detectee sur ${item.nodeName || "un noeud"}`,
      detail: `${item.zoneName || "Zone inconnue"} • score ${item.anomalyScore ?? 0}% • cause ${item.rootCause || "indeterminee"}`,
      source: item.zoneName || datacenter?.name || "Datacenter",
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    }));

  anomalies.unshift(...model2Anomalies);

  const classificationRecommendations = (classifications?.nodes || [])
    .filter((node) => node.state && node.state !== "Normal")
    .slice(0, 3)
    .map((node, index) => ({
      id: `rec-node-${node.nodeId || index}`,
      priority: recommendationPriorityFromClassification(node.state),
      title: node.recommendation || `Verifier ${node.nodeName || "le noeud prioritaire"}.`,
      detail: [
        node.nodeName || "Noeud",
        node.zoneName || "Zone inconnue",
        node.confidence !== null && node.confidence !== undefined ? `Confiance ${Math.round(Number(node.confidence) * 100)}%` : null,
      ].filter(Boolean).join(" • "),
      target: node.zoneName || datacenter?.name || "Datacenter",
      metricKey: node.rootCause || null,
    }));

  const anomalyRecommendations = (model2Summary?.nodes || [])
    .filter((node) => node.isAnomaly)
    .slice(0, 2)
    .map((node, index) => ({
      id: `rec-anomaly-${node.nodeId || index}`,
      priority: node.state === "Critique" ? "urgent" : "important",
      title: node.recommendation || `Inspection recommandee sur ${node.nodeName || "le noeud anormal"}.`,
      detail: `${node.zoneName || "Zone inconnue"} • score anomalie ${node.anomalyScore ?? 0}%`,
      target: node.zoneName || datacenter?.name || "Datacenter",
      metricKey: node.rootCause || null,
    }));

  const riskRecommendations = (model3Summary?.nodes || [])
    .filter((node) => ["ELEVE", "CRITIQUE"].includes(node.riskLevel))
    .slice(0, 2)
    .map((node, index) => ({
      id: `rec-risk-${node.nodeId || index}`,
      priority: recommendationPriorityFromRiskLevel(node.riskLevel),
      title: node.action || `Risque ${node.riskLevel} sur ${node.nodeName || "un noeud"}.`,
      detail: `${node.nodeName || "Noeud"} • ${node.zoneName || "Zone inconnue"} • confiance ${Math.round(Number(node.confidence || 0))}%`,
      target: node.zoneName || datacenter?.name || "Datacenter",
      metricKey: "risk-model",
    }));

  const metricRecommendations = metrics
    .filter((metric) => metric.state !== "stable")
    .slice(0, 5)
    .map((metric) => ({
      id: `rec-${metric.key}`,
      priority: metric.state === "critical" ? "urgent" : metric.state === "maintenance" ? "important" : metric.state === "alert" ? "important" : "normal",
      title: metric.recommendation,
      detail:
        metric.state === "maintenance"
          ? `Couverture des donnees: ${Math.round(dataCoverage * 100)}% • Noeuds hors ligne: ${offlineNodes}`
          : `${metric.label} actuel${metric.currentValue !== null ? `: ${metric.currentValue} ${metric.unit}` : ""}${metric.predictedValue !== null ? ` • Prevu: ${metric.predictedValue} ${metric.unit}` : ""}`,
      target: datacenter?.name || "Datacenter",
      metricKey: metric.key,
    }));

  const recommendations = [...classificationRecommendations, ...anomalyRecommendations, ...riskRecommendations, ...metricRecommendations].slice(0, 6);

  if (!recommendations.length) {
    recommendations.push({
      id: "rec-stable",
      priority: "normal",
      title: "Le systeme reste stable sur l'ensemble des metriques supervisees.",
      detail: "Aucune derive critique n'a ete detectee sur l'horizon d'analyse courant.",
      target: datacenter?.name || "Datacenter",
      metricKey: null,
    });
  }

  const metricsGlobalState = metrics.reduce((best, metric) => (STATE_ORDER[metric.state] > STATE_ORDER[best] ? metric.state : best), "stable");
  const classificationGlobalState = uiStateFromClassification(classifications?.globalState);
  const anomalyGlobalState = uiStateFromClassification(model2Summary?.globalState);
  const riskGlobalState = uiStateFromRiskLevel(model3Summary?.globalState);
  const globalState = [metricsGlobalState, classificationGlobalState, anomalyGlobalState, riskGlobalState]
    .reduce((best, current) => (STATE_ORDER[current] > STATE_ORDER[best] ? current : best), "stable");
  const highestMetric = metrics[0] || null;
  const highestClassification = classifications?.nodes?.[0] || null;
  const highestRiskNode = model3Summary?.nodes?.[0] || null;

  const summaryParts = [];
  if (highestClassification && STATE_ORDER[classificationGlobalState] >= STATE_ORDER[metricsGlobalState] && classificationGlobalState !== "stable") {
    summaryParts.push(
      `${STATE_LABELS[globalState]} - ${highestClassification.nodeName || "Noeud prioritaire"} classe ${highestClassification.stateLabel || highestClassification.state}.`
    );
    if (highestClassification.recommendation) {
      summaryParts.push(highestClassification.recommendation);
    }
  } else if (highestRiskNode && STATE_ORDER[riskGlobalState] >= STATE_ORDER[metricsGlobalState] && riskGlobalState !== "stable") {
    summaryParts.push(
      `${STATE_LABELS[globalState]} - ${highestRiskNode.nodeName || "Noeud prioritaire"} presente un risque ${highestRiskNode.riskLevel}.`
    );
    if (highestRiskNode.action) {
      summaryParts.push(highestRiskNode.action);
    }
  } else if (highestMetric) {
    summaryParts.push(
      `${STATE_LABELS[globalState]} - ${highestMetric.label} ${highestMetric.currentValue !== null ? `a ${highestMetric.currentValue} ${highestMetric.unit}` : "avec donnees limitees"}. ${highestMetric.recommendation}`
    );
  } else {
    summaryParts.push("Aucune donnee suffisante pour produire une analyse IA.");
  }

  if (aiModelStatus?.error) {
    summaryParts.push("Le module de classification est indisponible et l'assistant s'appuie provisoirement sur l'analyse temps reel.");
  }

  const aiModules = [
    {
      key: "classification",
      label: "Modele 1 - Classification",
      state: aiModelStatus?.available === false ? "alert" : classificationGlobalState,
      stateLabel: aiModelStatus?.available === false ? "Alerte" : classifications?.globalLabel || STATE_LABELS[classificationGlobalState],
      engine: aiModelStatus?.available === false
        ? "Modele indisponible"
        : aiModelStatus?.source === "runtime"
          ? "Random Forest reentraine"
          : "Random Forest integre",
      detail: aiModelStatus?.error
        ? aiModelStatus.error
        : `${(classifications?.nodes || []).length} noeuds classes • version ${aiModelStatus?.version || classifications?.model?.version || "inconnue"}`,
      meta: {
        source: aiModelStatus?.source || classifications?.model?.source || null,
        lastTrainingAt: aiModelStatus?.trainingState?.lastRunAt || null,
      },
    },
    {
      key: "anomaly-detection",
      label: "Modele 2 - Detection d'anomalies",
      state: model2Status?.available === false ? "alert" : anomalyGlobalState,
      stateLabel: model2Status?.available === false ? "Alerte" : model2Summary?.globalLabel || STATE_LABELS[anomalyGlobalState],
      engine: model2Status?.available === false ? "Modele indisponible" : "Isolation Forest integre",
      detail: model2Status?.error
        ? model2Status.error
        : `${model2Summary?.anomalyCount || 0} anomalies detectees automatiquement`,
      meta: {
        anomalyCount: model2Summary?.anomalyCount || 0,
        source: model2Status?.source || model2Summary?.model?.source || null,
        version: model2Status?.version || model2Summary?.model?.version || null,
      },
    },
    {
      key: "risk-analysis",
      label: "Modele 3 - Analyse de risque",
      state: model3Status?.available === false ? "alert" : riskGlobalState,
      stateLabel: model3Status?.available === false ? "Alerte" : model3Summary?.globalLabel || STATE_LABELS[riskGlobalState],
      engine: model3Status?.available === false ? "Modele indisponible" : "Random Forest de risque",
      detail: model3Status?.error
        ? model3Status.error
        : highestRiskNode
          ? `${highestRiskNode.nodeName || "Noeud"} est le plus risque (${highestRiskNode.riskLevel})`
          : "Pas assez de donnees pour projeter le risque",
      meta: {
        source: model3Status?.source || model3Summary?.model?.source || null,
        version: model3Status?.version || model3Summary?.model?.version || null,
      },
    },
    {
      key: "assistant",
      label: "Modele 4 - Assistant explicatif",
      state: globalState,
      stateLabel: STATE_LABELS[globalState],
      engine: "Assistant contextuel relie aux insights IA",
      detail: "Le chat repond a partir des seuils, des alertes, des classifications et des previsions courantes.",
      meta: {
        ready: true,
      },
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    horizonHours: hours,
    datacenter: datacenter
      ? {
          id: String(datacenter._id),
          name: datacenter.name,
          status: datacenter.status,
          location: datacenter.location || null,
        }
      : null,
    globalState,
    globalLabel: STATE_LABELS[globalState],
    summary: summaryParts.join(" "),
    nodeHealth: {
      total: totalNodes,
      online: onlineNodes,
      offline: offlineNodes,
      dataCoverage: Math.round(dataCoverage * 100),
    },
    metrics,
    anomalies,
    recommendations,
    classifications: classifications || null,
    anomalyModel: model2Summary || null,
    riskModel: model3Summary || null,
    aiModules,
    modelStatus: aiModelStatus || null,
    modelStatuses: {
      model1: aiModelStatus || null,
      model2: model2Status || null,
      model3: model3Status || null,
    },
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
