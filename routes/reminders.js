import express from "express";
import {
  getReminders,
  getReminderStats,
  cancelReminderById
} from "../controllers/reminderController.js";

const router = express.Router();

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) return next();

  const provided = req.headers["x-admin-api-key"];

  if (provided !== expected) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized."
    });
  }

  next();
}

router.use(requireAdmin);

router.get("/", getReminders);
router.get("/stats", getReminderStats);
router.delete("/:id", cancelReminderById);

export default router;
