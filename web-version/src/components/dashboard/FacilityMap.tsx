import { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
// Import markercluster extension for Leaflet
import "leaflet.markercluster";

const LOCATION_COORDS: Record<string, [number, number]> = {
    "béja": [36.7256, 9.1817],
    "beja": [36.7256, 9.1817],
    "sfax": [34.7406, 10.7603],
    "tunis": [36.8065, 10.1815],
    "charguia": [36.8365, 10.1640],
    "sousse": [35.8256, 10.6369],
    "monastir": [35.7643, 10.8113],
    "gabès": [33.8815, 10.0982],
    "gabes": [33.8815, 10.0982],
    "bizerte": [37.2744, 9.8739],
    "kairouan": [35.6781, 10.0963],
};

function resolveCoords(location: string): [number, number] {
    const loc = location.toLowerCase();
    for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
        if (loc.includes(key)) return coords;
    }
    return [34.0, 9.0];
}

const statusColor = (status: string) => {
    switch (status) {
        case "normal": return "#22c55e";
        case "warning": return "#f59e0b";
        case "alert":
        case "critical": return "#ef4444";
        default: return "#6b7280";
    }
};

// Create custom icon for each status
const createStatusIcon = (status: string) => {
    const color = statusColor(status);
    const bgColor = status === "normal" ? "bg-status-normal" : status === "warning" ? "bg-status-warning" : "bg-status-critical";

    return L.divIcon({
        html: `
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background-color: ${color};
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        font-size: 16px;
      ">
        ${(status === "critical" || status === "alert") ? "✕" : status === "warning" ? "!" : "✓"}
      </div>
    `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
        className: "custom-status-icon",
    });
};

interface DatacenterMarker {
    id: string;
    name: string;
    location: string;
    status: "normal" | "warning" | "critical";
    nodes: number;
    currentLoad: number;
}

interface FacilityMapProps {
    datacenters: DatacenterMarker[];
}

export function FacilityMap({ datacenters }: FacilityMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const clusterGroupRef = useRef<any>(null);

    const markers = useMemo(
        () => datacenters.map((dc) => ({ ...dc, coords: resolveCoords(dc.location) })),
        [datacenters]
    );

    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;

        try {
            const map = L.map(mapRef.current, {
                center: [35.5, 9.8],
                zoom: 6,
                scrollWheelZoom: true,
            });

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);

            mapInstanceRef.current = map;

            return () => {
                map.remove();
                mapInstanceRef.current = null;
            };
        } catch (err) {
            console.error("Error initializing map:", err);
        }
    }, []);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        try {
            // Remove previous cluster group
            if (clusterGroupRef.current) {
                map.removeLayer(clusterGroupRef.current);
            }

            // Create cluster group using markercluster plugin
            const markerClusterGroup = (L as any).markerClusterGroup?.({
                chunkedLoading: true,
                maxClusterRadius: 50,
            }) || L.featureGroup();

            markers.forEach((dc) => {
                const color = statusColor(dc.status);
                const statusLabel = dc.status === "normal" ? "Normal" : dc.status === "warning" ? "Avert." : "Critique";
                const icon = createStatusIcon(dc.status);

                const marker = L.marker(dc.coords, { icon })
                    .bindPopup(
                        `<div style="min-width:160px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <strong style="font-size:13px">${dc.name}</strong>
              <span style="font-size:10px;text-transform:uppercase;color:${color};border:1px solid ${color};border-radius:4px;padding:1px 6px">${statusLabel}</span>
            </div>
            <p style="font-size:11px;color:#888;margin:4px 0">${dc.location}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;text-align:center;margin-top:8px">
              <div><div style="color:#888">Nœuds</div><strong>${dc.nodes}</strong></div>
              <div><div style="color:#888">Charge</div><strong>${dc.currentLoad}%</strong></div>
            </div>
          </div>`
                    );

                markerClusterGroup.addLayer(marker);
            });

            map.addLayer(markerClusterGroup);
            clusterGroupRef.current = markerClusterGroup;
        } catch (err) {
            console.error("Error updating markers:", err);
        }
    }, [markers]);

    return (
        <div
            ref={mapRef}
            className="h-[320px] rounded-lg overflow-hidden border border-border"
            style={{ zIndex: 0 }}
        />
    );
}