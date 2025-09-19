// app/api/identity/start/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const { email, first, last, baseUrl } = await req.json();

  // Fallbacks in case baseUrl is missing
  const inferredOrigin =
    (req.headers.get('origin')) ||
    (req.headers.get('referer') ? new URL(req.headers.get('referer') as string).origin : '') ||
    (process.env.NEXT_PUBLIC_BASE_URL ?? '');

  const origin = (baseUrl && typeof baseUrl === 'string') ? baseUrl : inferredOrigin;
  if (!origin) {
    return NextResponse.json({ ok: false, error: 'No base URL available' }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2024-06-20' });

  const vs = await stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: { email, first, last },
    options: { document: { require_matching_selfie: false } },
    // CRITICAL: use the exact origin the user is on so sessionStorage/cookies match
    return_url: `${origin}/apply-safe`,
  });

  return NextResponse.json({ id: vs.id, url: vs.url });
}
