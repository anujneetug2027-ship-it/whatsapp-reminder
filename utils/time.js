const DEFAULT_TZ = process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";

export function isValidTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getTimeZone(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TZ;
}

export function formatReminderTime(date, timeZone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: getTimeZone(timeZone),
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
