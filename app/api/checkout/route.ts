// app/api/checkout/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// quick status endpoint (handy for sanity checks)
export async function GET() {
  return NextResponse.json({
    hasSecret: Boolean(process.env.STRIPE_SECRET_KEY),
    hasWeekly: Boolean(process.env.STRIPE_PRICE_WEEKLY),
    hasMonthly: Boolean(process.env.STRIPE_PRICE_MONTHLY),
    baseUrlSet: Boolean(process.env.NEXT_PUBLIC_BASE_URL),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { plan, first, last, email, phone } = await req.json();

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2024-06-20',
    });

    const priceId =
      plan === 'monthly'
        ? process.env.STRIPE_PRICE_MONTHLY
        : process.env.STRIPE_PRICE_WEEKLY;

    if (!priceId) {
      return new NextResponse('Missing price env var', { status: 400 });
    }

    // Create a Customer (so email/name/phone are guaranteed to exist)
    let customerId: string | undefined = undefined;
    if (email) {
      const customer = await stripe.customers.create({
        email,
        name: [first, last].filter(Boolean).join(' ') || undefined,
        phone: phone || undefined,
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId as string, quantity: 1 }],

      // attach our customer if we made one; Checkout will still create a Customer if not provided
      customer: customerId,
      billing_address_collection: 'auto',
      allow_promotion_codes: true,

      // helpful metadata (lands on Session + Subscription)
      metadata: { plan, first, last, phone, email },
      subscription_data: { metadata: { plan, first, last, phone, email } },

      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/apply`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error('Checkout error:', e?.raw?.message || e?.message || e);
    return new NextResponse(
      `Server error: ${e?.raw?.message || e?.message || 'unknown'}`,
      { status: 500 }
    );
  }
}
