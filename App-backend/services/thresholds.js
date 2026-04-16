import AlertThreshold from "../models/AlertThreshold.js";

export const DEFAULT_THRESHOLDS = {
  temperature: { warningMin: 18, warningMax: 27, alertMin: 15, alertMax: 30 },
  humidity: { warningMin: 40, warningMax: 60, alertMin: 30, alertMax: 70 },
  pressure: { warningMin: 450, warningMax: 900, alertMin: 350, alertMax: 1100 },
  vibration: { warningMin: 0, warningMax: 1.2, alertMin: 0, alertMax: 1.5 },
  gasLevel: { warningMin: 0, warningMax: 90, alertMin: 0, alertMax: 130 },
};

const metricKeys = Object.keys(DEFAULT_THRESHOLDS);

function withinRange(value, min, max) {
  if (value === null || value === undefined) return true;
  if (min !== null && min !== undefined && value < min) return false;
  if (max !== null && max !== undefined && value > max) return false;
  return true;
}

export function evaluateMetric(metricName, value, threshold) {
  if (value === null || value === undefined) {
    return { metricName, value, state: "normal", ...threshold };
  }

  if (!withinRange(value, threshold.alertMin, threshold.alertMax)) {
    return { metricName, value, state: "alert", ...threshold };
  }

  if (!withinRange(value, threshold.warningMin, threshold.warningMax)) {
    return { metricName, value, state: "warning", ...threshold };
  }

  return { metricName, value, state: "normal", ...threshold };
}

export async function getEffectiveThresholds({ datacenterId = null, zoneId = null, nodeId = null }) {
  const thresholds = { ...DEFAULT_THRESHOLDS };

  const scopeFilters = [
    datacenterId ? { scopeType: "datacenter", scopeId: datacenterId } : null,
    zoneId ? { scopeType: "zone", scopeId: zoneId } : null,
    nodeId ? { scopeType: "node", scopeId: nodeId } : null,
  ].filter(Boolean);

  for (const filter of scopeFilters) {
    const docs = await AlertThreshold.find({ ...filter, enabled: true }).lean();
    for (const doc of docs) {
      thresholds[doc.metricName] = {
        warningMin: doc.warningMin,
        warningMax: doc.warningMax,
        alertMin: doc.alertMin,
        alertMax: doc.alertMax,
      };
    }
  }

  return metricKeys.reduce((acc, key) => {
    acc[key] = thresholds[key] || DEFAULT_THRESHOLDS[key];
    return acc;
  }, {});
}
