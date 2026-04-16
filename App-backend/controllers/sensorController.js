import SensorReading from "../models/SensorReading.js";
import Node from "../models/Node.js";
import Zone from "../models/Zone.js";
import { ingestReading } from "../services/ingestReading.js";
import { getIO } from "../services/socketInstance.js";
import Datacenter from "../models/Datacenter.js";
import { getEffectiveThresholds } from "../services/thresholds.js";
import { buildAiInsights, fetchActiveAlertsForAi } from "../services/aiInsights.js";

async function resolveNodeIds({ datacenterId, zoneId, nodeId }) {
  if (nodeId) return [nodeId];
  if (zoneId) {
    const nodes = await Node.find({ zoneId }, "_id");
    return nodes.map((n) => n._id);
  }
  if (datacenterId) {
    const zones = await Zone.find({ datacenterId }, "_id");
    const nodes = await Node.find({ zoneId: { $in: zones.map((z) => z._id) } }, "_id");
    return nodes.map((n) => n._id);
  }
  return [];
}

export const getLatestReadings = async (req, res) => {
  try {
    const nodeIds = await resolveNodeIds(req.query);
    const readings = await SensorReading.aggregate([
      ...(nodeIds.length ? [{ $match: { nodeId: { $in: nodeIds } } }] : []),
      { $sort: { recordedAt: -1 } },
      { $group: { _id: "$nodeId", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);

    res.json({ success: true, data: readings });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching latest readings", error: error.message });
  }
};

export const getSensorHistory = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(10000, Number(req.query.limit || 500)));
    const skip = (page - 1) * limit;

    const nodeIds = await resolveNodeIds(req.query);
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
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching sensor history", error: error.message });
  }
};

export const createReading = async (req, res) => {
  try {
    const result = await ingestReading({ payload: req.body, io: getIO() });
    res.status(201).json({ success: true, data: result.reading, level: result.nodeLevel, triggeredMetrics: result.triggeredMetrics });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error saving sensor reading", error: error.message });
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
      return res.status(400).json({ success: false, message: "datacenterId, zoneId ou nodeId est requis" });
    }

    const nodeIds = await resolveNodeIds({ datacenterId, zoneId, nodeId });
    const filter = {};
    if (nodeIds.length) filter.nodeId = { $in: nodeIds };
    filter.recordedAt = { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) };

    const [history, latestReadings, thresholds, activeAlerts, datacenter, nodes] = await Promise.all([
      SensorReading.find(filter).sort({ recordedAt: 1 }).limit(8000).lean(),
      SensorReading.aggregate([
        ...(nodeIds.length ? [{ $match: { nodeId: { $in: nodeIds } } }] : []),
        { $sort: { recordedAt: -1 } },
        { $group: { _id: "$nodeId", doc: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$doc" } },
      ]),
      getEffectiveThresholds({ datacenterId, zoneId, nodeId }),
      fetchActiveAlertsForAi(datacenterId),
      datacenterId ? Datacenter.findById(datacenterId).lean() : null,
      nodeIds.length ? Node.find({ _id: { $in: nodeIds } }).lean() : [],
    ]);

    const data = await buildAiInsights({
      datacenter,
      thresholds,
      history,
      latestReadings,
      nodes,
      activeAlerts,
      hours,
      points,
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error computing AI insights", error: error.message });
  }
};
