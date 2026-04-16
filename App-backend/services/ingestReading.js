import SensorReading from "../models/SensorReading.js";
import Node from "../models/Node.js";
import Zone from "../models/Zone.js";
import Datacenter from "../models/Datacenter.js";
import Alert from "../models/Alert.js";
import User from "../models/User.js";
import { sendEmail } from "./mailer.js";
import { getEffectiveThresholds, evaluateMetric } from "./thresholds.js";
import { buildAlertEmail } from "./emailTemplates.js";

const ALERT_EMAIL_COOLDOWN_MS = Number(process.env.ALERT_EMAIL_COOLDOWN_MS || 30 * 60_000);
const levelRank = { normal: 0, warning: 1, alert: 2, critical: 2 };
const nodeEmailCooldown = new Map();

function bestStatus(statuses) {
  return statuses.reduce((best, current) => (levelRank[current] > levelRank[best] ? current : best), "normal");
}

function buildValues(payload) {
  return {
    temperature: payload.temperature ?? null,
    humidity: payload.humidity ?? null,
    pressure: payload.pressure ?? null,
    vibration: payload.vibration ?? null,
    gasLevel: payload.gasLevel ?? payload.gaz ?? null,
  };
}

async function recomputeHierarchy({ node, zone, datacenter }) {
  const zoneNodes = await Node.find({ zoneId: zone._id }).select("status");
  zone.status = bestStatus(zoneNodes.map((item) => item.status || "normal"));
  await zone.save();

  const dcZones = await Zone.find({ datacenterId: datacenter._id }).select("status");
  datacenter.status = bestStatus(dcZones.map((item) => item.status || "normal"));
  await datacenter.save();

  return {
    node: { id: String(node._id), status: node.status },
    zone: { id: String(zone._id), status: zone.status },
    datacenter: { id: String(datacenter._id), status: datacenter.status },
  };
}

async function getAlertRecipients() {
  const users = await User.find({}).lean();
  return users.filter((user) => (user.notificationPreferences?.emailOnAlert ?? true));
}

async function maybeSendAlertEmail({ datacenter, zone, node, alertDoc }) {
  const now = Date.now();
  const cooldownKey = String(node._id);
  const last = nodeEmailCooldown.get(cooldownKey) || 0;
  if (now - last < ALERT_EMAIL_COOLDOWN_MS) {
    return false;
  }

  const recipients = await getAlertRecipients();
  const to = recipients
    .filter((user) => !(user.notificationPreferences?.criticalOnly) || alertDoc.level === "alert")
    .map((user) => user.email)
    .filter(Boolean);

  if (!to.length) return false;

  const email = buildAlertEmail({
    recipientsLabel: "équipe Sentinel",
    datacenter,
    zone,
    node,
    alert: alertDoc,
    timestamp: new Date().toLocaleString("fr-TN"),
  });

  const result = await sendEmail({ to: to.join(","), ...email });
  if (result.ok) {
    nodeEmailCooldown.set(cooldownKey, now);
    await Alert.updateOne({ _id: alertDoc._id }, { $set: { emailSentAt: new Date() } });
    return true;
  }

  return false;
}

export async function ingestReading({ payload, io = null }) {
  const values = buildValues(payload);
  const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : new Date();

  const node = await Node.findById(payload.nodeId);
  if (!node) {
    throw new Error("Node not found for reading ingestion");
  }

  const zone = await Zone.findById(node.zoneId);
  const datacenter = zone ? await Datacenter.findById(zone.datacenterId) : null;
  if (!zone || !datacenter) {
    throw new Error("Zone or datacenter not found for node");
  }

  const reading = await SensorReading.create({
    nodeId: node._id,
    ...values,
    recordedAt,
  });

  node.lastPing = new Date();
  node.isOnline = true;

  const thresholds = await getEffectiveThresholds({
    datacenterId: datacenter._id,
    zoneId: zone._id,
    nodeId: node._id,
  });

  const evaluations = Object.entries(values).map(([metricName, value]) =>
    evaluateMetric(metricName, value, thresholds[metricName])
  );
  // Only keep metrics that are genuinely warning or alert — skip nulls and normal states
  const triggeredMetrics = evaluations.filter(
    (item) => item.value != null && (item.state === "warning" || item.state === "alert")
  );
  const nodeLevel = triggeredMetrics.length === 0 ? "normal" : triggeredMetrics.length === 1 ? "warning" : "alert";
  node.status = nodeLevel;
  await node.save();

  let alertEvent = null;
  const activeAlert = await Alert.findOne({ nodeId: node._id, status: "active" });

  if (nodeLevel === "normal") {
    if (activeAlert) {
      activeAlert.status = "resolved";
      activeAlert.resolvedAt = new Date();
      await activeAlert.save();
      alertEvent = { type: "resolved", alert: activeAlert };
    }
  } else {
    const firstMetric = triggeredMetrics[0];
    const payloadUpdate = {
      datacenterId: datacenter._id,
      nodeId: node._id,
      zoneId: zone._id,
      level: nodeLevel,
      severity: nodeLevel,
      metricName: firstMetric.metricName,
      metricValue: firstMetric.value,
      thresholdExceeded:
        firstMetric.state === "alert"
          ? firstMetric.value > (firstMetric.alertMax ?? Infinity)
            ? firstMetric.alertMax
            : firstMetric.alertMin
          : firstMetric.value > (firstMetric.warningMax ?? Infinity)
          ? firstMetric.warningMax
          : firstMetric.warningMin,
      triggeredMetrics,
      message: `${triggeredMetrics.length} métrique(s) hors seuil détectée(s)`,
      lastTriggeredAt: new Date(),
    };

    let alertDoc;
    let eventType = null;
    if (!activeAlert) {
      alertDoc = await Alert.create({ ...payloadUpdate, status: "active" });
      eventType = "notified";
    } else {
      const previousLevel = activeAlert.level;
      // Use findByIdAndUpdate instead of Object.assign + save to avoid
      // Mongoose VersionError when the simulator runs concurrent ticks
      // that both try to update the same active alert document.
      alertDoc = await Alert.findByIdAndUpdate(
        activeAlert._id,
        { $set: { ...payloadUpdate, status: "active", resolvedAt: null, acknowledgedAt: null, acknowledgedBy: null } },
        { new: true }
      );
      if (!alertDoc) {
        // Document was deleted between our findOne and now — create fresh
        alertDoc = await Alert.create({ ...payloadUpdate, status: "active" });
        eventType = "notified";
      } else if (previousLevel !== alertDoc.level) {
        eventType = "notified";
      }
    }

    if (eventType === "notified") {
      await maybeSendAlertEmail({ datacenter, zone, node, alertDoc });
    }

    if (eventType) {
      alertEvent = { type: eventType, alert: alertDoc };
    }
  }

  const statusEvent = await recomputeHierarchy({ node, zone, datacenter });

  if (io) {
    io.to(`dc:${String(datacenter._id)}`).emit("reading:new", {
      nodeId: String(node._id),
      zoneId: String(zone._id),
      datacenterId: String(datacenter._id),
      recordedAt: reading.recordedAt,
      values,
    });

    if (alertEvent) {
      io.to(`dc:${String(datacenter._id)}`).emit("alert:event", alertEvent);
    }

    io.to(`dc:${String(datacenter._id)}`).emit("status:update", statusEvent);
  }

  return { reading, values, triggeredMetrics, nodeLevel, datacenter, zone, node, statusEvent, alertEvent };
}
