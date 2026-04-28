import "dotenv/config";
import "./config/env.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import http from "http";
import { Server } from "socket.io";
import { connectDB } from "./config/db.js";
import jwt from "jsonwebtoken";
import User from "./models/User.js";

import authRoutes from "./routes/authRoutes.js";
import datacenterRoutes from "./routes/datacenterRoutes.js";
import zoneRoutes from "./routes/zoneRoutes.js";
import nodeRoutes from "./routes/nodeRoutes.js";
import sensorRoutes from "./routes/sensorRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import thresholdRoutes from "./routes/thresholdRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import roleRequestRoutes from "./routes/roleRequestRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";

import { startRealtimeSimulator } from "./services/realtimeSimulator.js";
import { startPrototypeRealtimeBridge } from "./services/prototypeRealtimeBridge.js";
import { startAiTrainingScheduler } from "./services/aiTrainingScheduler.js";
import { setIO } from "./services/socketInstance.js";
import { normalizeRole } from "./utils/roles.js";

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Autoriser localhost + accès depuis d'autres appareils du même réseau.
 * origin: true reflète automatiquement l'origine reçue.
 */
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());
app.use(morgan("dev"));

app.get("/ping", (req, res) => {
  res.send("pong");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/datacenters", datacenterRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/nodes", nodeRoutes);
app.use("/api/sensors", sensorRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/thresholds", thresholdRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/role-requests", roleRequestRoutes);
app.use("/api/audit-logs", auditRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.split(" ")[1]
        : null);

    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select(
      "email role firstName lastName"
    );

    if (user) {
      socket.data.user = {
        id: String(user._id),
        email: user.email,
        role: normalizeRole(user.role),
        fullName: `${user.firstName} ${user.lastName}`.trim(),
      };
    }

    return next();
  } catch (e) {
    return next();
  }
});

setIO(io);

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  socket.on("join-datacenter", (dcId) => {
    socket.join(`dc:${dcId}`);
    console.log(`📌 Socket ${socket.id} joined room dc:${dcId}`);
  });

  socket.on("leave-datacenter", (dcId) => {
    socket.leave(`dc:${dcId}`);
    console.log(`📤 Socket ${socket.id} left room dc:${dcId}`);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected:", socket.id);
  });
});

async function boot() {
  await connectDB();
  startAiTrainingScheduler();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  if (String(process.env.ENABLE_SIMULATOR || "true").toLowerCase() !== "false") {
    startRealtimeSimulator(io, {
      intervalMs: Number(process.env.SIMULATOR_INTERVAL_MS || 15_000),
    });
  }

  startPrototypeRealtimeBridge(io).catch((error) => {
    console.error("Prototype datacenter bridge failed:", error.message);
  });
}

boot().catch((err) => {
  console.error("❌ Fatal startup error:", err);
  process.exit(1);
});

export { io };
