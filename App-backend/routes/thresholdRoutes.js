import express from "express";
import { getThresholds, createThreshold, updateThreshold, deleteThreshold, bulkUpsertThresholds } from "../controllers/thresholdController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getThresholds);
router.post("/", protect, authorize("admin"), createThreshold);
router.put("/bulk", protect, authorize("admin"), bulkUpsertThresholds);
router.put("/:id", protect, authorize("admin"), updateThreshold);
router.delete("/:id", protect, authorize("admin"), deleteThreshold);

export default router;
