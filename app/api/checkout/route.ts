export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET() {
  // Debug helper so we can verify envs without hitting POST
  return NextResponse.json({
    hasSecret: Boolean(process.env.STRIPE_SECRET_KEY),
    hasWeekly: Boolean(process.env.STRIPE_PRICE_WEEKLY),
    hasMonthly: Boolean(process.env.STRIPE_PRICE_MONTHLY),
    baseUrlSet: Boolean(process.env.NEXT_PUBLIC_BASE_URL),
    node: process.version
  })
}

export async function POST(req: NextRequest) {
  try {
    const { plan } = await req.json()

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2024-06-20'
    })

    const priceId =
      plan === 'monthly'
        ? process.env.STRIPE_PRICE_MONTHLY
        : process.env.STRIPE_PRICE_WEEKLY

    if (!priceId) {
      return new NextResponse('Missing price env var', { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId!, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/apply`,
    })

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return new NextResponse('Server error: ' + (e?.message || 'unknown'), { status: 500 })
  }
}
