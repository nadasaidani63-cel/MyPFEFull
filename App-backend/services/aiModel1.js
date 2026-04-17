import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const model1Dir = path.join(backendRoot, "ai", "model1");
const inferScriptPath = path.join(model1Dir, "infer.py");
const retrainScriptPath = path.join(model1Dir, "retrain.py");
const trainingRuntimeDir = path.join(backendRoot, "ai", "runtime");
const trainingStatePath = path.join(trainingRuntimeDir, "training_state.json");

const PYTHON_EXECUTABLE = process.env.AI_PYTHON_EXECUTABLE || "python";

function readJsonIfExists(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function severityRank(state) {
  return {
    Normal: 0,
    Alerte: 1,
    Maintenance: 2,
    Critique: 3,
  }[state] ?? 0;
}

function parseOutput(stdout, stderr) {
  try {
    return JSON.parse(stdout || "{}");
  } catch {
    throw new Error(stderr || stdout || "Invalid JSON returned by Python model");
  }
}

function runPythonJson(scriptPath, payload, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_EXECUTABLE, [scriptPath], {
      cwd: backendRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Python AI process timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || `Python process exited with code ${code}`));
        return;
      }
      resolve(parseOutput(stdout, stderr));
    });

    child.stdin.write(JSON.stringify(payload || {}));
    child.stdin.end();
  });
}

export function deriveNodeType({ node, zone }) {
  const text = [node?.name, zone?.name, zone?.room, zone?.part, zone?.description]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (/(UPS|BATTER|ENERG|ONDULEUR)/.test(text)) return "UPS";
  if (/(INTERCON|RESEAU|RESEAUX|NETWORK|NET|SWITCH|ROUTEUR)/.test(text)) return "NET";
  if (/(ENV|AMBIAN|CLIM|COOL)/.test(text)) return "OTHER";
  return "SRV";
}

function buildPreviousReadingMap(history = []) {
  const grouped = new Map();
  const sorted = [...history].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  for (const reading of sorted) {
    const key = String(reading.nodeId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(reading);
  }

  const latestPairByNode = new Map();
  for (const [nodeId, readings] of grouped.entries()) {
    const latest = readings[readings.length - 1] || null;
    const previous = readings.length > 1 ? readings[readings.length - 2] : null;
    latestPairByNode.set(nodeId, { latest, previous });
  }
  return latestPairByNode;
}

export function buildModel1BatchReadings({
  latestReadings = [],
  history = [],
  nodes = [],
  zones = [],
  datacenter = null,
  thresholdsByNode = {},
}) {
  const nodeMap = new Map(nodes.map((node) => [String(node._id || node.id), node]));
  const zoneMap = new Map(zones.map((zone) => [String(zone._id || zone.id), zone]));
  const pairMap = buildPreviousReadingMap(history);

  return latestReadings.map((reading) => {
    const nodeId = String(reading.nodeId || reading._id || reading.node_id);
    const node = nodeMap.get(nodeId) || null;
    const zone = node ? zoneMap.get(String(node.zoneId)) || null : null;
    const pair = pairMap.get(nodeId) || { latest: reading, previous: null };
    const previous = pair.previous;

    const currentTemperature = Number.isFinite(Number(reading.temperature)) ? Number(reading.temperature) : null;
    const currentHumidity = Number.isFinite(Number(reading.humidity)) ? Number(reading.humidity) : null;
    const currentPressure = Number.isFinite(Number(reading.pressure)) ? Number(reading.pressure) : null;
    const currentVibration = Number.isFinite(Number(reading.vibration)) ? Number(reading.vibration) : null;
    const currentGasLevel = Number.isFinite(Number(reading.gasLevel)) ? Number(reading.gasLevel) : null;

    return {
      readingId: String(reading._id || `${nodeId}:${reading.recordedAt}`),
      nodeId,
      nodeName: node?.name || null,
      zoneName: zone?.room || zone?.name || null,
      datacenter: datacenter?.name || null,
      nodeType: deriveNodeType({ node, zone }),
      temperature: currentTemperature,
      humidity: currentHumidity,
      pressure: currentPressure,
      vibration: currentVibration,
      gasLevel: currentGasLevel,
      deltaTemperature:
        previous && Number.isFinite(Number(previous.temperature)) && currentTemperature !== null
          ? currentTemperature - Number(previous.temperature)
          : 0,
      deltaHumidity:
        previous && Number.isFinite(Number(previous.humidity)) && currentHumidity !== null
          ? currentHumidity - Number(previous.humidity)
          : 0,
      deltaPressure:
        previous && Number.isFinite(Number(previous.pressure)) && currentPressure !== null
          ? currentPressure - Number(previous.pressure)
          : 0,
      deltaGasLevel:
        previous && Number.isFinite(Number(previous.gasLevel)) && currentGasLevel !== null
          ? currentGasLevel - Number(previous.gasLevel)
          : 0,
      deltaVibration:
        previous && Number.isFinite(Number(previous.vibration)) && currentVibration !== null
          ? currentVibration - Number(previous.vibration)
          : 0,
      thresholds: thresholdsByNode[nodeId] || null,
    };
  });
}

export async function classifyModel1Batch({ readings = [] }) {
  if (!readings.length) {
    return {
      model: { source: "artifact", version: "unknown" },
      results: [],
    };
  }

  const output = await runPythonJson(inferScriptPath, { readings }, { timeoutMs: 90_000 });
  return {
    model: output.model || { source: "artifact", version: "unknown" },
    results: Array.isArray(output.results) ? output.results : [],
  };
}

export async function getModel1Status() {
  const output = await runPythonJson(inferScriptPath, { mode: "health" }, { timeoutMs: 30_000 });
  const trainingState = readJsonIfExists(trainingStatePath, {});
  return {
    ...(output.model || {}),
    trainingState,
  };
}

export function getTrainingState() {
  return readJsonIfExists(trainingStatePath, {});
}

export function saveTrainingState(nextState) {
  writeJson(trainingStatePath, nextState);
}

export function buildClassificationSummary(results = []) {
  const counts = {
    Normal: 0,
    Alerte: 0,
    Critique: 0,
    Maintenance: 0,
  };
  const causeCounts = new Map();

  const nodes = [...results]
    .sort((a, b) => {
      const severity = severityRank(b.state) - severityRank(a.state);
      if (severity !== 0) return severity;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    })
    .map((item) => {
      counts[item.state] = (counts[item.state] || 0) + 1;
      if (item.rootCause && item.rootCause !== "none") {
        causeCounts.set(item.rootCause, (causeCounts.get(item.rootCause) || 0) + 1);
      }
      return {
        nodeId: item.nodeId,
        nodeName: item.nodeName,
        zoneName: item.zoneName,
        nodeType: item.nodeType,
        state: item.state,
        stateLabel: item.state,
        confidence: item.confidence,
        rootCause: item.rootCause,
        recommendation: item.recommendation,
        method: item.method,
      };
    });

  const topRootCauses = [...causeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({
      key,
      label: key.replaceAll("_", " "),
      count,
    }));

  const globalState = nodes.length ? nodes[0].state : "Normal";
  return {
    counts,
    nodes,
    topRootCauses,
    globalState,
    globalLabel: globalState,
  };
}

export async function runModel1Retrain(payload) {
  return runPythonJson(retrainScriptPath, payload, { timeoutMs: 10 * 60_000 });
}

