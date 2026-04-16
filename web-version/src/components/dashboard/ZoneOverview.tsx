import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStatusColor } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { MapPin, Thermometer, Droplets, Cpu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDatacenter } from "@/hooks/useDatacenter";
import { useZones } from "@/hooks/useApiData";

export function ZoneOverview() {
  const navigate = useNavigate();
  const { connectedDC } = useDatacenter();
  const { data: zones } = useZones(connectedDC?.id ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zones du Datacenter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(zones ?? []).map((zone: any) => (
          <div
            key={zone.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
            onClick={() => navigate(`/zones/${zone.id}`)}
          >
            <div className="flex items-center gap-3">
              <div className={cn("h-2 w-2 rounded-full", {
                "bg-status-normal": zone.status === "normal",
                "bg-status-warning": zone.status === "warning",
                "bg-status-critical": zone.status === "critical",
              })} />
              <div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{zone.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> {zone.nodes?.length ?? 0} nœuds
                  </span>
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn("capitalize text-xs", getStatusColor(zone.status))}
            >
              {zone.status === "normal" ? "Normal" : zone.status === "warning" ? "Attention" : "Critique"}
            </Badge>
          </div>
        ))}
        {(!zones || zones.length === 0) && (
          <p className="text-xs text-muted-foreground text-center py-4">Aucune zone disponible</p>
        )}
      </CardContent>
    </Card>
  );
}
