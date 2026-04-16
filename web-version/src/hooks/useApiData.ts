import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { socket } from "@/services/socket";
import { useDatacenter } from "@/hooks/useDatacenter";
import type { ReadingEvent, AlertEvent, StatusEvent } from "@/types/realtime";

type BackendDatacenter = any;
type BackendZone = any;
type BackendNode = any;
type BackendAlert = any;
type BackendThreshold = any;
type BackendUser = any;
type BackendRoleRequest = any;
type BackendAuditLog = any;

export function useDatacenters() {
  return useQuery({
    queryKey: ["datacenters"],
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: BackendDatacenter[] }>("/datacenters");
      return (res.data || []).map((dc) => ({
        id: dc._id,
        name: dc.name,
        location: dc.location,
        status: dc.status,
        zones: (dc.zones || []).map((z: BackendZone) => ({
          id: z._id,
          name: z.name,
          status: z.status,
          nodes: (z.nodes || []).map((n: BackendNode) => ({ id: n._id, is_online: !!n.isOnline })),
        })),
      }));
    },
  });
}

export function useZones(datacenterId: string | null) {
  return useQuery({
    queryKey: ["zones", datacenterId],
    enabled: !!datacenterId,
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: BackendZone[] }>(
        `/zones?datacenterId=${encodeURIComponent(datacenterId!)}`
      );
      return (res.data || []).map((z) => ({
        id: z._id,
        name: z.name,
        description: z.description,
        status: z.status,
        part: z.part,
        room: z.room,
        room_part: z.roomPart,
        display_order: z.displayOrder,
        datacenter_id: typeof z.datacenterId === "string" ? z.datacenterId : z.datacenterId?._id,
        nodes: (z.nodes || []).map((n: BackendNode) => ({
          id: n._id,
          name: n.name,
          is_online: !!n.isOnline,
          status: n.status,
          last_ping: n.lastPing,
          mac_address: n.macAddress,
          firmware_version: n.firmwareVersion,
        })),
      }));
    },
  });
}

export function useNodes(datacenterId: string | null) {
  return useQuery({
    queryKey: ["nodes", datacenterId],
    enabled: !!datacenterId,
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: BackendNode[] }>(
        `/nodes?datacenterId=${encodeURIComponent(datacenterId!)}`
      );

      return (res.data || []).map((n) => ({
        id: n._id,
        name: n.name,
        is_online: !!n.isOnline,
        isOnline: !!n.isOnline,
        status: n.status,
        last_ping: n.lastPing,
        mac_address: n.macAddress,
        firmware_version: n.firmwareVersion,
        zone: n.zoneId
          ? {
              id: n.zoneId._id,
              name: n.zoneId.name,
              datacenter_id:
                typeof n.zoneId.datacenterId === "string"
                  ? n.zoneId.datacenterId
                  : n.zoneId.datacenterId?._id,
            }
          : null,
      }));
    },
  });
}

export function useLatestReadings(datacenterId: string | null) {
  return useQuery({
    queryKey: ["latest-readings", datacenterId],
    enabled: !!datacenterId,
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: any[] }>(
        `/sensors/latest?datacenterId=${encodeURIComponent(datacenterId!)}`
      );
      return (res.data || []).map((r) => ({
        id: r._id,
        node_id: r.nodeId,
        temperature: r.temperature,
        humidity: r.humidity,
        gas_level: r.gasLevel,
        pressure: r.pressure,
        vibration: r.vibration,
        recorded_at: r.recordedAt,
      }));
    },
  });
}

export function useSensorHistory(datacenterId: string | null, options?: { from?: string; to?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["sensor-history", datacenterId, options],
    enabled: !!datacenterId,
    queryFn: async () => {
      const params = new URLSearchParams({ datacenterId: datacenterId! });
      if (options?.from) params.set("from", options.from);
      if (options?.to) params.set("to", options.to);
      if (options?.page) params.set("page", String(options.page));
      if (options?.limit) params.set("limit", String(options.limit));
      if (!options?.from && !options?.to) {
        params.set("hours", "6");
        params.set("limit", String(options?.limit || 5000));
      }
      const res = await apiFetch<{ success: boolean; data: any[]; pagination?: any }>(`/sensors/history?${params.toString()}`);
      return {
        data: (res.data || []).map((r) => ({
          id: r._id,
          node_id: r.nodeId?._id ?? r.nodeId,
          temperature: r.temperature,
          humidity: r.humidity,
          gas_level: r.gasLevel,
          pressure: r.pressure,
          vibration: r.vibration,
          recorded_at: r.recordedAt,
        })),
        pagination: res.pagination,
      };
    },
  });
}

export function useAlerts(datacenterId?: string | null) {
  return useQuery({
    queryKey: ["alerts", datacenterId],
    queryFn: async () => {
      const qs = datacenterId ? `?datacenterId=${encodeURIComponent(datacenterId)}&limit=200` : "?limit=200";
      const res = await apiFetch<{ success: boolean; data: BackendAlert[] }>(`/alerts${qs}`);
      return (res.data || []).map((a) => ({
        id: a._id,
        node_id: a.nodeId?._id ?? a.nodeId,
        zone_id: a.zoneId?._id ?? a.zoneId,
        datacenter_id: a.datacenterId?._id ?? a.datacenterId,
        metric_name: a.metricName,
        metric_value: a.metricValue,
        threshold_exceeded: a.thresholdExceeded,
        triggered_metrics: a.triggeredMetrics || [],
        message: a.message,
        severity: a.severity === "alert" ? "critical" : a.severity,
        level: a.level,
        status: a.status,
        created_at: a.createdAt,
        acknowledged_at: a.acknowledgedAt,
        resolved_at: a.resolvedAt,
        node: a.nodeId ? { name: a.nodeId.name, zone: a.zoneId ? { name: a.zoneId.name } : null } : null,
      }));
    },
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ alertId }: { alertId: string }) => {
      await apiFetch(`/alerts/${alertId}/acknowledge`, { method: "PATCH" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      await apiFetch(`/alerts/${alertId}/resolve`, { method: "PATCH" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useAlertThresholds(scopeType?: string, scopeId?: string) {
  return useQuery({
    queryKey: ["thresholds", scopeType, scopeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (scopeType) params.set("scopeType", scopeType);
      if (scopeId) params.set("scopeId", scopeId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await apiFetch<{ success: boolean; data: BackendThreshold[]; defaults: Record<string, any> }>(`/thresholds${qs}`);
      return {
        items: (res.data || []).map((t) => ({
          id: t._id,
          scope_type: t.scopeType,
          scope_id: t.scopeId,
          metric_name: t.metricName,
          warning_min: t.warningMin,
          warning_max: t.warningMax,
          alert_min: t.alertMin,
          alert_max: t.alertMax,
          enabled: t.enabled,
        })),
        defaults: res.defaults,
      };
    },
  });
}

export function useBulkUpsertThresholds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: any[]) => {
      return apiFetch(`/thresholds/bulk`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thresholds"] }),
  });
}

function upsertById<T extends { id: string }>(arr: T[], item: T): T[] {
  const idx = arr.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...arr];
  const copy = arr.slice();
  copy[idx] = { ...copy[idx], ...item };
  return copy;
}


export function useAiInsights(datacenterId: string | null) {
  return useQuery({
    queryKey: ["ai-insights", datacenterId],
    enabled: !!datacenterId,
    refetchInterval: 20000,
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: any }>(`/sensors/ai-insights?datacenterId=${encodeURIComponent(datacenterId!)}&hours=6&points=18`);
      return res.data || {};
    },
  });
}

export function useRealtimeSensorReadings() {
  const qc = useQueryClient();
  const { connectedDC } = useDatacenter();
  const dcId = connectedDC?.id ?? null;

  useEffect(() => {
    if (!dcId) return;

    const onReading = (payload: ReadingEvent) => {
      if (payload.datacenterId !== dcId) return;

      qc.setQueryData<any[]>(["latest-readings", dcId], (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const item = {
          id: `${payload.nodeId}:${new Date(payload.recordedAt).toISOString()}`,
          node_id: payload.nodeId,
          temperature: payload.values.temperature,
          humidity: payload.values.humidity,
          gas_level: payload.values.gasLevel,
          pressure: payload.values.pressure,
          vibration: payload.values.vibration,
          recorded_at: payload.recordedAt,
        };
        const filtered = list.filter((r: any) => r.node_id !== payload.nodeId);
        return [item, ...filtered];
      });

      qc.setQueryData<any>(["sensor-history", dcId, undefined], (prev) => {
        const list = Array.isArray(prev?.data) ? prev.data : [];
        const item = {
          id: `${payload.nodeId}:${new Date(payload.recordedAt).toISOString()}`,
          node_id: payload.nodeId,
          temperature: payload.values.temperature,
          humidity: payload.values.humidity,
          gas_level: payload.values.gasLevel,
          pressure: payload.values.pressure,
          vibration: payload.values.vibration,
          recorded_at: payload.recordedAt,
        };
        const next = [...list, item];
        return { ...(prev || {}), data: next.length > 5000 ? next.slice(next.length - 5000) : next };
      });
    };

    socket.on("reading:new", onReading);
    return () => {
      socket.off("reading:new", onReading);
    };
  }, [qc, dcId]);
}

export function useRealtimeAlerts() {
  const qc = useQueryClient();
  const { connectedDC } = useDatacenter();
  const dcId = connectedDC?.id ?? null;

  useEffect(() => {
    if (!dcId) return;

    const normalizeAlert = (a: any) => ({
      id: a._id,
      node_id: a.nodeId?._id ?? a.nodeId,
      zone_id: a.zoneId?._id ?? a.zoneId,
      datacenter_id: a.datacenterId?._id ?? a.datacenterId,
      metric_name: a.metricName,
      metric_value: a.metricValue,
      threshold_exceeded: a.thresholdExceeded,
      triggered_metrics: a.triggeredMetrics || [],
      message: a.message,
      severity: a.severity === "alert" ? "critical" : a.severity,
      level: a.level,
      status: a.status,
      created_at: a.createdAt,
      acknowledged_at: a.acknowledgedAt,
      resolved_at: a.resolvedAt,
      node: a.nodeId ? { name: a.nodeId.name, zone: a.zoneId ? { name: a.zoneId.name } : null } : null,
    });

    const onAlert = (payload: AlertEvent) => {
      const a = payload?.alert;
      if (!a) return;
      const alert = normalizeAlert(a);

      qc.setQueryData<any[]>(["alerts", dcId], (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const next = upsertById(list, alert);
        return next.sort((x: any, y: any) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()).slice(0, 200);
      });
    };

    const onStatus = (payload: StatusEvent) => {
      if (!payload?.datacenter?.id || payload.datacenter.id !== dcId) return;

      qc.setQueryData<any[]>(["nodes", dcId], (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((n: any) => (n.id === payload.node.id ? { ...n, status: payload.node.status } : n));
      });

      qc.setQueryData<any[]>(["zones", dcId], (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((z: any) => (z.id === payload.zone.id ? { ...z, status: payload.zone.status } : z));
      });

      qc.setQueryData<any[]>(["datacenters"], (prev: any) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((dc: any) => (dc.id === payload.datacenter.id ? { ...dc, status: payload.datacenter.status } : dc));
      });
    };

    socket.on("alert:event", onAlert);
    socket.on("status:update", onStatus);
    return () => {
      socket.off("alert:event", onAlert);
      socket.off("status:update", onStatus);
    };
  }, [qc, dcId]);
}

export function useRealtimeNodes() {}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: BackendUser[] }>("/users");
      return (res.data || []).map((u) => ({
        id: u._id,
        user_id: u._id,
        email: u.email,
        phone: u.phone,
        role: u.role,
        profile: {
          full_name: u.fullName,
          first_name: u.firstName,
          last_name: u.lastName,
          created_at: u.createdAt,
        },
      }));
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiFetch(`/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: BackendUser }>("/profile/me");
      return res.data;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await apiFetch<{ success: boolean; data: BackendUser }>("/profile/me", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", "me"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useRoleRequests() {
  return useQuery({
    queryKey: ["role-requests"],
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: BackendRoleRequest[] }>("/role-requests");
      return res.data || [];
    },
  });
}

export function useCreateRoleRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      return apiFetch("/role-requests", { method: "POST", body: JSON.stringify({ reason }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-requests"] }),
  });
}

export function useReviewRoleRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, decisionNote }: { id: string; decision: "approve" | "reject"; decisionNote?: string }) => {
      return apiFetch(`/role-requests/${id}/${decision}`, {
        method: "PATCH",
        body: JSON.stringify({ decisionNote }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-requests"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useAuditLogs(filters?: { action?: string; targetType?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.action) params.set("action", filters.action);
      if (filters?.targetType) params.set("targetType", filters.targetType);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("limit", String(filters.limit));
      const res = await apiFetch<{ success: boolean; data: BackendAuditLog[]; pagination: any }>(`/audit-logs?${params.toString()}`);
      return res;
    },
  });
}

export function useZoneNodesLatest(zoneId?: string) {
  return useQuery({
    queryKey: ["zone-nodes-latest", zoneId],
    enabled: !!zoneId,
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data: any }>(`/zones/${zoneId}/nodes/latest`);
      return res.data;
    },
  });
}

// ── History page: supports dc / zone / node + date range + page ──────────────
export function useSensorHistoryFiltered(filters: {
  datacenterId?: string | null;
  zoneId?: string | null;
  nodeId?: string | null;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { datacenterId, zoneId, nodeId, from, to, page = 1, limit = 100 } = filters;
  return useQuery({
    queryKey: ["sensor-history-filtered", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (datacenterId) params.set("datacenterId", datacenterId);
      if (zoneId) params.set("zoneId", zoneId);
      if (nodeId) params.set("nodeId", nodeId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (!from && !to) params.set("hours", "24");
      const res = await apiFetch<{ success: boolean; data: any[]; pagination: any }>(
        `/sensors/history?${params.toString()}`
      );
      return {
        data: (res.data || []).map((r) => ({
          id: r._id,
          node_id: r.nodeId?._id ?? r.nodeId,
          node_name: r.nodeId?.name ?? null,
          temperature: r.temperature,
          humidity: r.humidity,
          gas_level: r.gasLevel,
          pressure: r.pressure,
          vibration: r.vibration,
          recorded_at: r.recordedAt,
        })),
        pagination: res.pagination ?? { page: 1, pages: 1, total: 0, limit },
      };
    },
  });
}

// ── Audit logs with date range support ───────────────────────────────────────
export function useAuditLogsFiltered(filters: {
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["audit-logs-filtered", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.action) params.set("action", filters.action);
      if (filters.targetType) params.set("targetType", filters.targetType);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      params.set("page", String(filters.page ?? 1));
      params.set("limit", String(filters.limit ?? 50));
      const res = await apiFetch<{ success: boolean; data: any[]; pagination: any }>(
        `/audit-logs?${params.toString()}`
      );
      return {
        data: res.data || [],
        pagination: res.pagination ?? { page: 1, pages: 1, total: 0 },
      };
    },
  });
}
