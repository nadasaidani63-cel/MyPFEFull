import Node from "../models/Node.js";
import { ingestReading } from "./ingestReading.js";

const state = new Map();
const DEFAULT_INTERVAL_MS = Number(process.env.SIMULATOR_INTERVAL_MS || 15_000);
const INCIDENT_PROBABILITY = Number(process.env.SIMULATOR_INCIDENT_PROBABILITY || 0.00018);

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function maybe(probability) {
  return Math.random() < probability;
}

function initState() {
  return {
    base: {
      temperature: rand(20.5, 25.5),
      humidity: rand(44, 57),
      gasLevel: rand(35, 65),
      pressure: rand(560, 760),
      vibration: rand(0.12, 0.24),
    },
    incident: null,
    cooldownUntil: 0,
  };
}

function nextValues(currentState, now = Date.now()) {
  const periodMs = 12 * 60 * 1000;
  const wave = Math.sin((2 * Math.PI * (now % periodMs)) / periodMs);

  currentState.base.temperature = clamp(currentState.base.temperature + rand(-0.05, 0.05), 18, 27);
  currentState.base.humidity = clamp(currentState.base.humidity + rand(-0.18, 0.18), 38, 62);
  currentState.base.gasLevel = clamp(currentState.base.gasLevel + rand(-2, 2.5), 18, 85);
  currentState.base.pressure = clamp(currentState.base.pressure + rand(-4, 4), 420, 880);
  currentState.base.vibration = clamp(currentState.base.vibration + rand(-0.008, 0.008), 0.06, 0.42);

  let temperature = currentState.base.temperature + wave * 0.8 + rand(-0.25, 0.25);
  let humidity = currentState.base.humidity + wave * 2.1 + rand(-0.8, 0.8);
  let gasLevel = currentState.base.gasLevel + wave * 8 + rand(-5, 5);
  let pressure = currentState.base.pressure + wave * 55 + rand(-18, 18);
  let vibration = currentState.base.vibration + rand(-0.015, 0.02);

  if (!currentState.incident && now >= currentState.cooldownUntil && maybe(INCIDENT_PROBABILITY)) {
    const types = ["OVERHEAT", "SMOKE", "HUM_LOW", "HUM_HIGH", "CO2", "VIBRATION"];
    const type = types[Math.floor(Math.random() * types.length)];
    const durationSec = Math.floor(rand(180, 480));
    currentState.incident = { type, until: now + durationSec * 1000 };
  }

  if (currentState.incident) {
    const { type, until } = currentState.incident;

    if (type === "OVERHEAT") temperature += rand(4.5, 8);
    if (type === "SMOKE") gasLevel += rand(85, 145);
    if (type === "HUM_LOW") humidity -= rand(8, 14);
    if (type === "HUM_HIGH") humidity += rand(8, 12);
    if (type === "CO2") pressure += rand(230, 430);
    if (type === "VIBRATION") vibration += rand(0.2, 0.42);

    if (now >= until) {
      currentState.incident = null;
      currentState.cooldownUntil = now + Math.floor(rand(8, 16)) * 60 * 1000;
    }
  }

  return {
    temperature: clamp(temperature, 10, 45),
    humidity: clamp(humidity, 10, 90),
    gasLevel: clamp(gasLevel, 0, 260),
    pressure: clamp(pressure, 250, 1800),
    vibration: clamp(vibration, 0, 4),
  };
}

export async function startRealtimeSimulator(io, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  console.log(`Realtime simulator started (${intervalMs} ms)`);

  let ticking = false;

  const tick = async () => {
    if (ticking) return;
    ticking = true;

    try {
      const nodes = await Node.find({ isOnline: true, sourceType: { $ne: "prototype" } });
      const now = Date.now();

      for (const node of nodes) {
        let nodeState = state.get(String(node._id));
        if (!nodeState) {
          nodeState = initState();
          state.set(String(node._id), nodeState);
        }

        const values = nextValues(nodeState, now);
        await ingestReading({
          payload: {
            nodeId: node._id,
            ...values,
            recordedAt: new Date(now),
          },
          io,
        });
      }
    } finally {
      ticking = false;
    }
  };

  tick();
  setInterval(tick, intervalMs);
}
