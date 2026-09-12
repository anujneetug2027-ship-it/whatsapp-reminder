import express from "express";
import { handleChat } from "../controllers/chatbotController.js";

const router = express.Router();

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(value).trim();
    }
  }

  return "";
}

/**
 * Extracts the incoming WhatsApp phone number and message.
 * Fast2SMS may send these fields at the top level or inside
 * a nested data/message object.
 */
function extractIncomingMessage(payload) {
  const root =
    payload && typeof payload === "object"
      ? payload
      : {};

  const nested =
    root.data && typeof root.data === "object"
      ? root.data
      : root.message && typeof root.message === "object"
        ? root.message
        : {};

  const phone = firstValue(
    root.from,
    root.phone,
    root.mobile,
    root.number,
    root.customer_mobile,
    root.sender,
    nested.from,
    nested.phone,
    nested.mobile,
    nested.number,
    nested.customer_mobile,
    nested.sender
  );

  const message = firstValue(
    root.body,
    root.text,
    root.message_text,
    root.user_message,
    typeof root.message === "string" ? root.message : "",
    nested.body,
    nested.text,
    nested.message_text,
    nested.user_message,
    typeof nested.message === "string" ? nested.message : ""
  );

  return {
    phone,
    message
  };
}

/**
 * Fast2SMS WhatsApp Incoming Messages webhook.
 *
 * Configure Fast2SMS with:
 * Event: Incoming Messages
 * Method: POST
 * Content-Type: JSON
 * URL: https://YOUR-RENDER-DOMAIN/webhook
 */
router.post("/", async (req, res) => {
  try {
    const { phone, message } = extractIncomingMessage(req.body);

    console.log("Fast2SMS incoming WhatsApp message:", {
      phone,
      message,
      raw: req.body
    });

    if (!phone || !message) {
      return res.status(400).json({
        ok: false,
        error:
          "Webhook payload did not contain a phone number and message.",
        received: req.body
      });
    }

    // Reuse the existing Gemini and MongoDB chatbot logic.
    req.body = {
      phone,
      message,
      timezone: req.body?.timezone || undefined
    };

    return handleChat(req, res);
  } catch (error) {
    console.error("Fast2SMS incoming webhook error:", error);

    return res.status(500).json({
      ok: false,
      error: "Unable to process the incoming WhatsApp message."
    });
  }
});

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "fast2sms-incoming-whatsapp-webhook"
  });
});

export default router;
