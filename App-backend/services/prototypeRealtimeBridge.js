import { MongoClient } from "mongodb";
import Datacenter from "../models/Datacenter.js";
import Zone from "../models/Zone.js";
import Node from "../models/Node.js";
import SensorReading from "../models/SensorReading.js";
import AlertThreshold from "../models/AlertThreshold.js";
import { ingestReading } from "./ingestReading.js";

const PROTOTYPE_DC_KEY = "dc3-prototype";
const PROTOTYPE_DC_NAME = process.env.PROTO_DATACENTER_NAME || "Data Centre 3 - Prototype";
const PROTOTYPE_DC_LOCATION = process.env.PROTO_DATACENTER_LOCATION || "Prototype SISEDC, Tunis";
const PROTOTYPE_SOURCE_ENABLED =
  String(process.env.ENABLE_PROTO_DATACENTER || "true").toLowerCase() !== "false";
const PROTOTYPE_POLL_INTERVAL_MS = Number(process.env.PROTO_POLL_INTERVAL_MS || 5_000);
const PROTOTYPE_TOPOLOGY_REFRESH_MS = Number(process.env.PROTO_TOPOLOGY_REFRESH_MS || 60_000);
const PROTOTYPE_NODE_OFFLINE_AFTER_MS = Number(process.env.PROTO_NODE_OFFLINE_AFTER_MS || 120_000);

const FALLBACK_ZONES = [
  {
    key: "c0-z0",
    name: "Zone 0",
    description: "Zone 0 - Salle C0",
    room: "Salle C0",
    nodeCount: 1,
  },
  {
    key: "c0-z1",
    name: "Zone 1",
    description: "Zone 1 - Salle C0",
    room: "Salle C0",
    nodeCount: 1,
  },
];

const FALLBACK_NODES = [
  {
    externalNodeId: "ESP32-C0-Z0",
    zoneKey: "c0-z0",
    name: "ESP32-C0-Z0",
    macAddress: "A8:48:FA:C0:00:01",
    firmwareVersion: "v2.3.1",
  },
  {
    externalNodeId: "ESP32-C0-Z1",
    zoneKey: "c0-z1",
    name: "ESP32-C0-Z1",
    macAddress: "A8:48:FA:C0:01:01",
    firmwareVersion: "v2.3.1",
  },
];

const FALLBACK_THRESHOLDS = [
  { metricName: "temperature", warningMin: 15, warningMax: 30, alertMin: 15, alertMax: 40 },
  { metricName: "humidity", warningMin: 20, warningMax: 60, alertMin: 20, alertMax: 80 },
  { metricName: "gasLevel", warningMin: 0, warningMax: 300, alertMin: 0, alertMax: 500 },
  { metricName: "pressure", warningMin: 0, warningMax: 1000, alertMin: 0, alertMax: 2000 },
  { metricName: "vibration", warningMin: 0, warningMax: 2, alertMin: 0, alertMax: 5 },
];

const PROTOTYPE_THRESHOLD_MAP = {
  temperature: "temperature",
  humidity: "humidity",
  gaz: "gasLevel",
  co2: "pressure",
  vibrations: "vibration",
};

const state = {
  client: null,
  db: null,
  lastSeenExternalId: null,
  localNodeIdsByExternalId: new Map(),
  lastTopologySyncAt: 0,
  syncingTopology: false,
  polling: false,
  topologyInterval: null,
  pollInterval: null,
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ");
}

function toRoomLabel(value) {
  const raw = normalizeText(value);
  if (!raw) return "Salle C0";
  if (/^salle\s+/i.test(raw)) {
    return raw.replace(/^salle\s+/i, "Salle ");
  }
  return `Salle ${raw.toUpperCase()}`;
}

function toZoneLabel(value, fallbackIndex) {
  const raw = normalizeText(value);
  const match = raw.match(/zone\s*([a-z0-9]+)/i);
  if (match) {
    return `Zone ${String(match[1]).toUpperCase()}`;
  }
  return `Zone ${fallbackIndex}`;
}

function toZoneKey(value, fallbackIndex) {
  const raw = normalizeText(value).toLowerCase();
  const match = raw.match(/z(?:one)?[\s-]*([a-z0-9]+)/i);
  if (match) {
    return `c0-z${String(match[1]).toLowerCase()}`;
  }
  return `c0-z${fallbackIndex}`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractReadingTimestamp(doc) {
  const raw = doc?.timestamp || doc?._insertedAt || doc?.createdAt || doc?.updatedAt;
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function resetPrototypeClient() {
  if (state.client) {
    try {
      await state.client.close();
    } catch {
      // ignore close failures
    }
  }

  state.client = null;
  state.db = null;
}

async function getPrototypeDb() {
  if (!process.env.PROTO_MONGO_URI) {
    throw new Error("PROTO_MONGO_URI is not configured");
  }

  if (state.db) {
    return state.db;
  }

  const client = new MongoClient(process.env.PROTO_MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 5,
  });

  await client.connect();

  state.client = client;
  state.db = process.env.PROTO_DB_NAME ? client.db(process.env.PROTO_DB_NAME) : client.db();

  return state.db;
}

async function ensurePrototypeDatacenter() {
  return Datacenter.findOneAndUpdate(
    { key: PROTOTYPE_DC_KEY },
    {
      $set: {
        name: PROTOTYPE_DC_NAME,
        location: PROTOTYPE_DC_LOCATION,
        sourceType: "prototype",
        displayOrder: 3,
      },
      $setOnInsert: {
        key: PROTOTYPE_DC_KEY,
        status: "normal",
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
}

async function loadRemoteTopology(db) {
  const [zones, nodes, thresholds] = await Promise.all([
    db.collection("zones").find({ active: { $ne: false } }).sort({ salle: 1, name: 1 }).toArray(),
    db.collection("nodes").find({ active: { $ne: false } }).sort({ id: 1, name: 1 }).toArray(),
    db.collection("thresholds").find({}).toArray(),
  ]);

  return { zones, nodes, thresholds };
}

function buildPrototypeTopology(remoteTopology) {
  if (!remoteTopology?.zones?.length || !remoteTopology?.nodes?.length) {
    return {
      zones: FALLBACK_ZONES.map((zone, index) => ({
        ...zone,
        displayOrder: index + 1,
      })),
      nodes: FALLBACK_NODES.map((node) => ({ ...node, isOnline: false })),
      thresholds: FALLBACK_THRESHOLDS,
    };
  }

  const zones = remoteTopology.zones.map((zone, index) => ({
    key: toZoneKey(zone.name || zone.description || zone.salle, index),
    name: toZoneLabel(zone.name || zone.description || zone.salle, index),
    description: normalizeText(zone.description) || `${toZoneLabel(zone.name, index)} - ${toRoomLabel(zone.salle || zone.rack)}`,
    room: toRoomLabel(zone.salle || zone.rack),
    displayOrder: index + 1,
    externalName: normalizeText(zone.name),
  }));

  const zoneByExternalName = new Map(
    zones.map((zone) => [zone.externalName || zone.description, zone.key])
  );

  const nodes = remoteTopology.nodes.map((node, index) => ({
    externalNodeId: normalizeText(node.id || node.node_id || node.name || `ESP32-PROTOTYPE-${index + 1}`),
    zoneKey:
      zoneByExternalName.get(normalizeText(node.zone)) ||
      toZoneKey(node.zone || node.salle || node.rack, index),
    name: normalizeText(node.id || node.name || `ESP32-PROTOTYPE-${index + 1}`),
    macAddress: normalizeText(node.mac) || null,
    firmwareVersion: normalizeText(node.firmware) || null,
    isOnline: Boolean(node.active) && !Boolean(node.simulateOffline),
  }));

  const thresholds = remoteTopology.thresholds
    .map((item) => {
      const metricName = PROTOTYPE_THRESHOLD_MAP[item.param];
      if (!metricName) return null;

      return {
        metricName,
        warningMin: toNumber(item.min) ?? 0,
        warningMax: toNumber(item.max) ?? 0,
        alertMin: toNumber(item.min) ?? 0,
        alertMax: toNumber(item.critical) ?? toNumber(item.max) ?? 0,
      };
    })
    .filter(Boolean);

  return {
    zones,
    nodes,
    thresholds: thresholds.length ? thresholds : FALLBACK_THRESHOLDS,
  };
}

async function upsertPrototypeTopology(topology) {
  const datacenter = await ensurePrototypeDatacenter();

  const localZoneIdsByKey = new Map();

  for (const zone of topology.zones) {
    const localZone = await Zone.findOneAndUpdate(
      { key: `${PROTOTYPE_DC_KEY}:${zone.key}` },
      {
        $set: {
          name: zone.name,
          description: zone.description,
          datacenterId: datacenter._id,
          sourceType: "prototype",
          part: "Prototype",
          room: zone.room,
          roomPart: null,
          displayOrder: zone.displayOrder,
        },
        $setOnInsert: {
          key: `${PROTOTYPE_DC_KEY}:${zone.key}`,
          status: "normal",
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    localZoneIdsByKey.set(zone.key, localZone._id);
  }

  const localNodeIdsByExternalId = new Map();

  for (const node of topology.nodes) {
    const zoneId = localZoneIdsByKey.get(node.zoneKey) || localZoneIdsByKey.get(FALLBACK_ZONES[0].key);
    if (!zoneId) continue;

    const localNode = await Node.findOneAndUpdate(
      { externalNodeId: node.externalNodeId },
      {
        $set: {
          key: `${PROTOTYPE_DC_KEY}:${node.externalNodeId}`,
          name: node.name,
          zoneId,
          sourceType: "prototype",
          isOnline: Boolean(node.isOnline),
          macAddress: node.macAddress,
          firmwareVersion: node.firmwareVersion,
        },
        $setOnInsert: {
          status: "normal",
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    localNodeIdsByExternalId.set(node.externalNodeId, String(localNode._id));
  }

  for (const threshold of topology.thresholds) {
    await AlertThreshold.findOneAndUpdate(
      {
        scopeType: "datacenter",
        scopeId: datacenter._id,
        metricName: threshold.metricName,
      },
      {
        scopeType: "datacenter",
        scopeId: datacenter._id,
        metricName: threshold.metricName,
        warningMin: threshold.warningMin,
        warningMax: threshold.warningMax,
        alertMin: threshold.alertMin,
        alertMax: threshold.alertMax,
        enabled: true,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  }

  state.localNodeIdsByExternalId = localNodeIdsByExternalId;
  state.lastTopologySyncAt = Date.now();

  return datacenter;
}

async function syncPrototypeTopology() {
  if (state.syncingTopology) return;
  state.syncingTopology = true;

  try {
    let remoteTopology = null;

    try {
      const db = await getPrototypeDb();
      remoteTopology = await loadRemoteTopology(db);
    } catch (error) {
      console.warn("[prototype-bridge] Remote topology unavailable, using fallback skeleton:", error.message);
      await resetPrototypeClient();
    }

    const topology = buildPrototypeTopology(remoteTopology);
    const datacenter = await upsertPrototypeTopology(topology);

    console.log(
      `[prototype-bridge] Topology ready for ${datacenter.name} (${topology.zones.length} zones, ${topology.nodes.length} nodes)`
    );
  } finally {
    state.syncingTopology = false;
  }
}

async function shouldSkipExistingReading(localNodeId, recordedAt) {
  const latest = await SensorReading.findOne({ nodeId: localNodeId }).sort({ recordedAt: -1 }).lean();
  if (!latest?.recordedAt) return false;
  return new Date(latest.recordedAt).getTime() >= recordedAt.getTime();
}

async function ingestPrototypeReading(io, doc, { skipIfAlreadyStored = false } = {}) {
  const externalNodeId = normalizeText(doc?.node_id || doc?.nodeId);
  if (!externalNodeId) return false;

  let localNodeId = state.localNodeIdsByExternalId.get(externalNodeId);
  if (!localNodeId) {
    await syncPrototypeTopology();
    localNodeId = state.localNodeIdsByExternalId.get(externalNodeId);
  }
  if (!localNodeId) return false;

  const recordedAt = extractReadingTimestamp(doc);
  if (skipIfAlreadyStored && (await shouldSkipExistingReading(localNodeId, recordedAt))) {
    return false;
  }

  await ingestReading({
    payload: {
      nodeId: localNodeId,
      temperature: toNumber(doc.temperature_c ?? doc?.sensors?.temperature ?? doc.temperature),
      humidity: toNumber(doc.humidity_pct ?? doc?.sensors?.humidity ?? doc.humidity),
      gasLevel: toNumber(doc.gas_ppm ?? doc?.sensors?.gaz ?? doc.gasLevel ?? doc.gaz),
      pressure: toNumber(doc.co2_ppm ?? doc?.sensors?.co2 ?? doc.pressure ?? doc.co2),
      vibration: toNumber(doc.vibration_g ?? doc?.sensors?.vibration ?? doc.vibration),
      recordedAt,
    },
    io,
  });

  return true;
}

async function bootstrapLatestPrototypeReadings(io) {
  const db = await getPrototypeDb();
  const docs = await db
    .collection("sensordata")
    .aggregate([
      { $sort: { _id: -1 } },
      { $group: { _id: "$node_id", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  for (const doc of docs) {
    await ingestPrototypeReading(io, doc, { skipIfAlreadyStored: true });
  }

  state.lastSeenExternalId = docs.length ? docs[docs.length - 1]._id : state.lastSeenExternalId;
}

async function refreshPrototypeConnectivity() {
  const cutoff = new Date(Date.now() - PROTOTYPE_NODE_OFFLINE_AFTER_MS);
  await Node.updateMany(
    {
      sourceType: "prototype",
      $or: [{ lastPing: { $lt: cutoff } }, { lastPing: null }],
    },
    { $set: { isOnline: false } }
  );
}

async function pollPrototypeReadings(io) {
  if (state.polling) return;
  state.polling = true;

  try {
    if (!state.lastTopologySyncAt || Date.now() - state.lastTopologySyncAt > PROTOTYPE_TOPOLOGY_REFRESH_MS) {
      await syncPrototypeTopology();
    }

    const db = await getPrototypeDb();
    if (!state.lastSeenExternalId) {
      await bootstrapLatestPrototypeReadings(io);
      await refreshPrototypeConnectivity();
      return;
    }

    let processed = 0;

    while (true) {
      const docs = await db
        .collection("sensordata")
        .find({ _id: { $gt: state.lastSeenExternalId } })
        .sort({ _id: 1 })
        .limit(100)
        .toArray();

      if (!docs.length) break;

      for (const doc of docs) {
        await ingestPrototypeReading(io, doc);
        state.lastSeenExternalId = doc._id;
        processed += 1;
      }

      if (docs.length < 100) break;
    }

    if (processed > 0) {
      console.log(`[prototype-bridge] Synced ${processed} prototype reading(s)`);
    }

    await refreshPrototypeConnectivity();
  } catch (error) {
    console.warn("[prototype-bridge] Poll failed:", error.message);
    await resetPrototypeClient();
  } finally {
    state.polling = false;
  }
}

export async function startPrototypeRealtimeBridge(io) {
  if (!PROTOTYPE_SOURCE_ENABLED) {
    console.log("[prototype-bridge] Disabled");
    return;
  }

  await syncPrototypeTopology();
  await pollPrototypeReadings(io);

  if (!state.topologyInterval) {
    state.topologyInterval = setInterval(() => {
      syncPrototypeTopology().catch((error) => {
        console.warn("[prototype-bridge] Topology refresh failed:", error.message);
      });
    }, PROTOTYPE_TOPOLOGY_REFRESH_MS);
  }

  if (!state.pollInterval) {
    state.pollInterval = setInterval(() => {
      pollPrototypeReadings(io).catch((error) => {
        console.warn("[prototype-bridge] Incremental poll failed:", error.message);
      });
    }, PROTOTYPE_POLL_INTERVAL_MS);
  }
}
