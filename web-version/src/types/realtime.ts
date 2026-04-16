export type SensorValues = {
  temperature: number;
  humidity: number;
  gasLevel: number;
  pressure: number;
  vibration: number;
};

export type ReadingEvent = {
  nodeId: string;
  zoneId: string;
  datacenterId: string;
  recordedAt: string;
  values: SensorValues;
};

export type AlertDoc = {
  _id: string;
  nodeId: string;
  zoneId: string;
  metricName: string;
  metricValue: number;
  thresholdExceeded?: number | null;
  message: string;
  severity: "warning" | "alert" | "critical" | "info";
  level?: "warning" | "alert";
  status: "active" | "acknowledged" | "resolved";
  triggeredMetrics?: Array<{
    metricName: string;
    value: number;
    state: "warning" | "alert";
  }>;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AlertEvent = {
  type: "notified" | "updated" | "resolved";
  alert: AlertDoc;
};

export type StatusEvent = {
  datacenter: { id: string; status: "normal" | "warning" | "alert" | "critical" };
  zone: { id: string; status: "normal" | "warning" | "alert" | "critical" };
  node: { id: string; status: "normal" | "warning" | "alert" | "critical" };
};
