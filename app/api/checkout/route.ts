// app/api/checkout/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getPriceIds } from "../../../lib/prices";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Use a stable tag for this property (optional, kept for future use)
const PROPERTY_CODE = "rihc4";

export async function POST(req: Request) {
  try {
    const { plan, forceMoveIn, email } = (await req.json()) as {
      plan: "weekly" | "monthly";
      forceMoveIn?: boolean;
      email?: string;
    };

    // Build absolute URLs
    const reqUrl = new URL(req.url);
    const site =
      (process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http")
        ? process.env.NEXT_PUBLIC_SITE_URL
        : null) || reqUrl.origin;

    // Load prices
    const { weekly, monthly, movein } = getPriceIds();
    const recurringPriceId = plan === "weekly" ? weekly : monthly;
    if (!recurringPriceId) {
      return NextResponse.json(
        { error: `Missing env for ${plan === "weekly" ? "STRIPE_PRICE_WEEKLY" : "STRIPE_PRICE_MONTHLY"}` },
        { status: 500 }
      );
    }

    // Retrieve recurring price to copy amount/currency (one-time line)
    const recurringPrice = await stripe.prices.retrieve(recurringPriceId);
    if (!recurringPrice.unit_amount || !recurringPrice.currency) {
      return NextResponse.json(
        { error: "Recurring price missing unit_amount/currency." },
        { status: 500 }
      );
    }

    // -------- NEW / SIMPLE MOVE-IN RULE --------
    // If forceMoveIn => add fee.
    // Else, add fee only if NO Stripe customer exists for this email.
    let shouldAddMoveIn = Boolean(forceMoveIn);

    if (!shouldAddMoveIn) {
      if (!email) {
        // If no email provided, we can't decide safely — default to NO fee.
        shouldAddMoveIn = false;
      } else {
        try {
          const customers = await stripe.customers.search({
            query: `email:'${email.replace(/'/g, "\\'")}'`,
            limit: 1,
          });
          // No customer yet => brand new guest => add fee
          shouldAddMoveIn = customers.data.length === 0;
        } catch {
          // If search fails for any reason, fail safe: don't add fee
          shouldAddMoveIn = false;
        }
      }
    }
    // -------------------------------------------

    // Build Checkout line items (strictly one-time)
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
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

    if (shouldAddMoveIn) {
      if (movein) {
        // Use configured move-in price's amount as a one-time ad-hoc line
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
          // Fallback hard-coded amount if misconfigured (change as needed)
          line_items.push({
            price_data: {
              currency: recurringPrice.currency,
              product_data: { name: "Move-in Fee" },
              unit_amount: 3500, // $35.00
            },
            quantity: 1,
          });
        }
      } else {
        // No STRIPE_PRICE_MOVEIN set; use fallback
        line_items.push({
          price_data: {
            currency: recurringPrice.currency,
            product_data: { name: "Move-in Fee" },
            unit_amount: 3500, // $35.00
          },
          quantity: 1,
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment", // strictly one-time
      line_items,
      // Tag the resulting PaymentIntent for future insights (optional)
      payment_intent_data: {
        metadata: {
          property: PROPERTY_CODE,
          plan,
          movein_added: shouldAddMoveIn ? "1" : "0",
        },
      },
      customer_email: email || undefined,
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/apply`,
      allow_promotion_codes: true,
      metadata: {
        property: PROPERTY_CODE,
        plan,
        movein_added: shouldAddMoveIn ? "1" : "0",
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
