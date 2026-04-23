import SensorReading from "../models/SensorReading.js";
import Node from "../models/Node.js";
import Zone from "../models/Zone.js";
import Datacenter from "../models/Datacenter.js";
import { ingestReading } from "../services/ingestReading.js";
import { getIO } from "../services/socketInstance.js";
import { getEffectiveThresholds } from "../services/thresholds.js";
import { buildAiInsights, fetchActiveAlertsForAi } from "../services/aiInsights.js";
import {
  buildClassificationSummary,
  buildModel1BatchReadings,
  classifyModel1Batch,
  getModel1Status,
} from "../services/aiModel1.js";
import {
  buildModel2BatchReadings,
  buildModel2Summary,
  detectModel2Batch,
  getModel2Status,
} from "../services/aiModel2.js";
import {
  buildModel3BatchReadings,
  buildModel3Summary,
  getModel3Status,
  scoreModel3Batch,
} from "../services/aiModel3.js";
import { buildAssistantReply } from "../services/assistantChat.js";

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toId(value) {
  if (!value) return null;
  return String(value._id || value);
}

async function resolveScope({ datacenterId = null, zoneId = null, nodeId = null }) {
  let resolvedNode = null;
  let resolvedZone = null;
  let resolvedDatacenter = null;

  if (nodeId) {
    resolvedNode = await Node.findById(nodeId).lean();
    if (!resolvedNode) {
      throw createHttpError("Noeud introuvable", 404);
    }
    zoneId = toId(resolvedNode.zoneId);
  }

  if (zoneId) {
    resolvedZone = await Zone.findById(zoneId).lean();
    if (!resolvedZone) {
      throw createHttpError("Zone introuvable", 404);
    }
    datacenterId = datacenterId || toId(resolvedZone.datacenterId);
  }

  if (datacenterId) {
    resolvedDatacenter = await Datacenter.findById(datacenterId).lean();
    if (!resolvedDatacenter) {
      throw createHttpError("Datacenter introuvable", 404);
    }
  }

  return {
    datacenterId: datacenterId || null,
    zoneId: zoneId || null,
    nodeId: nodeId || null,
    datacenter: resolvedDatacenter,
    zone: resolvedZone,
    node: resolvedNode,
  };
}

async function resolveNodeIds({ datacenterId = null, zoneId = null, nodeId = null }) {
  if (nodeId) return [nodeId];

  if (zoneId) {
    const nodes = await Node.find({ zoneId }, "_id").lean();
    return nodes.map((node) => node._id);
  }

  if (datacenterId) {
    const zones = await Zone.find({ datacenterId }, "_id").lean();
    const zoneIds = zones.map((zone) => zone._id);
    if (!zoneIds.length) return [];
    const nodes = await Node.find({ zoneId: { $in: zoneIds } }, "_id").lean();
    return nodes.map((node) => node._id);
  }

  return [];
}

async function buildThresholdsByNode({ datacenterId = null, nodes = [] }) {
  if (!nodes.length) return {};

  const entries = await Promise.all(
    nodes.map(async (node) => {
      const nodeId = toId(node._id);
      const zoneId = toId(node.zoneId);
      const thresholds = await getEffectiveThresholds({ datacenterId, zoneId, nodeId });
      return [nodeId, thresholds];
    })
  );

  return Object.fromEntries(entries);
}

async function buildAiContext({ datacenterId = null, zoneId = null, nodeId = null, hours = 6, points = 18 }) {
  const scope = await resolveScope({ datacenterId, zoneId, nodeId });
  const resolvedNodeIds = await resolveNodeIds(scope);
  const noMatchingNodes = Boolean(scope.datacenterId || scope.zoneId || scope.nodeId) && !resolvedNodeIds.length;

  const filter = {
    recordedAt: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
  };
  if (resolvedNodeIds.length) {
    filter.nodeId = { $in: resolvedNodeIds };
  }

  const [history, latestReadings, activeAlerts, nodes, thresholds] = await Promise.all([
    noMatchingNodes ? [] : SensorReading.find(filter).sort({ recordedAt: 1 }).limit(8000).lean(),
    noMatchingNodes
      ? []
      : SensorReading.aggregate([
          { $match: { nodeId: { $in: resolvedNodeIds } } },
          { $sort: { recordedAt: -1 } },
          { $group: { _id: "$nodeId", doc: { $first: "$$ROOT" } } },
          { $replaceRoot: { newRoot: "$doc" } },
        ]),
    fetchActiveAlertsForAi(scope.datacenterId),
    resolvedNodeIds.length ? Node.find({ _id: { $in: resolvedNodeIds } }).lean() : [],
    getEffectiveThresholds({
      datacenterId: scope.datacenterId,
      zoneId: scope.zoneId,
      nodeId: scope.nodeId,
    }),
  ]);

  const zoneIds = [...new Set(nodes.map((node) => toId(node.zoneId)).filter(Boolean))];
  const zones = zoneIds.length ? await Zone.find({ _id: { $in: zoneIds } }).lean() : [];
  const thresholdsByNode = await buildThresholdsByNode({
    datacenterId: scope.datacenterId,
    nodes,
  });

  let classifications = buildClassificationSummary([]);
  let aiModelStatus = {
    available: false,
    source: "unavailable",
    version: "unknown",
    trainingState: {},
  };
  let model2Summary = buildModel2Summary([]);
  let model2Status = {
    available: false,
    source: "unavailable",
    version: "unknown",
  };
  let model3Summary = buildModel3Summary([]);
  let model3Status = {
    available: false,
    source: "unavailable",
    version: "unknown",
  };

  try {
    const modelStatus = await getModel1Status();
    aiModelStatus = {
      ...modelStatus,
      available: true,
    };
  } catch (error) {
    aiModelStatus = {
      available: false,
      error: error.message,
      source: "unavailable",
      version: "unknown",
      trainingState: {},
    };
  }

  try {
    const batchReadings = buildModel1BatchReadings({
      latestReadings,
      history,
      nodes,
      zones,
      datacenter: scope.datacenter,
      thresholdsByNode,
    });

    const modelBatch = await classifyModel1Batch({ readings: batchReadings });
    classifications = buildClassificationSummary(modelBatch.results || []);
    classifications.model = modelBatch.model || null;
    classifications.generatedAt = new Date().toISOString();

    if (!aiModelStatus.error) {
      aiModelStatus = {
        ...aiModelStatus,
        available: true,
        source: modelBatch.model?.source || aiModelStatus.source,
        version: modelBatch.model?.version || aiModelStatus.version,
        batchSize: batchReadings.length,
      };
    }
  } catch (error) {
    classifications = {
      ...classifications,
      error: error.message,
    };
    aiModelStatus = {
      ...aiModelStatus,
      available: false,
      error: aiModelStatus.error || error.message,
    };
  }

  try {
    model2Status = {
      ...(await getModel2Status()),
      available: true,
    };
  } catch (error) {
    model2Status = {
      available: false,
      error: error.message,
      source: "unavailable",
      version: "unknown",
    };
  }

  try {
    const model2Readings = buildModel2BatchReadings({
      latestReadings,
      history,
      nodes,
      zones,
      datacenter: scope.datacenter,
      activeAlerts,
    });
    const model2Batch = await detectModel2Batch({ readings: model2Readings });
    model2Summary = buildModel2Summary(model2Batch.results || []);
    model2Summary.model = model2Batch.model || null;
    if (!model2Status.error) {
      model2Status = {
        ...model2Status,
        available: true,
        source: model2Batch.model?.source || model2Status.source,
        version: model2Batch.model?.version || model2Status.version,
        batchSize: model2Readings.length,
      };
    }
  } catch (error) {
    model2Summary = {
      ...model2Summary,
      error: error.message,
    };
    model2Status = {
      ...model2Status,
      available: false,
      error: model2Status.error || error.message,
    };
  }

  try {
    model3Status = {
      ...(await getModel3Status()),
      available: true,
    };
  } catch (error) {
    model3Status = {
      available: false,
      error: error.message,
      source: "unavailable",
      version: "unknown",
    };
  }

  try {
    const model3Readings = buildModel3BatchReadings({
      latestReadings,
      history,
      nodes,
      zones,
      datacenter: scope.datacenter,
    });
    const model3Batch = await scoreModel3Batch({ readings: model3Readings });
    model3Summary = buildModel3Summary(model3Batch.results || []);
    model3Summary.model = model3Batch.model || null;
    if (!model3Status.error) {
      model3Status = {
        ...model3Status,
        available: true,
        source: model3Batch.model?.source || model3Status.source,
        version: model3Batch.model?.version || model3Status.version,
        batchSize: model3Readings.length,
      };
    }
  } catch (error) {
    model3Summary = {
      ...model3Summary,
      error: error.message,
    };
    model3Status = {
      ...model3Status,
      available: false,
      error: model3Status.error || error.message,
    };
  }

  const insights = await buildAiInsights({
    datacenter: scope.datacenter,
    thresholds,
    history,
    latestReadings,
    nodes,
    activeAlerts,
    classifications,
    aiModelStatus,
    model2Summary,
    model2Status,
    model3Summary,
    model3Status,
    hours,
    points,
  });

  return {
    scope,
    insights,
  };
}

export const getLatestReadings = async (req, res) => {
  try {
    const nodeIds = await resolveNodeIds(req.query);
    const hasScope = Boolean(req.query.datacenterId || req.query.zoneId || req.query.nodeId);
    const readings = hasScope && !nodeIds.length
      ? []
      : await SensorReading.aggregate([
          ...(nodeIds.length ? [{ $match: { nodeId: { $in: nodeIds } } }] : []),
          { $sort: { recordedAt: -1 } },
          { $group: { _id: "$nodeId", doc: { $first: "$$ROOT" } } },
          { $replaceRoot: { newRoot: "$doc" } },
        ]);

    res.json({ success: true, data: readings });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Error fetching latest readings",
      error: error.message,
    });
  }
};

export const getSensorHistory = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(10000, Number(req.query.limit || 500)));
    const skip = (page - 1) * limit;

    const nodeIds = await resolveNodeIds(req.query);
    const hasScope = Boolean(req.query.datacenterId || req.query.zoneId || req.query.nodeId);
    if (hasScope && !nodeIds.length) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, pages: 1 },
      });
    }

    const filter = {};
    if (nodeIds.length) filter.nodeId = { $in: nodeIds };

    if (req.query.hours && !req.query.from && !req.query.to) {
      filter.recordedAt = { $gte: new Date(Date.now() - Number(req.query.hours) * 60 * 60 * 1000) };
    }

    if (req.query.from || req.query.to) {
      filter.recordedAt = filter.recordedAt || {};
      if (req.query.from) filter.recordedAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.recordedAt.$lte = new Date(req.query.to);
    }

    const [total, readingsDesc] = await Promise.all([
      SensorReading.countDocuments(filter),
      SensorReading.find(filter)
        .sort({ recordedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("nodeId", "name zoneId"),
    ]);

    res.json({
      success: true,
      data: [...readingsDesc].reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Error fetching sensor history",
      error: error.message,
    });
  }
};

export const createReading = async (req, res) => {
  try {
    const result = await ingestReading({ payload: req.body, io: getIO() });
    res.status(201).json({
      success: true,
      data: result.reading,
      level: result.nodeLevel,
      triggeredMetrics: result.triggeredMetrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error saving sensor reading",
      error: error.message,
    });
  }
};

export const getAiInsights = async (req, res) => {
  try {
    const datacenterId = req.query.datacenterId || null;
    const zoneId = req.query.zoneId || null;
    const nodeId = req.query.nodeId || null;
    const hours = Math.max(1, Math.min(72, Number(req.query.hours || 6)));
    const points = Math.max(8, Math.min(36, Number(req.query.points || 18)));

    if (!datacenterId && !zoneId && !nodeId) {
      return res.status(400).json({
        success: false,
        message: "datacenterId, zoneId ou nodeId est requis",
      });
    }

    const { insights } = await buildAiContext({
      datacenterId,
      zoneId,
      nodeId,
      hours,
      points,
    });

    res.json({ success: true, data: insights });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Error computing AI insights",
      error: error.message,
    });
  }
};

export const chatWithAiAssistant = async (req, res) => {
  try {
    const datacenterId = req.body.datacenterId || null;
    const zoneId = req.body.zoneId || null;
    const nodeId = req.body.nodeId || null;
    const message = String(req.body.message || "").trim();
    const hours = Math.max(1, Math.min(72, Number(req.body.hours || 6)));
    const points = Math.max(8, Math.min(36, Number(req.body.points || 18)));

    if (!datacenterId && !zoneId && !nodeId) {
      return res.status(400).json({
        success: false,
        message: "datacenterId, zoneId ou nodeId est requis",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Le message est requis",
      });
    }

    const { insights } = await buildAiContext({
      datacenterId,
      zoneId,
      nodeId,
      hours,
      points,
    });

    let reply;
    try {
      const n8nResponse = await fetch(
        process.env.N8N_WEBHOOK_URL || "https://n8n-production-d635.up.railway.app/webhook/datacenter-chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            sensor_data: insights?.metrics?.[0] || null,
            history: [],
          }),
        }
      );
      const n8nData = await n8nResponse.json();
      reply = n8nData.reply || buildAssistantReply({ message, insights });
    } catch {
      reply = buildAssistantReply({ message, insights });
    }

    res.json({
      success: true,
      data: {
        reply,
        message,
        generatedAt: new Date().toISOString(),
        insights,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Error while chatting with AI assistant",
      error: error.message,
    });
  }
};
