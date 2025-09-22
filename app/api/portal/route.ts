import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

/**
 * POST /api/portal
 * Body: { email: string }
 * Returns: { url }
 */
export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    // 1) Find or create customer by email
    const found = await stripe.customers.search({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: 1 });
    const customer = found.data[0] || await stripe.customers.create({ email });

    // 2) Build return URL
    const reqUrl = new URL(req.url);
    const site =
      (process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http")
        ? process.env.NEXT_PUBLIC_SITE_URL
        : null) || reqUrl.origin;

    // 3) Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${site}/portal/return`,
      // Optional: Limit features (in Stripe Dashboard > Billing > Customer Portal)
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Portal error" }, { status: 500 });
  }
}
