import { useState, useMemo } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle, Filter, Search, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAlerts, useAcknowledgeAlert, useResolveAlert, useRealtimeAlerts } from "@/hooks/useApiData";
import { useDatacenter } from "@/hooks/useDatacenter";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

const severityIcon = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
};

const statusLabel: Record<string, string> = {
  active: "Active",
  acknowledged: "Acquittée",
  resolved: "Résolue",
};

const severityLabel: Record<string, string> = {
  info: "Info",
  warning: "Avertissement",
  critical: "Critique",
};

const getSeverityColor = (s: string) => {
  if (s === "critical") return "text-status-critical";
  if (s === "warning") return "text-status-warning";
  return "text-muted-foreground";
};

const Alerts = () => {
  const { connectedDC } = useDatacenter();
  const { user } = useAuth();
  const { data: rawAlerts, isLoading } = useAlerts(connectedDC?.id);
  const acknowledgeAlert = useAcknowledgeAlert();
  const resolveAlert = useResolveAlert();
  useRealtimeAlerts();

  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "severity">("recent");

  const alerts = useMemo(() => {
    if (!rawAlerts) return [];
    return rawAlerts.map((a: any) => ({
      id: a.id,
      severity: a.severity,
      status: a.status,
      message: a.message ?? "",
      metric: a.metric_name,
      value: a.metric_value,
      threshold: a.threshold_exceeded ?? 0,
      timestamp: new Date(a.created_at).toLocaleString("fr-FR"),
      nodeId: a.node?.name ?? "—",
      zone: a.node?.zone?.name ?? "—",
      datacenter: a.node?.zone?.datacenters?.name ?? "—",
    }));
  }, [rawAlerts]);

  const filtered = alerts
    .filter((a) => severityFilter === "all" || a.severity === severityFilter)
    .filter((a) => statusFilter === "all" || a.status === statusFilter)
    .filter((a) => searchQuery === "" || a.message.toLowerCase().includes(searchQuery.toLowerCase()) || a.nodeId.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "severity") {
        const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
      }
      return 0;
    });

  const totalActive = alerts.filter((a) => a.status === "active").length;
  const criticalCount = alerts.filter((a) => a.severity === "critical" && a.status === "active").length;
  const warningCount = alerts.filter((a) => a.severity === "warning" && a.status === "active").length;

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Alertes</h1>
        <p className="text-sm text-muted-foreground">Gestion des alertes et notifications en temps réel</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex flex-col items-center"><span className="text-3xl font-bold text-foreground">{totalActive}</span><span className="text-xs text-muted-foreground">Alertes Actives</span></CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col items-center"><span className="text-3xl font-bold text-status-critical">{criticalCount}</span><span className="text-xs text-muted-foreground">Critiques</span></CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col items-center"><span className="text-3xl font-bold text-status-warning">{warningCount}</span><span className="text-xs text-muted-foreground">Avertissements</span></CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col items-center"><span className="text-3xl font-bold text-foreground">{alerts.length}</span><span className="text-xs text-muted-foreground">Total</span></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher alertes, nœuds..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px]"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="Sévérité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
                <SelectItem value="warning">Avertissement</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="active">Actives</SelectItem>
                <SelectItem value="acknowledged">Acquittées</SelectItem>
                <SelectItem value="resolved">Résolues</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setSortBy(sortBy === "recent" ? "severity" : "recent")}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              {sortBy === "recent" ? "Récent" : "Sévérité"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Aucune alerte ne correspond aux filtres sélectionnés.</CardContent></Card>
        )}
        {filtered.map((alert) => {
          const Icon = severityIcon[alert.severity as keyof typeof severityIcon] ?? Info;
          const rawAlert = rawAlerts?.find((a: any) => a.id === alert.id);
          return (
            <Card key={alert.id} className={cn("transition-all", alert.status === "active" && alert.severity === "critical" && "border-status-critical/40", alert.status === "active" && alert.severity === "warning" && "border-status-warning/40")}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", { "bg-muted": alert.severity === "info", "bg-status-warning/10": alert.severity === "warning", "bg-status-critical/10": alert.severity === "critical" })}>
                    <Icon className={cn("h-5 w-5", getSeverityColor(alert.severity))} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", { "border-status-critical text-status-critical": alert.severity === "critical", "border-status-warning text-status-warning": alert.severity === "warning", "border-muted-foreground text-muted-foreground": alert.severity === "info" })}>
                        {severityLabel[alert.severity] ?? alert.severity}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">{alert.message}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                      <span className="font-medium text-foreground">{alert.datacenter}</span><span>/</span><span>{alert.zone}</span><span>–</span><span className="font-mono">{alert.nodeId}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>Paramètre: <span className="font-medium text-foreground capitalize">{alert.metric}</span></span>
                      {alert.threshold > 0 && (<span>Valeur: <span className="font-medium text-foreground">{alert.value}</span> (Seuil: {alert.threshold})</span>)}
                      <span>{alert.timestamp}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Badge variant="outline" className={cn("text-xs capitalize", { "border-status-critical text-status-critical": alert.status === "active", "border-status-warning text-status-warning": alert.status === "acknowledged", "border-status-normal text-status-normal": alert.status === "resolved" })}>
                      {statusLabel[alert.status] ?? alert.status}
                    </Badge>
                    {alert.status === "active" && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => user && acknowledgeAlert.mutate({ alertId: alert.id })}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Acquitter
                      </Button>
                    )}
                    {alert.status === "acknowledged" && (
                      <Button size="sm" variant="outline" className="text-xs text-status-normal border-status-normal/30" onClick={() => resolveAlert.mutate(alert.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Résoudre
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Alerts;
