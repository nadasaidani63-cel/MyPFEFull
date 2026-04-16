import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Cpu, MapPin, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlertThresholds, useZoneNodesLatest } from "@/hooks/useApiData";
import { formatMetricValue, getMetricMeta, getMetricStatus, orderedMetricKeys } from "@/lib/metrics";
import { cn } from "@/lib/utils";

function buildThresholdMap(data: any) {
  const defaults = data?.defaults ?? {};
  const items = data?.items ?? [];
  const result: Record<string, { warningMin: number; warningMax: number; alertMin: number; alertMax: number }> = {};

  orderedMetricKeys.forEach((metric) => {
    const meta = getMetricMeta(metric);
    const existing = items.find((item: any) => item.metric_name === metric);
    const fallback = defaults[metric] ?? {};
    result[metric] = {
      warningMin: existing?.warning_min ?? fallback.warningMin ?? meta.warningMin,
      warningMax: existing?.warning_max ?? fallback.warningMax ?? meta.warningMax,
      alertMin: existing?.alert_min ?? fallback.alertMin ?? meta.alertMin,
      alertMax: existing?.alert_max ?? fallback.alertMax ?? meta.alertMax,
    };
  });

  return result;
}

function MetricThresholdChips({ metricKey, thresholds }: { metricKey: string; thresholds: any }) {
  const meta = getMetricMeta(metricKey);
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
      <span className="rounded-full border border-status-warning/25 bg-status-warning/5 px-2.5 py-1 text-status-warning">
        Warning {thresholds.warningMin.toFixed(meta.digits)}-{thresholds.warningMax.toFixed(meta.digits)} {meta.unit}
      </span>
      <span className="rounded-full border border-status-critical/20 bg-status-critical/5 px-2.5 py-1 text-status-critical">
        Alert {thresholds.alertMin.toFixed(meta.digits)}-{thresholds.alertMax.toFixed(meta.digits)} {meta.unit}
      </span>
    </div>
  );
}

export default function ZoneDetails() {
  const { zoneId } = useParams();
  const navigate = useNavigate();
  const { data: zone, isLoading, error } = useZoneNodesLatest(zoneId);
  const thresholdsQuery = useAlertThresholds("zone", zoneId);

  const thresholds = useMemo(() => buildThresholdMap(thresholdsQuery.data), [thresholdsQuery.data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-40 rounded-[28px]" />
        ))}
      </div>
    );
  }

  if (error || !zone) {
    return (
      <div className="space-y-3">
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
        <p className="text-sm text-destructive">Erreur lors du chargement de la salle.</p>
      </div>
    );
  }

  const nodes = zone.nodes || [];
  const online = nodes.filter((node: any) => node.isOnline).length;
  const status = zone.status === "alert" ? "critical" : zone.status || "normal";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Salle</h1>
          <p className="text-sm text-muted-foreground">Visualisation des donnees des noeuds et seuils appliques a cette salle.</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>

      <Card className="rounded-[28px] border-border">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary/10 text-primary">
              <MapPin className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold text-foreground">{zone.room ?? zone.name}</h2>
              <p className="text-sm text-muted-foreground">
                {zone.part ? `${zone.part} · ` : ""}
                {zone.roomPart ? `${zone.roomPart} · ` : ""}
                {zone.datacenterId?.name ?? "Datacenter"}
              </p>
            </div>
            <div
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold uppercase",
                status === "critical" && "border-status-critical/30 text-status-critical",
                status === "warning" && "border-status-warning/30 text-status-warning",
                status === "normal" && "border-status-normal/30 text-status-normal",
              )}
            >
              {status}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                {nodes.length} noeuds surveilles
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                {online > 0 ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                {online}/{nodes.length} en ligne
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Seuils appliques a la salle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orderedMetricKeys.map((metricKey) => {
            const meta = getMetricMeta(metricKey);
            const metricThresholds = thresholds[metricKey] ?? meta;
            return (
              <div key={metricKey} className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{meta.shortLabel}</p>
                <p className="mt-1 text-base font-semibold text-foreground">{meta.label}</p>
                <MetricThresholdChips metricKey={metricKey} thresholds={metricThresholds} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Visualisation des donnees des noeuds</h2>
          <p className="text-sm text-muted-foreground">Chaque noeud affiche ses mesures et les seuils de reference juste en dessous.</p>
        </div>

        {nodes.length === 0 ? (
          <Card className="rounded-[28px] border-border">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Aucun noeud dans cette salle.</CardContent>
          </Card>
        ) : (
          nodes.map((node: any) => (
            <Card key={node._id} className="rounded-[28px] border-border">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{node.name}</p>
                    <p className="text-xs text-muted-foreground">{node.macAddress || "Aucune adresse MAC"}</p>
                  </div>
                  <div className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {node.isOnline ? "Online" : "Offline"}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {orderedMetricKeys.map((metricKey) => {
                    const meta = getMetricMeta(metricKey);
                    const canonicalKey = meta.canonicalKey === "gasLevel" ? "gasLevel" : meta.canonicalKey;
                    const value = node.latestMetrics?.[canonicalKey];
                    const statusTone = getMetricStatus(metricKey, value, thresholds[metricKey]);
                    return (
                      <div
                        key={metricKey}
                        className={cn(
                          "rounded-2xl border p-4",
                          statusTone === "critical" && "border-status-critical/25 bg-status-critical/5",
                          statusTone === "warning" && "border-status-warning/25 bg-status-warning/5",
                          statusTone === "normal" && "border-border bg-muted/20",
                        )}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{meta.shortLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{meta.label}</p>
                        <p className="mt-3 text-2xl font-bold text-foreground">
                          {formatMetricValue(metricKey, value)} <span className="text-xs font-medium text-muted-foreground">{meta.unit}</span>
                        </p>
                        <MetricThresholdChips metricKey={metricKey} thresholds={thresholds[metricKey] ?? meta} />
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-muted-foreground">
                  Derniere lecture:{" "}
                  {node.latestMetrics?.recordedAt ? new Date(node.latestMetrics.recordedAt).toLocaleString("fr-FR") : "Aucune donnee"}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
