import express from "express";
import { getLatestReadings, getSensorHistory, createReading, getAiInsights } from "../controllers/sensorController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/latest", protect, getLatestReadings);
router.get("/history", protect, getSensorHistory);
router.get("/ai-insights", protect, getAiInsights);
router.post("/", createReading); // open - ESP32 nodes push data here

export default router;
