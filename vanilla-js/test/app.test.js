import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-thirty-two-characters";
const { bookingTimes, normalizePhone, validBookingDate, hasDeliveryConfig, hashPassword, verifyPassword, sendRecoveryCode } =
  await import("../server.js");

test("booking slot calculation handles half-hour slots and closing time", () => {
  const result = bookingTimes("22:30", 1, "06:00-24:00");
  assert.equal(result.endTime, "23:30");
  assert.deepEqual(result.slots, ["22:30", "23:00"]);
  assert.throws(() => bookingTimes("23:30", 1, "06:00-24:00"), /opening hours/);
});

test("phone normalization and Cambodian booking-date validation", () => {
  assert.equal(normalizePhone("012 345 678"), "+85512345678");
  assert.equal(normalizePhone("+855 12 345 678"), "+85512345678");
  assert.equal(validBookingDate("2026-02-31"), false);
  assert.equal(validBookingDate("2020-01-01"), false);
});

test("customer password hashes use scrypt and verify without exposing the password", async () => {
  const stored = await hashPassword("test-password-123");
  assert.match(stored, /^scrypt\$[a-f0-9]+\$[a-f0-9]{128}$/);
  assert.equal(await verifyPassword("test-password-123", stored), true);
  assert.equal(await verifyPassword("incorrect-password", stored), false);
});

test("delivery configuration requires explicit server provider configuration", () => {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-api-key";
  process.env.EMAIL_FROM = "booking@example.test";
  assert.equal(hasDeliveryConfig("email"), true);
  delete process.env.EMAIL_FROM;
  assert.equal(hasDeliveryConfig("email"), false);
  process.env.SMS_PROVIDER = "infobip";
  process.env.INFOBIP_API_KEY = "test-api-key";
  process.env.INFOBIP_BASE_URL = "example.api.infobip.com";
  process.env.INFOBIP_SMS_SENDER = "SUNNY";
  assert.equal(hasDeliveryConfig("phone"), true);
  delete process.env.INFOBIP_SMS_SENDER;
  assert.equal(hasDeliveryConfig("phone"), false);
});

test("provider calls use mocked HTTP and accept only successful responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ status: { name: "PENDING_ACCEPTED", groupName: "PENDING" } }] }),
    };
  };
  try {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-api-key";
    process.env.EMAIL_FROM = "booking@example.test";
    await sendRecoveryCode({ email: "customer@example.test", phone: "+85512345678" }, "123456", "email");
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(JSON.parse(calls[0].options.body).text.includes("123456"), true);

    calls.length = 0;
    process.env.SMS_PROVIDER = "infobip";
    process.env.INFOBIP_API_KEY = "test-api-key";
    process.env.INFOBIP_BASE_URL = "example.api.infobip.com";
    process.env.INFOBIP_SMS_SENDER = "SUNNY";
    await sendRecoveryCode({ email: null, phone: "+85512345678" }, "654321", "phone");
    assert.equal(calls[0].url, "https://example.api.infobip.com/sms/3/messages");
    const sms = JSON.parse(calls[0].options.body).messages[0];
    assert.equal(sms.destinations[0].to, "85512345678");
    assert.match(sms.content.text, /654321/);

    globalThis.fetch = async () => ({ ok: false, status: 502 });
    await assert.rejects(
      sendRecoveryCode({ email: "customer@example.test" }, "123456", "email"),
      /Email provider rejected/,
    );

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ status: { name: "MESSAGE_REJECTED", groupName: "REJECTED" } }] }),
    });
    await assert.rejects(
      sendRecoveryCode({ phone: "+85512345678" }, "123456", "phone"),
      /did not accept/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
