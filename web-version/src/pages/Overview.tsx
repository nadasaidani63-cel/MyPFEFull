import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { Download, Video, Thermometer, Droplets, Gauge, Waves, ShieldAlert, X, Wifi, WifiOff } from "lucide-react";
import { useDatacenter } from "@/hooks/useDatacenter";
import { useLatestReadings, useZones, useSensorHistory, useAlerts, useRealtimeSensorReadings, useRealtimeAlerts, useAcknowledgeAlert } from "@/hooks/useApiData";
import { useJoinDatacenter } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

const cctvFeeds = [
  { id: "CAM-02", label: "SALLE SERVEURS 1" },
  { id: "CAM-01", label: "COULOIR A" },
  { id: "CAM-03", label: "ZONE COOLING" },
  { id: "CAM-04", label: "SALLE UPS" },
];

type TabType = "CARTE ZONES" | "ANALYTIQUES" | "FLUX CCTV";


type MetricKey = "temperature" | "humidity" | "pressure" | "vibration" | "gas_level";

type AnalyticsMetricConfig = {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  warningMin?: number;
  warningMax?: number;
  alertMin?: number;
  alertMax?: number;
};

const analyticsMetricConfigs: AnalyticsMetricConfig[] = [
  { key: "temperature", label: "Température", unit: "°C", color: "hsl(var(--primary))", warningMin: 18, warningMax: 27, alertMin: 15, alertMax: 30 },
  { key: "humidity", label: "Humidité", unit: "%", color: "hsl(var(--status-warning))", warningMin: 40, warningMax: 60, alertMin: 30, alertMax: 70 },
  { key: "pressure", label: "Gaz CO2", unit: "ppm", color: "hsl(var(--chart-2))", warningMin: 450, warningMax: 900, alertMin: 350, alertMax: 1100 },
  { key: "vibration", label: "Vibration", unit: "mm/s", color: "hsl(var(--chart-4))", warningMin: 0, warningMax: 1.2, alertMin: 0, alertMax: 1.5 },
  { key: "gas_level", label: "Fumee", unit: "ppm", color: "hsl(var(--chart-5))", warningMin: 0, warningMax: 90, alertMin: 0, alertMax: 130 },
];

function buildPredictionSeries(history: any[], metric: AnalyticsMetricConfig, maxActualPoints = 14, forecastPoints = 4) {
  const valid = history
    .map((row: any) => ({
      time: new Date(row.recorded_at).getTime(),
      value: Number(row[metric.key]),
    }))
    .filter((row) => Number.isFinite(row.value));

  if (!valid.length) return [];

  const bucketSize = Math.max(1, Math.ceil(valid.length / maxActualPoints));
  const actual = [] as Array<{ time: string; reel?: number; predit?: number }>;

  for (let i = 0; i < valid.length; i += bucketSize) {
    const bucket = valid.slice(i, i + bucketSize);
    const avg = bucket.reduce((sum, row) => sum + row.value, 0) / bucket.length;
    const middle = new Date(bucket[Math.floor(bucket.length / 2)].time);
    actual.push({
      time: middle.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      reel: Number(avg.toFixed(metric.key === "pressure" ? 0 : 2)),
    });
  }

  if (actual.length <= 1) return actual;

  const recent = actual.slice(-Math.min(4, actual.length)).map((item) => item.reel ?? 0);
  const baseline = recent[recent.length - 1] ?? actual[actual.length - 1].reel ?? 0;
  const first = recent[0] ?? baseline;
  const slope = (baseline - first) / Math.max(recent.length - 1, 1);
  const maxStep = Math.max(Math.abs(baseline || 1) * 0.08, 0.4);
  const safeSlope = Math.max(-maxStep, Math.min(maxStep, slope));

  const predicted = Array.from({ length: forecastPoints }, (_, index) => {
    const step = index + 1;
    const lastLabel = actual[actual.length - 1].time;
    return {
      time: step === 1 ? lastLabel : `+${step - 1}`,
      predit: Number((baseline + safeSlope * step).toFixed(metric.key === "pressure" ? 0 : 2)),
      reel: step === 1 ? Number(baseline.toFixed(metric.key === "pressure" ? 0 : 2)) : undefined,
    };
  });

  return [...actual.slice(0, -1), predicted[0], ...predicted.slice(1)];
}

function getMetricStatus(value: number | null | undefined, metric: AnalyticsMetricConfig) {
  if (value == null || Number.isNaN(value)) return "unknown";
  if ((metric.alertMin !== undefined && value < metric.alertMin) || (metric.alertMax !== undefined && value > metric.alertMax)) return "critical";
  if ((metric.warningMin !== undefined && value < metric.warningMin) || (metric.warningMax !== undefined && value > metric.warningMax)) return "warning";
  return "normal";
}

const Overview = () => {
  const [activeTab, setActiveTab] = useState<TabType>("CARTE ZONES");
  const [analyticsMetric, setAnalyticsMetric] = useState<MetricKey>("temperature");
  const [selectedNode, setSelectedNode] = useState<{
    nodeDbId: string;
    name: string;
    zone: string;
    status: string;
    isOnline: boolean;
  } | null>(null);
  const { connectedDC } = useDatacenter();
  const { user } = useAuth();
  const dcId = connectedDC?.id ?? null;

  const { data: zones, isLoading: zonesLoading } = useZones(dcId);
  const { data: latestReadings } = useLatestReadings(dcId);
  const { data: historyResult } = useSensorHistory(dcId);
  const history = historyResult?.data ?? [];
  const { data: rawAlerts } = useAlerts(dcId);
  const acknowledgeAlert = useAcknowledgeAlert();
  // ✅ Join the selected datacenter room so Socket.IO only streams the connected hub
  useJoinDatacenter(dcId ?? undefined);
  useRealtimeSensorReadings();
  useRealtimeAlerts();

  // Compute sensor cards from latest readings
  const sensorCards = useMemo(() => {
    if (!latestReadings?.length) return [
      { title: "TEMPÉRATURE MOY.", value: "—", unit: "°C", color: "hsl(var(--status-critical))", spark: [] },
      { title: "HUMIDITÉ MOY.", value: "—", unit: "%", color: "hsl(var(--status-warning))", spark: [] },
      { title: "GAZ CO2", value: "—", unit: "ppm", color: "hsl(var(--primary))", spark: [] },
      { title: "FUMEE", value: "—", unit: "ppm", color: "hsl(var(--status-critical))", spark: [] },
      { title: "VIBRATION", value: "—", unit: "mm/s", color: "hsl(var(--status-critical))", spark: [] },
    ];

    const avg = (vals: number[]) => vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
    const temps = latestReadings.filter((r) => r.temperature != null).map((r) => r.temperature!);
    const hums = latestReadings.filter((r) => r.humidity != null).map((r) => r.humidity!);
    const press = latestReadings.filter((r) => r.pressure != null).map((r) => r.pressure!);
    const gas = latestReadings.filter((r) => r.gas_level != null).map((r) => r.gas_level!);
    const vibs = latestReadings.filter((r) => r.vibration != null).map((r) => r.vibration!);

    // Build sparklines from history
    const buildSpark = (key: string) => history.slice(-20).map((r: any) => ({ v: r[key] ?? 0 }));

    return [
      { title: "TEMPÉRATURE MOY.", value: avg(temps), unit: "°C", color: "hsl(var(--status-critical))", spark: buildSpark("temperature") },
      { title: "HUMIDITÉ MOY.", value: avg(hums), unit: "%", color: "hsl(var(--status-warning))", spark: buildSpark("humidity") },
      { title: "GAZ CO2", value: avg(press), unit: "ppm", color: "hsl(var(--primary))", spark: buildSpark("pressure") },
      { title: "FUMEE", value: avg(gas), unit: "ppm", color: "hsl(var(--status-critical))", spark: buildSpark("gas_level") },
      { title: "VIBRATION", value: avg(vibs), unit: "mm/s", color: "hsl(var(--status-critical))", spark: buildSpark("vibration") },
    ];
  }, [latestReadings, history]);

  // Build zone map from real zones and nodes — includes DB IDs for metric lookup
  const zoneMap = useMemo(() => {
    if (!zones) return [];
    return zones.flatMap((z: any) =>
      (z.nodes ?? []).map((n: any) => ({
        id: n.name,
        nodeDbId: n.id,
        zone: z.name,
        status: n.status as string,
        isOnline: !!n.is_online,
      }))
    );
  }, [zones]);

  // Group zones by Part → Room for the room-based display
  const roomMap = useMemo(() => {
    if (!zones) return [];
    const grouped: Record<string, Record<string, any[]>> = {};
    zones.forEach((z: any) => {
      const part = z.part || "Général";
      const room = z.room || "Salle Principale";
      if (!grouped[part]) grouped[part] = {};
      if (!grouped[part][room]) grouped[part][room] = [];
      grouped[part][room].push(z);
    });
    return Object.entries(grouped).map(([part, rooms]) => ({
      part,
      rooms: Object.entries(rooms).map(([room, zoneList]) => ({
        room,
        zones: zoneList,
        status: zoneList.some((z: any) => z.status === "critical" || z.status === "alert")
          ? "critical"
          : zoneList.some((z: any) => z.status === "warning")
          ? "warning"
          : "normal",
      })),
    }));
  }, [zones]);

  // System logs from alerts
  const systemLogs = useMemo(() => {
    if (!rawAlerts) return [];
    return rawAlerts.slice(0, 8).map((a: any) => ({
      id: a.id,
      severity: a.severity as "critical" | "warning" | "info",
      time: new Date(a.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      message: a.message ?? `${a.metric_name}: ${a.metric_value}`,
      source: a.node?.name ?? "Système",
      status: a.status,
    }));
  }, [rawAlerts]);

  // Analytics prediction from history — multi-metrics
  const predictionByMetric = useMemo(() => {
    return analyticsMetricConfigs.reduce((acc, metric) => {
      acc[metric.key] = buildPredictionSeries(history, metric);
      return acc;
    }, {} as Record<MetricKey, Array<{ time: string; reel?: number; predit?: number }>>);
  }, [history]);

  const selectedAnalytics = analyticsMetricConfigs.find((metric) => metric.key === analyticsMetric) ?? analyticsMetricConfigs[0];
  const predictionData = predictionByMetric[selectedAnalytics.key] ?? [];

  const analyticsSummary = useMemo(() => {
    return analyticsMetricConfigs.map((metric) => {
      const series = predictionByMetric[metric.key] ?? [];
      const current = [...series].reverse().find((item) => item.reel != null)?.reel;
      const predicted = [...series].reverse().find((item) => item.predit != null)?.predit;
      return {
        ...metric,
        current,
        predicted,
        status: getMetricStatus(predicted ?? current, metric),
      };
    });
  }, [predictionByMetric]);

  // CSV export from real data
  const exportToCSV = () => {
    const csvRows = [
      ["Datacenter", connectedDC?.name ?? ""],
      ["Date export", new Date().toLocaleString("fr-FR")],
      [],
      ["Métrique", "Valeur Moyenne", "Unité"],
      ...sensorCards.map((c) => [c.title, c.value, c.unit]),
      [],
      ["Nœud", "Zone", "Statut"],
      ...zoneMap.map((z) => [z.id, z.zone, z.status === "normal" ? "Normal" : z.status === "warning" ? "Avertissement" : "Critique"]),
      [],
      ["Heure", "Sévérité", "Message", "Source"],
      ...systemLogs.map((l) => [l.time, l.severity.toUpperCase(), l.message, l.source]),
    ];
    const csvContent = csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_${connectedDC?.name?.replace(/\s/g, "_") ?? "datacenter"}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (zonesLoading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>;
  }

  return (
    <div className="space-y-6 min-w-0 w-full max-w-full overflow-x-hidden">
      {/* Sensor metric cards */}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {sensorCards.map((card) => (
          <Card key={card.title} className="min-w-0">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-1">{card.title}</p>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold" style={{ color: card.color }}>{card.value}</span>
                <span className="text-xs text-muted-foreground mb-1">{card.unit}</span>
              </div>
              {card.spark.length > 0 && (
                <div className="h-10 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={card.spark}>
                      <Line type="monotone" dataKey="v" stroke={card.color} strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <div className="min-w-0 space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-xs">
            {(["CARTE ZONES", "ANALYTIQUES", "FLUX CCTV"] as TabType[]).map((tab) => (
              <span key={tab} onClick={() => setActiveTab(tab)} className={cn("px-2 pb-2 cursor-pointer transition-colors", activeTab === tab ? "font-semibold text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}>{tab}</span>
            ))}
            <div className="ml-auto">
              <button onClick={exportToCSV} className="flex items-center gap-1.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded px-3 py-1.5 hover:bg-primary/90 transition-colors">
                <Download className="h-3 w-3" /> EXPORT RAPPORT
              </button>
            </div>
          </div>

          {/* CARTE ZONES */}
          {activeTab === "CARTE ZONES" && (
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base uppercase tracking-wide">Carte des Salles</CardTitle>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-normal" /> NORMAL</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-warning" /> AVERT.</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-critical" /> CRITIQUE</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {roomMap.map((partGroup) => (
                  <div key={partGroup.part}>
                    {/* Part header */}
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 border-b border-border pb-1">
                      {partGroup.part}
                    </p>
                    <div className="space-y-3">
                      {partGroup.rooms.map((roomGroup) => (
                        <div key={roomGroup.room} className={cn(
                          "rounded-lg border p-3",
                          roomGroup.status === "critical" && "border-status-critical/30 bg-status-critical/5",
                          roomGroup.status === "warning" && "border-status-warning/30 bg-status-warning/5",
                          roomGroup.status === "normal" && "border-border bg-muted/20",
                        )}>
                          {/* Room header */}
                          <div className="flex items-center justify-between mb-2">
                            <span className={cn("text-xs font-semibold",
                              roomGroup.status === "critical" && "text-status-critical",
                              roomGroup.status === "warning" && "text-status-warning",
                              roomGroup.status === "normal" && "text-foreground",
                            )}>
                              {roomGroup.room}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{roomGroup.zones.length} zone{roomGroup.zones.length > 1 ? "s" : ""}</span>
                          </div>
                          {/* Zones grid */}
                          <div className="grid grid-cols-4 gap-1.5">
                            {roomGroup.zones.flatMap((z: any) =>
                              (z.nodes ?? []).map((n: any) => {
                                const nodeStatus = n.status as string;
                                const isOnline = !!n.is_online;
                                const nodeDbId = n.id;
                                const zoneLabel = z.room_part ? `${z.room_part} - ${z.name.split(" - ").pop()}` : z.name.split(" - ").pop();
                                return (
                                  <div
                                    key={n.id}
                                    onClick={() => setSelectedNode(selectedNode?.nodeDbId === nodeDbId ? null : { nodeDbId, name: n.name, zone: z.name, status: nodeStatus, isOnline })}
                                    className={cn(
                                      "rounded border-2 flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 select-none py-2 px-1",
                                      selectedNode?.nodeDbId === nodeDbId && "ring-2 ring-primary ring-offset-1 scale-105",
                                      nodeStatus === "normal" && "bg-status-normal/10 border-status-normal/30",
                                      nodeStatus === "warning" && "bg-status-warning/10 border-status-warning/40",
                                      (nodeStatus === "alert" || nodeStatus === "critical") && "bg-status-critical/10 border-status-critical/40",
                                    )}
                                  >
                                    <span className={cn("text-[10px] font-bold text-center leading-tight",
                                      nodeStatus === "normal" && "text-status-normal",
                                      nodeStatus === "warning" && "text-status-warning",
                                      (nodeStatus === "alert" || nodeStatus === "critical") && "text-status-critical",
                                    )}>
                                      {zoneLabel}
                                    </span>
                                    {!isOnline && <span className="text-[8px] text-muted-foreground">offline</span>}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* ── Metrics panel inline — only for the room that contains the selected node ── */}
                          {selectedNode && roomGroup.zones.some((z: any) => z.nodes?.some((n: any) => n.id === selectedNode.nodeDbId)) && (() => {
                            const reading = latestReadings?.find((r: any) => r.node_id === selectedNode.nodeDbId);
                            const metrics = [
                              { key: "temperature" as const, label: "Température", unit: "°C", icon: Thermometer, warnMin: 18, warnMax: 27, alertMin: 15, alertMax: 30 },
                              { key: "humidity" as const,    label: "Humidité",    unit: "%",   icon: Droplets,    warnMin: 40, warnMax: 60, alertMin: 30, alertMax: 70 },
                              { key: "pressure" as const,    label: "Gaz CO2",     unit: "ppm", icon: Gauge,       warnMin: 450, warnMax: 900, alertMin: 350, alertMax: 1100 },
                              { key: "vibration" as const,   label: "Vibration",   unit: "mm/s",icon: Waves,       warnMin: 0,  warnMax: 1.2, alertMin: 0, alertMax: 1.5 },
                              { key: "gas_level" as const,   label: "Fumee",       unit: "ppm", icon: ShieldAlert, warnMin: 0,  warnMax: 90, alertMin: 0, alertMax: 130 },
                            ];
                            const getStatus = (val: number | null | undefined, m: typeof metrics[0]) => {
                              if (val == null) return "unknown";
                              if (val < m.alertMin || val > m.alertMax) return "alert";
                              if (val < m.warnMin || val > m.warnMax) return "warning";
                              return "normal";
                            };
                            return (
                              <div className="mt-3 rounded-lg border border-border bg-card p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {selectedNode.isOnline ? <Wifi className="h-3.5 w-3.5 text-status-normal" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                                    <span className="text-sm font-semibold">{selectedNode.name}</span>
                                    <Badge variant="outline" className={cn("text-[10px]",
                                      selectedNode.status === "normal" && "text-status-normal border-status-normal/40",
                                      selectedNode.status === "warning" && "text-status-warning border-status-warning/40",
                                      (selectedNode.status === "alert" || selectedNode.status === "critical") && "text-status-critical border-status-critical/40",
                                    )}>
                                      {selectedNode.status === "normal" ? "Normal" : selectedNode.status === "warning" ? "Warning" : "Alert"}
                                    </Badge>
                                  </div>
                                  <button onClick={() => setSelectedNode(null)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {!reading ? (
                                  <p className="text-xs text-muted-foreground text-center py-1">{selectedNode.isOnline ? "Chargement..." : "Node hors ligne"}</p>
                                ) : (
                                  <div className="grid grid-cols-5 gap-2">
                                    {metrics.map((m) => {
                                      const val = reading[m.key];
                                      const st = getStatus(val, m);
                                      const Icon = m.icon;
                                      return (
                                        <div key={m.key} className={cn("rounded-lg border p-2 space-y-1 text-center",
                                          st === "alert"   && "bg-status-critical/8 border-status-critical/30",
                                          st === "warning" && "bg-status-warning/8 border-status-warning/30",
                                          st === "normal"  && "bg-status-normal/5 border-status-normal/20",
                                          st === "unknown" && "bg-muted/30 border-border",
                                        )}>
                                          <div className={cn("flex items-center justify-center gap-1 text-[10px]",
                                            st === "alert" && "text-status-critical", st === "warning" && "text-status-warning",
                                            st === "normal" && "text-status-normal",  st === "unknown" && "text-muted-foreground",
                                          )}>
                                            <Icon className="h-3 w-3" /><span>{m.label}</span>
                                          </div>
                                          <div className={cn("text-base font-bold",
                                            st === "alert" && "text-status-critical", st === "warning" && "text-status-warning",
                                            st === "normal" && "text-foreground",     st === "unknown" && "text-muted-foreground",
                                          )}>
                                            {val != null ? Number(val).toFixed(m.key === "pressure" ? 0 : 2) : "—"}
                                          </div>
                                          <div className="text-[10px] text-muted-foreground">{m.unit}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {reading?.recorded_at && (
                                  <p className="text-[10px] text-muted-foreground text-right">
                                    Dernière lecture : {new Date(reading.recorded_at).toLocaleString("fr-FR")}
                                    <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-status-normal animate-pulse" />
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground mt-2 text-center">
                  Total Nœuds: <span className="font-semibold">{zoneMap.length}</span> • Zones: <span className="font-semibold">{zones?.length ?? 0}</span>
                </p>
              </CardContent>
            </Card>
          )}

          {/* ANALYTIQUES */}
          {activeTab === "ANALYTIQUES" && (
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><span className="text-primary">⚡</span> Prédiction multi-métriques – {connectedDC?.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">Analyse prédictive IA sur la température, l'humidité, le Gaz CO2, la Fumee et la vibration.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:max-w-[420px] lg:justify-end">
                    {analyticsMetricConfigs.map((metric) => (
                      <button
                        key={metric.key}
                        onClick={() => setAnalyticsMetric(metric.key)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                          analyticsMetric === metric.key ? "bg-muted" : "bg-background hover:bg-muted/60"
                        )}
                        style={{
                          borderColor: analyticsMetric === metric.key ? metric.color : undefined,
                          color: analyticsMetric === metric.key ? metric.color : undefined,
                        }}
                      >
                        {metric.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="min-w-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {analyticsSummary.map((metric) => (
                    <div
                      key={metric.key}
                      className={cn(
                        "rounded-lg border px-3 py-3",
                        metric.status === "critical" && "border-status-critical/30 bg-status-critical/5",
                        metric.status === "warning" && "border-status-warning/30 bg-status-warning/5",
                        metric.status === "normal" && "border-border bg-muted/20",
                        metric.status === "unknown" && "border-border bg-background"
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                      <p className="mt-2 text-lg font-bold" style={{ color: metric.color }}>{metric.current ?? "—"} <span className="text-xs text-muted-foreground">{metric.unit}</span></p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Prévu: {metric.predicted ?? "—"} {metric.unit}</p>
                    </div>
                  ))}
                </div>
                <div className="h-[320px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={predictionData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} tickLine={false} axisLine={false} width={42} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(val: number, name: string) => [selectedAnalytics.key === "pressure" ? `${val?.toFixed(0)} ${selectedAnalytics.unit}` : `${val?.toFixed(2)} ${selectedAnalytics.unit}`, name === "reel" ? "Réel" : "Prédit"]} />
                      {selectedAnalytics.warningMin !== undefined && <ReferenceLine y={selectedAnalytics.warningMin} stroke="hsl(var(--status-warning))" strokeDasharray="4 4" ifOverflow="extendDomain" />}
                      {selectedAnalytics.warningMax !== undefined && <ReferenceLine y={selectedAnalytics.warningMax} stroke="hsl(var(--status-warning))" strokeDasharray="4 4" ifOverflow="extendDomain" />}
                      {selectedAnalytics.alertMin !== undefined && <ReferenceLine y={selectedAnalytics.alertMin} stroke="hsl(var(--status-critical))" strokeDasharray="6 4" ifOverflow="extendDomain" />}
                      {selectedAnalytics.alertMax !== undefined && <ReferenceLine y={selectedAnalytics.alertMax} stroke="hsl(var(--status-critical))" strokeDasharray="6 4" ifOverflow="extendDomain" />}
                      <Line type="monotone" dataKey="reel" stroke={selectedAnalytics.color} strokeWidth={2.5} dot={false} name="Réel" connectNulls={false} />
                      <Line type="monotone" dataKey="predit" stroke="hsl(var(--status-warning))" strokeWidth={2.5} strokeDasharray="6 4" dot={false} name="Prédit" connectNulls={true} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6" style={{ backgroundColor: selectedAnalytics.color }} /> Historique réel</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-status-warning" /> Projection IA</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6 border-t border-dashed border-status-critical" /> Seuils</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* FLUX CCTV */}
          {activeTab === "FLUX CCTV" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><Video className="h-4 w-4 text-primary" /> Flux de Surveillance CCTV</CardTitle>
                  <Badge className="bg-primary text-primary-foreground text-[10px]">EN DIRECT</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{connectedDC?.name} — 4 caméras actives</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {cctvFeeds.map((cam) => (
                    <div key={cam.id} className="relative rounded-lg overflow-hidden bg-[#1a1a1a] border border-border aspect-video flex flex-col items-center justify-center">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#1c1c1c] to-[#0a0a0a]" />
                      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)" }} />
                      <Video className="relative z-10 h-8 w-8 text-muted-foreground/40 mb-2" />
                      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-critical animate-pulse" />
                        <span className="text-[9px] font-bold text-status-critical">DIRECT</span>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1.5 z-10">
                        <p className="text-[10px] font-mono font-semibold text-white/90">{cam.id}</p>
                        <p className="text-[9px] text-white/60 uppercase tracking-wider">{cam.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-3">Intégration flux vidéo en temps réel — Contactez l'équipe infrastructure pour connecter les flux de caméras</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* System Logs */}
        <Card className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base uppercase tracking-wide">Journaux Système</CardTitle>
              <Badge className="bg-primary text-primary-foreground text-[10px]">EN DIRECT</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 overflow-y-auto min-w-0">
            {systemLogs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucun journal récent</p>}
            {systemLogs.map((log) => (
              <div key={log.id} className={cn("p-3 rounded-lg border", { "bg-status-critical/5 border-status-critical/20": log.severity === "critical", "bg-status-warning/5 border-status-warning/20": log.severity === "warning", "bg-muted/30 border-border": log.severity === "info" })}>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className={cn("text-[9px] uppercase px-1.5", { "text-status-critical border-status-critical/30": log.severity === "critical", "text-status-warning border-status-warning/30": log.severity === "warning", "text-muted-foreground border-border": log.severity === "info" })}>{log.severity}</Badge>
                  <span className="text-[10px] font-mono text-muted-foreground">{log.time}</span>
                </div>
                <p className="text-xs text-foreground mb-1">{log.message}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{log.source}</span>
                  {log.status === "active" && (
                    <button onClick={() => user && acknowledgeAlert.mutate({ alertId: log.id })} className="text-[10px] font-semibold text-primary hover:underline">ACQUITTER</button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Overview;
