// app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

export async function POST(req: Request) {
  try {
    const { plan, first, last, email, phone, forceMoveIn } = await req.json();

    if (!plan || !first || !last || !email) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    const weekly = process.env.STRIPE_WEEKLY_PRICE_ID;
    const monthly = process.env.STRIPE_MONTHLY_PRICE_ID;
    const moveIn = process.env.STRIPE_MOVEIN_PRICE_ID;

    const recurringPrice = plan === 'monthly' ? monthly : weekly;
    if (!recurringPrice) {
      return new NextResponse('Missing recurring price env vars', { status: 500 });
    }

    // Base URL for redirects
    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${proto}://${host}` : '');

    // Look up customer in THIS Stripe mode (test or live) by email
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0] || null;

    // First-ever PAID invoice?
    let isFirstPaid = true;
    if (customer) {
      const paid = await stripe.invoices.list({ customer: customer.id, status: 'paid', limit: 1 });
      isFirstPaid = paid.data.length === 0;
    }

    // Line items: recurring + optional one-time move-in fee
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: recurringPrice!, quantity: 1 },
    ];

    const shouldAddMoveIn = Boolean((isFirstPaid || !!forceMoveIn) && moveIn);
    if (shouldAddMoveIn) line_items.push({ price: moveIn!, quantity: 1 });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items,
      customer: customer?.id, // reuse existing; omit to let Checkout create new
      allow_promotion_codes: true,
      success_url: `${baseUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/apply`,
      consent_collection: { terms_of_service: 'required' },
      metadata: {
        first, last, email, phone, plan,
        move_in_fee_applied: shouldAddMoveIn ? 'true' : 'false',
      },
      subscription_data: {
        metadata: {
          first, last, email, phone, plan,
          move_in_fee_applied: shouldAddMoveIn ? 'true' : 'false',
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('checkout error', err);
    return new NextResponse(`Server error: ${err?.message || err}`, { status: 500 });
  }
}
