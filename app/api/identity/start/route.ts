// app/api/identity/start/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const { email, first, last } = await req.json();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2024-06-20' });

  const vs = await stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: { email, first, last },
    options: { document: { require_matching_selfie: false } }, // set true if you want selfies
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/apply?vs={VERIFICATION_SESSION_ID}`,
  });

  return NextResponse.json({ id: vs.id, url: vs.url });
}
