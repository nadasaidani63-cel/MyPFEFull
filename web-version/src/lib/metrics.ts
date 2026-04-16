export type MetricKey = "temperature" | "humidity" | "pressure" | "vibration" | "gasLevel" | "gas_level";

export type MetricMeta = {
  key: MetricKey;
  canonicalKey: "temperature" | "humidity" | "pressure" | "vibration" | "gasLevel";
  label: string;
  shortLabel: string;
  unit: string;
  digits: number;
  warningMin: number;
  warningMax: number;
  alertMin: number;
  alertMax: number;
};

const METRICS: Record<string, MetricMeta> = {
  temperature: {
    key: "temperature",
    canonicalKey: "temperature",
    label: "Temperature",
    shortLabel: "T",
    unit: "°C",
    digits: 1,
    warningMin: 18,
    warningMax: 27,
    alertMin: 15,
    alertMax: 30,
  },
  humidity: {
    key: "humidity",
    canonicalKey: "humidity",
    label: "Humidite",
    shortLabel: "H",
    unit: "%",
    digits: 1,
    warningMin: 40,
    warningMax: 60,
    alertMin: 30,
    alertMax: 70,
  },
  pressure: {
    key: "pressure",
    canonicalKey: "pressure",
    label: "Gaz CO2",
    shortLabel: "CO2",
    unit: "ppm",
    digits: 0,
    warningMin: 450,
    warningMax: 900,
    alertMin: 350,
    alertMax: 1100,
  },
  vibration: {
    key: "vibration",
    canonicalKey: "vibration",
    label: "Vibration",
    shortLabel: "V",
    unit: "mm/s",
    digits: 2,
    warningMin: 0,
    warningMax: 1.2,
    alertMin: 0,
    alertMax: 1.5,
  },
  gasLevel: {
    key: "gasLevel",
    canonicalKey: "gasLevel",
    label: "Fumee",
    shortLabel: "Fumee",
    unit: "ppm",
    digits: 0,
    warningMin: 0,
    warningMax: 90,
    alertMin: 0,
    alertMax: 130,
  },
  gas_level: {
    key: "gas_level",
    canonicalKey: "gasLevel",
    label: "Fumee",
    shortLabel: "Fumee",
    unit: "ppm",
    digits: 0,
    warningMin: 0,
    warningMax: 90,
    alertMin: 0,
    alertMax: 130,
  },
};

export const orderedMetricKeys: MetricKey[] = ["temperature", "humidity", "pressure", "vibration", "gasLevel"];

export function getMetricMeta(key: string): MetricMeta {
  return METRICS[key] ?? METRICS.temperature;
}

export function formatMetricValue(key: string, value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const meta = getMetricMeta(key);
  return Number(value).toFixed(meta.digits);
}

export function metricThresholdText(key: string) {
  const meta = getMetricMeta(key);
  return `Warning ${meta.warningMin.toFixed(meta.digits)}-${meta.warningMax.toFixed(meta.digits)} ${meta.unit} · Alert ${meta.alertMin.toFixed(meta.digits)}-${meta.alertMax.toFixed(meta.digits)} ${meta.unit}`;
}

export function getMetricStatus(
  key: string,
  value: number | null | undefined,
  thresholds?: Partial<Pick<MetricMeta, "warningMin" | "warningMax" | "alertMin" | "alertMax">>,
) {
  if (value == null || Number.isNaN(value)) return "unknown";
  const meta = getMetricMeta(key);
  const alertMin = thresholds?.alertMin ?? meta.alertMin;
  const alertMax = thresholds?.alertMax ?? meta.alertMax;
  const warningMin = thresholds?.warningMin ?? meta.warningMin;
  const warningMax = thresholds?.warningMax ?? meta.warningMax;

  if (value < alertMin || value > alertMax) return "critical";
  if (value < warningMin || value > warningMax) return "warning";
  return "normal";
}
