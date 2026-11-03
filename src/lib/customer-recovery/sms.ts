import { z } from "zod";

type SmsProvider = "infobip" | "twilio";

type SmsDiagnostics = {
  provider: string;
  phoneNormalized: boolean;
  sessionSecretConfigured: boolean;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  senderConfigured: boolean;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
};

export class OtpSmsDeliveryError extends Error {
  constructor(readonly diagnostics: SmsDiagnostics) {
    super("Unable to deliver the recovery SMS.");
    this.name = "OtpSmsDeliveryError";
  }
}

function configuredProvider(): SmsProvider | null {
  const provider = process.env.SMS_PROVIDER;
  return provider === "infobip" || provider === "twilio" ? provider : null;
}

function validInfobipBaseUrl(value: string | undefined) {
  return Boolean(value && /^[a-z0-9.-]+\.api\.infobip\.com$/i.test(value));
}

export function getSmsProviderDiagnostics(phoneNormalized = false): SmsDiagnostics {
  const provider = configuredProvider();
  return {
    provider: provider ?? "unsupported",
    phoneNormalized,
    sessionSecretConfigured: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
    baseUrlConfigured: provider === "infobip" && validInfobipBaseUrl(process.env.INFOBIP_BASE_URL),
    apiKeyConfigured: provider === "infobip"
      ? Boolean(process.env.INFOBIP_API_KEY && process.env.INFOBIP_API_KEY.length >= 32 && !/replace-with/i.test(process.env.INFOBIP_API_KEY))
      : provider === "twilio"
        ? Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
        : false,
    senderConfigured: provider === "infobip"
      ? Boolean(process.env.INFOBIP_SENDER && !/replace-with|your-sender/i.test(process.env.INFOBIP_SENDER))
      : provider === "twilio"
        ? Boolean(process.env.TWILIO_PHONE_NUMBER)
        : false,
  };
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

function getInfobipErrorDetails(body: unknown, sensitiveValues: string[]) {
  if (!body || typeof body !== "object") return {};
  const root = body as Record<string, unknown>;
  const requestError = root.requestError as Record<string, unknown> | undefined;
  const serviceException = requestError?.serviceException as Record<string, unknown> | undefined;
  const messages = Array.isArray(root.messages) ? root.messages : [];
  const firstMessage = messages[0] as Record<string, unknown> | undefined;
  const status = firstMessage?.status as Record<string, unknown> | undefined;
  const rawCode = serviceException?.messageId ?? status?.id ?? status?.name;
  const rawMessage = serviceException?.text ?? status?.description;
  const errorCode = typeof rawCode === "string" || typeof rawCode === "number" ? String(rawCode) : undefined;
  const errorMessage = typeof rawMessage === "string" ? rawMessage : undefined;
  return {
    ...(errorCode && /^(?!\d{6}$)[A-Za-z0-9_.-]{1,64}$/.test(errorCode) ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage: redactProviderMessage(errorMessage, sensitiveValues) } : {}),
  };
}

function redactProviderMessage(message: string, sensitiveValues: string[]) {
  let safeMessage = message;
  for (const value of sensitiveValues) {
    if (value) safeMessage = safeMessage.replaceAll(value, "[redacted]");
  }
  return safeMessage
    .replace(/\b(?:App|Bearer)\s+\S+/gi, "[credential redacted]")
    .replace(/\b\+?\d[\d\s().-]{5,}\d\b/g, "[number redacted]")
    .replace(/\b\d{6}\b/g, "[code redacted]")
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, "[redacted]")
    .slice(0, 200);
}

export async function sendOtpSms(input: { to: string; code: string }) {
  const provider = configuredProvider();
  let recipient: string;
  try {
    recipient = normalizeCambodianRecipient(input.to);
  } catch {
    throw new OtpSmsDeliveryError({
      ...getSmsProviderDiagnostics(),
      errorCode: "INVALID_PHONE_NUMBER",
      errorMessage: "Phone normalization failed.",
    });
  }

  if (!provider || !hasSmsProviderConfiguration()) {
    throw new OtpSmsDeliveryError({
      ...getSmsProviderDiagnostics(true),
      errorCode: "SMS_PROVIDER_NOT_CONFIGURED",
    });
  }
  const text = `SUNNY SPORT CLUB password reset code: ${input.code}. Expires in 5 minutes. Do not share this code.`;

  if (provider === "infobip") {
    try {
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

      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new OtpSmsDeliveryError({
          ...getSmsProviderDiagnostics(true),
          httpStatus: response.status,
          errorCode: "INVALID_PROVIDER_RESPONSE",
        });
      }

      const errorDetails = getInfobipErrorDetails(result, [
        process.env.INFOBIP_API_KEY ?? "",
        recipient,
        recipient.slice(1),
        input.code,
      ]);
      if (!response.ok) {
        throw new OtpSmsDeliveryError({
          ...getSmsProviderDiagnostics(true),
          httpStatus: response.status,
          ...errorDetails,
        });
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
        throw new OtpSmsDeliveryError({
          ...getSmsProviderDiagnostics(true),
          httpStatus: response.status,
          ...errorDetails,
          ...(!errorDetails.errorCode ? { errorCode: "SMS_NOT_ACCEPTED" } : {}),
        });
      }
      return;
    } catch (error) {
      if (error instanceof OtpSmsDeliveryError) throw error;
      throw new OtpSmsDeliveryError({
        ...getSmsProviderDiagnostics(true),
        errorCode: error instanceof Error && error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE",
      });
    }
  }

  try {
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
    if (!response.ok) {
      throw new OtpSmsDeliveryError({
        ...getSmsProviderDiagnostics(true),
        httpStatus: response.status,
        errorCode: "SMS_PROVIDER_REJECTED",
      });
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new OtpSmsDeliveryError({
        ...getSmsProviderDiagnostics(true),
        httpStatus: response.status,
        errorCode: "INVALID_PROVIDER_RESPONSE",
      });
    }
    if (typeof result !== "object" || result === null || !("sid" in result) || typeof result.sid !== "string") {
      throw new OtpSmsDeliveryError({
        ...getSmsProviderDiagnostics(true),
        httpStatus: response.status,
        errorCode: "SMS_NOT_ACCEPTED",
      });
    }
  } catch (error) {
    if (error instanceof OtpSmsDeliveryError) throw error;
    throw new OtpSmsDeliveryError({
      ...getSmsProviderDiagnostics(true),
      errorCode: error instanceof Error && error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE",
    });
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
