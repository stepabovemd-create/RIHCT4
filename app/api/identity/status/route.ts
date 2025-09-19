// app/api/identity/status/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 200 });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2024-06-20',
    });
    const vs = await stripe.identity.verificationSessions.retrieve(id);

    // Possible statuses: 'verified' | 'processing' | 'requires_input' | 'canceled'
    return NextResponse.json({
      ok: true,
      id: vs.id,
      status: vs.status,
    });
  } catch (e: any) {
    console.error('Identity status error:', e?.message || e);
    // Always return JSON (200) so the client never hard-crashes on .json()
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 200 });
  }
}
