import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    message: { type: String, required: true, maxlength: 1000 },

    scheduledFor: { type: Date, required: true, index: true },
    timezone: { type: String, default: process.env.DEFAULT_TIMEZONE || "Asia/Kolkata" },

    status: {
      type: String,
      enum: ["scheduled", "processing", "sent", "failed", "cancelled"],
      default: "scheduled",
      index: true
    },

    reminderId: { type: String, required: true, unique: true, index: true },

    createdFromText: { type: String, maxlength: 2000 },

    sentAt: Date,
    failedAt: Date,
    failureReason: String,

    processingStartedAt: Date,
    fast2smsResponse: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

reminderSchema.index({ status: 1, scheduledFor: 1 });

export default mongoose.model("Reminder", reminderSchema);
