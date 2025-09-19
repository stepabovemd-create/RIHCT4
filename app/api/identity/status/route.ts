// app/api/identity/status/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new NextResponse('Missing id', { status: 400 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2024-06-20' });
  const vs = await stripe.identity.verificationSessions.retrieve(id);
  return NextResponse.json({ id: vs.id, status: vs.status }); // 'verified' | 'processing' | 'requires_input' | 'canceled'
}
