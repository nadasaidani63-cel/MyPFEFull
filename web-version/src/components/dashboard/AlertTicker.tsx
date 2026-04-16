import { AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/useApiData";
import { useDatacenter } from "@/hooks/useDatacenter";

export function AlertTicker() {
  const { connectedDC } = useDatacenter();
  const { data: alerts = [] } = useAlerts(connectedDC?.id ?? null);

  const active = alerts.filter((a: any) => a.status === "active");
  if (active.length === 0) return null;

  return (
    <div className="mb-6 min-w-0 rounded-lg border border-status-critical/20 bg-status-critical/10 p-3">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        <AlertCircle className="h-4 w-4 text-status-critical shrink-0 animate-pulse" />
        <div className="flex min-w-0 gap-6 overflow-x-auto scrollbar-none">
          {active.map((alert: any) => {
            const isAlert = alert.level === "alert" || alert.severity === "critical";
            const Icon = isAlert ? AlertCircle : AlertTriangle;
            const colorClass = isAlert ? "text-status-critical" : "text-status-warning";
            const timeStr = alert.created_at
              ? new Date(alert.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
              : "";
            return (
              <div key={alert.id} className="flex items-center gap-2 whitespace-nowrap">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", colorClass)} />
                <span className="text-sm text-foreground">{alert.message ?? `${alert.metric_name}: ${alert.metric_value}`}</span>
                {alert.node?.name && (
                  <span className="text-xs font-medium text-muted-foreground">— {alert.node.name}</span>
                )}
                <span className="text-xs text-muted-foreground">{timeStr}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
