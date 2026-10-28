import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import nodemailer from "nodemailer";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  createHash, createHmac, randomBytes, randomInt, randomUUID, scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new PrismaClient();
const scrypt = promisify(scryptCallback);
const PORT = Number(process.env.PORT || 3001);
const CUSTOMER_COOKIE = "football_customer";
const ADMIN_COOKIE = "football_admin";
const DAY = 24 * 60 * 60 * 1000;
const authAttempts = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use(express.static(path.join(here, "public")));

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  return value;
}

function sign(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const content = `${header}.${body}`;
  return `${content}.${createHmac("sha256", secret()).update(content).digest("base64url")}`;
}

function verify(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = createHmac("sha256", secret()).update(`${parts[0]}.${parts[1]}`).digest();
  let actual;
  try { actual = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}

function cookieOptions(maxAge) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge };
}

function trustedOrigin(req, res, next) {
  const origin = req.get("origin");
  const host = req.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) {
      return res.status(403).json({ error: "Request origin not allowed." });
    }
  } catch {
    return res.status(403).json({ error: "Request origin not allowed." });
  }
  next();
}

function authLimit(scope, key, limit, windowMs) {
  const mapKey = `${scope}:${key}`;
  const now = Date.now();
  const item = authAttempts.get(mapKey);
  if (item && item.resetAt > now) {
    if (item.count >= limit) return true;
    item.count += 1;
  } else authAttempts.set(mapKey, { count: 1, resetAt: now + windowMs });
  if (authAttempts.size > 5000) {
    for (const [k, v] of authAttempts) if (v.resetAt <= now) authAttempts.delete(k);
  }
  return false;
}
function clearAuthLimit(scope, key) {
  authAttempts.delete(`${scope}:${key}`);
}

function requestIp(req) {
  return (req.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown").slice(0, 64);
}

async function persistentRateLimit(scope, key, limit, windowMs) {
  const storageKey = createHmac("sha256", secret()).update(`${scope}:${key}`).digest("hex");
  const now = new Date();
  for (let tries = 0; tries < 5; tries += 1) {
    const current = await db.customerAuthRateLimit.findUnique({ where: { key: storageKey } });
    if (!current) {
      try {
        await db.customerAuthRateLimit.create({ data: { key: storageKey, count: 1, resetAt: new Date(now.getTime() + windowMs) } });
        return false;
      } catch (error) {
        if (error?.code === "P2002") continue;
        throw error;
      }
    }
    if (current.resetAt <= now) {
      const changed = await db.customerAuthRateLimit.updateMany({
        where: { key: storageKey, count: current.count, resetAt: current.resetAt },
        data: { count: 1, resetAt: new Date(now.getTime() + windowMs), updatedAt: now },
      });
      if (changed.count) return false;
      continue;
    }
    if (current.count >= limit) return true;
    const changed = await db.customerAuthRateLimit.updateMany({
      where: { key: storageKey, count: current.count, resetAt: current.resetAt },
      data: { count: { increment: 1 }, updatedAt: now },
    });
    if (changed.count) return false;
  }
  throw new Error("Unable to update the authentication rate limit.");
}

function normalizeEmail(value) { return value.trim().toLowerCase(); }
function normalizePhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") ? `+855${digits.slice(1)}` : `+${digits}`;
}
function validPhone(value) {
  return typeof value === "string" && /^[+0-9 ()-]{7,24}$/.test(value.trim()) && /^\+\d{7,15}$/.test(normalizePhone(value));
}
function validCambodianPhone(value) {
  return validPhone(value) && /^\+855\d{8,9}$/.test(normalizePhone(value));
}
function validEmail(value) { return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }
function validPassword(value) { return typeof value === "string" && value.length >= 10 && value.length <= 128; }
function customerPublic(customer) {
  return { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone };
}
function setCustomerCookie(res, customer) {
  const maxAge = 7 * DAY;
  res.cookie(CUSTOMER_COOKIE, sign({
    role: "customer", sub: customer.id, sessionVersion: customer.sessionVersion,
    exp: Math.floor((Date.now() + maxAge) / 1000),
  }), cookieOptions(maxAge));
}
function setAdminCookie(res, username) {
  const maxAge = 8 * 60 * 60 * 1000;
  res.cookie(ADMIN_COOKIE, sign({
    role: "admin", username, exp: Math.floor((Date.now() + maxAge) / 1000),
  }), cookieOptions(maxAge));
}
function isAdmin(req) {
  const payload = verify(req.cookies[ADMIN_COOKIE]);
  return payload?.role === "admin" && typeof payload.username === "string";
}
async function customerSession(req) {
  const payload = verify(req.cookies[CUSTOMER_COOKIE]);
  if (payload?.role !== "customer" || typeof payload.sub !== "string") return null;
  const customer = await db.customerAccount.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, phone: true, sessionVersion: true },
  });
  return customer && customer.sessionVersion === payload.sessionVersion ? customer : null;
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Administrator sign-in required." });
  next();
}
function badJson(res, detail = "Request must be valid JSON.") {
  return res.status(400).json({ error: detail });
}
function validateBooking(input) {
  return input && typeof input === "object"
    && typeof input.fieldId === "string" && input.fieldId.length > 0 && input.fieldId.length <= 40
    && typeof input.customerName === "string" && input.customerName.trim().length >= 2 && input.customerName.trim().length <= 80
    && typeof input.phone === "string" && /^[+0-9 ()-]{7,24}$/.test(input.phone.trim())
    && typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    && typeof input.startTime === "string" && /^([01]\d|2[0-3]):(00|30)$/.test(input.startTime)
    && Number.isInteger(input.duration) && input.duration >= 1 && input.duration <= 6
    && (input.notes === undefined || (typeof input.notes === "string" && input.notes.trim().length <= 500));
}
function cambodiaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function validBookingDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.valueOf())
    && date.toISOString().slice(0, 10) === value && value >= cambodiaToday();
}
function bookingTimes(startTime, duration, openingHours = "06:00-24:00") {
  const hours = /^(2[0-3]|[01]\d):00-(24|2[0-3]|[01]\d):00$/.exec(openingHours);
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(startTime) || !hours || !Number.isInteger(duration) || duration < 1 || duration > 6) {
    throw new Error("Choose a valid start time and a duration from 1 to 6 hours.");
  }
  const start = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3));
  const close = Number(hours[2]) * 60;
  const opening = Number(hours[1]) * 60;
  const end = start + duration * 60;
  if (opening >= close || start < opening || end > close) throw new Error(`Bookings must be within opening hours (${openingHours.replace("-", " to ")}).`);
  const slots = [];
  for (let time = start; time < end; time += 30) slots.push(`${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`);
  return { slots, endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}` };
}
async function config() {
  const rows = await db.setting.findMany();
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    openingHours: values.openingHours || "06:00-24:00",
    usdToKhrRate: Number(values.usdToKhrRate || process.env.USD_TO_KHR_RATE || "4100"),
    bookingFeeKhr: Number(values.bookingFeeKhr || "5000"),
  };
}
function hashAccess(token) { return createHash("sha256").update(token).digest("hex"); }
function hashRecovery(value) { return createHmac("sha256", secret()).update(value).digest("hex"); }
function hashResetToken(token) { return hashRecovery(`customer-password-reset:${token}`); }
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [algorithm, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(encoded || "")) return false;
  const hash = await scrypt(password, salt, 64);
  const expected = Buffer.from(encoded, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}
function codeMatches(code, stored) {
  const actual = Buffer.from(hashRecovery(code), "hex");
  const expected = Buffer.from(stored, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function resetCode() { return String(randomInt(0, 1_000_000)).padStart(6, "0"); }
function deposit(total) { return Math.ceil(total * 10 / 100); }

async function sendRecoveryCode(customer, code, channel) {
  const text = `SUNNY SPORT CLUB password reset code: ${code}. Expires in 5 minutes. Do not share this code.`;
  if (channel === "email") {
    const provider = process.env.EMAIL_PROVIDER;
    if (provider === "resend" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [customer.email], subject: "Reset your SUNNY SPORT CLUB password", text }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Email provider rejected the recovery email.");
      return;
    }
    if (provider === "infobip" && process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL && process.env.INFOBIP_FROM_EMAIL) {
      const response = await fetch(`https://${process.env.INFOBIP_BASE_URL}/email/4/messages`, {
        method: "POST", headers: { authorization: `App ${process.env.INFOBIP_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ destinations: [{ to: [{ destination: customer.email }] }], sender: process.env.INFOBIP_FROM_EMAIL, content: { subject: "Reset your SUNNY SPORT CLUB password", text } }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Email provider rejected the recovery email.");
      return;
    }
    if (provider === "smtp" && process.env.SMTP_HOST && process.env.SMTP_FROM) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      await transporter.sendMail({ from: process.env.SMTP_FROM, to: customer.email, subject: "Reset your SUNNY SPORT CLUB password", text });
      return;
    }
    throw new Error("The selected email provider is not configured.");
  }
  const provider = process.env.SMS_PROVIDER;
  if (provider === "infobip" && process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL && process.env.INFOBIP_SMS_SENDER) {
    const response = await fetch(`https://${process.env.INFOBIP_BASE_URL}/sms/3/messages`, {
      method: "POST", headers: { authorization: `App ${process.env.INFOBIP_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ sender: process.env.INFOBIP_SMS_SENDER, destinations: [{ to: normalizePhone(customer.phone).slice(1) }], content: { text } }] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("SMS provider rejected the recovery message.");
    const result = await response.json().catch(() => null);
    const status = result?.messages?.[0]?.status;
    if (!(status?.groupName === "PENDING" || /PENDING|ACCEPTED/i.test(status?.name || ""))) {
      throw new Error("SMS provider did not accept the recovery message.");
    }
    return;
  }
  if (provider === "twilio" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const body = new URLSearchParams({ To: normalizePhone(customer.phone), From: process.env.TWILIO_PHONE_NUMBER, Body: text });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("SMS provider rejected the recovery message.");
    return;
  }
  throw new Error("The selected SMS provider is not configured.");
}

function hasDeliveryConfig(channel) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return false;
  if (channel === "email") {
    return (process.env.EMAIL_PROVIDER === "resend" && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM)
      || (process.env.EMAIL_PROVIDER === "smtp" && !!process.env.SMTP_HOST && !!process.env.SMTP_FROM)
      || (process.env.EMAIL_PROVIDER === "infobip" && !!process.env.INFOBIP_API_KEY && !!process.env.INFOBIP_BASE_URL && !!process.env.INFOBIP_FROM_EMAIL);
  }
  return (process.env.SMS_PROVIDER === "infobip" && !!process.env.INFOBIP_API_KEY && !!process.env.INFOBIP_BASE_URL && !!process.env.INFOBIP_SMS_SENDER)
    || (process.env.SMS_PROVIDER === "twilio" && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_PHONE_NUMBER);
}
async function telegram(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return { delivered: false, reason: "Telegram is not configured." };
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { delivered: false, reason: "Telegram rejected the notification." };
    const result = await response.json();
    return result?.ok ? { delivered: true } : { delivered: false, reason: "Telegram rejected the notification." };
  } catch {
    return { delivered: false, reason: "Telegram could not be reached." };
  }
}
async function notifyBooking(booking, event) {
  const row = booking.field ? booking : await db.booking.findUnique({ where: { id: booking.id }, include: { field: true } });
  if (!row) return { delivered: false, reason: "Booking not found." };
  const amount = row.paymentStatus === "PAID" ? row.amountPaidCents : deposit(row.totalCents);
  return telegram([
    `⚽ ${event}`, `Booking ID: #${row.reference}`, `Customer: ${row.customerName}`, `Phone: ${row.phone}`,
    `Field: ${row.field.name}`, `Date: ${row.date}`, `Time: ${row.startTime} - ${row.endTime}`,
    `Total: $${(row.totalCents / 100).toFixed(2)}`, `Deposit: $${(amount / 100).toFixed(2)}`, `Payment: ${row.paymentStatus}`,
  ].join("\n"));
}
function bookingRef() {
  const ymd = cambodiaToday().replaceAll("-", "");
  return `FB${ymd}${randomUUID().slice(0, 6).toUpperCase()}`;
}

app.get("/api/admin/me", (req, res) => res.json({ authenticated: isAdmin(req) }));
app.post("/api/admin/login", trustedOrigin, (req, res) => {
  const ip = requestIp(req);
  if (authLimit("admin-login", ip, 8, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || username.length > 100 || password.length > 200) return badJson(res, "Enter a valid username and password.");
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) return res.status(503).json({ error: "Administrator login is not configured." });
  const equal = (a, b) => {
    const x = Buffer.from(a); const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };
  if (!equal(username, process.env.ADMIN_USERNAME) || !equal(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  clearAuthLimit("admin-login", ip);
  setAdminCookie(res, username);
  res.json({ ok: true });
});
app.post("/api/admin/logout", trustedOrigin, (req, res) => res.clearCookie(ADMIN_COOKIE, cookieOptions(0)).json({ ok: true }));
app.post("/api/customer/logout", trustedOrigin, (req, res) => res.clearCookie(CUSTOMER_COOKIE, cookieOptions(0)).json({ ok: true }));

app.get("/api/customer/me", async (req, res) => {
  try {
    const customer = await customerSession(req);
    res.json(customer ? { authenticated: true, customer: customerPublic(customer) } : { authenticated: false });
  } catch { res.status(500).json({ error: "Unable to check customer sign-in." }); }
});
app.post("/api/customer/register", trustedOrigin, async (req, res) => {
  if (authLimit("register", requestIp(req), 5, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many account creation attempts. Try again later." });
  const { name, email, phone, password } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80 || !validEmail(email) || !validPhone(phone) || !validPassword(password)) {
    return badJson(res, "Enter your name, a valid email address, a valid phone number, and a password of at least 10 characters.");
  }
  try {
    const customer = await db.customerAccount.create({ data: { name: name.trim(), email: normalizeEmail(email), phone: normalizePhone(phone), passwordHash: await hashPassword(password) } });
    setCustomerCookie(res, customer);
    res.status(201).json({ customer: customerPublic(customer) });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "An account already uses that email address or phone number." });
    res.status(500).json({ error: "Unable to create the customer account." });
  }
});
app.post("/api/customer/login", trustedOrigin, async (req, res) => {
  const ip = requestIp(req);
  if (authLimit("customer-login", ip, 8, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
  const { identifier, password } = req.body || {};
  if (typeof identifier !== "string" || identifier.trim().length < 3 || identifier.length > 254 || typeof password !== "string" || !password.length || password.length > 128) {
    return badJson(res, "Enter your email or phone number and password.");
  }
  try {
    const customer = await db.customerAccount.findFirst({ where: identifier.includes("@") ? { email: normalizeEmail(identifier) } : { phone: normalizePhone(identifier) } });
    if (!customer || !(await verifyPassword(password, customer.passwordHash))) return res.status(401).json({ error: "Email/phone or password is incorrect." });
    clearAuthLimit("customer-login", ip);
    setCustomerCookie(res, customer);
    res.json({ customer: customerPublic(customer) });
  } catch { res.status(500).json({ error: "Unable to sign in right now." }); }
});

app.get("/api/fields", async (req, res) => {
  try { res.json(await db.field.findMany({ where: isAdmin(req) ? {} : { active: true }, orderBy: { name: "asc" } })); }
  catch { res.status(500).json({ error: "Unable to load fields." }); }
});
app.get("/api/public-config", async (req, res) => {
  try { res.json(await config()); } catch { res.status(500).json({ error: "Unable to load booking configuration." }); }
});
app.get("/api/availability", async (req, res) => {
  const { fieldId, date } = req.query;
  if (typeof fieldId !== "string" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return badJson(res, "A field and valid date are required.");
  try {
    const rows = await db.bookingSlot.findMany({ where: { fieldId, date, booking: { status: { not: "CANCELLED" } } }, select: { time: true } });
    res.json({ unavailable: rows.map((row) => row.time) });
  } catch { res.status(500).json({ error: "Unable to load availability." }); }
});
app.get("/api/bookings", requireAdmin, async (req, res) => {
  try {
    const where = typeof req.query.date === "string" ? { date: req.query.date } : {};
    res.json(await db.booking.findMany({ where, include: { field: true }, orderBy: [{ date: "desc" }, { startTime: "asc" }], take: 500 }));
  } catch { res.status(500).json({ error: "Unable to load bookings." }); }
});
app.post("/api/bookings", trustedOrigin, async (req, res) => {
  const admin = isAdmin(req);
  let customer = null;
  try { if (!admin) customer = await customerSession(req); }
  catch { /* Treat unavailable customer sessions as signed out. */ }
  if (!admin && !customer) return res.status(401).json({ error: "Sign in to a customer account before booking.", errorCode: "CUSTOMER_SIGN_IN_REQUIRED" });
  const input = req.body;
  if (!validateBooking(input)) return res.status(400).json({ error: "Please check the booking details and try again.", errorCode: "INVALID_BOOKING_DETAILS" });
  if (!validBookingDate(input.date)) return res.status(400).json({ error: "Choose a valid date that is not in the past.", errorCode: "INVALID_BOOKING_DATE" });
  if (new Date(`${input.date}T${input.startTime}:00+07:00`).getTime() <= Date.now()) return res.status(400).json({ error: "Choose a start time in the future.", errorCode: "BOOKING_TIME_PASSED" });
  try {
    const field = await db.field.findFirst({ where: { id: input.fieldId, active: true } });
    if (!field) return res.status(404).json({ error: "That field is unavailable.", errorCode: "FIELD_NOT_AVAILABLE" });
    const settings = await config();
    const { slots, endTime } = bookingTimes(input.startTime, input.duration, settings.openingHours);
    const feeCents = Math.round(settings.bookingFeeKhr * 100 / settings.usdToKhrRate);
    const token = randomBytes(32).toString("hex");
    const url = process.env.KHQR_PAYMENT_URL || null;
    const booking = await db.$transaction((tx) => tx.booking.create({
      data: {
        reference: bookingRef(), customerName: customer?.name ?? input.customerName.trim(), phone: customer?.phone ?? normalizePhone(input.phone),
        notes: (input.notes || "").trim(), date: input.date, startTime: input.startTime, duration: input.duration, endTime,
        totalCents: field.hourlyRateCents * input.duration + feeCents, bookingFeeCents: feeCents, fieldId: field.id,
        customerAccountId: customer?.id,
        slots: { create: slots.map((time) => ({ fieldId: field.id, date: input.date, time })) },
        customerAccess: { create: { tokenHash: hashAccess(token) } },
      },
      include: { field: true },
    }));
    const notification = await notifyBooking(booking, "NEW FOOTBALL FIELD BOOKING");
    return res.status(201).json({
      booking, customerAccessToken: token,
      payment: {
        mode: "MANUAL_KHQR", qrImageUrl: process.env.KHQR_IMAGE_URL || null, paymentUrl: url,
        paymentQrDataUrl: null, depositCents: deposit(booking.totalCents), bookingFeeCents: booking.bookingFeeCents,
        instructions: process.env.KHQR_PAYMENT_INSTRUCTIONS || "Pay the required 10% deposit using the KHQR link. Check the amount in PayWay before paying and include your booking reference.",
      }, notification,
    });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "That time was just booked. Please select another slot.", errorCode: "BOOKING_SLOT_CONFLICT" });
    if (/Bookings must|Choose a valid/.test(error.message || "")) return res.status(400).json({ error: error.message, errorCode: "INVALID_BOOKING_TIME" });
    res.status(500).json({ error: "Unable to create booking.", errorCode: "BOOKING_CREATE_FAILED" });
  }
});

app.patch("/api/bookings/:id", trustedOrigin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const current = await db.booking.findUnique({ where: { id }, include: { field: true } });
  if (!current) return res.status(404).json({ error: "Booking not found." });
  if (current.status === "CANCELLED") return res.status(409).json({ error: "This booking is already cancelled." });
  try {
    if (req.body?.action === "cancel") {
      const booking = await db.$transaction(async (tx) => {
        const changed = await tx.booking.updateMany({
          where: { id, status: current.status, paymentStatus: current.paymentStatus },
          data: { status: "CANCELLED", paymentStatus: current.paymentStatus === "PENDING" ? "CANCELLED" : current.paymentStatus },
        });
        if (changed.count !== 1) throw new Error("BOOKING_UPDATE_CONFLICT");
        await tx.bookingSlot.deleteMany({ where: { bookingId: id } });
        return tx.booking.findUnique({ where: { id }, include: { field: true } });
      });
      return res.json({ booking, notification: await notifyBooking(booking, "BOOKING CANCELLED") });
    }
    const { date, startTime } = req.body || {};
    if (req.body?.action !== "reschedule" || typeof date !== "string" || typeof startTime !== "string") return badJson(res, "Choose cancel or provide a valid new date and start time.");
    if (!validBookingDate(date) || new Date(`${date}T${startTime}:00+07:00`).getTime() <= Date.now()) return badJson(res, "Choose a valid future date and time.");
    const settings = await config();
    const { slots, endTime } = bookingTimes(startTime, current.duration, settings.openingHours);
    const booking = await db.$transaction(async (tx) => {
      await tx.bookingSlot.deleteMany({ where: { bookingId: id } });
      const changed = await tx.booking.updateMany({ where: { id, status: current.status, date: current.date, startTime: current.startTime }, data: { date, startTime, endTime } });
      if (changed.count !== 1) throw new Error("BOOKING_UPDATE_CONFLICT");
      await tx.bookingSlot.createMany({ data: slots.map((time) => ({ bookingId: id, fieldId: current.fieldId, date, time })) });
      return tx.booking.findUnique({ where: { id }, include: { field: true } });
    });
    res.json({ booking, notification: await notifyBooking(booking, "BOOKING RESCHEDULED") });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "The new time conflicts with another booking." });
    if (error.message === "BOOKING_UPDATE_CONFLICT") return res.status(409).json({ error: "This booking changed while you were editing it. Refresh and try again." });
    if (/Bookings must|Choose a valid/.test(error.message || "")) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Unable to update booking." });
  }
});

app.post("/api/customer/bookings", trustedOrigin, async (req, res) => {
  const body = req.body || {};
  if (body.action === "list") {
    if (!Array.isArray(body.tokens) || body.tokens.length > 50 || body.tokens.some((token) => typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token))) return badJson(res, "Provide valid booking access details.");
    try {
      const customer = await customerSession(req);
      const tokenHashes = body.tokens.map(hashAccess);
      const [accesses, accountBookings] = await Promise.all([
        tokenHashes.length ? db.customerBookingAccess.findMany({ where: { tokenHash: { in: tokenHashes } }, include: { booking: { include: { field: true } } }, orderBy: { booking: { createdAt: "desc" } } }) : [],
        customer ? db.booking.findMany({ where: { customerAccountId: customer.id }, include: { field: true }, orderBy: { createdAt: "desc" }, take: 50 }) : [],
      ]);
      const byId = new Map([...accountBookings, ...accesses.map((item) => item.booking)].map((booking) => [booking.id, booking]));
      return res.json({ bookings: [...byId.values()].sort((a, b) => b.createdAt - a.createdAt) });
    } catch { return res.status(500).json({ error: "Unable to load customer bookings." }); }
  }
  if (body.action !== "cancel" || (body.token && !/^[a-f0-9]{64}$/i.test(body.token)) || (body.bookingId && (typeof body.bookingId !== "string" || body.bookingId.length > 40))) return badJson(res, "Provide valid booking access details.");
  try {
    const customer = await customerSession(req);
    let booking = body.bookingId && customer
      ? await db.booking.findFirst({ where: { id: body.bookingId, customerAccountId: customer.id }, include: { field: true } })
      : null;
    if (!booking && body.token) {
      const access = await db.customerBookingAccess.findUnique({ where: { tokenHash: hashAccess(body.token) }, include: { booking: { include: { field: true } } } });
      booking = access?.booking || null;
    }
    if (!booking) return res.status(404).json({ error: "Booking access could not be verified." });
    if (booking.paymentStatus !== "PENDING" || booking.status !== "PENDING") return res.status(409).json({ error: "Only unpaid, active bookings can be cancelled by the customer." });
    const cancelled = await db.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({ where: { id: booking.id, status: "PENDING", paymentStatus: "PENDING" }, data: { status: "CANCELLED", paymentStatus: "CANCELLED" } });
      if (!changed.count) throw new Error("CUSTOMER_CANCELLATION_CONFLICT");
      await tx.bookingSlot.deleteMany({ where: { bookingId: booking.id } });
      return tx.booking.findUnique({ where: { id: booking.id }, include: { field: true } });
    });
    res.json({ booking: cancelled, notification: await notifyBooking(cancelled, "CUSTOMER CANCELLED UNPAID BOOKING") });
  } catch (error) {
    if (error.message === "CUSTOMER_CANCELLATION_CONFLICT") return res.status(409).json({ error: "This booking was paid, cancelled, or changed. Refresh and try again." });
    res.status(500).json({ error: "Unable to manage customer bookings." });
  }
});

app.post("/api/payments/:id", trustedOrigin, requireAdmin, async (req, res) => {
  const action = req.body?.action;
  if (!["verify", "fail", "refund"].includes(action)) return badJson(res, "Choose verify, fail, or refund.");
  const current = await db.booking.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Booking not found." });
  let paymentStatus; let bookingStatus; let releaseSlots = false;
  if (action === "refund") {
    if (current.paymentStatus !== "PAID") return res.status(409).json({ error: "Only verified payments can be refunded." });
    paymentStatus = "REFUNDED"; bookingStatus = "CANCELLED"; releaseSlots = true;
  } else {
    if (current.paymentStatus !== "PENDING" || current.status === "CANCELLED") return res.status(409).json({ error: "Only pending payments for active bookings can be reviewed." });
    paymentStatus = action === "verify" ? "PAID" : "FAILED";
    bookingStatus = action === "verify" ? "CONFIRMED" : "CANCELLED"; releaseSlots = action === "fail";
  }
  try {
    const booking = await db.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({
        where: { id: current.id, paymentStatus: action === "refund" ? "PAID" : "PENDING", status: current.status },
        data: {
          paymentStatus, status: bookingStatus, amountPaidCents: action === "verify" ? deposit(current.totalCents) : undefined,
          verifiedAt: action === "verify" || action === "refund" ? new Date() : null,
          verifiedBy: process.env.ADMIN_USERNAME || "admin",
        },
      });
      if (changed.count !== 1) throw new Error("PAYMENT_REVIEW_CONFLICT");
      if (releaseSlots) await tx.bookingSlot.deleteMany({ where: { bookingId: current.id } });
      return tx.booking.findUnique({ where: { id: current.id }, include: { field: true } });
    });
    const event = action === "refund" ? "REFUND RECORDED" : action === "verify" ? "PAYMENT VERIFIED — BOOKING CONFIRMED" : "PAYMENT FAILED — BOOKING RELEASED";
    res.json({ booking, notification: await notifyBooking(booking, event) });
  } catch (error) {
    if (error.message === "PAYMENT_REVIEW_CONFLICT") return res.status(409).json({ error: "This payment was already reviewed." });
    res.status(500).json({ error: "Unable to update payment status." });
  }
});

app.post("/api/admin/telegram-test", trustedOrigin, requireAdmin, async (req, res) => {
  const result = await telegram("✅ SUNNY SPORT CLUB test message: Telegram group notifications are connected.");
  if (!result.delivered) return res.status(502).json({ error: result.reason });
  res.json({ ok: true });
});
app.get("/api/reports", requireAdmin, async (req, res) => {
  const period = req.query.period || "week";
  if (!["day", "week", "month"].includes(period)) return badJson(res, "Choose day, week, or month.");
  const today = cambodiaToday();
  const start = new Date(`${today}T00:00:00Z`);
  if (period === "month") start.setUTCDate(1);
  else if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  const startDate = start.toISOString().slice(0, 10);
  const bookings = await db.booking.findMany({ where: { date: { gte: startDate, lte: today } } });
  res.json({
    period, startDate, bookingCount: bookings.length,
    revenueCents: bookings.filter((item) => item.paymentStatus === "PAID").reduce((sum, item) => sum + item.amountPaidCents, 0),
    pendingPayments: bookings.filter((item) => item.paymentStatus === "PENDING").length,
  });
});

app.post("/api/fields", trustedOrigin, requireAdmin, async (req, res) => {
  const body = req.body || {};
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 50
    || typeof body.surface !== "string" || body.surface.trim().length < 2 || body.surface.trim().length > 80
    || !Number.isInteger(body.hourlyRateCents) || body.hourlyRateCents < 0 || body.hourlyRateCents > 10000000
    || (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 250))
    || (body.active !== undefined && typeof body.active !== "boolean")) return badJson(res, "Check the field details.");
  const data = { name: body.name.trim(), surface: body.surface.trim(), hourlyRateCents: body.hourlyRateCents, description: (body.description || "").trim(), active: body.active ?? true };
  try { res.status(201).json(await db.field.create({ data })); }
  catch { res.status(409).json({ error: "Unable to create field. Check that its name is unique." }); }
});
app.patch("/api/fields", trustedOrigin, requireAdmin, async (req, res) => {
  const body = req.body || {};
  if (typeof body.id !== "string") return badJson(res, "Field ID is required.");
  const valid = typeof body.name === "string" && body.name.trim().length >= 2 && body.name.trim().length <= 50
    && typeof body.surface === "string" && body.surface.trim().length >= 2 && body.surface.trim().length <= 80
    && Number.isInteger(body.hourlyRateCents) && body.hourlyRateCents >= 0 && body.hourlyRateCents <= 10000000
    && (body.description === undefined || (typeof body.description === "string" && body.description.length <= 250))
    && (body.active === undefined || typeof body.active === "boolean");
  if (!valid) return badJson(res, "Check the field details.");
  try {
    res.json(await db.field.update({ where: { id: body.id }, data: { name: body.name.trim(), surface: body.surface.trim(), hourlyRateCents: body.hourlyRateCents, description: (body.description || "").trim(), active: body.active ?? true } }));
  } catch { res.status(400).json({ error: "Unable to update field. Check that its name is unique." }); }
});
app.get("/api/settings", requireAdmin, async (req, res) => {
  const saved = await config();
  res.json({
    ...saved, paymentMode: "Manual KHQR — admin verification required",
    telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    khqrConfigured: !!(process.env.KHQR_IMAGE_URL || process.env.KHQR_PAYMENT_URL),
    emailRecoveryConfigured: hasDeliveryConfig("email"), phoneRecoveryConfigured: hasDeliveryConfig("phone"),
  });
});
app.put("/api/settings", trustedOrigin, requireAdmin, async (req, res) => {
  const { openingHours, usdToKhrRate, bookingFeeKhr } = req.body || {};
  const hours = typeof openingHours === "string" && /^(2[0-3]|[01]\d):00-(24|2[0-3]|[01]\d):00$/.test(openingHours)
    && Number(openingHours.slice(6, 8)) > Number(openingHours.slice(0, 2));
  if (!hours || !Number.isInteger(usdToKhrRate) || usdToKhrRate < 1000 || usdToKhrRate > 10000
    || !Number.isInteger(bookingFeeKhr) || bookingFeeKhr < 0 || bookingFeeKhr > 1000000) return badJson(res, "Settings were invalid or could not be saved.");
  try {
    await db.$transaction([
      db.setting.upsert({ where: { key: "openingHours" }, update: { value: openingHours }, create: { key: "openingHours", value: openingHours } }),
      db.setting.upsert({ where: { key: "usdToKhrRate" }, update: { value: String(usdToKhrRate) }, create: { key: "usdToKhrRate", value: String(usdToKhrRate) } }),
      db.setting.upsert({ where: { key: "bookingFeeKhr" }, update: { value: String(bookingFeeKhr) }, create: { key: "bookingFeeKhr", value: String(bookingFeeKhr) } }),
    ]);
    res.json({ ok: true });
  } catch { res.status(400).json({ error: "Settings were invalid or could not be saved." }); }
});

app.post("/api/customer/forgot-password", trustedOrigin, async (req, res) => {
  const { identifier, channel } = req.body || {};
  if (typeof identifier !== "string" || identifier.trim().length < 3 || identifier.length > 254 || !["email", "phone"].includes(channel)) return badJson(res, "Enter the email address or phone number and select a recovery method.");
  const normalized = channel === "email" ? normalizeEmail(identifier) : normalizePhone(identifier);
  if (channel === "email" ? !validEmail(normalized) : !validCambodianPhone(identifier)) return badJson(res, channel === "email" ? "Enter a valid email address." : "Enter a valid Cambodian phone number, including +855.");
  if (!hasDeliveryConfig(channel)) return res.status(503).json({ error: `${channel === "email" ? "Email" : "SMS"} recovery is unavailable because the selected server provider is not configured.` });
  try {
    const limited = await Promise.all([
      persistentRateLimit("recovery-request-endpoint", "all", 100, 60 * 60 * 1000),
      persistentRateLimit("recovery-request-ip", requestIp(req), 10, 60 * 60 * 1000),
      persistentRateLimit("recovery-request-account", normalized, 3, 60 * 60 * 1000),
    ]);
    if (limited.some(Boolean)) return res.status(429).json({ error: "Too many recovery requests. Try again later." });
    const customer = await db.customerAccount.findFirst({ where: channel === "email" ? { email: normalized } : { phone: normalized } });
    if (!customer) return res.json({ message: "If an account matches the information provided, recovery instructions will be sent." });
    if (await persistentRateLimit("recovery-request-customer", customer.id, 3, 60 * 60 * 1000)) return res.json({ message: "If an account matches the information provided, recovery instructions will be sent." });
    const code = resetCode();
    const now = new Date();
    const challenge = await db.$transaction(async (tx) => {
      await tx.customerAuthChallenge.updateMany({ where: { customerAccountId: customer.id, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: now, resetTokenHash: null, resetTokenExpiresAt: null } });
      return tx.customerAuthChallenge.create({ data: {
        customerAccountId: customer.id, purpose: "PASSWORD_RESET", recoveryMethod: channel,
        emailCodeHash: channel === "email" ? hashRecovery(code) : "",
        phoneCodeHash: channel === "phone" ? hashRecovery(code) : "",
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      } });
    });
    try { await sendRecoveryCode(customer, code, channel); }
    catch {
      await db.customerAuthChallenge.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date(), emailCodeHash: "", phoneCodeHash: "" } });
      return res.json({ message: "If an account matches the information provided, recovery instructions will be sent." });
    }
    return res.json({ message: "If an account matches the information provided, recovery instructions will be sent." });
  } catch { res.status(500).json({ error: "Unable to process the recovery request right now." }); }
});
app.post("/api/customer/verify-reset-code", trustedOrigin, async (req, res) => {
  const { identifier, channel, code } = req.body || {};
  if (typeof identifier !== "string" || identifier.trim().length < 3 || !["email", "phone"].includes(channel) || typeof code !== "string" || !/^\d{6}$/.test(code)) return badJson(res, "Enter the account contact and six-digit recovery code.");
  const normalized = channel === "email" ? normalizeEmail(identifier) : normalizePhone(identifier);
  if (channel === "email" ? !validEmail(normalized) : !validCambodianPhone(identifier)) return res.status(400).json({ error: "The recovery code is invalid, expired, or already used." });
  try {
    const limits = await Promise.all([
      persistentRateLimit("recovery-verify-endpoint", "all", 300, 60 * 60 * 1000),
      persistentRateLimit("recovery-verify-ip", requestIp(req), 30, 60 * 60 * 1000),
      persistentRateLimit("recovery-verify-account", normalized, 10, 60 * 60 * 1000),
    ]);
    if (limits.some(Boolean)) return res.status(429).json({ error: "Too many verification attempts. Request a new recovery code later." });
    const customer = await db.customerAccount.findFirst({ where: channel === "email" ? { email: normalized } : { phone: normalized }, select: { id: true } });
    if (!customer || await persistentRateLimit("recovery-verify-customer", customer.id, 10, 60 * 60 * 1000)) return res.status(400).json({ error: "The recovery code is invalid, expired, or already used." });
    const challenge = await db.customerAuthChallenge.findFirst({
      where: { customerAccountId: customer.id, purpose: "PASSWORD_RESET", recoveryMethod: channel, usedAt: null, verifiedAt: null, expiresAt: { gt: new Date() }, attemptCount: { lt: 5 } },
      orderBy: { createdAt: "desc" },
    });
    const activeHash = challenge && (channel === "email" ? challenge.emailCodeHash : challenge.phoneCodeHash);
    if (!challenge || !activeHash || !codeMatches(code, activeHash)) {
      if (challenge) {
        const now = new Date();
        await db.customerAuthChallenge.updateMany({
          where: { id: challenge.id, attemptCount: challenge.attemptCount, usedAt: null, verifiedAt: null, expiresAt: { gt: now } },
          data: { attemptCount: { increment: 1 }, ...(challenge.attemptCount >= 4 ? { usedAt: now } : {}) },
        });
      }
      return res.status(400).json({ error: "The recovery code is invalid, expired, or already used." });
    }
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + 10 * 60 * 1000);
    const claimed = await db.customerAuthChallenge.updateMany({
      where: { id: challenge.id, attemptCount: challenge.attemptCount, usedAt: null, verifiedAt: null, expiresAt: { gt: now } },
      data: { verifiedAt: now, resetTokenHash: hashResetToken(token), resetTokenExpiresAt: expires },
    });
    if (!claimed.count) return res.status(400).json({ error: "The recovery code is invalid, expired, or already used." });
    res.json({ resetToken: token, expiresInSeconds: 600 });
  } catch { res.status(500).json({ error: "Unable to verify the recovery code right now." }); }
});
app.post("/api/customer/reset-password", trustedOrigin, async (req, res) => {
  const { resetToken, password, confirmPassword } = req.body || {};
  if (typeof resetToken !== "string" || resetToken.length < 40 || resetToken.length > 100 || !validPassword(password) || !validPassword(confirmPassword) || password !== confirmPassword) return badJson(res, "Enter matching passwords with at least 10 characters.");
  try {
    const tokenHash = hashResetToken(resetToken);
    const limits = await Promise.all([
      persistentRateLimit("recovery-reset-endpoint", "all", 100, 60 * 60 * 1000),
      persistentRateLimit("recovery-reset-ip", requestIp(req), 20, 60 * 60 * 1000),
      persistentRateLimit("recovery-reset-token", tokenHash, 5, 15 * 60 * 1000),
    ]);
    if (limits.some(Boolean)) return res.status(429).json({ error: "Too many password reset attempts. Try again later." });
    const challenge = await db.customerAuthChallenge.findUnique({ where: { resetTokenHash: tokenHash } });
    const now = new Date();
    if (!challenge?.verifiedAt || challenge.usedAt || !challenge.resetTokenExpiresAt || challenge.resetTokenExpiresAt <= now) return res.status(400).json({ error: "Password reset authorization is invalid or expired. Verify a new recovery code." });
    const passwordHash = await hashPassword(password);
    const changed = await db.$transaction(async (tx) => {
      const claimed = await tx.customerAuthChallenge.updateMany({
        where: { id: challenge.id, resetTokenHash: tokenHash, verifiedAt: { not: null }, usedAt: null, resetTokenExpiresAt: { gt: now } },
        data: { usedAt: now, resetTokenHash: null, resetTokenExpiresAt: null },
      });
      if (claimed.count !== 1) return false;
      await tx.customerAccount.update({ where: { id: challenge.customerAccountId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      await tx.customerAuthChallenge.updateMany({ where: { customerAccountId: challenge.customerAccountId, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: now, resetTokenHash: null, resetTokenExpiresAt: null, emailCodeHash: "", phoneCodeHash: "" } });
      return true;
    });
    if (!changed) return res.status(400).json({ error: "Password reset authorization is invalid or expired. Verify a new recovery code." });
    res.json({ passwordReset: true });
  } catch { res.status(500).json({ error: "Unable to reset the customer password right now." }); }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API endpoint not found." });
  res.sendFile(path.join(here, "public", "index.html"));
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && "body" in error) return badJson(res);
  console.error("Request failed.");
  res.status(500).json({ error: "Unable to process the request." });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`Vanilla booking app listening on http://localhost:${PORT}`));
}

export { app, db, bookingTimes, normalizePhone, validBookingDate, hasDeliveryConfig, hashPassword, verifyPassword, sendRecoveryCode };
