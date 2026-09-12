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
  if (
    req.isWhatsAppWebhook &&
    payload.reply &&
    req.body.phone
  ) {
    try {
      await sendSessionText({
        phone: req.body.phone,
        message: payload.reply
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

    if (text.length > maxMessageLength) {
      return res.status(400).json({
        ok: false,
        error:
          `Message is too long. Maximum ` +
          `${maxMessageLength} characters.`
      });
    }

    await upsertUser(phone, timezone);

    const parsed = await parseUserMessage({
      text,
      timezone
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
        "I’m your reminder assistant 🌟\n\n" +
        "You can ask me to create, list, cancel, " +
        "or find your next reminder."
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
