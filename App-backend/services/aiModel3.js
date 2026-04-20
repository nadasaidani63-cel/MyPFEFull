import path from "path";
import { fileURLToPath } from "url";

import { deriveNodeType, getTrainingState, runPythonJson } from "./aiModel1.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const model3Dir = path.join(backendRoot, "ai", "model3");
const inferScriptPath = path.join(model3Dir, "infer.py");
const retrainScriptPath = path.join(model3Dir, "retrain.py");

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

function deriveRssi({ node, latestReading = null }) {
  let rssi = node?.isOnline ? -67 : -89;
  if (node?.status === "warning") rssi -= 4;
  if (node?.status === "alert") rssi -= 8;
  if (node?.status === "critical") rssi -= 12;

  const vibration = toNumeric(latestReading?.vibration, 0) || 0;
  if (vibration > 1.1) rssi -= 3;

  return Math.round(clamp(rssi, -95, -45));
}

function deriveGasProxy({ smokePpm = 0, co2Ppm = 0 }) {
  const smokeComponent = Math.max(Number(smokePpm) || 0, 0) * 4.0;
  const co2Component = Math.max(Number(co2Ppm) || 0, 0) * 0.45;
  return Number(Math.max(smokeComponent, co2Component).toFixed(2));
}

function severityRank(level) {
  return {
    FAIBLE: 0,
    MOYEN: 1,
    ELEVE: 2,
    CRITIQUE: 3,
  }[level] ?? 0;
}

export function buildModel3BatchReadings({
  latestReadings = [],
  history = [],
  nodes = [],
  zones = [],
  datacenter = null,
}) {
  const nodeMap = new Map(nodes.map((node) => [String(node._id || node.id), node]));
  const zoneMap = new Map(zones.map((zone) => [String(zone._id || zone.id), zone]));
  const historyMap = buildHistoryMap(history);

  return latestReadings.map((reading) => {
    const nodeId = String(reading.nodeId || reading._id || reading.node_id);
    const node = nodeMap.get(nodeId) || null;
    const zone = node ? zoneMap.get(String(node.zoneId)) || null : null;
    const nodeType = deriveNodeType({ node, zone });
    const zoneCode = zoneCodeFromType(nodeType);
    const nodeHistory = historyMap.get(nodeId) || [];
    const recentWindow = nodeHistory.slice(-3);
    const temperature = toNumeric(reading.temperature, 24) || 24;
    const humidity = toNumeric(reading.humidity, 45) || 45;
    const co2Ppm = toNumeric(reading.pressure, 450) || 450;
    const smokePpm = toNumeric(reading.gasLevel, 0) || 0;
    const vibration = toNumeric(reading.vibration, 0) || 0;
    const smoothedSmoke = recentWindow.length
      ? recentWindow.reduce((sum, item) => sum + (toNumeric(item.gasLevel, 0) || 0), 0) / recentWindow.length
      : smokePpm;

    return {
      readingId: String(reading._id || `${nodeId}:${reading.recordedAt}`),
      nodeId,
      nodeName: node?.name || null,
      zoneName: zone?.room || zone?.name || null,
      datacenter: datacenter?.name || null,
      zone_code: zoneCode,
      temperature_c: temperature,
      humidity_pct: humidity,
      co2_ppm: co2Ppm,
      vibration_mm_s: vibration,
      gas_ppm: deriveGasProxy({ smokePpm: smoothedSmoke, co2Ppm }),
      smoke_ppm: smokePpm,
      rssi_dbm: deriveRssi({ node, latestReading: reading }),
    };
  });
}

export async function scoreModel3Batch({ readings = [] }) {
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

export async function getModel3Status() {
  const output = await runPythonJson(inferScriptPath, { mode: "health" }, { timeoutMs: 30_000 });
  const schedulerState = getTrainingState();
  return {
    ...(output.model || { available: false, source: "artifact", version: "unknown" }),
    trainingState: schedulerState?.models?.model3 || null,
  };
}

export async function runModel3Retrain(payload) {
  return runPythonJson(retrainScriptPath, payload, { timeoutMs: 10 * 60_000 });
}

export function buildModel3Summary(results = []) {
  const counts = {
    FAIBLE: 0,
    MOYEN: 0,
    ELEVE: 0,
    CRITIQUE: 0,
  };

  const nodes = [...results]
    .sort((a, b) => {
      const severity = severityRank(b.riskLevel) - severityRank(a.riskLevel);
      if (severity !== 0) return severity;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    })
    .map((item) => {
      counts[item.riskLevel] = (counts[item.riskLevel] || 0) + 1;
      return {
        nodeId: item.nodeId,
        nodeName: item.nodeName,
        zoneName: item.zoneName,
        riskLevel: item.riskLevel,
        riskCode: item.riskCode,
        riskScore: item.riskScore,
        confidence: item.confidence,
        action: item.action,
      };
    });

  return {
    counts,
    nodes,
    globalState: nodes[0]?.riskLevel || "FAIBLE",
    globalLabel: nodes[0]?.riskLevel || "FAIBLE",
  };
}
