import { useState, useMemo, useEffect } from "react";
import {
  History as HistoryIcon, Database, ClipboardList,
  ChevronLeft, ChevronRight, Download, Search, Filter, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDatacenter } from "@/hooks/useDatacenter";
import { useDatacenters, useZones, useNodes, useSensorHistoryFiltered, useAuditLogsFiltered } from "@/hooks/useApiData";

type TabType = "sensors" | "audit";
const ALL = "__ALL__";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "Connexion", "auth.signup": "Inscription", "auth.verify_email": "Vérif. email",
  "threshold.create": "Seuil créé", "threshold.update": "Seuil modifié", "threshold.bulk_upsert": "Seuils maj",
  "threshold.delete": "Seuil supprimé", "profile.update": "Profil mis à jour", "user.role_update": "Rôle modifié",
  "user.delete": "Utilisateur supprimé", "role_request.create": "Demande élévation",
  "role_request.approved": "Élévation accordée", "role_request.rejected": "Élévation refusée", "alert.notified": "Alerte notifiée",
};

function metricCell(val: number | null | undefined, warnMin: number, warnMax: number, alertMin: number, alertMax: number) {
  if (val == null) return <span className="text-muted-foreground">—</span>;
  const v = Number(val);
  const isAlert = v < alertMin || v > alertMax;
  const isWarn = !isAlert && (v < warnMin || v > warnMax);
  return (
    <span className={cn("font-medium tabular-nums",
      isAlert && "text-status-critical", isWarn && "text-status-warning", !isAlert && !isWarn && "text-foreground")}>
      {v.toFixed(v > 100 ? 0 : 2)}
    </span>
  );
}

export default function History() {
  const { connectedDC } = useDatacenter();
  const [tab, setTab] = useState<TabType>("sensors");
  const [dcFilter, setDcFilter] = useState<string>(ALL);
  const [zoneFilter, setZoneFilter] = useState<string>(ALL);
  const [nodeFilter, setNodeFilter] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sensorPage, setSensorPage] = useState(1);
  const [auditAction, setAuditAction] = useState(ALL);
  const [auditTargetType, setAuditTargetType] = useState(ALL);
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditSearch, setAuditSearch] = useState("");

  useEffect(() => {
    if (connectedDC?.id && dcFilter === ALL) setDcFilter(connectedDC.id);
  }, [connectedDC?.id]);

  const dcId = dcFilter === ALL ? null : dcFilter;
  const zoneId = zoneFilter === ALL ? null : zoneFilter;
  const nodeId = nodeFilter === ALL ? null : nodeFilter;

  const { data: allDcs = [] } = useDatacenters();
  const { data: zones = [] } = useZones(dcId);
  const { data: nodes = [] } = useNodes(dcId);

  const sensorQuery = useSensorHistoryFiltered({
    datacenterId: !zoneId && !nodeId ? dcId : null,
    zoneId: zoneId || null, nodeId: nodeId || null,
    from: fromDate || undefined, to: toDate || undefined,
    page: sensorPage, limit: 100,
  });

  const auditQuery = useAuditLogsFiltered({
    action: auditAction === ALL ? undefined : auditAction,
    targetType: auditTargetType === ALL ? undefined : auditTargetType,
    from: auditFrom || undefined, to: auditTo || undefined,
    page: auditPage, limit: 50,
  });

  const sensorData = sensorQuery.data?.data ?? [];
  const sensorPag = sensorQuery.data?.pagination;
  const auditData = auditQuery.data?.data ?? [];
  const auditPag = auditQuery.data?.pagination;

  const filteredAudit = useMemo(() => {
    if (!auditSearch.trim()) return auditData;
    const q = auditSearch.toLowerCase();
    return auditData.filter((a: any) => {
      const actor = `${a.actorId?.firstName ?? ""} ${a.actorId?.lastName ?? ""} ${a.actorId?.email ?? ""}`.toLowerCase();
      return (a.action ?? "").includes(q) || actor.includes(q) || (a.targetType ?? "").includes(q);
    });
  }, [auditData, auditSearch]);

  const exportCSV = () => {
    const header = ["Date/Heure","Node","Température (°C)","Humidité (%)","Gaz CO2 (ppm)","Vibration (mm/s)","Fumee (ppm)"];
    const rows = sensorData.map((r: any) => [
      r.recorded_at ? new Date(r.recorded_at).toLocaleString("fr-FR") : "",
      r.node_name ?? r.node_id ?? "",
      r.temperature ?? "", r.humidity ?? "", r.pressure ?? "", r.vibration ?? "", r.gas_level ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `historique_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HistoryIcon className="h-6 w-6 text-primary" /> Historique</h1>
        <p className="text-sm text-muted-foreground mt-1">Données capteurs et journal d'interventions / audit</p>
      </div>

      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {(["sensors","audit"] as TabType[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            tab === t ? "bg-background text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
          )}>
            {t === "sensors" ? <><Database className="h-4 w-4" /> Données capteurs</> : <><ClipboardList className="h-4 w-4" /> Interventions &amp; Audit</>}
          </button>
        ))}
      </div>

      {tab === "sensors" && (
        <div className="space-y-4">
          <Card><CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datacenter</label>
                <Select value={dcFilter} onValueChange={(v) => { setDcFilter(v); setZoneFilter(ALL); setNodeFilter(ALL); setSensorPage(1); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tous" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tous</SelectItem>
                    {(allDcs as any[]).map((dc) => <SelectItem key={dc.id} value={dc.id}>{dc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[150px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Zone</label>
                <Select value={zoneFilter} onValueChange={(v) => { setZoneFilter(v); setNodeFilter(ALL); setSensorPage(1); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Toutes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Toutes</SelectItem>
                    {(zones as any[]).map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[150px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Node</label>
                <Select value={nodeFilter} onValueChange={(v) => { setNodeFilter(v); setSensorPage(1); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tous" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tous</SelectItem>
                    {(nodes as any[]).map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Du</label>
                <Input type="datetime-local" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setSensorPage(1); }} className="h-8 text-xs w-[170px]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Au</label>
                <Input type="datetime-local" value={toDate} onChange={(e) => { setToDate(e.target.value); setSensorPage(1); }} className="h-8 text-xs w-[170px]" />
              </div>
              <div className="flex gap-2 pb-0.5">
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
                  onClick={() => { setZoneFilter(ALL); setNodeFilter(ALL); setFromDate(""); setToDate(""); setSensorPage(1); }}>
                  <RefreshCw className="h-3 w-3" /> Réinitialiser
                </Button>
                <Button size="sm" className="h-8 gap-1 text-xs" onClick={exportCSV} disabled={sensorData.length === 0}>
                  <Download className="h-3 w-3" /> Exporter CSV
                </Button>
              </div>
            </div>
          </CardContent></Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" /> Relevés capteurs
                {sensorPag && <span className="text-xs font-normal text-muted-foreground ml-1">— {(sensorPag.total ?? 0).toLocaleString("fr-FR")} entrées</span>}
              </CardTitle>
              {sensorQuery.isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent className="p-0">
              {sensorQuery.isLoading ? (
                <div className="p-4 space-y-2">{[...Array(6)].map((_,i) => <Skeleton key={i} className="h-8" />)}</div>
              ) : sensorData.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  <Database className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  {!dcId && !zoneId && !nodeId ? "Sélectionnez un datacenter pour afficher les données." : "Aucune donnée pour les filtres sélectionnés."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {["Date / Heure","Node","T (°C)","H (%)","CO2 (ppm)","V (mm/s)","Fumee (ppm)"].map((h,i) => (
                          <th key={h} className={cn("px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wider", i > 1 ? "text-right" : "text-left")}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sensorData.map((r: any, i: number) => (
                        <tr key={r.id ?? i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">{r.recorded_at ? new Date(r.recorded_at).toLocaleString("fr-FR") : "—"}</td>
                          <td className="px-4 py-2.5 font-medium">{r.node_name ?? <span className="text-muted-foreground text-[10px] font-mono">{String(r.node_id ?? "—").slice(-8)}</span>}</td>
                          <td className="px-4 py-2.5 text-right">{metricCell(r.temperature,18,27,15,30)}</td>
                          <td className="px-4 py-2.5 text-right">{metricCell(r.humidity,40,60,30,70)}</td>
                          <td className="px-4 py-2.5 text-right">{metricCell(r.pressure,450,900,350,1100)}</td>
                          <td className="px-4 py-2.5 text-right">{metricCell(r.vibration,0,1.2,0,1.5)}</td>
                          <td className="px-4 py-2.5 text-right">{metricCell(r.gas_level,0,90,0,130)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {sensorPag && sensorPag.pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">Page {sensorPag.page} / {sensorPag.pages} <span className="ml-2">({(sensorPag.total ?? 0).toLocaleString("fr-FR")} entrées)</span></span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={sensorPag.page <= 1} onClick={() => setSensorPage(p => p-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={sensorPag.page >= sensorPag.pages} onClick={() => setSensorPage(p => p+1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="font-medium">Codes couleur :</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-critical inline-block" /> Hors seuil alert</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-warning inline-block" /> Hors seuil warning</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-normal inline-block" /> Normal</span>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-4">
          <Card><CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recherche</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Acteur, action..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} className="h-8 text-xs pl-8" />
                </div>
              </div>
              <div className="space-y-1 min-w-[170px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</label>
                <Select value={auditAction} onValueChange={(v) => { setAuditAction(v); setAuditPage(1); }}>
                  <SelectTrigger className="h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Toutes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Toutes</SelectItem>
                    {Object.keys(AUDIT_ACTION_LABELS).map((k) => <SelectItem key={k} value={k}>{AUDIT_ACTION_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type cible</label>
                <Select value={auditTargetType} onValueChange={(v) => { setAuditTargetType(v); setAuditPage(1); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tous" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tous</SelectItem>
                    <SelectItem value="user">Utilisateur</SelectItem>
                    <SelectItem value="threshold">Seuil</SelectItem>
                    <SelectItem value="role_request">Élévation rôle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Du</label>
                <Input type="date" value={auditFrom} onChange={(e) => { setAuditFrom(e.target.value); setAuditPage(1); }} className="h-8 text-xs w-[140px]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Au</label>
                <Input type="date" value={auditTo} onChange={(e) => { setAuditTo(e.target.value); setAuditPage(1); }} className="h-8 text-xs w-[140px]" />
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs pb-0.5"
                onClick={() => { setAuditAction(ALL); setAuditTargetType(ALL); setAuditFrom(""); setAuditTo(""); setAuditPage(1); setAuditSearch(""); }}>
                <RefreshCw className="h-3 w-3" /> Réinitialiser
              </Button>
            </div>
          </CardContent></Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" /> Journal d'audit
                {auditPag && <span className="text-xs font-normal text-muted-foreground ml-1">— {(auditPag.total ?? 0).toLocaleString("fr-FR")} entrées</span>}
              </CardTitle>
              {auditQuery.isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent className="p-0">
              {auditQuery.isLoading ? (
                <div className="p-4 space-y-2">{[...Array(6)].map((_,i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : filteredAudit.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  <ClipboardList className="h-8 w-8 mx-auto mb-3 opacity-30" /> Aucune entrée d'audit trouvée.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {["Date / Heure","Acteur","Action","Type cible","Détails"].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAudit.map((entry: any, i: number) => {
                        const actor = entry.actorId;
                        const actorName = actor ? (`${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() || actor.email) : "Système";
                        const actionLabel = AUDIT_ACTION_LABELS[entry.action] ?? entry.action;
                        const isAuth = entry.action?.startsWith("auth.");
                        const isAlertAction = entry.action?.startsWith("alert.");
                        const isAdmin = entry.action?.includes("role") || entry.action?.includes("user.");
                        const isThreshold = entry.action?.startsWith("threshold.");
                        return (
                          <tr key={entry._id ?? i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">{entry.createdAt ? new Date(entry.createdAt).toLocaleString("fr-FR") : "—"}</td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{actorName}</div>
                              {actor?.email && actor.email !== actorName && <div className="text-[10px] text-muted-foreground">{actor.email}</div>}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={cn("text-[10px] font-mono",
                                isAuth && "text-blue-600 border-blue-200 bg-blue-50",
                                isAlertAction && "text-status-critical border-status-critical/30 bg-status-critical/5",
                                isAdmin && "text-status-warning border-status-warning/30 bg-status-warning/5",
                                isThreshold && "text-purple-600 border-purple-200 bg-purple-50",
                                !isAuth && !isAlertAction && !isAdmin && !isThreshold && "text-muted-foreground",
                              )}>{actionLabel}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground capitalize">{entry.targetType ?? "—"}</td>
                            <td className="px-4 py-2.5 text-muted-foreground max-w-[260px] truncate">
                              {entry.metadata
                                ? Object.entries(entry.metadata).map(([k,v]) => `${k}: ${v}`).join(" · ")
                                : entry.after
                                ? Object.entries(entry.after as Record<string,unknown>)
                                    .filter(([k]) => ["role","email","phone","metricName","warningMax","status"].includes(k))
                                    .map(([k,v]) => `${k}=${v}`).join(" · ")
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {auditPag && auditPag.pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">Page {auditPag.page} / {auditPag.pages} <span className="ml-2">({(auditPag.total ?? 0).toLocaleString("fr-FR")} entrées)</span></span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={auditPag.page <= 1} onClick={() => setAuditPage(p => p-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={auditPag.page >= auditPag.pages} onClick={() => setAuditPage(p => p+1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
