import express from "express";
import crypto from "node:crypto";
import { handleChat } from "../controllers/chatbotController.js";

const router = express.Router();

// Provider retries are common when a webhook takes too long to acknowledge.
// Acknowledge immediately, then process the message in the background.
const DEDUPE_TTL_MS = 5 * 60 * 1000;
const MAX_DEDUPE_ENTRIES = 5000;
const seenMessages = new Map();

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      typeof value !== "object" &&
      String(value).trim()
    ) {
      return String(value).trim();
    }
  }
  return "";
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function extractIncomingMessage(payload) {
  const root = objectOrEmpty(payload);
  const report = Array.isArray(root.whatsapp_reports) && root.whatsapp_reports.length
    ? objectOrEmpty(root.whatsapp_reports[0])
    : null;
  const source = report || root;
  const nested = objectOrEmpty(source.data);
  const nestedMessage = objectOrEmpty(source.message);
  const dataMessage = objectOrEmpty(nested.message);
  const candidates = [source, nested, nestedMessage, dataMessage, root];

  let phone = "";
  let message = "";
  let providerMessageId = "";

  for (const item of candidates) {
    phone ||= firstValue(
      item.from, item.phone, item.mobile, item.number,
      item.customer_mobile, item.sender, item.wa_id,
      item.contact?.wa_id, item.contact?.phone
    );
    message ||= firstValue(
      item.body, item.text, item.message_text, item.user_message,
      typeof item.message === "string" ? item.message : "",
      item.content
    );
    providerMessageId ||= firstValue(
      item.message_id, item.messageId, item.msg_id, item.msgId,
      item.wamid, item.wam_id, item.id, item.event_id, item.eventId
    );
  }

  return { phone, message, providerMessageId, source };
}

function makeDedupeKey({ phone, message, providerMessageId, source }) {
  // Prefer the provider's stable ID whenever one is present.
  if (providerMessageId) {
    return `id:${phone}:${providerMessageId}`;
  }

  // Fallback for integrations that omit a message ID. Include common event
  // timestamps when available; otherwise suppress identical phone+text
  // deliveries for the short retry window.
  const eventTimestamp = firstValue(
    source.timestamp, source.created_at, source.createdAt,
    source.sent_at, source.sentAt, source.time
  );
  const canonical = [
    phone,
    message.trim().replace(/\s+/g, " "),
    eventTimestamp
  ].join("\n");

  return `hash:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

function cleanupDedupe(now = Date.now()) {
  for (const [key, timestamp] of seenMessages) {
    if (now - timestamp > DEDUPE_TTL_MS) seenMessages.delete(key);
  }
  while (seenMessages.size > MAX_DEDUPE_ENTRIES) {
    const oldestKey = seenMessages.keys().next().value;
    if (oldestKey === undefined) break;
    seenMessages.delete(oldestKey);
  }
}

function alreadySeen(key) {
  const now = Date.now();
  cleanupDedupe(now);
  const previous = seenMessages.get(key);
  if (previous && now - previous < DEDUPE_TTL_MS) return true;
  seenMessages.set(key, now);
  return false;
}

function backgroundResponse() {
  // handleChat expects an Express-like response object. The real webhook
  // response has already been acknowledged to prevent provider retries.
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      if (this.statusCode >= 400) {
        console.error("Background webhook processing returned an error:", {
          status: this.statusCode,
          error: payload?.error
        });
      }
      return payload;
    }
  };
}

router.post("/", (req, res) => {
  const extracted = extractIncomingMessage(req.body);
  const { phone, message, providerMessageId } = extracted;

  if (!phone || !message) {
    console.warn("Ignoring invalid Fast2SMS webhook payload:", {
      hasPhone: Boolean(phone),
      hasMessage: Boolean(message),
      keys: Object.keys(objectOrEmpty(req.body))
    });
    // Acknowledge malformed payloads to avoid retry storms; log keys for
    // diagnosis without dumping personal message content.
    return res.status(200).json({
      ok: false,
      ignored: true,
      error: "Webhook payload did not contain a phone number and message."
    });
  }

  const dedupeKey = makeDedupeKey(extracted);

  if (alreadySeen(dedupeKey)) {
    console.log("Duplicate Fast2SMS webhook ignored:", {
      phone,
      providerMessageId: providerMessageId || undefined
    });
    return res.status(200).json({
      ok: true,
      duplicate: true,
      accepted: true
    });
  }

  console.log("Fast2SMS webhook accepted:", {
    phone,
    providerMessageId: providerMessageId || undefined,
    messageLength: message.length
  });

  // Respond before database/AI/WhatsApp work. Many webhook providers retry
  // if their request remains open while a slow model is generating a reply.
  res.status(200).json({ ok: true, accepted: true });

  const backgroundReq = {
    body: {
      phone,
      message,
      timezone:
        firstValue(extracted.source?.timezone, req.body?.timezone) ||
        process.env.DEFAULT_TIMEZONE ||
        "Asia/Kolkata"
    },
    isWhatsAppWebhook: true
  };

  Promise.resolve()
    .then(() => handleChat(backgroundReq, backgroundResponse()))
    .catch((error) => {
      console.error("Fast2SMS background processing failed:", error);
    });
});

router.get("/", (_req, res) => {
  res.json({ ok: true, service: "fast2sms-incoming-whatsapp-webhook" });
});

export default router;
