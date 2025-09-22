import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    route: '/api/ok',
    hasWeekly: !!process.env.STRIPE_WEEKLY_PRICE_ID,
    hasMonthly: !!process.env.STRIPE_MONTHLY_PRICE_ID,
    hasMoveIn: !!process.env.STRIPE_MOVEIN_PRICE_ID,
    moveInPrefix: (process.env.STRIPE_MOVEIN_PRICE_ID || '').slice(0, 10),
    env: process.env.VERCEL_ENV || 'unknown',
  });
}
