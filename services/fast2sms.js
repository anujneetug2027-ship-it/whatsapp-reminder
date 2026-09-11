const baseUrl = "https://www.fast2sms.com/dev/whatsapp";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

async function fast2smsRequest(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`Fast2SMS request failed with HTTP ${response.status}`);
    error.status = response.status;
    error.response = data;
    throw error;
  }

  return data;
}

/**
 * Sends a reminder using an approved WhatsApp template.
 *
 * The template should have one BODY variable:
 *   "🔔 Reminder: {{1}}"
 *
 * This is used because scheduled reminders can be outside the
 * 24-hour customer-service/session window.
 */
export async function sendReminderTemplate({ phone, message, reminderId }) {
  const apiKey = required("FAST2SMS_API_KEY");
  const version = process.env.FAST2SMS_WHATSAPP_VERSION || "v26.0";
  const phoneNumberId = required("FAST2SMS_PHONE_NUMBER_ID");
  const templateName = required("FAST2SMS_REMINDER_TEMPLATE_NAME");
  const languageCode = process.env.FAST2SMS_REMINDER_TEMPLATE_LANGUAGE || "en_US";

  const url = `${baseUrl}/${version}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: message }
          ]
        }
      ]
    }
  };

  return fast2smsRequest(url, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

/**
 * Optional session-message helper.
 * Use this only when the recipient is inside WhatsApp's
 * allowed session window. Scheduled reminders should normally
 * use sendReminderTemplate().
 */
export async function sendSessionText({ phone, message, reminderId }) {
  const apiKey = required("FAST2SMS_API_KEY");
  const phoneNumberId = required("FAST2SMS_PHONE_NUMBER_ID");

  const url = "https://www.fast2sms.com/dev/whatsapp-session";

  return fast2smsRequest(url, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      phone_number_id: phoneNumberId,
      to: phone,
      type: "text",
      text: message,
      udf1: reminderId || ""
    })
  });
}
