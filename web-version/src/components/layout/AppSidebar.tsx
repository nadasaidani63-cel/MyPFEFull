import { useMemo } from "react";
import {
  Bell,
  Brain,
  Eye,
  Globe,
  History,
  Info,
  LogOut,
  Activity,
  Settings,
  SlidersHorizontal,
  Unplug,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useDatacenter } from "@/hooks/useDatacenter";
import { useZones } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";

const mainNav = [
  { title: "Datacenters", url: "/datacenters", icon: Globe, gated: false },
  { title: "Vue d'ensemble", url: "/overview", icon: Eye, gated: true },
  { title: "Surveillance", url: "/surveillance", icon: Activity, gated: true },
  { title: "Alertes", url: "/alerts", icon: Bell, gated: true },
  { title: "Historique", url: "/history", icon: History, gated: true },
  { title: "Seuils", url: "/thresholds", icon: SlidersHorizontal, gated: false },
  { title: "Assistant IA", url: "/ai", icon: Brain, gated: true },
  { title: "Informations", url: "/datacenter", icon: Info, gated: true },
  { title: "Parametres", url: "/settings", icon: Settings, gated: false },
];

const adminNav = [{ title: "Utilisateurs", url: "/admin/users", icon: Users }];

const roomAccentPalette = [
  {
    square: "bg-rose-100 text-rose-500 border-rose-200",
    text: "text-rose-500",
  },
  {
    square: "bg-sky-100 text-sky-500 border-sky-200",
    text: "text-sky-500",
  },
  {
    square: "bg-violet-100 text-violet-500 border-violet-200",
    text: "text-violet-500",
  },
  {
    square: "bg-emerald-100 text-emerald-500 border-emerald-200",
    text: "text-emerald-500",
  },
  {
    square: "bg-cyan-100 text-cyan-500 border-cyan-200",
    text: "text-cyan-500",
  },
  {
    square: "bg-amber-100 text-amber-500 border-amber-200",
    text: "text-amber-500",
  },
];

function roomStatusTone(status: string) {
  if (status === "critical" || status === "alert") {
    return "border-status-critical/20 bg-status-critical/5";
  }
  if (status === "warning") {
    return "border-status-warning/25 bg-status-warning/5";
  }
  return "border-border bg-muted/30";
}

function groupRooms(zones: any[]) {
  const grouped = new Map<
    string,
    {
      key: string;
      part: string;
      room: string;
      sortOrder: number;
      firstZoneId: string;
      zoneCount: number;
      nodeCount: number;
      status: string;
      roomParts: string[];
    }
  >();

  zones.forEach((zone: any) => {
    const part = zone.part || "Salles";
    const room = zone.room || zone.name;
    const key = `${part}::${room}`;
    const current = grouped.get(key);
    const zoneStatus = zone.status === "alert" ? "critical" : zone.status || "normal";
    const roomPart = zone.room_part ? [zone.room_part] : [];
    const nodeCount = Array.isArray(zone.nodes) ? zone.nodes.length : 0;

    if (!current) {
      grouped.set(key, {
        key,
        part,
        room,
        sortOrder: Number(zone.display_order ?? Number.MAX_SAFE_INTEGER),
        firstZoneId: zone.id,
        zoneCount: 1,
        nodeCount,
        status: zoneStatus,
        roomParts: roomPart,
      });
      return;
    }

    current.zoneCount += 1;
    current.nodeCount += nodeCount;
    current.sortOrder = Math.min(current.sortOrder, Number(zone.display_order ?? Number.MAX_SAFE_INTEGER));
    if (zoneStatus === "critical" || current.status === "critical") {
      current.status = "critical";
    } else if (zoneStatus === "warning" || current.status === "warning") {
      current.status = "warning";
    }
    if (zone.room_part && !current.roomParts.includes(zone.room_part)) {
      current.roomParts.push(zone.room_part);
    }
  });

  const rooms = [...grouped.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.room.localeCompare(b.room));
  const parts = new Map<string, typeof rooms>();

  rooms.forEach((room) => {
    const bucket = parts.get(room.part) ?? [];
    bucket.push(room);
    parts.set(room.part, bucket);
  });

  return [...parts.entries()].map(([part, items]) => ({ part, rooms: items }));
}

export function AppSidebar() {
  const { user, role, signOut } = useAuth();
  const { connectedDC, disconnect } = useDatacenter();
  const { data: zones = [] } = useZones(connectedDC?.id ?? null);
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const isAdmin = role === "admin";

  const roomSections = useMemo(() => groupRooms(zones), [zones]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden bg-white">
            <img src="/ooredoo-icon.jpeg" alt="Ooredoo" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-primary">ooredoo</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Sentinel IoT</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-4">
        {connectedDC && !collapsed && (
          <div className="mx-3 mt-3 rounded-2xl border border-status-normal/20 bg-status-normal/5 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-status-normal">
                <Wifi className="h-3 w-3" />
                Connecte
              </div>
              <button onClick={disconnect} className="text-muted-foreground transition-colors hover:text-foreground">
                <Unplug className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">{connectedDC.name}</p>
          </div>
        )}

        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => {
                const disabled = item.gated && !connectedDC;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      {disabled ? (
                        <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground/40">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          <WifiOff className="ml-auto h-3 w-3" />
                        </span>
                      ) : (
                        <NavLink
                          to={item.url}
                          end={item.url === "/datacenters" || item.url === "/"}
                          className="hover:bg-sidebar-accent"
                          activeClassName="bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && (
          <SidebarGroup className="pt-0">
            <SidebarGroupLabel>Infrastructure</SidebarGroupLabel>
            <SidebarGroupContent className="space-y-3 px-2">
              <NavLink
                to="/datacenter"
                className="block rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-muted/40"
                activeClassName="block rounded-2xl border border-primary/25 bg-primary/5 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{connectedDC?.name ?? "Datacenter"}</p>
                    <p className="text-xs text-muted-foreground">
                      {connectedDC ? `${zones.length} zones actives` : "Connecte un hub pour afficher les salles"}
                    </p>
                  </div>
                  {connectedDC && (
                    <Badge variant="outline" className="border-status-normal/30 text-[10px] text-status-normal">
                      OK
                    </Badge>
                  )}
                </div>
              </NavLink>

              {!connectedDC ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                  Les salles apparaitront ici des qu'un datacenter sera connecte.
                </div>
              ) : roomSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                  Aucune salle detectee pour ce datacenter.
                </div>
              ) : (
                <div className="space-y-4">
                  {roomSections.map((section) => (
                    <div key={section.part} className="space-y-2">
                      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        {section.part}
                      </p>
                      <div className="space-y-2">
                        {section.rooms.map((room, index) => {
                          const accent = roomAccentPalette[index % roomAccentPalette.length];
                          return (
                            <NavLink
                              key={room.key}
                              to={`/zones/${room.firstZoneId}`}
                              className={cn(
                                "block rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm",
                                roomStatusTone(room.status),
                              )}
                              activeClassName={cn(
                                "block rounded-2xl border p-3 shadow-sm ring-1 ring-primary/25",
                                roomStatusTone(room.status),
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border", accent.square)}>
                                  <span className="h-3 w-3 rounded-md bg-current" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={cn("truncate text-sm font-semibold", accent.text)}>{room.room}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {room.nodeCount} noeuds
                                    {room.roomParts.length > 0 ? ` · ${room.roomParts.join(" / ")}` : ""}
                                  </p>
                                </div>
                                <Badge variant="outline" className="rounded-xl bg-card px-2.5 text-[11px] font-semibold">
                                  {room.zoneCount}
                                </Badge>
                              </div>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup className="pt-0">
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground">{user?.email}</p>
                <p className="text-[10px] capitalize text-muted-foreground">{role === "admin" ? "admin" : "utilisateur"}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={signOut}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
