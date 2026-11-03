import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fieldInputSchema } from "@/lib/validation";
import { hasTrustedOrigin, isAdminRequest, unauthorized } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { safeErrorDetails } from "@/lib/safe-error";

export async function GET(request: NextRequest) {
  try {
    const admin = await isAdminRequest(request);
    const fields = await db.field.findMany({
      where: admin ? {} : { active: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(fields);
  } catch (error) {
    console.error("Fields could not be loaded.", safeErrorDetails(error));
    return NextResponse.json({ error: "Unable to load fields." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Field details must be valid JSON." }, { status: 400 });
  }
  const parsed = fieldInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the field details." }, { status: 400 });
  try {
    const field = await db.field.create({ data: parsed.data });
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A field with that name already exists." }, { status: 409 });
    }
    console.error("Field creation failed.", safeErrorDetails(error));
    return NextResponse.json({ error: "Unable to create field." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Field update must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || !("id" in body) || typeof body.id !== "string") {
    return NextResponse.json({ error: "Field ID is required." }, { status: 400 });
  }
  const parsed = fieldInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the field details." }, { status: 400 });
  try {
    const field = await db.field.update({ where: { id: body.id }, data: parsed.data });
    return NextResponse.json(field);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A field with that name already exists." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Field not found." }, { status: 404 });
    }
    console.error("Field update failed.", safeErrorDetails(error));
    return NextResponse.json({ error: "Unable to update field." }, { status: 500 });
  }
}
