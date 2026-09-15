const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

// Keep using the existing environment variable name.
// Put your OpenRouter API key inside GEMINI_API_KEY.
const apiKey = process.env.GEMINI_API_KEY;

// We intentionally use OpenRouter's free router.
// This avoids depending on the old Gemini model setting.
const model = "openrouter/free";

if (!apiKey) {
  console.warn(
    "GEMINI_API_KEY is not configured. " +
    "Add your OpenRouter API key to this existing variable."
  );
}

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

function formatHistory(history = []) {
  if (!Array.isArray(history) || history.length === 0) {
    return "No previous conversation is available.";
  }

  return history
    .slice(-5)
    .map((item) => {
      const speaker =
        item.role === "assistant"
          ? "Assistant"
          : "User";

      return `${speaker}: ${item.content}`;
    })
    .join("\n");
}

function cleanJsonResponse(text) {
  return String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function parseUserMessage({
  text,
  timezone,
  history = []
}) {
  if (!apiKey) {
    throw new Error(
      "OpenRouter is not configured. " +
      "Add your OpenRouter key to GEMINI_API_KEY."
    );
  }

  const userTimezone =
    timezone ||
    process.env.DEFAULT_TIMEZONE ||
    "Asia/Kolkata";

  const currentUtc = new Date().toISOString();
  const currentLocal = getLocalDateTime(userTimezone);

  const prompt = `
You are a smart, friendly WhatsApp reminder assistant.

RECENT CONVERSATION:
${formatHistory(history)}

NEW USER MESSAGE:
"""${text}"""

User timezone: ${userTimezone}
Current UTC time: ${currentUtc}
Current local date and time: ${currentLocal}

Use the recent conversation to understand follow-up messages.

For example:

User: Remind me to pay the electricity bill
Assistant: What time should I set it for?
User: 4:54pm today

In this example, combine the task from the earlier message
with the date and time from the latest message.

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

- Return only valid JSON.
- Do not use Markdown.
- Understand English, Hindi, and Hinglish.
- Use the recent conversation when the latest message is incomplete.
- For create_reminder, combine relevant task and time details
  from the recent conversation.
- Extract the actual task into "message".
- Do not include "remind me" in the extracted task message.
- Resolve expressions such as "in 5 minutes", "today",
  "tomorrow", "tonight", and "next Monday".
- scheduled_for_iso must contain a timezone offset.
- Never invent a date or time.
- If the date or time is unclear, use "clarify".
- For list_reminders, next_reminder, cancel_reminder,
  and edit_reminder, do not create a new reminder.
- For cancel_reminder, use reminder_id if the user gives one.
- Otherwise, place identifying words in search_text.
- creative_reply should be short, warm, friendly,
  and slightly creative.
- creative_reply must not invent reminder IDs, saved reminders,
  dates, or database results.

Return JSON with exactly these fields:

{
  "intent": "create_reminder | list_reminders | next_reminder | cancel_reminder | edit_reminder | clarify | unknown",
  "message": "",
  "scheduled_for_iso": "",
  "timezone": "",
  "reminder_id": "",
  "search_text": "",
  "clarification_question": "",
  "creative_reply": ""
}
`;

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },

    body: JSON.stringify({
      model,

      messages: [
        {
          role: "system",
          content:
            "You are a precise JSON-only reminder assistant."
        },
        {
          role: "user",
          content: prompt
        }
      ],

      temperature: 0.7,

      response_format: {
        type: "json_object"
      }
    })
  });

  const responseText = await response.text();

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = {
      raw: responseText
    };
  }

  if (!response.ok) {
    const error = new Error(
      `OpenRouter request failed with HTTP ${response.status}`
    );

    error.status = response.status;
    error.response = data;

    throw error;
  }

  const raw = data?.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error(
      "OpenRouter returned an empty response."
    );
  }

  const cleanedResponse = cleanJsonResponse(raw);

  try {
    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error(
      "OpenRouter returned invalid JSON:",
      raw
    );

    throw new Error(
      "OpenRouter returned an invalid reminder response."
    );
  }
}
