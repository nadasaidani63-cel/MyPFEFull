import { useState } from "react";
import { Server, ArrowRight, Wifi, WifiOff, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/mock-data";
import { useDatacenter, DatacenterInfo } from "@/hooks/useDatacenter";
import { useNavigate } from "react-router-dom";
import { useDatacenters, useRealtimeNodes } from "@/hooks/useApiData";
import { Skeleton } from "@/components/ui/skeleton";
import { FacilityMap } from "@/components/dashboard/FacilityMap";
import { ConnectDatacenterOverlay } from "@/components/datacenter/ConnectDatacenterOverlay";

const loadColor = (load: number) =>
   load >= 80
  ? "bg-zinc-500"
  : load >= 60
  ? "bg-zinc-300"
  : "bg-red-400";


const DataCenters = () => {
  const { connectedDC, connecting, connectStep, connect, disconnect } = useDatacenter();
  const navigate = useNavigate();
  const { data: rawDatacenters, isLoading } = useDatacenters();
  useRealtimeNodes();

  const datacenters: (DatacenterInfo & { dbId: string })[] = (rawDatacenters ?? []).map((dc) => {
    const allNodes = dc.zones?.flatMap((z: any) => z.nodes ?? []) ?? [];
    const onlineNodes = allNodes.filter((n: any) => n.is_online).length;
    const totalNodes = allNodes.length;
    return {
      dbId: dc.id,
      id: dc.id,
      name: dc.name,
      location: dc.location ?? "",
      status: dc.status as "normal" | "warning" | "critical",
      nodes: totalNodes,
      currentLoad: totalNodes > 0 ? Math.round((onlineNodes / totalNodes) * 100) : 0,
    };
  });

  const handleConnect = async (dc: DatacenterInfo) => {
    await connect(dc);
    navigate("/overview");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {connecting && (
        <ConnectDatacenterOverlay
          open={true}
          hubName={datacenters.find((d) => d.id === connecting)?.name ?? "Hub"}
          stepIndex={connectStep}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{datacenters.length} datacenters disponibles</p>
          {connectedDC && (
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-status-normal animate-pulse" />
              <span className="text-xs font-medium text-status-normal">Connecté — {connectedDC.name}</span>
              <button onClick={() => disconnect()} className="text-xs text-muted-foreground underline hover:text-foreground ml-1">Déconnecter</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {datacenters.map((dc) => {
          const isConnected = connectedDC?.id === dc.id;
          const isConnecting = connecting === dc.id;
          return (
            <Card key={dc.id} className={cn("transition-all duration-300", isConnected && "ring-2 ring-status-normal shadow-lg shadow-status-normal/10")}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors", isConnected ? "bg-status-normal/20" : "bg-primary/10")}>
                    <Server className={cn("h-5 w-5", isConnected ? "text-status-normal" : "text-primary")} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">{dc.name}</h3>
                    <p className="text-xs text-muted-foreground">{dc.location}</p>
                  </div>
                  {isConnected ? (
                    <Badge variant="outline" className="text-[10px] uppercase border-status-normal text-status-normal">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Connecté
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={cn("text-[10px] uppercase", getStatusColor(dc.status))}>
                      {dc.status === "normal" ? "Normal" : dc.status === "warning" ? "Avert." : "Critique"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Nœuds</span>
                  <span className="font-semibold text-foreground">{dc.nodes}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Charge Actuelle</span>
                    <span className="font-medium text-foreground">{dc.currentLoad} %</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", loadColor(dc.currentLoad))} style={{ width: `${dc.currentLoad}%` }} />
                  </div>
                </div>
                {isConnected ? (
                  <Button variant="default" className="w-full text-xs bg-status-normal/20 text-status-normal border border-status-normal/40 hover:bg-status-normal/30" onClick={() => navigate("/overview")}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> ACCÉDER AU TABLEAU DE BORD
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full text-xs text-primary border-primary/30 hover:bg-primary/5"
                    // ✅ One connection at a time (enterprise-style). Both hubs are connectable.
                    disabled={!!connecting || !!connectedDC}
                    onClick={() => handleConnect(dc)}
                  >
                    {isConnecting ? (<><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Connexion…</>) : connectedDC ? (<><WifiOff className="h-3 w-3 mr-1" /> NON DISPONIBLE</>) : (<>CONNEXION AU HUB <ArrowRight className="h-3 w-3 ml-1" /></>)}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-foreground">Carte des Sites</h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-normal" /> NORMAL</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-warning" /> AVERT.</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-critical" /> CRITIQUE</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Distribution géospatiale des datacenters en Tunisie</p>
              <FacilityMap datacenters={datacenters} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground">Comparaison des Sites</h3>
            {datacenters.map((dc) => (
              <div key={dc.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{dc.name}</span>
                  <span className={cn("h-2.5 w-2.5 rounded-full", {
                    "bg-status-normal": dc.status === "normal",
                    "bg-status-warning": dc.status === "warning",
                    "bg-status-critical": dc.status === "critical",
                  })} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <div><p>Utilisation</p><p className="text-sm font-semibold text-foreground normal-case">{dc.currentLoad}%</p></div>
                  <div><p>Nœuds</p><p className="text-sm font-semibold text-foreground normal-case">{dc.nodes}</p></div>
                </div>
                <div className="h-0.5 w-full rounded-full" style={{
                  background: dc.status === "normal" ? "hsl(var(--status-normal))" : dc.status === "warning" ? "hsl(var(--status-warning))" : "hsl(var(--status-critical))",
                }} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataCenters;