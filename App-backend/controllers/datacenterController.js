import Datacenter from "../models/Datacenter.js";
import Zone from "../models/Zone.js";
import Node from "../models/Node.js";

// GET /api/datacenters
export const getDatacenters = async (req, res) => {
  try {
    const datacenters = await Datacenter.find();
    // attach zones and node counts
    const result = await Promise.all(
      datacenters.map(async (dc) => {
        const zones = await Zone.find({ datacenterId: dc._id }).sort({ displayOrder: 1, createdAt: 1 });
        const zonesWithNodes = await Promise.all(
          zones.map(async (z) => {
            const nodes = await Node.find({ zoneId: z._id }, "_id isOnline");
            return { ...z.toJSON(), nodes };
          })
        );
        return { ...dc.toJSON(), zones: zonesWithNodes };
      })
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching datacenters", error });
  }
};

// GET /api/datacenters/:id
export const getDatacenter = async (req, res) => {
  try {
    const dc = await Datacenter.findById(req.params.id);
    if (!dc) return res.status(404).json({ success: false, message: "Datacenter not found" });
    res.json({ success: true, data: dc });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching datacenter", error });
  }
};

// POST /api/datacenters
export const createDatacenter = async (req, res) => {
  try {
    const dc = await Datacenter.create(req.body);
    res.status(201).json({ success: true, data: dc });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating datacenter", error });
  }
};

// PUT /api/datacenters/:id
export const updateDatacenter = async (req, res) => {
  try {
    const dc = await Datacenter.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!dc) return res.status(404).json({ success: false, message: "Datacenter not found" });
    res.json({ success: true, data: dc });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating datacenter", error });
  }
};

// DELETE /api/datacenters/:id
export const deleteDatacenter = async (req, res) => {
  try {
    await Datacenter.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Datacenter deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting datacenter", error });
  }
};
