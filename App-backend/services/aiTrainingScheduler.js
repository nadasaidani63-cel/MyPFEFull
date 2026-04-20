import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Alert from "../models/Alert.js";
import Node from "../models/Node.js";
import SensorReading from "../models/SensorReading.js";
import Zone from "../models/Zone.js";
import {
  deriveNodeType,
  getTrainingState,
  runModel1Retrain,
  saveTrainingState,
} from "./aiModel1.js";
import { runModel2Retrain } from "./aiModel2.js";
import { runModel3Retrain } from "./aiModel3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const runtimeDir = path.join(backendRoot, "ai", "runtime");
const exportCsvPath = path.join(runtimeDir, "model1_app_training.csv");

let intervalHandle = null;
let trainingInFlight = false;

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

async function exportReadingsForTraining({ maxRows = 12000 }) {
  const readings = await SensorReading.find({})
    .sort({ recordedAt: -1 })
    .limit(maxRows)
    .lean();

  const ordered = [...readings].reverse();
  const nodeIds = [...new Set(ordered.map((reading) => String(reading.nodeId)))];
  const [nodes, activeAlerts] = await Promise.all([
    Node.find({ _id: { $in: nodeIds } }).lean(),
    Alert.find({ nodeId: { $in: nodeIds }, status: "active" }, "nodeId").lean(),
  ]);
  const zoneIds = [...new Set(nodes.map((node) => String(node.zoneId)))];
  const zones = await Zone.find({ _id: { $in: zoneIds } }).lean();

  const nodeMap = new Map(nodes.map((node) => [String(node._id), node]));
  const zoneMap = new Map(zones.map((zone) => [String(zone._id), zone]));
  const alertCountByNode = activeAlerts.reduce((map, alert) => {
    const nodeId = String(alert.nodeId);
    map.set(nodeId, (map.get(nodeId) || 0) + 1);
    return map;
  }, new Map());

  fs.mkdirSync(runtimeDir, { recursive: true });
  const header = [
    "recorded_at",
    "node_id",
    "node_name",
    "zone_name",
    "node_type",
    "node_status",
    "is_online",
    "last_ping",
    "active_alert_count",
    "temperature",
    "humidity",
    "pressure",
    "vibration",
    "gas_level",
  ];

  const lines = [header.join(",")];
  for (const reading of ordered) {
    const node = nodeMap.get(String(reading.nodeId)) || null;
    const zone = node ? zoneMap.get(String(node.zoneId)) || null : null;
    lines.push([
      csvEscape(reading.recordedAt ? new Date(reading.recordedAt).toISOString() : null),
      csvEscape(reading.nodeId),
      csvEscape(node?.name || null),
      csvEscape(zone?.room || zone?.name || null),
      csvEscape(deriveNodeType({ node, zone })),
      csvEscape(node?.status || null),
      csvEscape(node?.isOnline ?? null),
      csvEscape(node?.lastPing ? new Date(node.lastPing).toISOString() : null),
      csvEscape(alertCountByNode.get(String(reading.nodeId)) || 0),
      csvEscape(reading.temperature),
      csvEscape(reading.humidity),
      csvEscape(reading.pressure),
      csvEscape(reading.vibration),
      csvEscape(reading.gasLevel),
    ].join(","));
  }

  fs.writeFileSync(exportCsvPath, lines.join("\n"), "utf8");
  return {
    rowCount: ordered.length,
    exportPath: exportCsvPath,
  };
}

async function runRetrainStep(label, callback) {
  try {
    const result = await callback();
    return {
      label,
      success: !!result?.success,
      skipped: !!result?.skipped,
      lastRunAt: new Date().toISOString(),
      ...result,
    };
  } catch (error) {
    return {
      label,
      success: false,
      skipped: false,
      lastRunAt: new Date().toISOString(),
      error: error.message,
    };
  }
}

export async function runAiRetrainingIfNeeded({ force = false } = {}) {
  if (trainingInFlight) {
    return {
      success: false,
      skipped: true,
      reason: "training_already_running",
    };
  }

  trainingInFlight = true;
  try {
    const totalReadings = await SensorReading.countDocuments();
    const lastState = getTrainingState();
    const minNewReadings = Math.max(50, Number(process.env.AI_RETRAIN_MIN_NEW_READINGS || 250));
    const maxRows = Math.max(1000, Number(process.env.AI_RETRAIN_MAX_ROWS || 12000));

    if (!force && totalReadings - Number(lastState.lastReadingCount || 0) < minNewReadings) {
      return {
        success: false,
        skipped: true,
        reason: "not_enough_new_readings",
        totalReadings,
        lastReadingCount: Number(lastState.lastReadingCount || 0),
      };
    }

    const exported = await exportReadingsForTraining({ maxRows });
    const sharedPayload = {
      appDatasetPath: exported.exportPath,
      maxAppRows: maxRows,
      minAppRows: Math.max(150, Number(process.env.AI_RETRAIN_MIN_ROWS || 250)),
    };

    const [model1, model2, model3] = await Promise.all([
      runRetrainStep("model1", () => runModel1Retrain(sharedPayload)),
      runRetrainStep("model2", () =>
        runModel2Retrain({
          ...sharedPayload,
          contamination: Number(process.env.AI_MODEL2_CONTAMINATION || 0.1),
        })
      ),
      runRetrainStep("model3", () => runModel3Retrain(sharedPayload)),
    ]);

    const nextState = {
      enabled: true,
      lastRunAt: new Date().toISOString(),
      lastReadingCount: totalReadings,
      exportPath: exported.exportPath,
      exportRowCount: exported.rowCount,
      result: model1,
      models: {
        model1,
        model2,
        model3,
      },
    };
    saveTrainingState(nextState);

    const models = nextState.models;
    const successCount = Object.values(models).filter((item) => item.success).length;
    const skippedCount = Object.values(models).filter((item) => item.skipped).length;

    return {
      success: successCount > 0,
      skipped: successCount === 0 && skippedCount === Object.keys(models).length,
      totalReadings,
      exportRowCount: exported.rowCount,
      models,
    };
  } finally {
    trainingInFlight = false;
  }
}

export async function runModel1RetrainingIfNeeded(options = {}) {
  return runAiRetrainingIfNeeded(options);
}

function handleTrainingError(error) {
  saveTrainingState({
    ...(getTrainingState() || {}),
    enabled: true,
    lastRunAt: new Date().toISOString(),
    lastError: error.message,
  });
  console.error("AI retraining error:", error);
}

export function startAiTrainingScheduler() {
  const enabled = String(process.env.ENABLE_AI_RETRAINING || "true").toLowerCase() !== "false";
  if (!enabled || intervalHandle) return;

  const intervalMs = Math.max(5 * 60_000, Number(process.env.AI_RETRAIN_INTERVAL_MS || 30 * 60_000));
  const runCycle = () => {
    runAiRetrainingIfNeeded().catch(handleTrainingError);
  };

  intervalHandle = setInterval(() => {
    runCycle();
  }, intervalMs);

  runCycle();
}
