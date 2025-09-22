import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

async function createPortalUrl(email: string, reqUrl: URL) {
  const found = await stripe.customers.search({
    query: `email:'${email.replace(/'/g, "\\'")}'`,
    limit: 1,
  });
  const customer = found.data[0] || (await stripe.customers.create({ email }));

  const site =
    (process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http")
      ? process.env.NEXT_PUBLIC_SITE_URL
      : null) || reqUrl.origin;

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${site}/portal/return`,
  });

  return session.url;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get("email")?.trim();
    const noredirect = url.searchParams.get("noredirect") === "1";
    if (!email) {
      return NextResponse.json(
        { error: "Add ?email=you@example.com" },
        { status: 400 }
      );
    }
    const portalUrl = await createPortalUrl(email, url);
    if (noredirect) {
      return NextResponse.json({ url: portalUrl });
    }
    return NextResponse.redirect(portalUrl, { status: 302 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Portal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
    const portalUrl = await createPortalUrl(email.trim(), new URL(req.url));
    return NextResponse.json({ url: portalUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Portal error" }, { status: 500 });
  }
}
