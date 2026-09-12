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

function extractIncomingMessage(payload) {
  const root =
    payload && typeof payload === "object"
      ? payload
      : {};

  const report =
    Array.isArray(root.whatsapp_reports) &&
    root.whatsapp_reports.length
      ? root.whatsapp_reports[0]
      : null;

  const source = report || root;

  const nested =
    source.data &&
    typeof source.data === "object"
      ? source.data
      : source.message &&
          typeof source.message === "object"
        ? source.message
        : {};

  const phone = firstValue(
    source.from,
    source.phone,
    source.mobile,
    source.number,
    source.customer_mobile,
    source.sender,
    nested.from,
    nested.phone,
    nested.mobile,
    nested.number,
    nested.customer_mobile,
    nested.sender
  );

  const message = firstValue(
    source.body,
    source.text,
    source.message_text,
    source.user_message,
    typeof source.message === "string"
      ? source.message
      : "",
    nested.body,
    nested.text,
    nested.message_text,
    nested.user_message,
    typeof nested.message === "string"
      ? nested.message
      : ""
  );

  return {
    phone,
    message
  };
}

router.post("/", async (req, res) => {
  try {
    const {
      phone,
      message
    } = extractIncomingMessage(req.body);

    console.log(
      "Fast2SMS incoming WhatsApp message:",
      {
        phone,
        message
      }
    );

    if (!phone || !message) {
      return res.status(400).json({
        ok: false,
        error:
          "Webhook payload did not contain a phone number " +
          "and message.",
        received: req.body
      });
    }

    req.body = {
      phone,
      message,
      timezone:
        req.body?.timezone ||
        process.env.DEFAULT_TIMEZONE ||
        "Asia/Kolkata"
    };

    // This tells chatbotController.js to send the
    // generated reply through the WhatsApp session API.
    req.isWhatsAppWebhook = true;

    return handleChat(req, res);
  } catch (error) {
    console.error(
      "Fast2SMS incoming webhook error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Unable to process the incoming WhatsApp message."
    });
  }
});

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service:
      "fast2sms-incoming-whatsapp-webhook"
  });
});

export default router;
