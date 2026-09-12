import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not configured.");
}

const ai = apiKey
  ? new GoogleGenAI({ apiKey })
  : null;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
        "create_reminder",
        "list_reminders",
        "next_reminder",
        "cancel_reminder",
        "edit_reminder",
        "clarify",
        "unknown"
      ]
    },

    message: {
      type: Type.STRING,
      description:
        "The task to remind the user about. Empty when not applicable."
    },

    scheduled_for_iso: {
      type: Type.STRING,
      description:
        "ISO datetime with timezone offset. Empty when not applicable."
    },

    timezone: {
      type: Type.STRING,
      description:
        "IANA timezone such as Asia/Kolkata."
    },

    reminder_id: {
      type: Type.STRING,
      description:
        "Reminder ID if the user explicitly mentions one."
    },

    search_text: {
      type: Type.STRING,
      description:
        "Words identifying a reminder to cancel."
    },

    clarification_question: {
      type: Type.STRING,
      description:
        "A short question if more information is required."
    },

    creative_reply: {
      type: Type.STRING,
      description:
        "A short, friendly, creative response. Do not invent IDs, dates, or database results."
    }
  },

  required: [
    "intent",
    "message",
    "scheduled_for_iso",
    "timezone",
    "reminder_id",
    "search_text",
    "clarification_question",
    "creative_reply"
  ]
};

function getLocalDateTime(timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  return formatter.format(new Date());
}

export async function parseUserMessage({ text, timezone }) {
  if (!ai) {
    throw new Error("Gemini is not configured.");
  }

  const userTimezone =
    timezone ||
    process.env.DEFAULT_TIMEZONE ||
    "Asia/Kolkata";

  const currentUtc = new Date().toISOString();
  const currentLocal = getLocalDateTime(userTimezone);

  const prompt = `
You are a smart, friendly WhatsApp reminder assistant.

User message:
"""${text}"""

User timezone: ${userTimezone}
Current UTC time: ${currentUtc}
Current local date and time: ${currentLocal}

Identify the user's intent and return only valid JSON.

Supported intents:

create_reminder:
The user wants to create a reminder.

list_reminders:
The user wants to see all active reminders.
Examples:
- list my reminders
- show my reminders
- what reminders do I have?

next_reminder:
The user wants to know their nearest upcoming reminder.
Examples:
- what is my next reminder?
- when is my next reminder?
- tell me my upcoming reminder

cancel_reminder:
The user wants to cancel an existing reminder.

edit_reminder:
The user wants to edit an existing reminder.

clarify:
Important information is missing or ambiguous.

unknown:
The message is unrelated to the reminder system.

Rules:

- Return only JSON.
- Understand English, Hindi, and Hinglish.
- For create_reminder, extract the actual task into "message".
- Resolve expressions such as "in 5 minutes", "tomorrow", and "next Monday".
- scheduled_for_iso must contain a timezone offset.
- Never invent a date or time.
- If the date or time is unclear, use "clarify".
- For list_reminders, next_reminder, cancel_reminder, and edit_reminder, do not create a new reminder.
- For cancel_reminder, use reminder_id if the user gives one.
- Otherwise, place identifying words in search_text.
- Do not include "remind me" in the extracted task message.
- creative_reply should be short, warm, and slightly creative.
- creative_reply must not invent reminder IDs, saved reminders, dates, or results.
`;

  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.7
    }
  });

  const raw = result.text?.trim();

  if (!raw) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(raw);
    }
