import { useEffect, useRef } from "react";
import { socket } from "@/services/socket";
import type { AlertEvent, ReadingEvent, StatusEvent } from "@/types/realtime";

export function useJoinDatacenter(datacenterId?: string) {
  const prev = useRef<string | undefined>(undefined);

  useEffect(() => {
    // leave previous room
    if (prev.current && prev.current !== datacenterId) {
      socket.emit("leave-datacenter", prev.current);
    }

    // join new room
    if (datacenterId) {
      socket.emit("join-datacenter", datacenterId);
    }

    prev.current = datacenterId;

    // on unmount: leave last joined room
    return () => {
      if (prev.current) socket.emit("leave-datacenter", prev.current);
    };
  }, [datacenterId]);
}

export function useRealtimeReadings(onReading: (payload: ReadingEvent) => void) {
  useEffect(() => {
    socket.on("reading:new", onReading);
    return () => {
      socket.off("reading:new", onReading);
    };
  }, [onReading]);
}

export function useRealtimeAlerts(onAlert: (payload: AlertEvent) => void) {
  useEffect(() => {
    socket.on("alert:event", onAlert);
    return () => {
      socket.off("alert:event", onAlert);
    };
  }, [onAlert]);
}


export function useRealtimeStatus(onStatus: (payload: StatusEvent) => void) {
  useEffect(() => {
    socket.on("status:update", onStatus);
    return () => {
      socket.off("status:update", onStatus);
    };
  }, [onStatus]);
}
