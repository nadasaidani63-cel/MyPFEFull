import Node from "../models/Node.js";
import Zone from "../models/Zone.js";

// GET /api/nodes?datacenterId=xxx
export const getNodes = async (req, res) => {
  try {
    let nodeQuery = {};
    if (req.query.datacenterId) {
      const zones = await Zone.find({ datacenterId: req.query.datacenterId }, "_id");
      const zoneIds = zones.map((z) => z._id);
      nodeQuery = { zoneId: { $in: zoneIds } };
    }
    if (req.query.zoneId) nodeQuery.zoneId = req.query.zoneId;

    const nodes = await Node.find(nodeQuery).populate({
      path: "zoneId",
      select: "name datacenterId",
      populate: { path: "datacenterId", select: "name" },
    });
    res.json({ success: true, data: nodes });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching nodes", error });
  }
};

// GET /api/nodes/:id
export const getNode = async (req, res) => {
  try {
    const node = await Node.findById(req.params.id).populate("zoneId");
    if (!node) return res.status(404).json({ success: false, message: "Node not found" });
    res.json({ success: true, data: node });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching node", error });
  }
};

// POST /api/nodes
export const createNode = async (req, res) => {
  try {
    const node = await Node.create(req.body);
    res.status(201).json({ success: true, data: node });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating node", error });
  }
};

// PUT /api/nodes/:id
export const updateNode = async (req, res) => {
  try {
    const node = await Node.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!node) return res.status(404).json({ success: false, message: "Node not found" });
    res.json({ success: true, data: node });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating node", error });
  }
};

// DELETE /api/nodes/:id
export const deleteNode = async (req, res) => {
  try {
    await Node.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Node deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting node", error });
  }
};
