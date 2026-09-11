import { parseUserMessage } from "../services/gemini.js";
import {
  createReminder,
  formatReminderList,
  listUserReminders,
  cancelReminder,
  upsertUser
} from "../services/reminderService.js";
import { normalizePhone } from "../utils/phone.js";
import { formatReminderTime } from "../utils/time.js";

const maxMessageLength = Number(process.env.MAX_MESSAGE_LENGTH || 2000);

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
        error: `Message is too long. Maximum ${maxMessageLength} characters.`
      });
    }

    await upsertUser(phone, timezone);

    const parsed = await parseUserMessage({
      text,
      timezone
    });

    if (parsed.intent === "create_reminder") {
      if (!parsed.message || !parsed.scheduled_for_iso) {
        return res.json({
          ok: true,
          reply:
            parsed.clarification_question ||
            "What exact date and time should I remind you?"
        });
      }

      const reminder = await createReminder({
        phone,
        message: parsed.message,
        scheduledFor: parsed.scheduled_for_iso,
        timezone: parsed.timezone || timezone,
        createdFromText: text
      });

      return res.json({
        ok: true,
        intent: parsed.intent,
        reminder: {
          id: reminder.reminderId,
          message: reminder.message,
          scheduledFor: reminder.scheduledFor,
          timezone: reminder.timezone
        },
        reply: `✅ Reminder set for ${formatReminderTime(
          reminder.scheduledFor,
          reminder.timezone
        )}.\n\n🔔 ${reminder.message}\nID: ${reminder.reminderId}`
      });
    }

    if (parsed.intent === "list_reminders") {
      const reminders = await listUserReminders(phone);

      return res.json({
        ok: true,
        intent: parsed.intent,
        reminders,
        reply: await formatReminderList(reminders)
      });
    }

    if (parsed.intent === "cancel_reminder") {
      const cancelled = await cancelReminder({
        phone,
        reminderId: parsed.reminder_id,
        searchText: parsed.search_text
      });

      if (!cancelled) {
        return res.json({
          ok: true,
          intent: parsed.intent,
          reply:
            "I couldn't find a matching active reminder. Try giving me its reminder ID or a few words from the reminder."
        });
      }

      return res.json({
        ok: true,
        intent: parsed.intent,
        reminder: cancelled,
        reply: `✅ Cancelled reminder ${cancelled.reminderId}:\n${cancelled.message}`
      });
    }

    if (parsed.intent === "edit_reminder") {
      return res.json({
        ok: true,
        intent: parsed.intent,
        reply:
          "Editing is prepared in the API structure, but this first version does not modify reminders yet. Cancel the old reminder and create a new one."
      });
    }

    if (parsed.intent === "clarify") {
      return res.json({
        ok: true,
        intent: parsed.intent,
        reply:
          parsed.clarification_question ||
          "What exact date and time should I use for the reminder?"
      });
    }

    return res.json({
      ok: true,
      intent: parsed.intent,
      reply:
        "I can set reminders for you. Try: “Remind me tomorrow at 8 PM to study.”"
    });
  } catch (error) {
    console.error("Chatbot error:", error);

    return res.status(500).json({
      ok: false,
      error: "Unable to process the reminder right now.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}
