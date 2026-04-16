import Alert from "../models/Alert.js";
import Node from "../models/Node.js";
import Zone from "../models/Zone.js";
import Datacenter from "../models/Datacenter.js";
import { sendEmail } from "./mailer.js";

const RANK = { normal: 0, warning: 1, critical: 2 };

function maxStatus(statuses) {
  let best = "normal";
  for (const s of statuses) {
    if (RANK[s] > RANK[best]) best = s;
  }
  return best;
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

// cooldown to avoid spamming emails
const dcEmailLastSent = new Map();
const EMAIL_COOLDOWN_MS = Number(process.env.ALERT_EMAIL_COOLDOWN_MS || 5 * 60_000);
const FIXED_TO = (process.env.ALERT_EMAIL_TO || "nadasaidani63@gmail.com").trim();

async function getConnectedRecipientEmails(io, dcId) {
  if (!io) return [];
  try {
    const room = `dc:${dcId}`;
    const sockets = await io.in(room).fetchSockets();
    const emails = sockets
      .map((s) => s.data?.user?.email)
      .filter(Boolean);
    const rolesOk = sockets
      .filter((s) => ["administrator", "superviseur", "technicien"].includes(s.data?.user?.role))
      .map((s) => s.data?.user?.email)
      .filter(Boolean);

    // Use roles filtered list (admin/superviseur/tech)
    return uniq(rolesOk.length ? rolesOk : emails);
  } catch (e) {
    return [];
  }
}

export async function recomputeAndEmitStatus({ nodeId, io, triggerAlert = null } = {}) {
  if (!nodeId) return null;

  // Load node -> zone -> datacenter
  const node = await Node.findById(nodeId);
  if (!node) return null;

  const zone = await Zone.findById(node.zoneId);
  if (!zone) return null;

  const dc = await Datacenter.findById(zone.datacenterId);
  if (!dc) return null;

  // Node status from ACTIVE alerts (highest severity)
  const nodeAlerts = await Alert.find({ nodeId: node._id, status: "active" }).select("severity");
  const nodeStatus = maxStatus(nodeAlerts.map((a) => a.severity));
  const prevNodeStatus = node.status;
  if (prevNodeStatus !== nodeStatus) {
    node.status = nodeStatus;
    await node.save();
  }

  // Zone status from nodes status
  const zoneNodes = await Node.find({ zoneId: zone._id }).select("status");
  const zoneStatus = maxStatus(zoneNodes.map((n) => n.status));
  const prevZoneStatus = zone.status;
  if (prevZoneStatus !== zoneStatus) {
    zone.status = zoneStatus;
    await zone.save();
  }

  // Datacenter status from zones status
  const dcZones = await Zone.find({ datacenterId: dc._id }).select("status");
  const dcStatus = maxStatus(dcZones.map((z) => z.status));
  const prevDcStatus = dc.status;
  if (prevDcStatus !== dcStatus) {
    dc.status = dcStatus;
    await dc.save();
  }

  // Emit status update to dashboard (realtime UI)
  if (io) {
    io.to(`dc:${String(dc._id)}`).emit("status:update", {
      datacenter: { id: String(dc._id), status: dcStatus },
      zone: { id: String(zone._id), status: zoneStatus },
      node: { id: String(node._id), status: nodeStatus },
    });
  }

  // Send email on CRITICAL transition (or cooldown exceeded)
  if (dcStatus === "critical") {
    const last = dcEmailLastSent.get(String(dc._id)) || 0;
    const canSend = Date.now() - last >= EMAIL_COOLDOWN_MS;
    const transitioned = prevDcStatus !== "critical";

    if (canSend && transitioned) {
      dcEmailLastSent.set(String(dc._id), Date.now());

      const connected = await getConnectedRecipientEmails(io, String(dc._id));
      const to = uniq([FIXED_TO, ...connected]);

      const time = new Date().toLocaleString("fr-TN");
      let alertInfo = "Un ou plusieurs capteurs ont dépassé les seuils critiques.";
      if (triggerAlert) {
        const n = await Node.findById(triggerAlert.nodeId).select("name");
        const nodeName = n?.name || String(triggerAlert.nodeId);
        alertInfo = `Node=${nodeName} | Metric=${triggerAlert.metricName} | Value=${triggerAlert.metricValue}`;
      }

      const subject = `[Sentinel] CRITICAL - ${dc.name}`;
      const text =
        `ALERTE CRITIQUE\n` +
        `Datacenter: ${dc.name} (${dc.location || "N/A"})\n` +
        `Date: ${time}\n` +
        `Détails: ${alertInfo}\n\n` +
        `Action: Vérifie le dashboard Sentinel (Surveillance / Alerts).`;

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5">
          <h2 style="margin:0 0 8px 0">🚨 ALERTE CRITIQUE</h2>
          <p><b>Datacenter:</b> ${dc.name} (${dc.location || "N/A"})</p>
          <p><b>Date:</b> ${time}</p>
          <p><b>Détails:</b> ${alertInfo}</p>
          <p style="margin-top:16px">➡️ Action: ouvrir le dashboard Sentinel et vérifier la section <b>Alerts</b> et l'état des <b>Nodes</b>.</p>
        </div>
      `;

      await sendEmail({ to, subject, text, html });
    }
  }

  return {
    datacenter: { id: String(dc._id), status: dcStatus },
    zone: { id: String(zone._id), status: zoneStatus },
    node: { id: String(node._id), status: nodeStatus },
  };
}
