const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

// Keep the existing environment variable name.
// Store your OpenRouter API key in GEMINI_API_KEY.
const apiKey = process.env.GEMINI_API_KEY;

// OpenRouter's free model router.
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
        item.role === "assistant" ? "Assistant" : "User";

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

USER TIMEZONE:
${userTimezone}

CURRENT UTC TIME:
${currentUtc}

CURRENT LOCAL DATE AND TIME:
${currentLocal}

Use the recent conversation to understand incomplete follow-up messages.

Example:

User: Remind me to pay the electricity bill
Assistant: What time should I set it for?
User: 4:54pm today

In this example, the final message is a continuation of the
earlier message. Combine the task from the earlier message with
the date and time from the latest message.

SUPPORTED INTENTS:

create_reminder:
The user wants to create a reminder.

list_reminders:
The user wants to see all active reminders.

next_reminder:
The user wants to know the nearest upcoming reminder.

cancel_reminder:
The user wants to cancel an existing reminder.

edit_reminder:
The user wants to edit an existing reminder.

clarify:
Important information is missing or ambiguous.

unknown:
The message is unrelated to the reminder system.

DATE AND TIME RULES:

- If the user mentions only a day number, such as "20", "on 20",
  or "20th", interpret it as that day of the CURRENT MONTH in
  the user's timezone, unless another month or year is explicitly
  mentioned.

- Example:
  "Remind me to pay electricity bill on 20 at 12 noon"
  means the 20th day of the current month at 12:00 PM.

- "12 noon" means 12:00 PM.
- "12 midnight" means 12:00 AM.
- "4:54pm" means 16:54.
- "tomorrow" must be calculated using the user's timezone.
- "tonight" means the evening of the current day.
- If a month is explicitly mentioned, use that month.
- If a year is explicitly mentioned, use that year.
- If the requested date and time have already passed, do not silently
  schedule it in the past. Use "clarify" and ask whether the user
  means the next month or another date.
- Never invent a date or time.
- scheduled_for_iso must contain a timezone offset.

LANGUAGE RULES:

- Reply in the same language style used by the user.
- If the user writes in English, use natural English.
- If the user writes in Hindi using Devanagari, reply in Hindi.
- If the user writes in Hinglish using English letters, reply in
  Hinglish using English letters.
- Do not force English when the user is speaking Hinglish.
- Keep replies friendly, natural, and concise.

REMINDER MESSAGE RULES:

- For create_reminder, write a short, natural, slightly creative
  notification in the "message" field.
- Do not include the words "remind me" in the reminder message.
- Make the reminder sound like a friendly personal nudge.
- Keep it directly related to the user's task.
- Do not invent extra tasks, amounts, dates, or details.
- Put the complete reminder notification in WhatsApp bold format
  using SINGLE asterisks.
- Use *text*, not **text**.

Examples:

*Aaj electricity bill bharna hai, yaad hai? 💡*

*Electricity bill ka time ho gaya hai—payment kar dena. ⚡*

*Aaj revision karna hai. Ready ho? 📚*

WHATSAPP RESPONSE RULES:

- creative_reply should be short, warm, friendly, and slightly creative.
- Write creative_reply in the same language style as the user.
- Do not put the actual reminder notification inside creative_reply.
- Do not invent reminder IDs, saved reminders, dates, or database results.
- The backend will add the actual reminder ID and confirmed time.

GENERAL RULES:

- Return only valid JSON.
- Do not use Markdown outside the required WhatsApp asterisks
  inside the "message" field.
- Understand English, Hindi, and Hinglish.
- Use recent conversation history when the latest message is incomplete.
- For create_reminder, combine relevant task and time details
  from previous messages.
- For list_reminders, next_reminder, cancel_reminder, and edit_reminder,
  do not create a new reminder.
- For cancel_reminder, use reminder_id if the user gives one.
- Otherwise, place identifying words in search_text.
- If important information is missing, use "clarify".

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
            "You are a precise JSON-only WhatsApp reminder assistant."
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

  const raw =
    data?.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error(
      "OpenRouter returned an empty assistant response."
    );
  }

  const cleanedResponse = cleanJsonResponse(raw);

  let parsed;

  try {
    parsed = JSON.parse(cleanedResponse);
  } catch {
    // Some free-model routes occasionally return a safety/status string
    // instead of the requested JSON (for example: "User Safety: safe").
    // Do not turn that provider/model quirk into a webhook 500 or retry storm.
    console.warn(
      "OpenRouter returned non-JSON content; using safe fallback.",
      {
        model,
        contentPreview: String(raw).slice(0, 160)
      }
    );

    return {
      intent: "unknown",
      message: "",
      scheduled_for_iso: "",
      timezone: userTimezone,
      reminder_id: "",
      search_text: "",
      clarification_question: "",
      creative_reply: ""
    };
  }

  // Validate the model output before it reaches reminder/database logic.
  const allowedIntents = new Set([
    "create_reminder",
    "list_reminders",
    "next_reminder",
    "cancel_reminder",
    "edit_reminder",
    "clarify",
    "unknown"
  ]);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !allowedIntents.has(parsed.intent)
  ) {
    console.warn(
      "OpenRouter returned JSON with an invalid schema; using safe fallback.",
      { model }
    );

    return {
      intent: "unknown",
      message: "",
      scheduled_for_iso: "",
      timezone: userTimezone,
      reminder_id: "",
      search_text: "",
      clarification_question: "",
      creative_reply: ""
    };
  }

  // Normalize every expected field to a string. This prevents malformed
  // model output (nulls, numbers, arrays) from breaking controller logic.
  const stringFields = [
    "message",
    "scheduled_for_iso",
    "timezone",
    "reminder_id",
    "search_text",
    "clarification_question",
    "creative_reply"
  ];

  for (const field of stringFields) {
    if (typeof parsed[field] !== "string") {
      parsed[field] = "";
    }
  }

  if (!parsed.timezone) {
    parsed.timezone = userTimezone;
  }

  return parsed;
}
  
