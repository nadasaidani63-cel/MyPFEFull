import express from "express";
import { createRoleRequest, getRoleRequests, approveRoleRequest, rejectRoleRequest } from "../controllers/roleRequestController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getRoleRequests);
router.post("/", protect, authorize("utilisateur", "admin"), createRoleRequest);
router.patch("/:id/approve", protect, authorize("admin"), approveRoleRequest);
router.patch("/:id/reject", protect, authorize("admin"), rejectRoleRequest);

export default router;
