import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  RefreshCw,
  Save,
  Search,
  Server,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useDatacenter } from "@/hooks/useDatacenter";
import {
  useAlertThresholds,
  useBulkUpsertThresholds,
  useDatacenters,
  useNodes,
  useZones,
} from "@/hooks/useApiData";
import { getMetricMeta, orderedMetricKeys } from "@/lib/metrics";
import { cn } from "@/lib/utils";

type ThresholdMode = "datacenter" | "room" | "node";

type MetricRow = {
  metricName: string;
  label: string;
  unit: string;
  warningMin: number;
  warningMax: number;
  alertMin: number;
  alertMax: number;
  enabled: boolean;
};

function buildDefaultRows() {
  return orderedMetricKeys.map((metricName) => {
    const meta = getMetricMeta(metricName);
    return {
      metricName,
      label: meta.label,
      unit: meta.unit,
      warningMin: meta.warningMin,
      warningMax: meta.warningMax,
      alertMin: meta.alertMin,
      alertMax: meta.alertMax,
      enabled: true,
    } satisfies MetricRow;
  });
}

function NumberField({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (value: number) => void;
  step: string;
}) {
  return (
    <Input
      type="number"
      value={value}
      step={step}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="h-10 rounded-xl text-sm"
    />
  );
}

function groupRooms(zones: any[]) {
  const grouped = new Map<
    string,
    {
      key: string;
      part: string;
      room: string;
      firstZoneId: string;
      zoneIds: string[];
      nodeCount: number;
      zoneCount: number;
      roomParts: string[];
      status: string;
      sortOrder: number;
    }
  >();

  zones.forEach((zone: any) => {
    const part = zone.part || "Salles";
    const room = zone.room || zone.name;
    const key = `${part}::${room}`;
    const current = grouped.get(key);
    const nextStatus = zone.status === "alert" ? "critical" : zone.status || "normal";
    const roomPart = zone.room_part ? [zone.room_part] : [];
    const nodeCount = Array.isArray(zone.nodes) ? zone.nodes.length : 0;

    if (!current) {
      grouped.set(key, {
        key,
        part,
        room,
        firstZoneId: zone.id,
        zoneIds: [zone.id],
        nodeCount,
        zoneCount: 1,
        roomParts: roomPart,
        status: nextStatus,
        sortOrder: Number(zone.display_order ?? Number.MAX_SAFE_INTEGER),
      });
      return;
    }

    current.zoneIds.push(zone.id);
    current.nodeCount += nodeCount;
    current.zoneCount += 1;
    current.sortOrder = Math.min(current.sortOrder, Number(zone.display_order ?? Number.MAX_SAFE_INTEGER));
    if (zone.room_part && !current.roomParts.includes(zone.room_part)) {
      current.roomParts.push(zone.room_part);
    }
    if (nextStatus === "critical" || current.status === "critical") {
      current.status = "critical";
    } else if (nextStatus === "warning" || current.status === "warning") {
      current.status = "warning";
    }
  });

  return [...grouped.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.room.localeCompare(b.room));
}

export default function Thresholds() {
  const { connectedDC } = useDatacenter();
  const { toast } = useToast();

  const [mode, setMode] = useState<ThresholdMode>("datacenter");
  const [selectedDatacenterId, setSelectedDatacenterId] = useState("");
  const [selectedRoomKey, setSelectedRoomKey] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [rows, setRows] = useState<MetricRow[]>(buildDefaultRows());
  const [dirty, setDirty] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");

  const { data: datacenters = [] } = useDatacenters();
  const { data: zones = [] } = useZones(connectedDC?.id ?? null);
  const { data: nodes = [] } = useNodes(connectedDC?.id ?? null);
  const bulkUpsert = useBulkUpsertThresholds();

  const rooms = useMemo(() => groupRooms(zones), [zones]);
  const selectedRoom = rooms.find((room) => room.key === selectedRoomKey) ?? null;
  const selectedNode = nodes.find((node: any) => node.id === selectedNodeId) ?? null;

  const effectiveScopeType = mode === "room" ? "zone" : mode;
  const effectiveScopeId =
    mode === "datacenter"
      ? selectedDatacenterId
      : mode === "room"
      ? selectedRoom?.firstZoneId ?? ""
      : selectedNodeId;

  const thresholdQuery = useAlertThresholds(effectiveScopeType, effectiveScopeId || undefined);

  useEffect(() => {
    if (connectedDC?.id) {
      setSelectedDatacenterId((current) => current || connectedDC.id);
    } else if (datacenters[0]?.id) {
      setSelectedDatacenterId((current) => current || datacenters[0].id);
    }
  }, [connectedDC?.id, datacenters]);

  useEffect(() => {
    if (rooms[0]?.key) {
      setSelectedRoomKey((current) => current || rooms[0].key);
    }
  }, [rooms]);

  useEffect(() => {
    if (nodes[0]?.id) {
      setSelectedNodeId((current) => current || nodes[0].id);
    }
  }, [nodes]);

  useEffect(() => {
    if (!effectiveScopeId) {
      setRows(buildDefaultRows());
      setDirty(false);
      return;
    }
    if (thresholdQuery.isLoading) return;

    const serverItems = thresholdQuery.data?.items ?? [];
    const defaults = thresholdQuery.data?.defaults ?? {};
    const merged = orderedMetricKeys.map((metricName) => {
      const meta = getMetricMeta(metricName);
      const existing = serverItems.find((item: any) => item.metric_name === metricName);
      const fallback = defaults[metricName] ?? {};
      return {
        metricName,
        label: meta.label,
        unit: meta.unit,
        warningMin: existing?.warning_min ?? fallback.warningMin ?? meta.warningMin,
        warningMax: existing?.warning_max ?? fallback.warningMax ?? meta.warningMax,
        alertMin: existing?.alert_min ?? fallback.alertMin ?? meta.alertMin,
        alertMax: existing?.alert_max ?? fallback.alertMax ?? meta.alertMax,
        enabled: existing?.enabled ?? true,
      } satisfies MetricRow;
    });

    setRows(merged);
    setDirty(false);
  }, [effectiveScopeId, thresholdQuery.data, thresholdQuery.isLoading]);

  const roomNodeSections = useMemo(() => {
    const search = nodeSearch.trim().toLowerCase();
    return rooms
      .map((room) => ({
        ...room,
        nodes: nodes.filter((node: any) => {
          const matchesRoom = room.zoneIds.includes(node.zone?.id);
          const matchesSearch =
            !search ||
            node.name?.toLowerCase().includes(search) ||
            room.room.toLowerCase().includes(search) ||
            node.zone?.name?.toLowerCase().includes(search);
          return matchesRoom && matchesSearch;
        }),
      }))
      .filter((room) => room.nodes.length > 0);
  }, [nodeSearch, nodes, rooms]);

  const selectionSummary = useMemo(() => {
    if (mode === "datacenter") {
      const datacenter = datacenters.find((item: any) => item.id === selectedDatacenterId) ?? connectedDC;
      return {
        title: datacenter?.name ?? "Defauts globaux",
        subtitle: `${zones.length || 0} zones actives`,
        description: "Les seuils globaux s'appliquent aux noeuds qui n'ont pas de personnalisation salle ou noeud.",
      };
    }
    if (mode === "room" && selectedRoom) {
      return {
        title: selectedRoom.room,
        subtitle: `${selectedRoom.nodeCount} noeuds · ${selectedRoom.zoneCount} zones`,
        description: "La sauvegarde propage les memes seuils a toutes les zones de cette salle.",
      };
    }
    return {
      title: selectedNode?.name ?? "Noeud",
      subtitle: selectedNode?.zone?.name ?? "Aucune salle",
      description: "Le seuil noeud est prioritaire sur la salle et le global.",
    };
  }, [mode, datacenters, selectedDatacenterId, connectedDC, zones.length, selectedRoom, selectedNode]);

  const saveRows = () => {
    if (!effectiveScopeId) {
      toast({
        title: "Selection requise",
        description: "Choisis un datacenter, une salle ou un noeud avant de sauvegarder.",
        variant: "destructive",
      });
      return;
    }

    const payload =
      mode === "room" && selectedRoom
        ? selectedRoom.zoneIds.flatMap((zoneId) =>
            rows.map((row) => ({
              scopeType: "zone",
              scopeId: zoneId,
              metricName: row.metricName,
              warningMin: row.warningMin,
              warningMax: row.warningMax,
              alertMin: row.alertMin,
              alertMax: row.alertMax,
              enabled: row.enabled,
            })),
          )
        : rows.map((row) => ({
            scopeType: effectiveScopeType,
            scopeId: effectiveScopeId,
            metricName: row.metricName,
            warningMin: row.warningMin,
            warningMax: row.warningMax,
            alertMin: row.alertMin,
            alertMax: row.alertMax,
            enabled: row.enabled,
          }));

    bulkUpsert.mutate(payload, {
      onSuccess: () => {
        setDirty(false);
        thresholdQuery.refetch?.();
        toast({
          title: "Seuils enregistres",
          description:
            mode === "room" && selectedRoom
              ? `La salle ${selectedRoom.room} a ete synchronisee sur ${selectedRoom.zoneCount} zones.`
              : `${rows.length} metriques mises a jour.`,
        });
      },
      onError: (error: any) => {
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const updateRow = (metricName: string, field: keyof MetricRow, value: number | boolean) => {
    setRows((current) => current.map((row) => (row.metricName === metricName ? { ...row, [field]: value } : row)));
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <SlidersHorizontal className="h-6 w-6 text-primary" />
            Seuils d'alerte
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Meme organisation sur le web et le flutter: global, salle et noeud avec des cartes plus compactes.
          </p>
        </div>
        <Button onClick={saveRows} disabled={!dirty || bulkUpsert.isPending || !effectiveScopeId} className="gap-2 rounded-2xl">
          {bulkUpsert.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Sauvegarder
        </Button>
      </div>

      <div className="rounded-[28px] border border-border bg-card p-2">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { key: "datacenter", label: "Global", icon: Building2 },
            { key: "room", label: "Salle", icon: Server },
            { key: "node", label: "Noeud", icon: Waypoints },
          ].map((item) => {
            const active = mode === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key as ThresholdMode)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-semibold transition-all",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-[28px] border-border">
          <CardContent className="space-y-4 p-4">
            {mode === "datacenter" && (
              <div className="space-y-3">
                {(datacenters.length ? datacenters : connectedDC ? [connectedDC] : []).map((datacenter: any) => {
                  const active = datacenter.id === selectedDatacenterId;
                  return (
                    <button
                      key={datacenter.id}
                      type="button"
                      onClick={() => setSelectedDatacenterId(datacenter.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-3xl border p-4 text-left transition-all",
                        active ? "border-primary/20 bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/40",
                      )}
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-foreground">{datacenter.name}</p>
                        <p className="text-sm text-muted-foreground">{datacenter.zones?.length ?? zones.length} zones actives</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {mode === "room" && (
              <div className="space-y-4">
                {rooms.map((room, index) => {
                  const active = room.key === selectedRoomKey;
                  const palette = ["bg-rose-100 text-rose-500", "bg-sky-100 text-sky-500", "bg-violet-100 text-violet-500", "bg-emerald-100 text-emerald-500", "bg-cyan-100 text-cyan-500", "bg-amber-100 text-amber-500"];
                  return (
                    <button
                      key={room.key}
                      type="button"
                      onClick={() => setSelectedRoomKey(room.key)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-3xl border p-4 text-left transition-all",
                        active ? "border-primary/20 bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/40",
                      )}
                    >
                      <div className={cn("flex h-14 w-14 items-center justify-center rounded-3xl", palette[index % palette.length])}>
                        <span className="h-4 w-4 rounded-md bg-current" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold text-foreground">{room.room}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {room.nodeCount} noeuds{room.roomParts.length ? ` · ${room.roomParts.join(" / ")}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {mode === "node" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={nodeSearch}
                    onChange={(event) => setNodeSearch(event.target.value)}
                    placeholder="Rechercher un noeud..."
                    className="h-12 rounded-2xl pl-9"
                  />
                </div>
                <div className="space-y-4">
                  {roomNodeSections.map((room) => (
                    <div key={room.key} className="space-y-2">
                      <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        <span>{room.room}</span>
                        <span>{room.nodes.length}</span>
                      </div>
                      <div className="space-y-2">
                        {room.nodes.map((node: any) => {
                          const active = node.id === selectedNodeId;
                          return (
                            <button
                              key={node.id}
                              type="button"
                              onClick={() => setSelectedNodeId(node.id)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all",
                                active ? "border-primary/20 bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/40",
                              )}
                            >
                              <div>
                                <p className="text-sm font-semibold text-foreground">{node.name}</p>
                                <p className="text-xs text-muted-foreground">{node.zone?.name ?? room.room}</p>
                              </div>
                              <div className="rounded-xl border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                {node.is_online ? "Online" : "Offline"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-[28px] border-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary/10 text-primary">
                  {mode === "datacenter" ? <Building2 className="h-7 w-7" /> : mode === "room" ? <Server className="h-7 w-7" /> : <Waypoints className="h-7 w-7" />}
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">{selectionSummary.title}</p>
                  <p className="text-sm text-muted-foreground">{selectionSummary.subtitle}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                {selectionSummary.description}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-2xl border border-status-warning/20 bg-status-warning/5 px-4 py-3 text-sm text-status-warning/90">
            <span className="font-semibold">Priorite des seuils:</span> Noeud &gt; Salle &gt; Global. Pour les salles, la meme configuration est appliquee a toutes les zones de la salle.
          </div>

          {thresholdQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {orderedMetricKeys.map((metric) => (
                <Skeleton key={metric} className="h-56 rounded-[28px]" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {rows.map((row) => {
                const meta = getMetricMeta(row.metricName);
                const step = meta.digits === 0 ? "1" : meta.digits === 2 ? "0.01" : "0.1";
                return (
                  <Card key={row.metricName} className={cn("rounded-[28px] border-border", !row.enabled && "opacity-55")}>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{meta.shortLabel}</p>
                          <h3 className="mt-1 text-lg font-semibold text-foreground">{row.label}</h3>
                          <p className="text-sm text-muted-foreground">{row.unit}</p>
                        </div>
                        <Switch checked={row.enabled} onCheckedChange={(value) => updateRow(row.metricName, "enabled", value)} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Warning min</p>
                          <NumberField value={row.warningMin} onChange={(value) => updateRow(row.metricName, "warningMin", value)} step={step} />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Warning max</p>
                          <NumberField value={row.warningMax} onChange={(value) => updateRow(row.metricName, "warningMax", value)} step={step} />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Alert min</p>
                          <NumberField value={row.alertMin} onChange={(value) => updateRow(row.metricName, "alertMin", value)} step={step} />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Alert max</p>
                          <NumberField value={row.alertMax} onChange={(value) => updateRow(row.metricName, "alertMax", value)} step={step} />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                        {`Warning ${row.warningMin.toFixed(meta.digits)}-${row.warningMax.toFixed(meta.digits)} ${row.unit} · Alert ${row.alertMin.toFixed(meta.digits)}-${row.alertMax.toFixed(meta.digits)} ${row.unit}`}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-status-warning" />
              {dirty ? "Des modifications ne sont pas encore sauvegardees." : "Les seuils affiches sont synchronises avec le backend."}
            </div>
            {thresholdQuery.isFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </div>
    </div>
  );
}
