import express from "express";
import crypto from "node:crypto";
import { handleChat } from "../controllers/chatbotController.js";

const router = express.Router();
const DEDUPE_TTL_MS = 5 * 60 * 1000;
const MAX_DEDUPE_ENTRIES = 5000;
const seenMessages = new Map();

function firstValue(...values) {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return "";
}
function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function extractIncomingMessage(payload) {
  const root = obj(payload);
  // Fast2SMS Standard/SIMPLIFIED webhook payload.
  const report = Array.isArray(root.whatsapp_reports) && root.whatsapp_reports.length
    ? obj(root.whatsapp_reports[0]) : null;
  const source = report || root;

  // Fast2SMS META DIRECT format: entry[].changes[].value.contacts/messages.
  const entry = Array.isArray(root.entry) ? obj(root.entry[0]) : {};
  const change = Array.isArray(entry.changes) ? obj(entry.changes[0]) : {};
  const value = obj(change.value);
  const contact = Array.isArray(value.contacts) ? obj(value.contacts[0]) : {};
  const profile = obj(contact.profile);
  const metaMessage = Array.isArray(value.messages) ? obj(value.messages[0]) : {};
  const metaText = obj(metaMessage.text);

  const nested = obj(source.data);
  const nestedMessage = obj(source.message);
  const candidates = [
    source, nested, nestedMessage, obj(nested.message), root,
    value, contact, profile, metaMessage, metaText
  ];

  let phone = firstValue(metaMessage.from, contact.wa_id);
  let message = firstValue(metaText.body);
  let name = firstValue(profile.name);
  let providerMessageId = firstValue(metaMessage.id);

  for (const item of candidates) {
    phone ||= firstValue(item.from, item.phone, item.mobile, item.number,
      item.customer_mobile, item.sender, item.wa_id,
      obj(item.contact).wa_id, obj(item.contact).phone);
    message ||= firstValue(item.body, item.text, item.message_text,
      item.user_message, typeof item.message === "string" ? item.message : "",
      item.content);
    name ||= firstValue(item.name, item.profile_name, item.contact_name,
      obj(item.profile).name, obj(item.contact).name);
    providerMessageId ||= firstValue(item.message_id, item.messageId,
      item.msg_id, item.msgId, item.wamid, item.wam_id, item.id,
      item.event_id, item.eventId);
  }

  return { phone, message, name, providerMessageId, source: source, root };
}

function dedupeKey({ phone, message, providerMessageId, source }) {
  if (providerMessageId) return `id:${phone}:${providerMessageId}`;
  const timestamp = firstValue(source.timestamp, source.created_at,
    source.createdAt, source.sent_at, source.sentAt, source.time);
  return "hash:" + crypto.createHash("sha256")
    .update([phone, message.trim().replace(/\s+/g, " "), timestamp].join("\n"))
    .digest("hex");
}
function isDuplicate(key) {
  const now = Date.now();
  for (const [storedKey, timestamp] of seenMessages) {
    if (now - timestamp > DEDUPE_TTL_MS) seenMessages.delete(storedKey);
  }
  if (seenMessages.has(key)) return true;
  seenMessages.set(key, now);
  while (seenMessages.size > MAX_DEDUPE_ENTRIES) {
    seenMessages.delete(seenMessages.keys().next().value);
  }
  return false;
}
function backgroundResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) {
      if (this.statusCode >= 400) console.error("Background webhook processing error:", {
        status: this.statusCode, error: payload?.error
      });
      return payload;
    }
  };
}

router.post("/", (req, res) => {
  const event = extractIncomingMessage(req.body);

  // Fast2SMS can deliver status callbacks as well as incoming messages.
  // Process only incoming-message events when the event type is present.
  const eventType = firstValue(event.root.webhook_type, event.source.webhook_type);
  if (eventType && !["incoming_message", "received"].includes(eventType.toLowerCase())) {
    return res.status(200).json({ ok: true, ignored: true, reason: "not_incoming_message" });
  }

  const { phone, message, name, providerMessageId } = event;
  if (!phone || !message) {
    console.warn("Ignoring invalid Fast2SMS webhook payload:", {
      hasPhone: Boolean(phone), hasMessage: Boolean(message),
      keys: Object.keys(obj(req.body))
    });
    return res.status(200).json({ ok: false, ignored: true, error: "Missing phone or message." });
  }

  // Don't process support-prefixed messages or send an automatic reply.
  if (message.trimStart().toLowerCase().startsWith("/support")) {
    return res.status(200).json({ ok: true, ignored: true, reason: "support_command" });
  }

  const key = dedupeKey(event);
  if (isDuplicate(key)) {
    console.log("Duplicate Fast2SMS webhook ignored:", { phone, providerMessageId: providerMessageId || undefined });
    return res.status(200).json({ ok: true, duplicate: true, accepted: true });
  }

  console.log("Fast2SMS webhook accepted:", {
    phone, name: name || undefined,
    providerMessageId: providerMessageId || undefined,
    messageLength: message.length
  });
  res.status(200).json({ ok: true, accepted: true });

  const backgroundReq = {
    body: {
      phone, message, name,
      timezone: firstValue(event.source.timezone, req.body?.timezone) ||
        process.env.DEFAULT_TIMEZONE || "Asia/Kolkata"
    },
    isWhatsAppWebhook: true
  };
  Promise.resolve()
    .then(() => handleChat(backgroundReq, backgroundResponse()))
    .catch(error => console.error("Fast2SMS background processing failed:", error));
});

router.get("/", (_req, res) => res.json({ ok: true, service: "fast2sms-incoming-whatsapp-webhook" }));
export default router;
    
