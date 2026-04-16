import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PREVIEW_URL || "http://127.0.0.1:4173";
const outputDir = path.resolve(process.cwd(), "preview-captures");

fs.mkdirSync(outputDir, { recursive: true });

const defaultThresholds = {
  temperature: { warningMin: 18, warningMax: 27, alertMin: 14, alertMax: 32 },
  humidity: { warningMin: 35, warningMax: 65, alertMin: 25, alertMax: 75 },
  pressure: { warningMin: 450, warningMax: 900, alertMin: 350, alertMax: 1100 },
  vibration: { warningMin: 0, warningMax: 4.5, alertMin: 0, alertMax: 6 },
  gasLevel: { warningMin: 0, warningMax: 90, alertMin: 0, alertMax: 130 },
};

const backendDatacenter = {
  _id: "dc-tunis",
  name: "Datacenter Tunis",
  location: "Tunis",
  status: "normal",
  zones: [
    {
      _id: "zone-a0-temp",
      name: "Salle AO - Temperature",
      description: "Capteurs temperature",
      status: "normal",
      part: "Salles",
      room: "Salle AO",
      roomPart: "Temperature",
      displayOrder: 1,
      datacenterId: "dc-tunis",
      nodes: [
        { _id: "node-a01", name: "Noeud AO-1", isOnline: true, status: "normal", macAddress: "AA:00:00:00:01", firmwareVersion: "1.0.0" },
        { _id: "node-a02", name: "Noeud AO-2", isOnline: true, status: "normal", macAddress: "AA:00:00:00:02", firmwareVersion: "1.0.0" },
      ],
    },
    {
      _id: "zone-b0-air",
      name: "Salle BO - Air",
      description: "Capteurs air",
      status: "warning",
      part: "Salles",
      room: "Salle BO",
      roomPart: "Air",
      displayOrder: 2,
      datacenterId: "dc-tunis",
      nodes: [
        { _id: "node-b01", name: "Noeud BO-1", isOnline: true, status: "warning", macAddress: "BB:00:00:00:01", firmwareVersion: "1.0.0" },
        { _id: "node-b02", name: "Noeud BO-2", isOnline: false, status: "warning", macAddress: "BB:00:00:00:02", firmwareVersion: "1.0.0" },
      ],
    },
    {
      _id: "zone-bat-1",
      name: "Salle Batterie - Energie",
      description: "Zone batteries",
      status: "normal",
      part: "Salles",
      room: "Salle Batterie",
      roomPart: "Energie",
      displayOrder: 3,
      datacenterId: "dc-tunis",
      nodes: [
        { _id: "node-bat-1", name: "Noeud BAT-1", isOnline: true, status: "normal", macAddress: "CC:00:00:00:01", firmwareVersion: "1.0.0" },
      ],
    },
    {
      _id: "zone-co-1",
      name: "Salle CO - Air",
      description: "Zone CO",
      status: "normal",
      part: "Salles",
      room: "Salle CO",
      roomPart: "Air",
      displayOrder: 4,
      datacenterId: "dc-tunis",
      nodes: [
        { _id: "node-co-1", name: "Noeud CO-1", isOnline: true, status: "normal", macAddress: "DD:00:00:00:01", firmwareVersion: "1.0.0" },
      ],
    },
  ],
};

const zones = backendDatacenter.zones;
const nodes = zones.flatMap((zone) =>
  zone.nodes.map((node) => ({
    _id: node._id,
    name: node.name,
    isOnline: node.isOnline,
    status: node.status,
    lastPing: new Date().toISOString(),
    macAddress: node.macAddress,
    firmwareVersion: node.firmwareVersion,
    zoneId: {
      _id: zone._id,
      name: zone.name,
      datacenterId: zone.datacenterId,
    },
  })),
);

const thresholdItems = {
  "zone:zone-a0-temp": [
    {
      _id: "thr-zone-a0-pressure",
      scopeType: "zone",
      scopeId: "zone-a0-temp",
      metricName: "pressure",
      warningMin: 500,
      warningMax: 840,
      alertMin: 420,
      alertMax: 950,
      enabled: true,
    },
    {
      _id: "thr-zone-a0-gas",
      scopeType: "zone",
      scopeId: "zone-a0-temp",
      metricName: "gasLevel",
      warningMin: 0,
      warningMax: 65,
      alertMin: 0,
      alertMax: 90,
      enabled: true,
    },
  ],
  "node:node-a01": [
    {
      _id: "thr-node-a01-gas",
      scopeType: "node",
      scopeId: "node-a01",
      metricName: "gasLevel",
      warningMin: 0,
      warningMax: 55,
      alertMin: 0,
      alertMax: 80,
      enabled: true,
    },
  ],
};

const zoneLatestById = {
  "zone-a0-temp": {
    _id: "zone-a0-temp",
    name: "Salle AO - Temperature",
    room: "Salle AO",
    roomPart: "Temperature",
    part: "Salles",
    status: "normal",
    datacenterId: { _id: "dc-tunis", name: "Datacenter Tunis" },
    nodes: [
      {
        _id: "node-a01",
        name: "Noeud AO-1",
        isOnline: true,
        macAddress: "AA:00:00:00:01",
        latestMetrics: {
          temperature: 23.4,
          humidity: 46.2,
          pressure: 640,
          vibration: 1.3,
          gasLevel: 28,
          recordedAt: "2026-04-16T09:20:00.000Z",
        },
      },
      {
        _id: "node-a02",
        name: "Noeud AO-2",
        isOnline: true,
        macAddress: "AA:00:00:00:02",
        latestMetrics: {
          temperature: 24.1,
          humidity: 47.8,
          pressure: 690,
          vibration: 1.1,
          gasLevel: 31,
          recordedAt: "2026-04-16T09:21:00.000Z",
        },
      },
    ],
  },
};

function json(body) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  await page.addInitScript(() => {
    window.localStorage.setItem("sentinel_token", "preview-token");
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const scopeType = url.searchParams.get("scopeType");
    const scopeId = url.searchParams.get("scopeId");

    if (pathname.endsWith("/auth/me")) {
      return route.fulfill(
        json({
          success: true,
          user: {
            _id: "user-1",
            email: "preview@ooredoo.tn",
            firstName: "Preview",
            lastName: "User",
            fullName: "Preview User",
            role: "admin",
          },
        }),
      );
    }

    if (pathname.endsWith("/datacenters")) {
      return route.fulfill(json({ success: true, data: [backendDatacenter] }));
    }

    if (pathname.endsWith("/zones") && !pathname.includes("/nodes/latest")) {
      const datacenterId = url.searchParams.get("datacenterId");
      return route.fulfill(
        json({
          success: true,
          data: datacenterId === "dc-tunis" ? zones : [],
        }),
      );
    }

    if (pathname.endsWith("/nodes")) {
      const datacenterId = url.searchParams.get("datacenterId");
      return route.fulfill(
        json({
          success: true,
          data: datacenterId === "dc-tunis" ? nodes : [],
        }),
      );
    }

    if (pathname.endsWith("/thresholds")) {
      const key = scopeType && scopeId ? `${scopeType}:${scopeId}` : "";
      return route.fulfill(
        json({
          success: true,
          data: thresholdItems[key] || [],
          defaults: defaultThresholds,
        }),
      );
    }

    if (pathname.endsWith("/thresholds/bulk")) {
      return route.fulfill(json({ success: true }));
    }

    if (pathname.includes("/zones/") && pathname.endsWith("/nodes/latest")) {
      const zoneId = pathname.split("/zones/")[1].split("/nodes/latest")[0];
      return route.fulfill(
        json({
          success: true,
          data: zoneLatestById[zoneId] || null,
        }),
      );
    }

    if (pathname.endsWith("/sensors/latest")) {
      return route.fulfill(
        json({
          success: true,
          data: [
            {
              _id: "reading-1",
              nodeId: "node-a01",
              temperature: 23.4,
              humidity: 46.2,
              gasLevel: 28,
              pressure: 640,
              vibration: 1.3,
              recordedAt: "2026-04-16T09:20:00.000Z",
            },
          ],
        }),
      );
    }

    if (pathname.endsWith("/sensors/history")) {
      return route.fulfill(
        json({
          success: true,
          data: [
            {
              _id: "hist-1",
              nodeId: { _id: "node-a01", name: "Noeud AO-1" },
              temperature: 22.8,
              humidity: 45.7,
              gasLevel: 27,
              pressure: 630,
              vibration: 1.2,
              recordedAt: "2026-04-16T08:45:00.000Z",
            },
            {
              _id: "hist-2",
              nodeId: { _id: "node-a01", name: "Noeud AO-1" },
              temperature: 23.4,
              humidity: 46.2,
              gasLevel: 28,
              pressure: 640,
              vibration: 1.3,
              recordedAt: "2026-04-16T09:20:00.000Z",
            },
          ],
          pagination: { page: 1, pages: 1, total: 2, limit: 100 },
        }),
      );
    }

    if (pathname.endsWith("/alerts")) {
      return route.fulfill(json({ success: true, data: [] }));
    }

    if (pathname.endsWith("/sensors/ai-insights")) {
      return route.fulfill(json({ success: true, data: {} }));
    }

    if (pathname.endsWith("/users")) {
      return route.fulfill(json({ success: true, data: [] }));
    }

    return route.fulfill(json({ success: true, data: [] }));
  });

  try {
    await page.goto(`${baseUrl}/datacenters`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /connexion au hub/i }).first().click();
    await page.waitForURL(/\/overview$/, { timeout: 15000 });
    await page.waitForTimeout(2500);

    await page.getByRole("link", { name: /seuils/i }).click();
    await page.waitForURL(/\/thresholds$/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(outputDir, "thresholds-global.png"), fullPage: true });

    await page.getByRole("button", { name: /^Salle$/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outputDir, "thresholds-salle.png"), fullPage: true });

    await page.getByRole("button", { name: /^Noeud$/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outputDir, "thresholds-noeud.png"), fullPage: true });

    await page.getByRole("link", { name: /salle ao/i }).first().click();
    await page.waitForURL(/\/zones\/zone-a0-temp$/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(outputDir, "zone-details-salle-ao.png"), fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
