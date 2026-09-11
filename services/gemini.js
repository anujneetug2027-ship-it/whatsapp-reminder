import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not configured.");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const reminderSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ["create_reminder", "list_reminders", "cancel_reminder", "edit_reminder", "clarify", "unknown"]
    },
    message: {
      type: Type.STRING,
      description: "The concise action/task to remind the user about. Empty when not applicable."
    },
    scheduled_for_iso: {
      type: Type.STRING,
      description: "An ISO 8601 datetime with timezone offset when a precise reminder time is known. Empty when clarification is required."
    },
    timezone: {
      type: Type.STRING,
      description: "IANA timezone such as Asia/Kolkata."
    },
    reminder_id: {
      type: Type.STRING,
      description: "Reminder ID if the user explicitly gives one. Otherwise empty."
    },
    search_text: {
      type: Type.STRING,
      description: "Text identifying a reminder to cancel/edit, if needed."
    },
    clarification_question: {
      type: Type.STRING,
      description: "Short question to ask when essential information is missing or ambiguous."
    }
  },
  required: ["intent", "message", "scheduled_for_iso", "timezone", "reminder_id", "search_text", "clarification_question"]
};

function getNowContext(timeZone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  return formatter.format(now);
}

export async function parseUserMessage({ text, timezone }) {
  if (!ai) throw new Error("Gemini is not configured.");

  const tz = timezone || process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";
  const now = new Date().toISOString();
  const localNow = getNowContext(tz);

  const prompt = `
You are the intent and time parser for a WhatsApp reminder bot.

User message:
"""${text}"""

User timezone: ${tz}
Current UTC time: ${now}
Current local date/time in that timezone: ${localNow}

Rules:
1. Return ONLY the requested JSON structure.
2. For a create_reminder intent, extract the actual task as "message".
3. Resolve relative dates/times such as "in 2 hours", "tomorrow at 8 PM", "Monday morning", etc.
4. Do not invent a precise time when the user did not provide enough information. For phrases like "tomorrow evening" without a clear convention, use "clarify".
5. scheduled_for_iso must include a timezone offset.
6. Reject times in the past. If the requested time is ambiguous or already passed, use "clarify".
7. The user's original wording may be in English, Hindi, or Hinglish.
8. For list/cancel/edit requests, do not create a new reminder.
9. A reminder message should not include the words "remind me"; extract only what the user wants to be reminded about.
10. If the message is unrelated to reminders, use "unknown".
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: reminderSchema,
      temperature: 0
    }
  });

  const raw = response.text?.trim();
  if (!raw) throw new Error("Gemini returned an empty response.");

  return JSON.parse(raw);
}
