import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/auth";
import {
  EmailDeliveryError,
  getEmailProviderConfigurationDiagnostic,
} from "@/lib/customer-recovery/email";
import {
  consumeCustomerAuthRateLimit,
  customerCambodianPhoneSchema,
  createCustomerAuthChallenge,
  hasCustomerRecoveryConfiguration,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  sendCustomerAuthCode,
} from "@/lib/customer-auth";
import { db } from "@/lib/db";

const requestSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  channel: z.enum(["email", "phone"]),
});
const genericMessage = "If an account matches the information provided, recovery instructions will be sent.";

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown";
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Recovery request must be valid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter the email address or phone number and select a recovery method." }, { status: 400 });

  const { identifier, channel } = parsed.data;
  const isEmail = channel === "email";
  const normalized = isEmail ? normalizeCustomerEmail(identifier) : normalizeCustomerPhone(identifier);
  const validIdentifier = isEmail
    ? z.string().email().max(254).safeParse(normalized).success
    : customerCambodianPhoneSchema.safeParse(identifier).success;
  if (!validIdentifier) {
    return NextResponse.json({ error: isEmail ? "Enter a valid email address." : "Enter a valid Cambodian phone number, including +855." }, { status: 400 });
  }

  try {
    if (!hasCustomerRecoveryConfiguration(channel)) {
      const emailDiagnostic = channel === "email"
        ? getEmailProviderConfigurationDiagnostic()
        : null;
      if (channel === "email") {
        const missing = [...(emailDiagnostic?.missing ?? [])];
        if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
          missing.push("SESSION_SECRET");
        }
        console.warn("Customer recovery email provider configuration is incomplete.", {
          provider: emailDiagnostic?.provider ?? "unset",
          missing,
        });
      } else {
        console.warn("Customer recovery SMS provider configuration is incomplete.");
      }
      const emailError = channel === "email"
        ? `Email recovery is not configured for ${emailDiagnostic?.provider ?? "an unknown provider"}. Set these server environment variables: ${[
          ...(emailDiagnostic?.missing ?? []),
          ...(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 ? ["SESSION_SECRET"] : []),
        ].join(", ")}.`
        : "SMS recovery is unavailable because the selected server SMS provider is not configured.";
      return NextResponse.json({
        error: emailError,
      }, { status: 503 });
    }

    const ip = requestIp(request);
    const endpointLimited = await consumeCustomerAuthRateLimit("recovery-request-endpoint", "all", 100, 60 * 60 * 1000);
    const ipLimited = await consumeCustomerAuthRateLimit("recovery-request-ip", ip, 10, 60 * 60 * 1000);
    const accountLimited = await consumeCustomerAuthRateLimit("recovery-request-account", normalized, 3, 60 * 60 * 1000);
    if (endpointLimited || ipLimited || accountLimited) {
      return NextResponse.json({ error: "Too many recovery requests. Try again later." }, { status: 429 });
    }

    const customer = await db.customerAccount.findFirst({
      where: isEmail ? { email: normalized } : { phone: normalized },
    });
    if (!customer || (isEmail ? !customer.email : !customer.phone)) {
      return NextResponse.json({ message: genericMessage });
    }
    if (await consumeCustomerAuthRateLimit("recovery-request-customer", customer.id, 3, 60 * 60 * 1000)) {
      return NextResponse.json({ message: genericMessage });
    }

    const { challenge, code } = await createCustomerAuthChallenge(customer, channel);
    try {
      await sendCustomerAuthCode(customer, code, channel);
    } catch (error) {
      await db.customerAuthChallenge.updateMany({
        where: { id: challenge.id, usedAt: null },
        data: { usedAt: new Date(), emailCodeHash: "", phoneCodeHash: "" },
      });
      if (error instanceof EmailDeliveryError) {
        console.error("Customer recovery email delivery failed.", {
          provider: error.provider,
          reason: error.reason,
        });
      } else {
        console.error("Customer recovery SMS delivery failed.");
      }
      return NextResponse.json({ message: genericMessage });
    }

    return NextResponse.json({ message: genericMessage });
  } catch {
    console.error("Customer recovery request could not be processed.");
    return NextResponse.json({ error: "Unable to process the recovery request right now." }, { status: 500 });
  }
}
