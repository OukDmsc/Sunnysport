import { Prisma } from "@prisma/client";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { createCustomerToken, hasTrustedOrigin, setCustomerCookie } from "@/lib/auth";
import {
  customerAccountIdentifierSchema,
  customerPhoneSchema,
  hashCustomerPassword,
  isCustomerAuthRateLimited,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "@/lib/customer-auth";
import { db } from "@/lib/db";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  identifier: customerAccountIdentifierSchema.optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: customerPhoneSchema.optional(),
  password: z.string().min(10).max(128),
}).superRefine(({ identifier, email, phone }, context) => {
  if ([identifier, email, phone].filter((value) => value !== undefined).length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identifier"],
      message: "Provide exactly one email address or phone number.",
    });
  }
});

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isCustomerAuthRateLimited("register", ip, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many account creation attempts. Try again later." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Registration request must be valid JSON." }, { status: 400 });
  }
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter your name, either a valid email address or phone number, and a password of at least 10 characters." }, { status: 400 });

  try {
    const input = parsed.data;
    const contact = input.identifier ?? input.email ?? input.phone;
    if (!contact) {
      return NextResponse.json({ error: "Enter either an email address or phone number." }, { status: 400 });
    }
    const isEmail = contact.includes("@");
    const customer = await db.customerAccount.create({
      data: {
        name: input.name,
        email: isEmail ? normalizeCustomerEmail(contact) : null,
        phone: isEmail ? null : normalizeCustomerPhone(contact),
        passwordHash: await hashCustomerPassword(input.password),
      },
    });
    const response = NextResponse.json({
      customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    }, { status: 201 });
    setCustomerCookie(response, await createCustomerToken(customer.id, customer.sessionVersion));
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An account already uses that email address or phone number." }, { status: 409 });
    }
    console.error("Customer registration failed:", error);
    return NextResponse.json({ error: "Unable to create the customer account." }, { status: 500 });
  }
}
