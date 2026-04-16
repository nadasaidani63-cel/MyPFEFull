import Zone from "../models/Zone.js";
import Node from "../models/Node.js";
import SensorReading from "../models/SensorReading.js";

export const getZones = async (req, res) => {
  try {
    const filter = req.query.datacenterId ? { datacenterId: req.query.datacenterId } : {};
    const zones = await Zone.find(filter)
      .sort({ displayOrder: 1, createdAt: 1 })
      .populate("datacenterId", "name");
    const result = await Promise.all(
      zones.map(async (z) => {
        const nodes = await Node.find({ zoneId: z._id });
        return { ...z.toJSON(), nodes };
      })
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching zones", error: error.message });
  }
};

export const getZone = async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id).populate("datacenterId", "name");
    if (!zone) return res.status(404).json({ success: false, message: "Zone not found" });
    res.json({ success: true, data: zone });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching zone", error: error.message });
  }
};

export const getZoneNodesLatest = async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id).populate("datacenterId", "name location status");
    if (!zone) return res.status(404).json({ success: false, message: "Zone not found" });

    const nodes = await Node.find({ zoneId: zone._id }).lean();
    const latestReadings = await SensorReading.aggregate([
      { $match: { nodeId: { $in: nodes.map((item) => item._id) } } },
      { $sort: { recordedAt: -1 } },
      { $group: { _id: "$nodeId", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);

    const latestByNode = new Map(latestReadings.map((item) => [String(item.nodeId), item]));
    const data = nodes.map((node) => ({
      ...node,
      latestMetrics: latestByNode.get(String(node._id)) || null,
    }));

    res.json({ success: true, data: { ...zone.toJSON(), nodes: data } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching zone nodes latest metrics", error: error.message });
  }
};

export const createZone = async (req, res) => {
  try {
    const zone = await Zone.create(req.body);
    res.status(201).json({ success: true, data: zone });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating zone", error: error.message });
  }
};

export const updateZone = async (req, res) => {
  try {
    const zone = await Zone.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!zone) return res.status(404).json({ success: false, message: "Zone not found" });
    res.json({ success: true, data: zone });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating zone", error: error.message });
  }
};

export const deleteZone = async (req, res) => {
  try {
    await Zone.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Zone deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting zone", error: error.message });
  }
};
