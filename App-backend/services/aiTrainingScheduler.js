import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Node from "../models/Node.js";
import SensorReading from "../models/SensorReading.js";
import Zone from "../models/Zone.js";
import {
  deriveNodeType,
  getTrainingState,
  runModel1Retrain,
  saveTrainingState,
} from "./aiModel1.js";

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
  const nodes = await Node.find({ _id: { $in: nodeIds } }).lean();
  const zoneIds = [...new Set(nodes.map((node) => String(node.zoneId)))];
  const zones = await Zone.find({ _id: { $in: zoneIds } }).lean();

  const nodeMap = new Map(nodes.map((node) => [String(node._id), node]));
  const zoneMap = new Map(zones.map((zone) => [String(zone._id), zone]));

  fs.mkdirSync(runtimeDir, { recursive: true });
  const header = [
    "recorded_at",
    "node_id",
    "node_name",
    "zone_name",
    "node_type",
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

export async function runModel1RetrainingIfNeeded({ force = false } = {}) {
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
    const result = await runModel1Retrain({
      appDatasetPath: exported.exportPath,
      maxAppRows: maxRows,
      minAppRows: Math.max(150, Number(process.env.AI_RETRAIN_MIN_ROWS || 250)),
    });

    const nextState = {
      enabled: true,
      lastRunAt: new Date().toISOString(),
      lastReadingCount: totalReadings,
      exportPath: exported.exportPath,
      exportRowCount: exported.rowCount,
      result,
    };
    saveTrainingState(nextState);
    return {
      success: !!result.success,
      skipped: !!result.skipped,
      totalReadings,
      exportRowCount: exported.rowCount,
      ...result,
    };
  } finally {
    trainingInFlight = false;
  }
}

export function startAiTrainingScheduler() {
  const enabled = String(process.env.ENABLE_AI_RETRAINING || "true").toLowerCase() !== "false";
  if (!enabled || intervalHandle) return;

  const intervalMs = Math.max(5 * 60_000, Number(process.env.AI_RETRAIN_INTERVAL_MS || 30 * 60_000));
  intervalHandle = setInterval(() => {
    runModel1RetrainingIfNeeded().catch((error) => {
      saveTrainingState({
        ...(getTrainingState() || {}),
        enabled: true,
        lastRunAt: new Date().toISOString(),
        lastError: error.message,
      });
      console.error("AI retraining error:", error);
    });
  }, intervalMs);
}

