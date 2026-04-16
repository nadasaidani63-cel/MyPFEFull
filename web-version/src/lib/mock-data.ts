export const mockMetrics = {
  temperature: { current: 22.5, min: 18, max: 27, unit: "°C", status: "normal" as const },
  humidity: { current: 45, min: 30, max: 60, unit: "%HR", status: "normal" as const },
  gasLevel: { current: 12, min: 0, max: 50, unit: "ppm", status: "normal" as const },
  pressure: { current: 1013, min: 980, max: 1040, unit: "hPa", status: "normal" as const },
  vibration: { current: 0.3, min: 0, max: 2, unit: "mm/s", status: "normal" as const },
};

export const mockAlerts = [
  {
    id: "alert-1",
    severity: "warning" as const,
    status: "active" as const,
    message: "Température en hausse détectée dans Zone A",
    time: "Il y a 2 min",
  },
  {
    id: "alert-2",
    severity: "critical" as const,
    status: "active" as const,
    message: "Vibration anormale sur le node N-03",
    time: "Il y a 5 min",
  },
  {
    id: "alert-3",
    severity: "info" as const,
    status: "resolved" as const,
    message: "Synchronisation cloud rétablie",
    time: "Il y a 20 min",
  },
];

export const mockTemperatureHistory = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, "0")}:00`,
  zoneA: 21 + Math.sin(i / 3) * 3 + (i > 16 ? 2 : 0),
  zoneB: 22 + Math.cos(i / 4) * 2,
  zoneC: 20 + Math.sin(i / 5) * 2.5,
}));

export const mockAIPredictions = [
  {
    id: "pred-1",
    datacenter: "Virtual DC Tunis",
    zone: "Zone A",
    metric: "Température",
    currentValue: "31.2 °C",
    predictedValue: "35.8 °C",
    threshold: "35 °C",
    probability: 84,
    timeToFailure: "2h",
    severity: "warning" as const,
  },
  {
    id: "pred-2",
    datacenter: "Virtual DC Tunis",
    zone: "Zone B",
    metric: "Fumee",
    currentValue: "62 ppm",
    predictedValue: "79 ppm",
    threshold: "75 ppm",
    probability: 71,
    timeToFailure: "4h",
    severity: "critical" as const,
  },
];

export const mockAnomalies = [
  {
    id: "anom-1",
    datacenter: "Virtual DC Tunis",
    zone: "Zone A",
    node: "Node A-01",
    parameter: "Température",
    normalRange: "18–27 °C",
    currentPattern: "Augmentation continue sur 6 heures",
    timestamp: "2026-03-17 09:42",
    severity: "warning" as const,
  },
  {
    id: "anom-2",
    datacenter: "Virtual DC Tunis",
    zone: "Zone C",
    node: "Node C-02",
    parameter: "Vibration",
    normalRange: "0–2 mm/s",
    currentPattern: "Pics irréguliers supérieurs à 4 mm/s",
    timestamp: "2026-03-17 09:28",
    severity: "critical" as const,
  },
];

type Status = "normal" | "warning" | "alert" | "critical";
type Severity = "info" | "warning" | "alert" | "critical";

export function getStatusColor(status: Status) {
  switch (status) {
    case "normal":
      return "text-status-normal";
    case "warning":
      return "text-status-warning";
    case "alert":
    case "critical":
      return "text-status-critical";
  }
}

export function getStatusBg(status: Status) {
  switch (status) {
    case "normal":
      return "bg-status-normal/10 border-status-normal/30";
    case "warning":
      return "bg-status-warning/10 border-status-warning/30";
    case "alert":
    case "critical":
      return "bg-status-critical/10 border-status-critical/30";
  }
}

export function getSeverityColor(severity: Severity) {
  switch (severity) {
    case "info":
      return "text-muted-foreground";
    case "warning":
      return "text-status-warning";
    case "alert":
    case "critical":
      return "text-status-critical";
  }
}
