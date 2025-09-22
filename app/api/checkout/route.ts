// app/api/checkout/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getPriceIds } from "../../../lib/prices";

export const runtime = "nodejs"; // ensure standard process.env behavior

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  try {
    const { plan, forceMoveIn } = (await req.json()) as {
      plan: "weekly" | "monthly";
      forceMoveIn?: boolean;
    };

    const { weekly, monthly, movein, missing } = getPriceIds();
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing recurring price env vars: ${missing.join(", ")}` },
        { status: 500 }
      );
    }

    const priceMap: Record<"weekly" | "monthly", string> = {
      weekly: weekly!,
      monthly: monthly!,
    };

    const basePrice = priceMap[plan];
    if (!basePrice) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: basePrice, quantity: 1 },
    ];

    if (forceMoveIn) {
      line_items.push({ price: movein!, quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_creation: "if_required",
      line_items,
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/apply`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Checkout error" },
      { status: 500 }
    );
  }
}
