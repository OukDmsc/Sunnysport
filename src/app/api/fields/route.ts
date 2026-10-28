import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fieldInputSchema } from "@/lib/validation";
import { hasTrustedOrigin, isAdminRequest, unauthorized } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await isAdminRequest(request);
  const fields = await db.field.findMany({
    where: admin ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(fields);
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  try {
    const input = fieldInputSchema.parse(await request.json());
    const field = await db.field.create({ data: input });
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      return NextResponse.json({ error: "Check the field details." }, { status: 400 });
    }
    console.error("Field creation failed:", error);
    return NextResponse.json({ error: "Unable to create field. Check that its name is unique." }, { status: 409 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  try {
    const body = await request.json();
    if (typeof body.id !== "string") return NextResponse.json({ error: "Field ID is required." }, { status: 400 });
    const input = fieldInputSchema.parse(body);
    const field = await db.field.update({ where: { id: body.id }, data: input });
    return NextResponse.json(field);
  } catch (error) {
    console.error("Field update failed:", error);
    return NextResponse.json({ error: "Unable to update field. Check that its name is unique." }, { status: 400 });
  }
}
