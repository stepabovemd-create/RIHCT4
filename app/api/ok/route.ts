// app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2024-06-20' });

export async function POST(req: Request) {
  try {
    const { plan, first, last, email, phone, forceMoveIn } = await req.json();

    if (!plan || !first || !last || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const weekly = process.env.STRIPE_WEEKLY_PRICE_ID;
    const monthly = process.env.STRIPE_MONTHLY_PRICE_ID;
    const moveIn = process.env.STRIPE_MOVEIN_PRICE_ID;

    const recurringPrice = plan === 'monthly' ? monthly : plan === 'weekly' ? weekly : null;

    if (!recurringPrice) {
      return NextResponse.json(
        {
          error: 'Missing recurring price env vars',
          planReceived: plan,
          hasWeekly: !!weekly,
          hasMonthly: !!monthly,
        },
        { status: 500 }
      );
    }

    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${proto}://${host}` : '');

    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0] || null;

    let isFirstPaid = true;
    if (customer) {
      const paid = await stripe.invoices.list({ customer: customer.id, status: 'paid', limit: 1 });
      isFirstPaid = paid.data.length === 0;
    }

    const shouldAddMoveIn = Boolean((isFirstPaid || !!forceMoveIn) && moveIn);

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: recurringPrice, quantity: 1 },
    ];
    if (shouldAddMoveIn) line_items.push({ price: moveIn!, quantity: 1 });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items,
      customer: customer?.id,
      allow_promotion_codes: true,
      consent_collection: { terms_of_service: 'required' },
      success_url: `${baseUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/apply`,
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
