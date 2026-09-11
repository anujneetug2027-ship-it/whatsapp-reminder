import express from "express";

const router = express.Router();

/*
  Optional Fast2SMS webhook receiver.

  Fast2SMS can be configured to call this endpoint for delivery/status
  callbacks if your account/WhatsApp setup provides those events.

  Keep the endpoint simple initially. Store the incoming event in logs
  or extend it later to update Reminder.fast2smsResponse.
*/
router.post("/", (req, res) => {
  console.log("Fast2SMS webhook received:", JSON.stringify(req.body));
  res.status(200).json({ ok: true });
});

router.get("/", (_req, res) => {
  res.json({ ok: true, service: "fast2sms-webhook" });
});

export default router;
