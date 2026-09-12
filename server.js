import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { connectDatabase } from "./services/database.js";
import chatbotRoutes from "./routes/chatbot.js";
import reminderRoutes from "./routes/reminders.js";
import webhookRoutes from "./routes/webhook.js";
import { startScheduler } from "./services/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "whatsapp-ai-reminder",
    time: new Date().toISOString()
  });
});

app.use("/api/chat", chatbotRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/webhook", webhookRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await connectDatabase();
  startScheduler();

  app.listen(port, () => {
    console.log(`Reminder server running on port ${port}`);
    console.log(`Admin dashboard: http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
