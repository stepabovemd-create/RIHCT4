// app/api/webhook/route.ts
// NEXT.JS (App Router) + Stripe webhook handler + Postmark email
// Sends on BOTH `invoice.payment_succeeded` and `checkout.session.completed`.
// During testing, set FORCE_TEST_EMAIL=1 to always send to TEST_RECIPIENT.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

// ─── helpers ──────────────────────────────────────────────────────────────────
function extractEmail(addr?: string | null) {
  if (!addr) return '';
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}
function domainOf(addr: string) {
  const at = addr.lastIndexOf('@');
  return at > -1 ? addr.slice(at + 1).toLowerCase() : '';
}

async function sendEmailViaPostmark(params: {
  fromRaw: string;
  toRaw?: string;
  fallbackTo?: string;        // TEST_RECIPIENT
  forceTest?: boolean;        // FORCE_TEST_EMAIL === '1'
  subject: string;
  text: string;
  token?: string;             // POSTMARK_TOKEN
}) {
  const { fromRaw, toRaw, fallbackTo, forceTest, subject, text, token } = params;
  if (!token) {
    console.log('📧 Skipped email: POSTMARK_TOKEN missing');
    return;
  }

  const from = extractEmail(fromRaw);
  let to = extractEmail(toRaw || '') || extractEmail(fallbackTo || '');

  const fromDomain = domainOf(from);
  const toDomain = domainOf(to);
  const fbDomain = domainOf(extractEmail(fallbackTo || ''));

  // Force all mail to TEST_RECIPIENT while testing
  if (forceTest && fallbackTo) {
    console.log(`📧 FORCE_TEST_EMAIL=1 → routing all mail to TEST_RECIPIENT (${fallbackTo})`);
    to = extractEmail(fallbackTo);
  } else {
    // While Postmark account is pending, cross-domain is blocked.
    // If domains differ but fallback matches `from`, route to fallback.
    if (fromDomain && toDomain && fromDomain !== toDomain && fallbackTo && fbDomain === fromDomain) {
      console.log(`📧 Domain mismatch (${toDomain} ≠ ${fromDomain}) → routing to TEST_RECIPIENT (${fallbackTo})`);
      to = extractEmail(fallbackTo);
    }
  }

  if (!from || !to) {
    console.log('📧 Skipped email: from/to missing', { from, to });
    return;
  }

  console.log('📧 From:', fromRaw, '| To:', to);

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: fromRaw,                // allow "Name <user@domain>"
      To: to,
      Subject: subject,
      TextBody: text,
      MessageStream: 'outbound',
      ReplyTo: from,
    }),
  });

  const body = await res.text();
  console.log('📧 Postmark response:', res.status, body);
}

// ─── GET: status ───────────────────────────────────────────────────────────────
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

// ─── POST: Stripe webhook ─────────────────────────────────────────────────────
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

    console.log('✅ Stripe event:', event.type);

    // Common vars for email sending
    const fromRaw = process.env.SENDER_EMAIL || '';
    const testRecipient = process.env.TEST_RECIPIENT || '';
    const forceTest = process.env.FORCE_TEST_EMAIL === '1';
    const pmToken = process.env.POSTMARK_TOKEN;

    // ── Handler 1: invoice.payment_succeeded (primary for subscriptions)
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;

      // Try to get customer email
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

      // Grab name/phone from subscription metadata
      let first = '';
      let last = '';
      try {
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          first = (sub.metadata?.first as string) || '';
          last  = (sub.metadata?.last as string)  || '';
        }
      } catch {}

      // Determine interval (week/month)
      const line = invoice.lines?.data?.[0];
      const interval = line?.price?.recurring?.interval; // 'week' | 'month'

      // Demo door code + validity window
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const start = new Date(); start.setHours(15, 0, 0, 0); // 3pm
      const end = new Date(start);
      end.setDate(end.getDate() + (interval === 'month' ? 30 : 7));
      end.setHours(11, 0, 0, 0); // 11am

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

      await sendEmailViaPostmark({
        fromRaw,
        toRaw: email,
        fallbackTo: testRecipient,
        forceTest,
        subject: 'Your Relax Inn door code',
        text,
        token: pmToken,
      });
    }

    // ── Handler 2: checkout.session.completed (fallback path)
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // Email directly from session if present, otherwise from customer
      let email = session.customer_details?.email || undefined;
      const customerId = typeof session.customer === 'string' ? session.customer : undefined;
      if (!email && customerId) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (typeof customer === 'object' && customer && 'email' in customer) {
            email = (customer as Stripe.Customer).email || undefined;
          }
        } catch {}
      }

      // Get name from metadata (we set this in checkout route)
      const first = (session.metadata?.first as string) || '';
      const last  = (session.metadata?.last as string)  || '';

      // Figure out interval by retrieving line_items (expanded)
      let interval: 'week' | 'month' | 'unknown' = 'unknown';
      try {
        const s = await stripe.checkout.sessions.retrieve(session.id, { expand: ['line_items.data.price'] });
        const li = s.line_items?.data?.[0];
        const rec = (li?.price as Stripe.Price | undefined)?.recurring;
        interval = (rec?.interval as 'week' | 'month' | undefined) || 'unknown';
      } catch {}

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const start = new Date(); start.setHours(15, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + (interval === 'month' ? 30 : 7));
      end.setHours(11, 0, 0, 0);

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

      await sendEmailViaPostmark({
        fromRaw,
        toRaw: email,
        fallbackTo: testRecipient,
        forceTest,
        subject: 'Your Relax Inn door code',
        text,
        token: pmToken,
      });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('❌ Webhook verify error:', err?.message);
    return new NextResponse(`Webhook Error: ${err?.message}`, { status: 400 });
  }
}
