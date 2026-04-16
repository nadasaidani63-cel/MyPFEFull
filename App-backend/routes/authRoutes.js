import express from "express";
import { register, login, getMe, verifyEmail, resendVerification, requestPasswordReset, resetPassword } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);

// Email verification
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);

// Password reset
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);

export default router;
