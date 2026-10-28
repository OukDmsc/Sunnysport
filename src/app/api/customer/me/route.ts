import { NextRequest, NextResponse } from "next/server";
import { getCustomerAccountFromRequest } from "@/lib/customer-auth";

export async function GET(request: NextRequest) {
  try {
    const customer = await getCustomerAccountFromRequest(request);
    if (!customer) return NextResponse.json({ authenticated: false });
    return NextResponse.json({
      authenticated: true,
      customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    });
  } catch (error) {
    console.error("Customer session lookup failed:", error);
    return NextResponse.json({ error: "Unable to check customer sign-in." }, { status: 500 });
  }
}
