import path from "path";
import { fileURLToPath } from "url";

import { deriveNodeType, getTrainingState, runPythonJson } from "./aiModel1.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const model2Dir = path.join(backendRoot, "ai", "model2");
const inferScriptPath = path.join(model2Dir, "infer.py");
const retrainScriptPath = path.join(model2Dir, "retrain.py");

function severityRank(state) {
  return {
    Normal: 0,
    Maintenance: 1,
    Alerte: 2,
    Critique: 3,
  }[state] ?? 0;
}

function toNumeric(value, fallback = null) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function zoneCodeFromType(nodeType) {
  return {
    SRV: "SRV",
    NET: "NET",
    UPS: "UPS",
    OTHER: "ENV",
  }[nodeType] || "ENV";
}

function buildHistoryMap(history = []) {
  const grouped = new Map();
  const ordered = [...history].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  for (const reading of ordered) {
    const nodeId = String(reading.nodeId);
    if (!grouped.has(nodeId)) grouped.set(nodeId, []);
    grouped.get(nodeId).push(reading);
  }
  return grouped;
}

function deriveRssi({ node, alertCount = 0 }) {
  let rssi = node?.isOnline ? -66 : -88;
  if (node?.status === "warning") rssi -= 5;
  if (node?.status === "alert") rssi -= 9;
  if (node?.status === "critical") rssi -= 13;

  const lastPing = node?.lastPing ? new Date(node.lastPing).getTime() : null;
  if (!lastPing) {
    rssi -= 4;
  } else {
    const staleMinutes = (Date.now() - lastPing) / 60_000;
    if (staleMinutes > 10) rssi -= 4;
    if (staleMinutes > 30) rssi -= 6;
  }

  rssi -= Math.min(alertCount * 2, 8);
  return Math.round(clamp(rssi, -95, -45));
}

function deriveGenericGas({ smokePpm = 0, co2Ppm = 0 }) {
  const smokeComponent = Math.max(Number(smokePpm) || 0, 0) * 1.6;
  const co2Component = Math.max(Number(co2Ppm) || 0, 0) * 0.18;
  return Number(Math.max(smokeComponent, co2Component).toFixed(2));
}

function average(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageRecentGas(readings = []) {
  const values = readings
    .map((item) => deriveGenericGas({
      smokePpm: toNumeric(item.gasLevel, 0),
      co2Ppm: toNumeric(item.pressure, 0),
    }))
    .filter((value) => value !== null);
  return average(values);
}

export function buildModel2BatchReadings({
  latestReadings = [],
  history = [],
  nodes = [],
  zones = [],
  datacenter = null,
  activeAlerts = [],
}) {
  const nodeMap = new Map(nodes.map((node) => [String(node._id || node.id), node]));
  const zoneMap = new Map(zones.map((zone) => [String(zone._id || zone.id), zone]));
  const historyMap = buildHistoryMap(history);
  const alertsByNode = activeAlerts.reduce((acc, alert) => {
    const nodeId = alert?.nodeId?._id ? String(alert.nodeId._id) : alert?.nodeId ? String(alert.nodeId) : null;
    if (!nodeId) return acc;
    acc.set(nodeId, (acc.get(nodeId) || 0) + 1);
    return acc;
  }, new Map());

  return latestReadings.map((reading) => {
    const nodeId = String(reading.nodeId || reading._id || reading.node_id);
    const node = nodeMap.get(nodeId) || null;
    const zone = node ? zoneMap.get(String(node.zoneId)) || null : null;
    const nodeType = deriveNodeType({ node, zone });
    const zoneCode = zoneCodeFromType(nodeType);
    const nodeHistory = historyMap.get(nodeId) || [];
    const recentWindow = nodeHistory.slice(-3);
    const previous = nodeHistory.length > 1 ? nodeHistory[nodeHistory.length - 2] : null;
    const co2Ppm = toNumeric(reading.pressure, 0) || 0;
    const smokePpm = toNumeric(reading.gasLevel, 0) || 0;
    const vibration = toNumeric(reading.vibration, 0) || 0;
    const humidity = toNumeric(reading.humidity, 45) || 45;

    return {
      readingId: String(reading._id || `${nodeId}:${reading.recordedAt}`),
      nodeId,
      nodeName: node?.name || null,
      zoneName: zone?.room || zone?.name || null,
      datacenter: datacenter?.name || null,
      zone_code: zoneCode,
      vibration_mm_s: vibration,
      gas_ppm: deriveGenericGas({ smokePpm, co2Ppm }),
      rssi_dbm: deriveRssi({ node, alertCount: alertsByNode.get(nodeId) || 0 }),
      roll3_gas_ppm: averageRecentGas(recentWindow) ?? deriveGenericGas({ smokePpm, co2Ppm }),
      delta_vibration_mm_s:
        previous && toNumeric(previous.vibration, null) !== null ? Number((vibration - Number(previous.vibration)).toFixed(4)) : 0,
      co2_ppm: co2Ppm,
      smoke_ppm: smokePpm,
      humidity_pct: humidity,
      roll3_humidity_pct:
        average(recentWindow.map((item) => toNumeric(item.humidity, null)).filter((value) => value !== null)) ?? humidity,
    };
  });
}

export async function detectModel2Batch({ readings = [] }) {
  if (!readings.length) {
    return {
      model: { source: "artifact", version: "unknown", available: true },
      results: [],
    };
  }

  const output = await runPythonJson(inferScriptPath, { readings }, { timeoutMs: 90_000 });
  return {
    model: output.model || { source: "artifact", version: "unknown", available: true },
    results: Array.isArray(output.results) ? output.results : [],
  };
}

export async function getModel2Status() {
  const output = await runPythonJson(inferScriptPath, { mode: "health" }, { timeoutMs: 30_000 });
  const schedulerState = getTrainingState();
  return {
    ...(output.model || { available: false, source: "artifact", version: "unknown" }),
    trainingState: schedulerState?.models?.model2 || null,
  };
}

export async function runModel2Retrain(payload) {
  return runPythonJson(retrainScriptPath, payload, { timeoutMs: 10 * 60_000 });
}

export function buildModel2Summary(results = []) {
  const counts = {
    Normal: 0,
    Maintenance: 0,
    Alerte: 0,
    Critique: 0,
  };

  const nodes = [...results]
    .sort((a, b) => {
      const severity = severityRank(b.state) - severityRank(a.state);
      if (severity !== 0) return severity;
      return Number(b.anomalyScore || 0) - Number(a.anomalyScore || 0);
    })
    .map((item) => {
      counts[item.state] = (counts[item.state] || 0) + 1;
      return {
        nodeId: item.nodeId,
        nodeName: item.nodeName,
        zoneName: item.zoneName,
        state: item.state,
        stateLabel: item.stateLabel || item.state,
        anomalyScore: item.anomalyScore,
        isAnomaly: !!item.isAnomaly,
        confidence: item.confidence,
        rootCause: item.rootCause,
        recommendation: item.recommendation,
      };
    });

  return {
    counts,
    nodes,
    anomalyCount: nodes.filter((item) => item.isAnomaly).length,
    globalState: nodes[0]?.state || "Normal",
    globalLabel: nodes[0]?.stateLabel || nodes[0]?.state || "Normal",
  };
}
