import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

const routeNames: Record<string, string> = {
  "/": "Datacenters",
  "/datacenters": "Datacenters",
  "/surveillance": "Surveillance",
  "/overview": "Vue d'ensemble",
  "/alerts": "Alertes",
  "/ai": "Assistant IA",
  "/datacenter": "Informations",
  "/settings": "Paramètres",
  "/history": "Historique",
  "/thresholds": "Seuils d'alerte",
};

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const pageName = routeNames[location.pathname] ?? "Dashboard";
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.trim() ||
    user.email?.[0]?.toUpperCase() ||
    "U";
  const timeStr = currentTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });
  const dateStr = currentTime.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full min-w-0 overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex min-w-0 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="h-5 w-px bg-border" />
              <div>
                <h2 className="text-lg font-bold text-foreground leading-tight">{pageName}</h2>
                <p className="text-[10px] text-muted-foreground">
                  Sentinel / <span className="text-primary">{pageName}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-mono font-semibold text-foreground">{timeStr} UTC</p>
                <p className="text-[10px] text-muted-foreground">{dateStr}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-xs">
                    {initials.toUpperCase()}
                  </span>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-hidden p-4 flex min-h-0 min-w-0 flex-col">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
