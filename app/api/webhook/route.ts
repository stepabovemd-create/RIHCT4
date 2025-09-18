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

  console.log('🛰️  POST /api/webhook hit');
  console.log('   has stripe-signature header?', Boolean(sig));
  console.log('   raw body length:', rawBody.length);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2024-06-20',
  });

  try {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    console.log('✅ constructEvent OK:', event.type);

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;

      // Get customer email if present (for sanity)
      let email = invoice.customer_email || undefined;
      const line = invoice.lines?.data?.[0];
      const interval = line?.price?.recurring?.interval; // 'week' | 'month'

      // Demo code + window
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const start = new Date(); start.setHours(15,0,0,0);
      const end = new Date(start);
      end.setDate(end.getDate() + (interval === 'month' ? 30 : 7));
      end.setHours(11,0,0,0);

      console.log('🔐 Test door code for', email || '(no email found):', code);
      console.log('   Valid', start.toISOString(), '→', end.toISOString());
      console.log('   Interval from Stripe:', interval);
    }

    if (event.type === 'invoice.payment_failed') {
      console.log('⚠️ invoice.payment_failed');
    }

    if (event.type === 'customer.subscription.deleted') {
      console.log('🛑 customer.subscription.deleted (would revoke code in prod)');
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('❌ Webhook verify error:', e?.message);
    return new NextResponse(`Webhook Error: ${e?.message}`, { status: 400 });
  }
}
