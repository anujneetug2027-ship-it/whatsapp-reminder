export function normalizePhone(phone) {
  if (!phone) return null;

  const value = String(phone).trim().replace(/[^\d+]/g, "");

  // Keep an E.164-style value. If Fast2SMS gives an Indian number without
  // country code, add +91 as a convenience.
  if (/^\d{10}$/.test(value)) return `91${value}`;
  if (/^\+/.test(value)) return value.slice(1);
  return value;
}
