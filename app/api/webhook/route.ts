// app/api/webhook/route.ts
// NEXT.JS (App Router) + Stripe webhook handler
// Paste this entire file as-is.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

// Quick GET so you can verify the route + env is live in the browser
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/webhook',
    hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
  });
}

export async function POST(req: NextRequest) {
  // 1) Get raw body + Stripe signature header (required for verification)
  const sig = headers().get('stripe-signature');
  const rawBody = Buffer.from(await req.arrayBuffer());

  // (Loud) debug so you can see POST traffic in Vercel logs
  console.log('🛰️  POST /api/webhook');
  console.log('   stripe-signature header present?', Boolean(sig));
  console.log('   raw body length:', rawBody.length);
  console.log('   env STRIPE_WEBHOOK_SECRET set?', Boolean(process.env.STRIPE_WEBHOOK_SECRET));
  console.log('   env STRIPE_SECRET_KEY set?', Boolean(process.env.STRIPE_SECRET_KEY));

  // 2) Init Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2024-06-20',
  });

  try {
    // 3) Verify the event came from Stripe
    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    console.log('✅ Verified event:', event.type);

    // 4) Handle events you care about
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;

      // Try to get the customer's email
      let email = invoice.customer_email || undefined;
      const customerId = invoice.customer as string | null;
      if (!email && customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        if (typeof customer === 'object' && customer && 'email' in customer) {
          email = (customer as Stripe.Customer).email || undefined;
        }
      }

      // Determine weekly vs monthly from the invoice's first line item
      const line = invoice.lines?.data?.[0];
      const interval = line?.price?.recurring?.interval; // 'week' | 'month'

      // Generate a demo 6-digit code and validity window
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const start = new Date();
      start.setHours(15, 0, 0, 0); // 3pm check-in
      const end = new Date(start);
      end.setDate(end.getDate() + (interval === 'month' ? 30 : 7));
      end.setHours(11, 0, 0, 0); // 11am check-out

      console.log('🔐 Test door code for', email || '(no email found):', code);
      console.log('   Valid', start.toISOString(), '→', end.toISOString());
      console.log('   Interval from Stripe:', interval);

      // ⬇️ NEXT STEP (later): Create RemoteLock PIN + send email here
    }

    if (event.type === 'invoice.payment_failed') {
      console.log('⚠️ invoice.payment_failed');
    }

    if (event.type === 'customer.subscription.deleted') {
      console.log('🛑 customer.subscription.deleted (revoke code in prod)');
    }

    // 5) Acknowledge receipt to Stripe
    return NextResponse.json({ received: true });
  } catch (err: any) {
    // Signature verification or other errors
    console.error('❌ Webhook verify error:', err?.message);
    return new NextResponse(`Webhook Error: ${err?.message}`, { status: 400 });
  }
}
