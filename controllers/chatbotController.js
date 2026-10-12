import { parseUserMessage } from "../services/gemini.js";

import {
  createReminder,
  formatReminderList,
  listUserReminders,
  getNextReminder,
  cancelReminder,
  upsertUser
} from "../services/reminderService.js";

import { sendSessionText } from "../services/fast2sms.js";
import { normalizePhone } from "../utils/phone.js";
import { formatReminderTime } from "../utils/time.js";

const maxMessageLength = Number(
  process.env.MAX_MESSAGE_LENGTH || 2000
);

/*
 * Temporary in-memory conversation cache.
 *
 * Structure:
 * Map<phone, [{ role: "user" | "assistant", content: string }]>
 *
 * This is not saved in MongoDB.
 * It will be cleared if Render restarts or redeploys.
 */
const conversationCache = new Map();

const MAX_HISTORY_MESSAGES = 5;
const HISTORY_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function getConversationHistory(phone) {
  const record = conversationCache.get(phone);

  if (!record) {
    return [];
  }

  const isExpired =
    Date.now() - record.updatedAt > HISTORY_EXPIRY_MS;

  if (isExpired) {
    conversationCache.delete(phone);
    return [];
  }

  return record.messages;
}

function saveConversationMessage(phone, role, content) {
  const currentHistory = getConversationHistory(phone);

  const updatedHistory = [
    ...currentHistory,
    {
      role,
      content: String(content).slice(0, 4000)
    }
  ].slice(-MAX_HISTORY_MESSAGES);

  conversationCache.set(phone, {
    messages: updatedHistory,
    updatedAt: Date.now()
  });
}

function combineReply(creativeReply, factualReply) {
  const creative = String(
    creativeReply || ""
  ).trim();

  if (!creative) {
    return factualReply;
  }

  return `${creative}\n\n${factualReply}`;
}

async function respond(req, res, payload) {
  const phone = req.body.phone;
  const userMessage = req.body.message;
  const reply = payload.reply;

  /*
   * Save only in temporary server memory.
   * Nothing is written to MongoDB.
   */
  if (phone && userMessage && reply) {
    saveConversationMessage(
      phone,
      "user",
      userMessage
    );

    saveConversationMessage(
      phone,
      "assistant",
      reply
    );
  }

  /*
   * If this request came from the WhatsApp webhook,
   * send the reply through the session-text API.
   */
  if (
    req.isWhatsAppWebhook &&
    phone &&
    reply
  ) {
    try {
      await sendSessionText({
        phone,
        message: reply
      });

      console.log(
        "WhatsApp session reply sent successfully."
      );
    } catch (error) {
      console.error(
        "WhatsApp session reply failed:",
        error.message
      );

      payload.sessionReplyError = error.message;
    }
  }

  return res.json(payload);
}

export async function handleChat(req, res) {
  try {
    const phone = normalizePhone(
      req.body.phone ||
      req.body.from ||
      req.body.number ||
      req.body.mobile
    );

    const text = String(
      req.body.message ||
      req.body.text ||
      req.body.user_message ||
      ""
    ).trim();

    const timezone =
      req.body.timezone ||
      process.env.DEFAULT_TIMEZONE ||
      "Asia/Kolkata";

    if (!phone) {
      return res.status(400).json({
        ok: false,
        error: "Missing phone number."
      });
    }

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "Missing message."
      });
    }

    // Support-prefixed messages are intentionally silent (including direct API calls).
    if (text.trimStart().toLowerCase().startsWith("/support")) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (text.length > maxMessageLength) {
      return res.status(400).json({
        ok: false,
        error:
          `Message is too long. Maximum ` +
          `${maxMessageLength} characters.`
      });
    }

    const displayName = String(req.body.name || req.body.userName || "").trim().slice(0, 80);
    const user = await upsertUser(phone, timezone, displayName);
    const name = displayName || user?.name || "";

    // Handle greetings/help locally: no AI call, faster response, consistent wording.
    const normalizedText = text.toLowerCase().replace(/[!.,?]+$/g, "").trim();
    const greeting = /^(hi|hello|hey|hii+|heyy+|good morning|good afternoon|good evening)$/.test(normalizedText);
    const asksHow = /^(how|how do i|how can i|what can you do|help|examples|commands|how to)\b/.test(normalizedText);

    if (greeting || asksHow) {
      if (greeting) {
        const greetingMessage =
          `Hey${name ? ` ${name}` : ""} 👋\\n` +
          `I am your *Personal Reminder Assistant* developed by AmbikaShelf.\\n` +
          `📌 Ask me to create reminders, and I'll notify you when it's time!\\n` +
          `I can also cancel, edit, or list your upcoming reminders!`;

        return respond(req, res, {
          ok: true,
          intent: "greeting",
          reply: greetingMessage
        });
      }

      const help = [
        `Of course${name ? `, ${name}` : ""}! Here's how to use me:`,
        "",
        "You can message me naturally to:",
        "• Set a reminder — “Remind me to study Biology tomorrow at 7 PM.”",
        "• List reminders — “Show my reminders.”",
        "• Check the next one — “What's my next reminder?”",
        "• Cancel one — “Cancel my Biology reminder” or include its ID.",
        "• Ask how something works — I'll explain with examples.",
        "",
        "Tip: include the task and a clear date/time. You can write in English, Hindi, or Hinglish; I'll match your language.",
        "",
        "— Developed by AmbikaShelf"
      ].join("\\n");

      return respond(req, res, {
        ok: true,
        intent: "help",
        reply: help
      });
    }

    /*
     * Read the previous five messages from memory.
     * The current message is not added until a reply is created.
     */
    const history = getConversationHistory(phone);

    const parsed = await parseUserMessage({
      text,
      timezone,
      history
    });

    if (parsed.intent === "create_reminder") {
      if (
        !parsed.message ||
        !parsed.scheduled_for_iso
      ) {
        return respond(req, res, {
          ok: true,
          intent: parsed.intent,
          reply:
            parsed.clarification_question ||
            "What exact date and time should I use?"
        });
      }

      const reminder = await createReminder({
        phone,
        message: parsed.message,
        scheduledFor: parsed.scheduled_for_iso,
        timezone: parsed.timezone || timezone,
        createdFromText: text
      });

      const factualReply =
        `✅ Reminder set successfully!\n\n` +
        `🔔 ${reminder.message}\n` +
        `🕒 ${formatReminderTime(
          reminder.scheduledFor,
          reminder.timezone
        )}\n` +
        `🆔 ${reminder.reminderId}`;

      return respond(req, res, {
        ok: true,
        intent: parsed.intent,
        reminder: {
          id: reminder.reminderId,
          message: reminder.message,
          scheduledFor: reminder.scheduledFor,
          timezone: reminder.timezone
        },
        reply: combineReply(
          parsed.creative_reply,
          factualReply
        )
      });
    }

    if (parsed.intent === "list_reminders") {
      const reminders = await listUserReminders(phone);

      const factualReply =
        await formatReminderList(reminders);

      return respond(req, res, {
        ok: true,
        intent: parsed.intent,
        reminders,
        reply: combineReply(
          parsed.creative_reply,
          factualReply
        )
      });
    }

    if (parsed.intent === "next_reminder") {
      const reminder = await getNextReminder(phone);

      const factualReply = reminder
        ? (
            `🔔 Your next reminder is:\n\n` +
            `${reminder.message}\n` +
            `🕒 ${formatReminderTime(
              reminder.scheduledFor,
              reminder.timezone
            )}\n` +
            `🆔 ${reminder.reminderId}`
          )
        : "🌿 You have no upcoming reminders right now.";

      return respond(req, res, {
        ok: true,
        intent: parsed.intent,
        reminder: reminder || null,
        reply: combineReply(
          parsed.creative_reply,
          factualReply
        )
      });
    }

    if (parsed.intent === "cancel_reminder") {
      const cancelled = await cancelReminder({
        phone,
        reminderId: parsed.reminder_id,
        searchText: parsed.search_text
      });

      if (!cancelled) {
        return respond(req, res, {
          ok: true,
          intent: parsed.intent,
          reply:
            "I couldn't find a matching active reminder. " +
            "Please send its reminder ID or a few words " +
            "from the reminder."
        });
      }

      const factualReply =
        `✅ Reminder cancelled successfully.\n\n` +
        `🔔 ${cancelled.message}\n` +
        `🆔 ${cancelled.reminderId}`;

      return respond(req, res, {
        ok: true,
        intent: parsed.intent,
        reminder: cancelled,
        reply: combineReply(
          parsed.creative_reply,
          factualReply
        )
      });
    }

    if (parsed.intent === "edit_reminder") {
      return respond(req, res, {
        ok: true,
        intent: parsed.intent,
        reply:
          "Editing is not enabled yet. You can cancel " +
          "the old reminder and create a new one."
      });
    }

    if (parsed.intent === "clarify") {
      return respond(req, res, {
        ok: true,
        intent: parsed.intent,
        reply:
          parsed.clarification_question ||
          "Could you provide the exact date and time?"
      });
    }

    return respond(req, res, {
      ok: true,
      intent: parsed.intent,
      reply:
        (parsed.explanation || parsed.creative_reply || "").trim() ||
        `I can help with reminders${name ? `, ${name}` : ""}. For example:\n\n` +
        `• “Remind me to revise Chemistry tomorrow at 6 PM.”\n` +
        `• “Show my reminders.”\n` +
        `• “When is my next reminder?”\n` +
        `• “Cancel my Chemistry reminder.”\n\n` +
        `Tell me what you'd like to do, and I'll guide you step by step.\n\n` +
        `— Developed by AmbikaShelf`
    });
  } catch (error) {
    console.error("Chatbot error:", error);

    return res.status(500).json({
      ok: false,
      error:
        "Unable to process the reminder right now.",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
    }
    
