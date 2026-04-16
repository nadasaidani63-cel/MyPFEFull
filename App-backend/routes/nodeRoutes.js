import express from "express";
import { getNodes, getNode, createNode, updateNode, deleteNode } from "../controllers/nodeController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getNodes);
router.get("/:id", protect, getNode);
router.post("/", protect, authorize("admin"), createNode);
router.put("/:id", protect, authorize("admin"), updateNode);
router.delete("/:id", protect, authorize("admin"), deleteNode);

export default router;
