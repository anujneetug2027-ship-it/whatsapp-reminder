import Reminder from "../models/Reminder.js";
import User from "../models/User.js";
import { createReminderId } from "../utils/ids.js";
import { formatReminderTime, getTimeZone } from "../utils/time.js";

export async function upsertUser(phone, timezone) {
  const tz = getTimeZone(timezone);

  return User.findOneAndUpdate(
    { phone },
    {
      $set: {
        timezone: tz,
        lastSeenAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
}

export async function createReminder({
  phone,
  message,
  scheduledFor,
  timezone,
  createdFromText
}) {
  const date = new Date(scheduledFor);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid reminder date/time.");
  }

  if (date.getTime() <= Date.now()) {
    throw new Error("Reminder time must be in the future.");
  }

  const reminder = await Reminder.create({
    phone,
    message: message.trim(),
    scheduledFor: date,
    timezone: getTimeZone(timezone),
    createdFromText,
    reminderId: createReminderId()
  });

  return reminder;
}

export async function listUserReminders(phone) {
  return Reminder.find({
    phone,
    status: { $in: ["scheduled", "processing"] }
  })
    .sort({ scheduledFor: 1 })
    .limit(50);
}

export async function cancelReminder({ phone, reminderId, searchText }) {
  const filter = {
    phone,
    status: "scheduled"
  };

  if (reminderId) {
    filter.reminderId = reminderId;
  } else if (searchText) {
    filter.message = { $regex: searchText, $options: "i" };
  } else {
    throw new Error("Please provide a reminder ID or description.");
  }

  const reminder = await Reminder.findOneAndUpdate(
    filter,
    { $set: { status: "cancelled" } },
    { new: true }
  );

  return reminder;
}

export async function formatReminderList(reminders) {
  if (!reminders.length) return "You don't have any active reminders.";

  const lines = reminders.map((r, index) => {
    const time = formatReminderTime(r.scheduledFor, r.timezone);
    return `${index + 1}. ${time}\n   ${r.message}\n   ID: ${r.reminderId}`;
  });

  return `📋 Your active reminders:\n\n${lines.join("\n\n")}`;
}
