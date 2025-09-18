export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

// quick GET to verify the route is live
export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/stripe/webhook' });
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

    // For now, just log what arrives (we’ll add RemoteLock/email next)
    console.log('✅ webhook received:', event.type);

    switch (event.type) {
      case 'invoice.payment_succeeded': {
        // const invoice = event.data.object as Stripe.Invoice;
        // TODO: look up tenant by customer id, create RemoteLock code, email
        break;
      }
      case 'invoice.payment_failed': {
        // TODO: notify, mark past_due
        break;
      }
      case 'customer.subscription.deleted': {
        // TODO: revoke code after grace
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('Webhook verify error:', e?.message);
    return new NextResponse(`Webhook Error: ${e?.message}`, { status: 400 });
  }
}
