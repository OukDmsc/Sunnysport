import { z } from "zod";

type SmsProvider = "infobip" | "twilio";

function configuredProvider(): SmsProvider | null {
  const provider = process.env.SMS_PROVIDER;
  return provider === "infobip" || provider === "twilio" ? provider : null;
}

function validInfobipBaseUrl(value: string | undefined) {
  return Boolean(value && /^[a-z0-9.-]+\.api\.infobip\.com$/i.test(value));
}

export function hasSmsProviderConfiguration() {
  const provider = configuredProvider();
  if (provider === "infobip") {
    return Boolean(
      process.env.INFOBIP_API_KEY
      && process.env.INFOBIP_API_KEY.length >= 32
      && !/replace-with/i.test(process.env.INFOBIP_API_KEY)
      && validInfobipBaseUrl(process.env.INFOBIP_BASE_URL)
      && process.env.INFOBIP_SENDER
      && !/replace-with|your-sender/i.test(process.env.INFOBIP_SENDER),
    );
  }
  if (provider === "twilio") {
    return Boolean(
      process.env.TWILIO_SMS_ENABLED === "true"
      && process.env.TWILIO_ACCOUNT_SID
      && process.env.TWILIO_AUTH_TOKEN
      && process.env.TWILIO_PHONE_NUMBER
      && !/replace-with|000000000000|555555/i.test(process.env.TWILIO_ACCOUNT_SID)
      && !/replace-with/i.test(process.env.TWILIO_AUTH_TOKEN)
      && /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID)
      && /^\+[1-9]\d{7,14}$/.test(process.env.TWILIO_PHONE_NUMBER),
    );
  }
  return false;
}

function normalizeCambodianRecipient(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `+855${digits.slice(1)}` : `+${digits}`;
  if (!/^\+855\d{8,9}$/.test(normalized)) {
    throw new Error("Enter a valid Cambodian mobile number.");
  }
  return normalized;
}

export async function sendOtpSms(input: { to: string; code: string }) {
  const provider = configuredProvider();
  if (!provider || !hasSmsProviderConfiguration()) {
    throw new Error("The selected SMS provider is not configured correctly.");
  }
  const recipient = normalizeCambodianRecipient(input.to);
  const text = `SUNNY SPORT CLUB password reset code: ${input.code}. Expires in 5 minutes. Do not share this code.`;

  if (provider === "infobip") {
    const response = await fetch(`https://${process.env.INFOBIP_BASE_URL}/sms/3/messages`, {
      method: "POST",
      headers: {
        Authorization: `App ${process.env.INFOBIP_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [{
          sender: process.env.INFOBIP_SENDER,
          destinations: [{ to: recipient.slice(1) }],
          content: { text },
        }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("The configured SMS provider rejected the recovery message.");

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error("The SMS provider returned an invalid response.");
    }
    if (
      typeof result !== "object"
      || result === null
      || !("messages" in result)
      || !Array.isArray(result.messages)
      || result.messages.length !== 1
      || typeof result.messages[0] !== "object"
      || result.messages[0] === null
      || !("status" in result.messages[0])
      || typeof result.messages[0].status !== "object"
      || result.messages[0].status === null
      || !("name" in result.messages[0].status)
      || typeof result.messages[0].status.name !== "string"
      || !["PENDING_ACCEPTED", "MESSAGE_SENT"].includes(result.messages[0].status.name)
    ) {
      throw new Error("The SMS provider did not accept the recovery message.");
    }
    return;
  }

  const smsBody = new URLSearchParams({
    To: recipient,
    From: process.env.TWILIO_PHONE_NUMBER!,
    Body: text,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID!)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: smsBody,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("The configured SMS provider rejected the recovery message.");

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("The SMS provider returned an invalid response.");
  }
  if (typeof result !== "object" || result === null || !("sid" in result) || typeof result.sid !== "string") {
    throw new Error("The SMS provider did not accept the recovery message.");
  }
}

export const cambodianSmsNumberSchema = z.string().trim().min(7).max(24).refine((phone) => {
  try {
    normalizeCambodianRecipient(phone);
    return true;
  } catch {
    return false;
  }
});
