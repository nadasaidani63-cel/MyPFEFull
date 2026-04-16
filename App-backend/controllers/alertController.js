import Alert from "../models/Alert.js";
import Zone from "../models/Zone.js";

export const getAlerts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.datacenterId) filter.datacenterId = req.query.datacenterId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.nodeId) filter.nodeId = req.query.nodeId;

    const limitRaw = req.query.limit;
    const limit = limitRaw ? Math.max(10, Math.min(5000, Number(limitRaw))) : 200;

    const alerts = await Alert.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: "nodeId", select: "name zoneId" })
      .populate({ path: "zoneId", select: "name datacenterId", populate: { path: "datacenterId", select: "name" } })
      .populate({ path: "datacenterId", select: "name location" })
      .populate("acknowledgedBy", "firstName lastName email");

    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching alerts", error: error.message });
  }
};

export const createAlert = async (req, res) => {
  try {
    const alert = await Alert.create(req.body);
    res.status(201).json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating alert", error: error.message });
  }
};

export const acknowledgeAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        status: "acknowledged",
        acknowledgedAt: new Date(),
        acknowledgedBy: req.user._id,
      },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error acknowledging alert", error: error.message });
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { status: "resolved", resolvedAt: new Date() },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error resolving alert", error: error.message });
  }
};
