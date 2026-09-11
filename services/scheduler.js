import cron from "node-cron";
import Reminder from "../models/Reminder.js";
import { sendReminderTemplate } from "./fast2sms.js";

const cronExpression = process.env.SCHEDULER_CRON || "* * * * *";
const batchSize = Number(process.env.SCHEDULER_BATCH_SIZE || 100);
const lockMinutes = Number(process.env.SCHEDULER_LOCK_MINUTES || 10);

let running = false;

async function claimDueReminders() {
  const now = new Date();
  const lockCutoff = new Date(Date.now() - lockMinutes * 60 * 1000);

  // Recover jobs stuck in "processing" after a server crash.
  await Reminder.updateMany(
    {
      status: "processing",
      processingStartedAt: { $lt: lockCutoff }
    },
    {
      $set: { status: "scheduled" },
      $unset: { processingStartedAt: 1 }
    }
  );

  const reminders = [];

  for (let i = 0; i < batchSize; i++) {
    const reminder = await Reminder.findOneAndUpdate(
      {
        status: "scheduled",
        scheduledFor: { $lte: now }
      },
      {
        $set: {
          status: "processing",
          processingStartedAt: new Date()
        }
      },
      {
        sort: { scheduledFor: 1 },
        new: true
      }
    );

    if (!reminder) break;
    reminders.push(reminder);
  }

  return reminders;
}

async function processDueReminders() {
  if (running) return;
  running = true;

  try {
    const reminders = await claimDueReminders();

    for (const reminder of reminders) {
      try {
        const response = await sendReminderTemplate({
          phone: reminder.phone,
          message: reminder.message,
          reminderId: reminder.reminderId
        });

        await Reminder.updateOne(
          { _id: reminder._id },
          {
            $set: {
              status: "sent",
              sentAt: new Date(),
              fast2smsResponse: response
            },
            $unset: {
              processingStartedAt: 1
            }
          }
        );

        console.log(`Reminder ${reminder.reminderId} sent to ${reminder.phone}`);
      } catch (error) {
        console.error(`Reminder ${reminder.reminderId} failed:`, error);

        await Reminder.updateOne(
          { _id: reminder._id },
          {
            $set: {
              status: "failed",
              failedAt: new Date(),
              failureReason: error.message,
              fast2smsResponse: error.response || null
            },
            $unset: {
              processingStartedAt: 1
            }
          }
        );
      }
    }
  } catch (error) {
    console.error("Scheduler error:", error);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  cron.schedule(
    cronExpression,
    () => {
      processDueReminders();
    },
    {
      timezone: process.env.DEFAULT_TIMEZONE || "Asia/Kolkata"
    }
  );

  console.log(`Scheduler started with cron: ${cronExpression}`);
  processDueReminders();
}
