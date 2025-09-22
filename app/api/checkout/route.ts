// app/api/checkout/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getPriceIds } from "../../../lib/prices";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

/**
 * We do a one-time payment for:
 *   - First period's rent (weekly OR monthly) as a one-time line item
 *   - Optional move-in fee as a one-time line item
 * We also save the payment method for off-session, so we can create a subscription in the webhook.
 */
export async function POST(req: Request) {
  try {
    const { plan, forceMoveIn } = (await req.json()) as {
      plan: "weekly" | "monthly";
      forceMoveIn?: boolean;
    };

    // Build absolute URLs
    const reqUrl = new URL(req.url);
    const site =
      (process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http")
        ? process.env.NEXT_PUBLIC_SITE_URL
        : null) || reqUrl.origin;

    const { weekly, monthly, movein, missing } = getPriceIds();
    // For this flow we only absolutely require the RECURRING price to discover the amount.
    const missingCritical = plan === "weekly" && !weekly ? ["STRIPE_PRICE_WEEKLY"]
      : plan === "monthly" && !monthly ? ["STRIPE_PRICE_MONTHLY"]
      : [];
    if (missingCritical.length > 0) {
      return NextResponse.json(
        { error: `Missing env: ${missingCritical.join(", ")}` },
        { status: 500 }
      );
    }

    // Get the recurring price so we can reuse its amount for a one-time initial charge
    const recurringPriceId = plan === "weekly" ? weekly! : monthly!;
    const recurringPrice = await stripe.prices.retrieve(recurringPriceId);
    if (!recurringPrice.unit_amount || !recurringPrice.currency) {
      return NextResponse.json(
        { error: "Recurring price missing unit_amount/currency." },
        { status: 500 }
      );
    }

    // Build line items for a PAYMENT-mode Checkout
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      // First rent (one-time, using price_data for the same amount as the recurring price)
      {
        price_data: {
          currency: recurringPrice.currency,
          product_data: {
            name: plan === "weekly" ? "First Week Rent" : "First Month Rent",
          },
          unit_amount: recurringPrice.unit_amount,
        },
        quantity: 1,
      },
    ];

    // Optional move-in fee (prefer a configured price if present; else ad-hoc)
    if (forceMoveIn) {
      if (movein) {
        line_items.push({ price: movein, quantity: 1 });
      } else {
        // Fallback: create an ad-hoc move-in fee (say $35) — change as needed
        line_items.push({
          price_data: {
            currency: recurringPrice.currency,
            product_data: { name: "Move-in Fee" },
            unit_amount: 3500, // $35.00 in cents — adjust to your actual fee if not using STRIPE_PRICE_MOVEIN
          },
          quantity: 1,
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Save card for off-session so we can create a subscription later
      payment_intent_data: {
        setup_future_usage: "off_session",
      },
      // We'll read these in the webhook to know which plan to subscribe the user to and when to anchor
      metadata: {
        plan,
        had_movein: forceMoveIn ? "1" : "0",
      },
      line_items,
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/apply`,
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
