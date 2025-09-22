// app/api/checkout/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getPriceIds } from "../../../lib/prices";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

/**
 * One-time checkout ONLY (no subscriptions).
 * - First rent (weekly OR monthly) charged as a one-time item using the amount from your recurring price
 * - Optional Move-in fee (forced via flag) as a one-time item
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

    const { weekly, monthly, movein } = getPriceIds();

    // Get the recurring price just to copy its amount/currency into a one-time item
    const recurringPriceId = plan === "weekly" ? weekly : monthly;
    if (!recurringPriceId) {
      return NextResponse.json(
        { error: `Missing env for ${plan === "weekly" ? "STRIPE_PRICE_WEEKLY" : "STRIPE_PRICE_MONTHLY"}` },
        { status: 500 }
      );
    }

    const recurringPrice = await stripe.prices.retrieve(recurringPriceId);
    if (!recurringPrice.unit_amount || !recurringPrice.currency) {
      return NextResponse.json(
        { error: "Recurring price missing unit_amount/currency." },
        { status: 500 }
      );
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        // First rent as a one-time line using the same amount/currency as the recurring price
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

    // --- MOVE-IN FEE HANDLING ---
    if (forceMoveIn) {
      if (movein) {
        // Try to use your configured move-in price, but convert it into a one-time ad-hoc line
        // (This avoids any issues if your move-in price was accidentally set as recurring in Stripe.)
        const mi = await stripe.prices.retrieve(movein);
        const miAmount = mi.unit_amount;
        const miCurrency = mi.currency;
        if (miAmount && miCurrency) {
          line_items.push({
            price_data: {
              currency: miCurrency,
              product_data: { name: "Move-in Fee" },
              unit_amount: miAmount,
            },
            quantity: 1,
          });
        } else {
          // Fallback hard-coded fee if that price is misconfigured
          line_items.push({
            price_data: {
              currency: recurringPrice.currency,
              product_data: { name: "Move-in Fee" },
              unit_amount: 3500, // $35.00 fallback; change if you want
            },
            quantity: 1,
          });
        }
      } else {
        // No STRIPE_PRICE_MOVEIN set; use a sensible default
        line_items.push({
          price_data: {
            currency: recurringPrice.currency,
            product_data: { name: "Move-in Fee" },
            unit_amount: 3500, // $35.00 fallback; change if you want
          },
          quantity: 1,
        });
      }
    }
    // --- END MOVE-IN FEE HANDLING ---

    const session = await stripe.checkout.sessions.create({
      mode: "payment",           // strictly one-time
      line_items,
      // NOTE: we are NOT saving the card (no payment_intent_data.setup_future_usage)
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/apply`,
      allow_promotion_codes: true,
      metadata: {
        plan,
        movein_added: forceMoveIn ? "1" : "0",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Checkout error" },
      { status: 500 }
    );
  }
}
