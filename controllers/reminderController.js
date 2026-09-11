import Reminder from "../models/Reminder.js";

export async function getReminders(req, res) {
  const status = req.query.status;

  const filter = {};
  if (status) filter.status = status;

  const reminders = await Reminder.find(filter)
    .sort({ scheduledFor: 1 })
    .limit(200);

  res.json({
    ok: true,
    count: reminders.length,
    reminders
  });
}

export async function getReminderStats(_req, res) {
  const [total, scheduled, sent, failed, cancelled] = await Promise.all([
    Reminder.countDocuments(),
    Reminder.countDocuments({ status: "scheduled" }),
    Reminder.countDocuments({ status: "sent" }),
    Reminder.countDocuments({ status: "failed" }),
    Reminder.countDocuments({ status: "cancelled" })
  ]);

  res.json({
    ok: true,
    total,
    scheduled,
    sent,
    failed,
    cancelled
  });
}

export async function cancelReminderById(req, res) {
  const reminder = await Reminder.findOneAndUpdate(
    {
      reminderId: req.params.id,
      status: "scheduled"
    },
    {
      $set: { status: "cancelled" }
    },
    { new: true }
  );

  if (!reminder) {
    return res.status(404).json({
      ok: false,
      error: "Active reminder not found."
    });
  }

  res.json({
    ok: true,
    reminder
  });
}
