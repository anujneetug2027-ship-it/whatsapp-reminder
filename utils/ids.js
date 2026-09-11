import crypto from "node:crypto";

export function createReminderId() {
  return `REM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
