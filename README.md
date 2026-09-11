# WhatsApp AI Reminder

An AI-powered WhatsApp reminder backend using:

- Fast2SMS WhatsApp API
- Fast2SMS Flow Builder
- Gemini API
- MongoDB
- Node.js + Express
- Option A scheduler: cron + database polling
- Simple admin dashboard

## 1. Install

Requirements:

- Node.js 20+
- MongoDB
- Fast2SMS WhatsApp credentials
- Gemini API key

Run:

```bash
npm install
```

## 2. Configure environment

Copy:

```bash
cp .env.example .env
```

Fill in:

- `MONGODB_URI`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `FAST2SMS_API_KEY`
- `FAST2SMS_PHONE_NUMBER_ID`
- `FAST2SMS_REMINDER_TEMPLATE_NAME`
- `FAST2SMS_REMINDER_TEMPLATE_LANGUAGE`
- `ADMIN_API_KEY`

For India, the default timezone is:

```text
Asia/Kolkata
```

## 3. Fast2SMS reminder template

Create/approve a WhatsApp utility template in Fast2SMS/WhatsApp Business Manager that has one body variable.

Example body:

```text
🔔 Reminder: {{1}}
```

The backend sends the user's reminder text as `{{1}}`.

Scheduled reminders should normally use a WhatsApp template because they can happen outside the 24-hour session window.

## 4. Start

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Dashboard:

```text
http://localhost:3000
```

Health:

```text
GET /api/health
```

## 5. Flow Builder API endpoint

Configure your Fast2SMS Flow Builder so the `"remind"` branch calls:

```text
POST https://YOUR-DOMAIN.com/api/chat
```

The simplest JSON request expected by this project is:

```json
{
  "phone": "919876543210",
  "message": "Remind me tomorrow at 8 PM to complete my physics assignment"
}
```

The endpoint returns:

```json
{
  "ok": true,
  "reply": "..."
}
```

Map `reply` to the Flow Builder's outgoing chatbot message.

### If Fast2SMS sends different field names

The backend already accepts these common alternatives:

Phone:
- `phone`
- `from`
- `number`
- `mobile`

Message:
- `message`
- `text`
- `user_message`

If your Flow Builder sends a different structure, modify only `controllers/chatbotController.js` at the request parsing section.

## 6. Example

Input:

```text
Remind me tomorrow at 8 PM to complete my physics assignment.
```

Gemini produces structured intent information, then the backend stores a document similar to:

```json
{
  "phone": "919876543210",
  "message": "Complete my physics assignment",
  "scheduledFor": "2026-09-12T14:30:00.000Z",
  "timezone": "Asia/Kolkata",
  "status": "scheduled",
  "reminderId": "REM-82F4A1"
}
```

The cron scheduler runs every minute and finds:

```text
status = scheduled
scheduledFor <= now
```

It claims each due reminder, sends it through Fast2SMS, and changes the status to:

```text
sent
```

If sending fails:

```text
failed
```

## 7. Option A scheduler behavior

The scheduler is deliberately simple:

```text
Every minute
    ↓
Recover stale "processing" reminders
    ↓
Find due scheduled reminders
    ↓
Atomically claim each one
    ↓
Send Fast2SMS message
    ↓
Mark sent/failed
```

The atomic claim prevents two overlapping scheduler runs from normally sending the same reminder twice.

For a larger multi-instance deployment, use a proper queue/worker architecture later.

## 8. Supported chatbot actions

The Gemini parser supports:

### Create

```text
Remind me tomorrow at 8 PM to study.
```

### Relative time

```text
Remind me in 30 minutes to check my project.
```

### List

```text
What are my reminders?
```

### Cancel

```text
Cancel reminder REM-82F4A1.
```

or:

```text
Cancel my study reminder.
```

### Ambiguous time

```text
Remind me tomorrow evening to study.
```

The bot should ask for a more precise time rather than silently inventing one.

## 9. Admin API

These routes are protected by `x-admin-api-key` when `ADMIN_API_KEY` is configured.

```text
GET /api/reminders
GET /api/reminders?status=scheduled
GET /api/reminders/stats
DELETE /api/reminders/:reminderId
```

Example:

```bash
curl -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  https://YOUR-DOMAIN.com/api/reminders/stats
```

The browser dashboard uses these endpoints too. For production, consider putting proper admin authentication in front of the dashboard instead of exposing an API key in browser code.

## 10. Deployment

The application needs a hosting environment where the Node.js process stays alive continuously.

Do not deploy only the static `public/` folder: the scheduler and API need the Node process.

Make sure the deployed service has:

- Node.js 20+
- environment variables
- persistent MongoDB access
- a continuously running process

The scheduler runs inside the Node process.

## 11. Important WhatsApp note

There are two Fast2SMS sending modes represented in `services/fast2sms.js`:

- `sendReminderTemplate()` — used by the scheduler
- `sendSessionText()` — optional helper for session messages

The scheduled reminder flow uses the template endpoint because scheduled messages may occur outside the session window.

## 12. Security checklist

Before production:

- Keep `.env` out of Git.
- Use a strong `ADMIN_API_KEY`.
- Add authentication/rate limiting to `/api/chat` if the endpoint is publicly reachable.
- Validate that incoming requests really originate from your Fast2SMS Flow/webhook setup if Fast2SMS provides request-signing or authentication for that integration.
- Do not log API keys.
- Use HTTPS.
- Add database backups.
- Consider a proper admin login before exposing the dashboard.

## 13. Future upgrades

Good next additions:

1. Recurring reminders.
2. Edit reminder.
3. User-specific timezone detection.
4. Reminder confirmation/cancellation buttons.
5. Delivery-status webhook handling.
6. Retry policy for temporary Fast2SMS failures.
7. Proper admin authentication.
8. Redis/BullMQ when the number of reminders grows significantly.
