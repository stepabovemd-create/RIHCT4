// app/api/webhook/route.ts
// NEXT.JS (App Router) + Stripe webhook handler + Postmark email (with same-domain fallback + clear logs)

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

// helper: extract plain email from "Name <email@domain>"
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
  });
}

export async function POST(req: NextRequest) {
  const sig = headers().get('stripe-signature');
  const rawBody = Buffer.from(await req.arrayBuffer());

  console.log('🛰️  POST /api/webhook');
  console.log('   stripe-signature present?', Boolean(sig));
  console.log('   raw body length:', rawBody.length);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2024-06-20',
  });

  try {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    console.log('✅ Verified event:', event.type);

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;

      // --- pull customer email ---
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
        } catch (e: any) {
          console.log('ℹ️ Could not retrieve customer:', e?.message);
        }
      }

      // --- pull metadata (first/last/phone) from subscription we set during checkout ---
      let first = '';
      let last = '';
      let phone = '';
      try {
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          first = (sub.metadata?.first as string) || '';
          last = (sub.metadata?.last as string) || '';
          phone = (sub.metadata?.phone as string) || '';
        }
      } catch (e: any) {
        console.log('ℹ️ Could not fetch subscription metadata:', e?.message);
      }

      // --- determine plan interval (week/month) from the first line item ---
      const line = invoice.lines?.data?.[0];
      const interval = line?.price?.recurring?.interval; // 'week' | 'month'

      // --- generate demo door code + validity window ---
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const start = new Date();
      start.setHours(15, 0, 0, 0); // 3pm check-in
      const end = new Date(start);
      end.setDate(end.getDate() + (interval === 'month' ? 30 : 7));
      end.setHours(11, 0, 0, 0); // 11am check-out

      console.log('🔐 Test door code for', email || '(no email found):', code);
      console.log('   Valid', start.toISOString(), '→', end.toISOString());
      console.log('   Interval from Stripe:', interval);
      console.log('   Name from metadata:', [first, last].filter(Boolean).join(' ') || '(none)');

      // ---- Send email via Postmark (with same-domain fallback + loud logs) ----
      const fromRaw = process.env.SENDER_EMAIL || '';
      const from = extractEmail(fromRaw);
      const to = extractEmail(email) || extractEmail(process.env.TEST_RECIPIENT || '');

      const fromDomain = domainOf(from);
      const toDomain = domainOf(to);

      console.log('📧 Email From:', from, '(domain:', fromDomain + ')');
      console.log('📧 Email To  :', to, '(domain:', toDomain + ')');

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
            From: fromRaw,           // allow "Name <email@domain>"
            To: to,
            Subject: 'Your Relax Inn door code',
            TextBody: text,
            MessageStream: 'outbound',
            ReplyTo: from,
          }),
        });

        const body = await res.text();
        if (res.status === 422 && body.includes('"ErrorCode":412')) {
          console.log(
            '📧 Postmark restriction: while pending approval, the recipient domain MUST match From domain. (From:',
            fromDomain, 'To:', toDomain, ')'
          );
        } else {
          console.log('📧 Postmark response:', res.status, body);
        }
      } else {
        console.log('📧 Skipped email (missing POSTMARK_TOKEN/SENDER_EMAIL or no recipient).');
      }

      // ⬇️ NEXT: Replace demo code with a real RemoteLock PIN here later.
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
