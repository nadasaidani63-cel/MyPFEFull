import mongoose from "mongoose";

const triggeredMetricSchema = new mongoose.Schema(
  {
    metricName: { type: String, required: true },
    value: { type: Number, required: true },
    state: { type: String, enum: ["warning", "alert", "normal"], default: "warning" },
    warningMin: { type: Number, default: null },
    warningMax: { type: Number, default: null },
    alertMin: { type: Number, default: null },
    alertMax: { type: Number, default: null },
  },
  { _id: false }
);

const alertSchema = new mongoose.Schema(
  {
    datacenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Datacenter",
      default: null,
    },
    nodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Node",
      required: true,
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      required: true,
    },
    level: {
      type: String,
      enum: ["warning", "alert"],
      default: "warning",
    },
    severity: {
      type: String,
      enum: ["info", "warning", "alert", "critical"],
      default: "info",
    },
    metricName: { type: String, default: null },
    metricValue: { type: Number, default: null },
    thresholdExceeded: { type: Number, default: null },
    triggeredMetrics: {
      type: [triggeredMetricSchema],
      default: [],
    },
    message: { type: String, default: null },
    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved"],
      default: "active",
    },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
    lastTriggeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Alert", alertSchema);
