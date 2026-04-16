import { Activity, Droplets, Gauge, ShieldAlert, Thermometer, Waves } from "lucide-react";
import { useMemo } from "react";

import { AlertTicker } from "@/components/dashboard/AlertTicker";
import { MetricLineChart } from "@/components/dashboard/MetricLineChart";
import { StatusCard } from "@/components/dashboard/StatusCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDatacenter } from "@/hooks/useDatacenter";
import {
  useAlerts,
  useLatestReadings,
  useNodes,
  useRealtimeAlerts,
  useRealtimeSensorReadings,
  useSensorHistory,
} from "@/hooks/useApiData";
import { useLanguage } from "@/hooks/useLanguage";
import { getStatusBg, getStatusColor } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type MetricKey = "temperature" | "humidity" | "pressure" | "vibration" | "gas_level";

type MetricConfig = {
  key: MetricKey;
  label: string;
  unit: string;
  icon: any;
  color: string;
  warningMin?: number;
  warningMax?: number;
  alertMin?: number;
  alertMax?: number;
};

const metricConfigs: MetricConfig[] = [
  { key: "temperature", label: "Température", unit: "°C", icon: Thermometer, color: "#ef4444", warningMin: 18, warningMax: 27, alertMin: 15, alertMax: 30 },
  { key: "humidity", label: "Humidité", unit: "%", icon: Droplets, color: "#f59e0b", warningMin: 40, warningMax: 60, alertMin: 30, alertMax: 70 },
  { key: "pressure", label: "Gaz CO2", unit: "ppm", icon: Gauge, color: "#3b82f6", warningMin: 450, warningMax: 900, alertMin: 350, alertMax: 1100 },
  { key: "vibration", label: "Vibration", unit: "mm/s", icon: Waves, color: "#f97316", warningMin: 0, warningMax: 1.2, alertMin: 0, alertMax: 1.5 },
  { key: "gas_level", label: "Fumee", unit: "ppm", icon: ShieldAlert, color: "#22c55e", warningMin: 0, warningMax: 90, alertMin: 0, alertMax: 130 },
];

function computeStatus(value: number, config: MetricConfig): "normal" | "warning" | "alert" {
  if ((config.alertMin !== undefined && value < config.alertMin) || (config.alertMax !== undefined && value > config.alertMax)) return "alert";
  if ((config.warningMin !== undefined && value < config.warningMin) || (config.warningMax !== undefined && value > config.warningMax)) return "warning";
  return "normal";
}

function average(items: any[], key: MetricKey) {
  const values = items.map((item) => Number(item[key])).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildChartSeries(history: any[], key: MetricKey, maxPoints = 24) {
  const values = history
    .map((item) => ({
      time: new Date(item.recorded_at),
      value: Number(item[key]),
    }))
    .filter((item) => Number.isFinite(item.value));

  if (values.length <= maxPoints) {
    return values.map((item) => ({
      time: item.time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      value: item.value,
    }));
  }

  const bucketSize = Math.ceil(values.length / maxPoints);
  const series = [] as Array<{ time: string; value: number }>;
  for (let i = 0; i < values.length; i += bucketSize) {
    const bucket = values.slice(i, i + bucketSize);
    const avg = bucket.reduce((sum, item) => sum + item.value, 0) / bucket.length;
    const middle = bucket[Math.floor(bucket.length / 2)]?.time ?? bucket[0].time;
    series.push({
      time: middle.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      value: Number(avg.toFixed(2)),
    });
  }
  return series;
}

const Dashboard = () => {
  const { t } = useLanguage();
  const { connectedDC } = useDatacenter();
  const dcId = connectedDC?.id ?? null;

  const { data: latestReadings = [] } = useLatestReadings(dcId);
  const { data: nodes = [] } = useNodes(dcId);
  const { data: alerts = [] } = useAlerts(dcId);
  const historyQuery = useSensorHistory(dcId, { limit: 1500 });

  useRealtimeSensorReadings();
  useRealtimeAlerts();

  const history = historyQuery.data?.data || [];
  const onlineNodes = nodes.filter((node: any) => node.is_online).length;
  const activeAlerts = alerts.filter((alert: any) => alert.status === "active");
  const globalStatus: "normal" | "warning" | "alert" = activeAlerts.some((item: any) => item.severity === "critical") ? "alert" : activeAlerts.length ? "warning" : "normal";

  const metricCards = useMemo(
    () =>
      metricConfigs.map((config) => {
        const current = average(latestReadings, config.key);
        const status = computeStatus(current, config);
        return {
          ...config,
          current,
          status,
          chartData: buildChartSeries(history, config.key, 24),
        };
      }),
    [latestReadings, history]
  );

  if (!dcId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("dashboard")}</h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t("noHub")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-hidden pb-4 min-w-0 w-full max-w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold leading-tight">{t("dashboard")}</h1>
          <p className="text-xs text-muted-foreground">Vue temps réel des métriques — {connectedDC.name}</p>
        </div>
        <Badge variant="outline" className={cn("w-fit capitalize text-[10px]", getStatusColor(globalStatus))}>
          {t(globalStatus === "alert" ? "alert" : globalStatus)}
        </Badge>
      </div>

      <AlertTicker />

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((metric) => (
          <StatusCard
            key={metric.key}
            title={metric.label}
            value={metric.current.toFixed(metric.key === "pressure" ? 0 : 2)}
            unit={metric.unit}
            status={metric.status === "alert" ? "critical" : metric.status}
            icon={metric.icon}
            subtitle={`${t("status")}: ${metric.status === "alert" ? "Critique" : metric.status === "warning" ? "Avert." : "Normal"}`}
          />
        ))}
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        <Card className={cn("border min-w-0", getStatusBg(globalStatus))}>
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nodes</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold">{onlineNodes}</span>
              <span className="text-xs text-muted-foreground">/ {nodes.length} en ligne</span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Alertes actives</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold">{activeAlerts.length}</span>
              <span className="text-xs text-muted-foreground">warning / alert</span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="flex items-center gap-3 p-4">
            <Activity className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Datacenter</p>
              <p className="truncate text-sm font-semibold">{connectedDC.name}</p>
              <p className="truncate text-xs text-muted-foreground">{connectedDC.location || "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        {metricCards.map((metric) => (
          <MetricLineChart
            key={metric.key}
            title={`${metric.label} temps réel`}
            unit={metric.unit}
            data={metric.chartData}
            color={metric.color}
            warningMin={metric.warningMin}
            warningMax={metric.warningMax}
            alertMin={metric.alertMin}
            alertMax={metric.alertMax}
          />
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
