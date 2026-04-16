import AlertThreshold from "../models/AlertThreshold.js";
import { DEFAULT_THRESHOLDS } from "../services/thresholds.js";
import { createAuditLog } from "../services/auditLog.js";

function normalizePayload(body) {
  if (body.scopeType && body.scopeId) {
    return {
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      metricName: body.metricName,
      warningMin: body.warningMin,
      warningMax: body.warningMax,
      alertMin: body.alertMin,
      alertMax: body.alertMax,
      enabled: body.enabled ?? true,
    };
  }

  return {
    scopeType: "zone",
    scopeId: body.zoneId,
    metricName: body.metricName,
    warningMin: body.minValue,
    warningMax: body.maxValue,
    alertMin: body.alertMin ?? body.minValue,
    alertMax: body.alertMax ?? body.maxValue,
    enabled: body.enabled ?? true,
  };
}

export const getThresholds = async (req, res) => {
  try {
    const filter = {};
    if (req.query.scopeType) filter.scopeType = req.query.scopeType;
    if (req.query.scopeId) filter.scopeId = req.query.scopeId;
    if (req.query.zoneId) {
      filter.scopeType = "zone";
      filter.scopeId = req.query.zoneId;
    }
    const thresholds = await AlertThreshold.find(filter).sort({ metricName: 1 });
    res.json({ success: true, data: thresholds, defaults: DEFAULT_THRESHOLDS });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching thresholds", error: error.message });
  }
};

export const createThreshold = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const threshold = await AlertThreshold.findOneAndUpdate(
      { scopeType: payload.scopeType, scopeId: payload.scopeId, metricName: payload.metricName },
      payload,
      { new: true, upsert: true }
    );
    await createAuditLog({ actorId: req.user._id, action: "threshold.create", targetType: "threshold", targetId: threshold._id, after: threshold.toObject(), req });
    res.status(201).json({ success: true, data: threshold });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating threshold", error: error.message });
  }
};

export const updateThreshold = async (req, res) => {
  try {
    const before = await AlertThreshold.findById(req.params.id);
    const threshold = await AlertThreshold.findByIdAndUpdate(req.params.id, normalizePayload(req.body), { new: true });
    if (!threshold) return res.status(404).json({ success: false, message: "Threshold not found" });
    await createAuditLog({ actorId: req.user._id, action: "threshold.update", targetType: "threshold", targetId: threshold._id, before: before?.toObject?.(), after: threshold.toObject(), req });
    res.json({ success: true, data: threshold });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating threshold", error: error.message });
  }
};

export const bulkUpsertThresholds = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const results = [];
    for (const item of items) {
      const payload = normalizePayload(item);
      const doc = await AlertThreshold.findOneAndUpdate(
        { scopeType: payload.scopeType, scopeId: payload.scopeId, metricName: payload.metricName },
        payload,
        { new: true, upsert: true }
      );
      results.push(doc);
    }
    await createAuditLog({ actorId: req.user._id, action: "threshold.bulk_upsert", targetType: "threshold", after: results.map((item) => item.toObject()), req });
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error bulk updating thresholds", error: error.message });
  }
};

export const deleteThreshold = async (req, res) => {
  try {
    const threshold = await AlertThreshold.findByIdAndDelete(req.params.id);
    await createAuditLog({ actorId: req.user._id, action: "threshold.delete", targetType: "threshold", targetId: req.params.id, before: threshold?.toObject?.(), req });
    res.json({ success: true, message: "Threshold deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting threshold", error: error.message });
  }
};
