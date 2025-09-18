// app/api/webhook/route.ts
// NEXT.JS (App Router) + Stripe webhook handler + Postmark email
// Adds FORCE_TEST_EMAIL to route all mail to TEST_RECIPIENT during testing.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

// helpers
function extractEmail(addr?: string | null) {
  if (!addr) return '';
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}
function domainOf(addr: string) {
  const at = addr.lastIndexOf('@');
  return at > -1 ? addr.slice(at + 1).toLowerCase() : '';
}

// Simple GET so you can verify envs in the browser
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/webhook',
    hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
    hasPostmark: Boolean(process.env.POSTMARK_TOKEN),
    senderEmailSet: Boolean(process.env.SENDER_EMAIL),
    hasTestRecipient: Boolean(process.env.TEST_RECIPIENT),
    forceTestEmail: process.env.FORCE_TEST_EMAIL === '1',
  });
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

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;

      // email from invoice or customer
      let email = invoice.customer_email || undefined;
      const customerId =
        typeof invoice.customer === 'string'
          ? (invoice.customer as string)
          : (invoice.customer as Stripe.Customer | null)?.id || undefined;
      if (!email && customerId) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (typeof customer === 'object' && customer && 'email' in customer) {
            email = (customer as Stripe.Customer).email || undefined;
          }
        } catch {}
      }

      // subscription metadata for name/phone
      let first = '';
      let last = '';
      let phone = '';
      try {
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          first = (sub.metadata?.first as string) || '';
          last  = (sub.metadata?.last as string)  || '';
          phone = (sub.metadata?.phone as string) || '';
        }
      } catch {}

      // weekly vs monthly
      const line = invoice.lines?.data?.[0];
      const interval = line?.price?.recurring?.interval; // 'week' | 'month'

      // demo door code + validity
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const start = new Date(); start.setHours(15, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + (interval === 'month' ? 30 : 7));
      end.setHours(11, 0, 0, 0);

      // ---- decide recipient (force to TEST_RECIPIENT while testing) ----
      const fromRaw = process.env.SENDER_EMAIL || '';
      const from = extractEmail(fromRaw);
      const testRec = extractEmail(process.env.TEST_RECIPIENT || '');
      const force = process.env.FORCE_TEST_EMAIL === '1';

      let to = extractEmail(email) || testRec;
      if (force && testRec) {
        console.log(`📧 FORCE_TEST_EMAIL is ON → sending to TEST_RECIPIENT (${testRec})`);
        to = testRec;
      }

      console.log('📧 From:', fromRaw, '| To:', to);

      if (process.env.POSTMARK_TOKEN && from && to) {
        const greeting = [first, last].filter(Boolean).join(' ');
        const text = [
          (greeting ? `Hi ${greeting}` : 'Hi'),
          '',
          `Thanks for your ${interval === 'month' ? 'monthly' : 'weekly'} payment at Relax Inn.`,
          `Your door code is: ${code}`,
          `Valid ${start.toLocaleString()} → ${end.toLocaleString()}.`,
          '',
          `If you need help, call the front desk.`,
          `— Relax Inn Hartford City`,
        ].join('\n');

        const res = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN as string,
          },
          body: JSON.stringify({
            From: fromRaw,
            To: to,
            Subject: 'Your Relax Inn door code',
            TextBody: text,
            MessageStream: 'outbound',
            ReplyTo: from,
          }),
        });

        const body = await res.text();
        console.log('📧 Postmark response:', res.status, body);
      } else {
        console.log('📧 Skipped email (missing POSTMARK_TOKEN/SENDER_EMAIL or no recipient).');
      }
    }

    if (event.type === 'invoice.payment_failed') {
      console.log('⚠️ invoice.payment_failed');
    }
    if (event.type === 'customer.subscription.deleted') {
      console.log('🛑 customer.subscription.deleted (would revoke code)');
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('❌ Webhook verify error:', err?.message);
    return new NextResponse(`Webhook Error: ${err?.message}`, { status: 400 });
  }
}
