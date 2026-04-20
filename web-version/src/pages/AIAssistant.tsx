import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  MessageSquare,
  Send,
  Shield,
  TrendingUp,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDatacenter } from "@/hooks/useDatacenter";
import { useAiInsights } from "@/hooks/useApiData";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

const metricColors: Record<string, string> = {
  temperature: "#ef4444",
  humidity: "#f59e0b",
  pressure: "#3b82f6",
  vibration: "#f97316",
  gasLevel: "#22c55e",
};

const stateStyles: Record<string, { card: string; badge: string; icon: string; iconNode: any }> = {
  stable: {
    card: "border-status-normal/30 bg-status-normal/5",
    badge: "border-status-normal/30 bg-status-normal/10 text-status-normal",
    icon: "text-status-normal",
    iconNode: Brain,
  },
  watch: {
    card: "border-orange-400/30 bg-orange-400/5",
    badge: "border-orange-400/30 bg-orange-400/10 text-orange-500",
    icon: "text-orange-500",
    iconNode: Activity,
  },
  alert: {
    card: "border-status-warning/30 bg-status-warning/5",
    badge: "border-status-warning/30 bg-status-warning/10 text-status-warning",
    icon: "text-status-warning",
    iconNode: AlertTriangle,
  },
  critical: {
    card: "border-status-critical/30 bg-status-critical/5",
    badge: "border-status-critical/30 bg-status-critical/10 text-status-critical",
    icon: "text-status-critical",
    iconNode: AlertTriangle,
  },
  maintenance: {
    card: "border-indigo-400/30 bg-indigo-400/5",
    badge: "border-indigo-400/30 bg-indigo-400/10 text-indigo-500",
    icon: "text-indigo-500",
    iconNode: Wrench,
  },
};

function moduleIcon(key: string) {
  if (key === "classification") return Brain;
  if (key === "anomaly-detection") return Shield;
  if (key === "risk-analysis") return TrendingUp;
  return MessageSquare;
}

function exportInsights(data: any) {
  const metrics = data?.metrics || [];
  const anomalies = data?.anomalies || [];
  const recommendations = data?.recommendations || [];
  const modules = data?.aiModules || [];
  const classifications = data?.classifications?.nodes || [];

  const lines = [
    "Assistant IA - Insights",
    `Date export: ${new Date().toLocaleString("fr-FR")}`,
    `Etat global: ${data?.globalLabel || "-"}`,
    `Resume: ${data?.summary || "-"}`,
    "",
    "Modules IA",
    ...modules.map((item: any) => `- ${item.label}: ${item.stateLabel} | ${item.engine} | ${item.detail}`),
    "",
    "Metriques",
    ...metrics.map(
      (metric: any) =>
        `- ${metric.label}: ${metric.stateLabel} | actuel ${metric.currentValue ?? "-"} ${metric.unit ?? ""} | prevu ${metric.predictedValue ?? "-"} ${metric.unit ?? ""} | risque ${metric.riskScore ?? 0}%`
    ),
    "",
    "Noeuds classes",
    ...classifications.map(
      (node: any) =>
        `- ${node.nodeName || "Noeud"} (${node.zoneName || "Zone inconnue"}): ${node.stateLabel} | confiance ${Math.round((node.confidence || 0) * 100)}% | ${node.recommendation || "Aucune recommandation"}`
    ),
    "",
    "Anomalies",
    ...anomalies.map((item: any) => `- ${item.title} | ${item.detail} | ${item.source}`),
    "",
    "Recommandations",
    ...recommendations.map((item: any) => `- ${item.title}`),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `assistant_ia_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const AIAssistant = () => {
  const { connectedDC } = useDatacenter();
  const dcId = connectedDC?.id ?? null;
  const { data, isLoading, isError, refetch } = useAiInsights(dcId);

  const [selectedMetric, setSelectedMetric] = useState("temperature");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "ai"; content: string }>>([
    {
      role: "ai",
      content:
        "Bonjour. Je suis l'assistant IA de Sentinel. Je peux expliquer les alertes, resumer les classifications et te recommander les prochaines actions.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const metrics = data?.metrics || [];
  const anomalies = data?.anomalies || [];
  const recommendations = data?.recommendations || [];
  const aiModules = data?.aiModules || [];
  const classificationNodes = data?.classifications?.nodes || [];
  const classificationCounts = data?.classifications?.counts || {};
  const modelStatus = data?.modelStatus || null;
  const selected = metrics.find((metric: any) => metric.key === selectedMetric) || metrics[0];
  const globalState = data?.globalState || "stable";
  const styles = stateStyles[globalState] || stateStyles.stable;
  const HeaderIcon = styles.iconNode;

  useEffect(() => {
    if (metrics.length && !metrics.some((metric: any) => metric.key === selectedMetric)) {
      setSelectedMetric(metrics[0].key);
    }
  }, [metrics, selectedMetric]);

  useEffect(() => {
    if (chatOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatMessages, chatOpen, chatLoading]);

  const rankedMetrics = useMemo(
    () => [...metrics].sort((a: any, b: any) => (b.riskScore || 0) - (a.riskScore || 0)),
    [metrics]
  );

  const handleSend = async () => {
    const message = chatInput.trim();
    if (!message || !dcId || chatLoading) return;

    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await apiFetch<{ success: boolean; data: { reply: string } }>("/sensors/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          datacenterId: dcId,
          message,
          hours: 6,
          points: 18,
        }),
      });

      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content:
            response?.data?.reply ||
            "Je n'ai pas pu produire une reponse detaillee pour le moment. Reessaie dans quelques secondes.",
        },
      ]);
    } catch (error: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: error?.message || "Le backend assistant IA est indisponible pour le moment.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (!dcId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Assistant IA</h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Connectez-vous a un datacenter.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-10 text-center text-muted-foreground">Chargement de l'analyse IA...</div>;
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Assistant IA</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-muted-foreground">Impossible de charger les insights IA.</p>
            <Button variant="outline" onClick={() => refetch()}>
              Reessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assistant IA</h1>
          <p className="text-sm text-muted-foreground">
            Modeles integres, classifications noeuds, detection d'anomalies et chat explicatif
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Actualiser
        </Button>
      </div>

      <Card className={styles.card}>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/60">
              <HeaderIcon className={cn("h-6 w-6", styles.icon)} />
            </div>
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-foreground">Etat du systeme :</span>
                <Badge className={cn("text-xs", styles.badge)} variant="outline">
                  {data?.globalLabel || "Stable"}
                </Badge>
                {modelStatus?.source ? (
                  <Badge variant="outline" className="text-[10px]">
                    Modele 1: {modelStatus.source}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{data?.summary || "Aucun resume disponible."}</p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  {aiModules.length} modules IA
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {metrics.length} metriques classees
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {anomalies.length} anomalies
                </span>
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {data?.nodeHealth?.online || 0}/{data?.nodeHealth?.total || 0} noeuds en ligne
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!!aiModules.length && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {aiModules.map((module: any) => {
            const moduleStyles = stateStyles[module.state] || stateStyles.stable;
            const IconNode = moduleIcon(module.key);
            return (
              <Card key={module.key} className={moduleStyles.card}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                      <IconNode className={cn("h-5 w-5", moduleStyles.icon)} />
                    </div>
                    <Badge variant="outline" className={cn("text-[10px]", moduleStyles.badge)}>
                      {module.stateLabel}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{module.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{module.engine}</p>
                  </div>
                  <p className="text-xs text-foreground">{module.detail}</p>
                  {module.meta?.lastTrainingAt ? (
                    <p className="text-[11px] text-muted-foreground">
                      Dernier entrainement: {new Date(module.meta.lastTrainingAt).toLocaleString("fr-FR")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {metrics.map((metric: any) => (
          <button
            key={metric.key}
            onClick={() => setSelectedMetric(metric.key)}
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
              selectedMetric === metric.key ? "bg-muted" : "bg-background hover:bg-muted/60"
            )}
            style={{
              borderColor:
                selectedMetric === metric.key
                  ? metricColors[metric.key] || "hsl(var(--border))"
                  : undefined,
              color: selectedMetric === metric.key ? metricColors[metric.key] || undefined : undefined,
            }}
          >
            {metric.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-status-warning" />
                Classification et analyse de risque
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rankedMetrics.map((metric: any) => {
                const metricStateStyles = stateStyles[metric.state] || stateStyles.stable;
                const IconNode = metricStateStyles.iconNode;
                return (
                  <div key={metric.key} className={cn("rounded-lg border p-3", metricStateStyles.card)}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <IconNode className={cn("h-4 w-4", metricStateStyles.icon)} />
                      <span className="text-sm font-semibold text-foreground">{metric.label}</span>
                      <Badge variant="outline" className={cn("text-[10px]", metricStateStyles.badge)}>
                        {metric.stateLabel}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {metric.riskScore}% risque
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Actuel: {metric.currentValue ?? "-"} {metric.unit} | Prevu: {metric.predictedValue ?? "-"}{" "}
                      {metric.unit} | Tendance: {metric.trendLabel}
                    </p>
                    <p className="mt-2 text-xs text-foreground">{metric.recommendation}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                Projection {selected?.label || "metrique"}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportInsights(data)}>
                Exporter
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {selected?.series?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selected.series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        width={42}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      {selected.series?.[0]?.warningMin !== null &&
                      selected.series?.[0]?.warningMin !== undefined ? (
                        <ReferenceLine
                          y={selected.series[0].warningMin}
                          stroke="hsl(var(--status-warning))"
                          strokeDasharray="4 4"
                        />
                      ) : null}
                      {selected.series?.[0]?.warningMax !== null &&
                      selected.series?.[0]?.warningMax !== undefined ? (
                        <ReferenceLine
                          y={selected.series[0].warningMax}
                          stroke="hsl(var(--status-warning))"
                          strokeDasharray="4 4"
                        />
                      ) : null}
                      {selected.series?.[0]?.alertMin !== null &&
                      selected.series?.[0]?.alertMin !== undefined ? (
                        <ReferenceLine
                          y={selected.series[0].alertMin}
                          stroke="hsl(var(--status-critical))"
                          strokeDasharray="6 4"
                        />
                      ) : null}
                      {selected.series?.[0]?.alertMax !== null &&
                      selected.series?.[0]?.alertMax !== undefined ? (
                        <ReferenceLine
                          y={selected.series[0].alertMax}
                          stroke="hsl(var(--status-critical))"
                          strokeDasharray="6 4"
                        />
                      ) : null}
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke={metricColors[selected?.key] || "hsl(var(--primary))"}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="hsl(var(--status-warning))"
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Donnees insuffisantes
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-status-critical" />
                Detection d'anomalies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {anomalies.length ? (
                anomalies.map((item: any) => (
                  <div key={item.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <AlertTriangle
                        className={cn(
                          "h-4 w-4",
                          item.severity === "critical"
                            ? "text-status-critical"
                            : "text-status-warning"
                        )}
                      />
                      <span className="text-sm font-semibold text-foreground">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {item.source} | {item.time}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aucune anomalie active.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-primary" />
                Noeuds classes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Normal: {classificationCounts?.Normal || 0}</Badge>
                <Badge variant="outline">Alerte: {classificationCounts?.Alerte || 0}</Badge>
                <Badge variant="outline">Maintenance: {classificationCounts?.Maintenance || 0}</Badge>
                <Badge variant="outline">Critique: {classificationCounts?.Critique || 0}</Badge>
              </div>
              {classificationNodes.length ? (
                classificationNodes.slice(0, 6).map((node: any, index: number) => {
                  const nodeState = node.state === "Normal" ? "stable" : (data?.classifications?.globalState && {
                    Normal: "stable",
                    Alerte: "alert",
                    Maintenance: "maintenance",
                    Critique: "critical",
                  }[node.state]) || "stable";
                  const nodeStyles = stateStyles[nodeState] || stateStyles.stable;
                  return (
                    <div key={`${node.nodeId || node.nodeName || index}`} className={cn("rounded-lg border p-3", nodeStyles.card)}>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px]", nodeStyles.badge)}>
                          {node.stateLabel}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">
                          {node.nodeName || "Noeud"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {node.zoneName || "Zone inconnue"} | confiance{" "}
                        {Math.round((node.confidence || 0) * 100)}% | cause {node.rootCause || "n/a"}
                      </p>
                      <p className="mt-2 text-xs text-foreground">{node.recommendation || "Aucune recommandation"}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">Aucune classification noeud disponible.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" />
                Recommandations IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations.map((rec: any) => (
                <div key={rec.id} className="rounded-lg border bg-card p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("px-1.5 text-[10px]", {
                        "border-status-critical text-status-critical": rec.priority === "urgent",
                        "border-status-warning text-status-warning": rec.priority === "important",
                        "border-muted-foreground text-muted-foreground":
                          rec.priority !== "urgent" && rec.priority !== "important",
                      })}
                    >
                      {rec.priority === "urgent"
                        ? "Urgent"
                        : rec.priority === "important"
                          ? "Important"
                          : "Info"}
                    </Badge>
                  </div>
                  <p className="mb-1 text-sm font-medium text-foreground">{rec.title}</p>
                  <p className="mb-1 text-xs text-muted-foreground">{rec.detail}</p>
                  <span className="text-[10px] text-muted-foreground">{rec.target}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-50">
        {chatOpen && (
          <Card className="absolute bottom-16 right-0 flex h-[500px] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <span className="text-base font-semibold text-foreground">Assistant IA</span>
              <button
                onClick={() => setChatOpen(false)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto">
              <div className="divide-y divide-border">
                {chatMessages.map((msg, index) => (
                  <div key={index} className="flex items-start gap-3 px-5 py-3.5">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        msg.role === "ai"
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-accent-foreground"
                      )}
                    >
                      {msg.role === "ai" ? <Brain className="h-5 w-5" /> : "U"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {msg.role === "ai" ? "Assistant IA" : "Vous"}
                        </span>
                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                          maintenant
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Brain className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground">Assistant IA</span>
                      <p className="mt-0.5 text-xs text-muted-foreground">Analyse en cours...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Poser une question..."
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSend()}
                  className="rounded-full text-sm"
                  disabled={chatLoading}
                />
                <Button
                  size="icon"
                  className="shrink-0 rounded-full"
                  onClick={handleSend}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg"
          onClick={() => setChatOpen((value) => !value)}
        >
          {chatOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        </Button>
      </div>
    </div>
  );
};

export default AIAssistant;
