export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const { plan, first, last, email, phone } = await req.json()
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2024-06-20' })

  const priceId = plan === 'monthly'
    ? process.env.STRIPE_PRICE_MONTHLY
    : process.env.STRIPE_PRICE_WEEKLY

  if (!priceId) {
    return new NextResponse('Missing price env var', { status: 400 })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId!, quantity: 1 }],
    customer_creation: 'always',
    customer_email: email || undefined,
    customer_update: { address: 'auto', name: 'always' },
    metadata: { plan, first, last, phone }, // attached to Session
    subscription_data: { metadata: { plan, first, last, phone } }, // attached to Subscription
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/apply`,
  })

  return NextResponse.json({ url: session.url })
}
