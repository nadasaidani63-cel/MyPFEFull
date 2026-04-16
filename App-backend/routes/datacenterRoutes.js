import express from "express";
import { getDatacenters, getDatacenter, createDatacenter, updateDatacenter, deleteDatacenter } from "../controllers/datacenterController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getDatacenters);
router.get("/:id", protect, getDatacenter);
router.post("/", protect, authorize("admin"), createDatacenter);
router.put("/:id", protect, authorize("admin"), updateDatacenter);
router.delete("/:id", protect, authorize("admin"), deleteDatacenter);

export default router;
