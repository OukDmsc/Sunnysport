import { createHash, randomBytes } from "node:crypto";

export function createCustomerBookingAccessToken() {
  return randomBytes(32).toString("hex");
}

export function hashCustomerBookingAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
