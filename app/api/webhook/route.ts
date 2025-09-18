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

    console.log('✅ webhook received:', event.type);
    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('Webhook verify error:', e?.message);
    return new NextResponse(`Webhook Error: ${e?.message}`, { status: 400 });
  }
}
