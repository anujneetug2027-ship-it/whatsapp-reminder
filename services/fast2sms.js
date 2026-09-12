const baseUrl = "https://www.fast2sms.com/dev/whatsapp";

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing.`);
  }

  return value;
}

/**
 * Sends a scheduled reminder through an approved WhatsApp template.
 */
export async function sendReminderTemplate({ phone, message }) {
  const apiKey = required("FAST2SMS_API_KEY");
  const messageId = required("FAST2SMS_REMINDER_MESSAGE_ID");
  const phoneNumberId = required("FAST2SMS_PHONE_NUMBER_ID");

  const url = new URL(baseUrl);

  url.searchParams.set("authorization", apiKey);
  url.searchParams.set("message_id", messageId);
  url.searchParams.set("phone_number_id", phoneNumberId);
  url.searchParams.set("numbers", phone);
  url.searchParams.set("variables_values", message);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(
      `Fast2SMS request failed with HTTP ${response.status}`
    );

    error.status = response.status;
    error.response = data;

    throw error;
  }

  return data;
}

/**
 * Sends an ordinary text reply during the WhatsApp session window.
 *
 * This does not require a template ID.
 */
export async function sendSessionText({ phone, message }) {
  const apiKey = required("FAST2SMS_API_KEY");
  const phoneNumberId = required("FAST2SMS_PHONE_NUMBER_ID");

  const url = new URL(
    "https://www.fast2sms.com/dev/whatsapp-session"
  );

  url.searchParams.set("authorization", apiKey);
  url.searchParams.set("phone_number_id", phoneNumberId);
  url.searchParams.set("to", phone);
  url.searchParams.set("type", "text");
  url.searchParams.set("text", message);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(
      `Fast2SMS session request failed with HTTP ${response.status}`
    );

    error.status = response.status;
    error.response = data;

    throw error;
  }

  return data;
}
