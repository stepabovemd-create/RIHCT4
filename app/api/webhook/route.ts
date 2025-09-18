export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

// Quick GET to prove the route exists
export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/webhook' });
}

export async function POST(req: NextRequest) {
  const sig = headers().get('stripe-signature');
  const rawBody = Buffer.from(await req.arrayBuffer());

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2024-06-20',
  });

  try {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    // ---- Handle success (generate a demo door code and log it) ----
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;

      // Get the customer email (from invoice or by retrieving the Customer)
      let email = (invoice.customer_email || undefined) as string | undefined;
      const customerId = invoice.customer as string | null;
      if (!email && customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        if (typeof customer === 'object' && customer && 'email' in customer) {
          email = (customer as Stripe.Customer).email || undefined;
        }
      }

      // Figure out weekly vs monthly from the line item
      const line = invoice.lines?.data?.[0];
      const interval = line?.price?.recurring?.interval; // 'week' or 'month'

      // Generate a 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));

      // Validity window: now→+7 days (weekly) or +30 days (monthly)
      const start = new Date();
      start.setHours(15, 0, 0, 0); // 3pm check-in
      const end = new Date(start);
      if (interval === 'month') end.setDate(end.getDate() + 30);
      else end.setDate(end.getDate() + 7); // default weekly
      end.setHours(11, 0, 0, 0); // 11am check-out

      console.log('✅ invoice.payment_succeeded');
      console.log('🔐 Test door code for', email || '(no email found):', code);
      console.log('   Valid', start.toISOString(), '→', end.toISOString());
      console.log('   Interval from Stripe:', interval);

      // (Next step will be: create a RemoteLock PIN + send email)
    }

    if (event.type === 'invoice.payment_failed') {
      console.log('⚠️ invoice.payment_failed');
    }

    if (event.type === 'customer.subscription.deleted') {
      console.log('🛑 customer.subscription.deleted (would revoke code in prod)');
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('Webhook verify error:', e?.message);
    return new NextResponse(`Webhook Error: ${e?.message}`, { status: 400 });
  }
}
