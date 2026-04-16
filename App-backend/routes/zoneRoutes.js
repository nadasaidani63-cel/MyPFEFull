import express from "express";
import { getZones, getZone, getZoneNodesLatest, createZone, updateZone, deleteZone } from "../controllers/zoneController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getZones);
router.get("/:id", protect, getZone);
router.get("/:id/nodes/latest", protect, getZoneNodesLatest);
router.post("/", protect, authorize("admin"), createZone);
router.put("/:id", protect, authorize("admin"), updateZone);
router.delete("/:id", protect, authorize("admin"), deleteZone);

export default router;
