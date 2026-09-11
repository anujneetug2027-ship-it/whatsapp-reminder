import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    timezone: { type: String, default: process.env.DEFAULT_TIMEZONE || "Asia/Kolkata" },
    lastSeenAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
