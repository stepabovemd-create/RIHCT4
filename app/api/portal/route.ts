// app/api/portal/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, email } = await req.json();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2024-06-20' });

    let customerId: string | undefined;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const c = session.customer;
      customerId = typeof c === 'string' ? c : c?.id;
    } else if (email) {
      const found = await stripe.customers.search({ query: `email:'${email}'` });
      customerId = found.data[0]?.id;
    }

    if (!customerId) return new NextResponse('No customer found', { status: 404 });

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/apply`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (e: any) {
    return new NextResponse(`Portal error: ${e?.message || 'unknown'}`, { status: 500 });
  }
}
