import { Activity, Cpu, MapPin, Server, Wifi } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDatacenter } from "@/hooks/useDatacenter";
import { useNodes, useZones } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";

function groupRooms(zones: any[]) {
  const grouped = new Map<
    string,
    { part: string; room: string; nodeCount: number; zoneCount: number; roomParts: string[]; status: string; sortOrder: number }
  >();

  zones.forEach((zone: any) => {
    const part = zone.part || "Salles";
    const room = zone.room || zone.name;
    const key = `${part}::${room}`;
    const current = grouped.get(key);
    const status = zone.status === "alert" ? "critical" : zone.status || "normal";
    const nodeCount = Array.isArray(zone.nodes) ? zone.nodes.length : 0;

    if (!current) {
      grouped.set(key, {
        part,
        room,
        nodeCount,
        zoneCount: 1,
        roomParts: zone.room_part ? [zone.room_part] : [],
        status,
        sortOrder: Number(zone.display_order ?? Number.MAX_SAFE_INTEGER),
      });
      return;
    }

    current.nodeCount += nodeCount;
    current.zoneCount += 1;
    current.sortOrder = Math.min(current.sortOrder, Number(zone.display_order ?? Number.MAX_SAFE_INTEGER));
    if (zone.room_part && !current.roomParts.includes(zone.room_part)) {
      current.roomParts.push(zone.room_part);
    }
    if (status === "critical" || current.status === "critical") {
      current.status = "critical";
    } else if (status === "warning" || current.status === "warning") {
      current.status = "warning";
    }
  });

  return [...grouped.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.room.localeCompare(b.room));
}

export default function DatacenterInfo() {
  const { connectedDC } = useDatacenter();
  const dcId = connectedDC?.id ?? null;
  const { data: zones = [], isLoading: loadingZones } = useZones(dcId);
  const { data: nodes = [], isLoading: loadingNodes } = useNodes(dcId);

  if (loadingZones || loadingNodes) {
    return <div className="space-y-4">{[1, 2, 3].map((index) => <Skeleton key={index} className="h-32 rounded-[28px]" />)}</div>;
  }

  const rooms = groupRooms(zones);
  const palette = ["bg-rose-100 text-rose-500", "bg-sky-100 text-sky-500", "bg-violet-100 text-violet-500", "bg-emerald-100 text-emerald-500", "bg-cyan-100 text-cyan-500", "bg-amber-100 text-amber-500"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Informations</h1>
        <p className="text-sm text-muted-foreground">Organisation du datacenter, des salles et des noeuds connectes.</p>
      </div>

      {connectedDC && (
        <Card className="rounded-[28px] border-border">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary/10 text-primary">
                <Server className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-semibold text-foreground">{connectedDC.name}</h2>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {connectedDC.location}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {zones.length} zones
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  {rooms.length} salles
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  {nodes.length} noeuds
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-[28px] border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Salles du datacenter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room, index) => (
            <div
              key={`${room.part}-${room.room}`}
              className={cn(
                "rounded-3xl border p-4",
                room.status === "critical" && "border-status-critical/20 bg-status-critical/5",
                room.status === "warning" && "border-status-warning/20 bg-status-warning/5",
                room.status === "normal" && "border-border bg-muted/20",
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("flex h-14 w-14 items-center justify-center rounded-3xl", palette[index % palette.length])}>
                  <span className="h-4 w-4 rounded-md bg-current" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{room.room}</p>
                  <p className="text-sm text-muted-foreground">{room.part}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {room.nodeCount} noeuds · {room.zoneCount} zones{room.roomParts.length ? ` · ${room.roomParts.join(" / ")}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Visualisation des donnees des noeuds</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Noeud</TableHead>
                <TableHead>Salle</TableHead>
                <TableHead>Etat</TableHead>
                <TableHead>Dernier ping</TableHead>
                <TableHead>Firmware</TableHead>
                <TableHead>MAC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node: any) => {
                const room = zones.find((zone: any) => zone.id === node.zone?.id)?.room || node.zone?.name || "—";
                return (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium">{node.name}</TableCell>
                    <TableCell>{room}</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
                        <Wifi className="h-3.5 w-3.5" />
                        {node.is_online ? "En ligne" : "Hors ligne"}
                      </div>
                    </TableCell>
                    <TableCell>{node.last_ping ? new Date(node.last_ping).toLocaleString("fr-FR") : "—"}</TableCell>
                    <TableCell>{node.firmware_version ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{node.mac_address ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
