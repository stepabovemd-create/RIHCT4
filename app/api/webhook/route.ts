// app/api/webhook/route.ts
// Next.js App Router + Stripe webhook + Postmark email (no forced rerouting)

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

async function sendEmailViaPostmark({
  fromRaw,
  toRaw,
  subject,
  text,
  token,
}: {
  fromRaw: string;
  toRaw?: string;
  subject: string;
  text: string;
  token?: string;
}) {
  if (!token) {
    console.log('📧 Skipped email: POSTMARK_TOKEN missing');
  }
  const from = extractEmail(fromRaw);
  const to = extractEmail(toRaw || '');
  if (!from || !to) {
    console.log('📧 Skipped email: missing From/To', { from, to });
    return;
  }
  console.log('📧 From:', fromRaw, '| To:', to);

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': token as string,
    },
    body: JSON.stringify({
      From: fromRaw, // allow "Relax Inn <no-reply@yourdomain>"
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

// GET: quick status
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/webhook',
    hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
    hasPostmark: Boolean(process.env.POSTMARK_TOKEN),
    senderEmailSet: Boolean(process.env.SENDER_EMAIL),
  });
}

// POST: Stripe webhook
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

    const fromRaw = process.env.SENDER_EMAIL || '';
    const pmToken = process.env.POSTMARK_TOKEN;

    // 1) Primary for subscriptions
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;

      // email
      let email = invoice.customer_email || undefined;
      const customerId =
        typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id || undefined;
      if (!email && customerId) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (typeof customer === 'object' && customer && 'email' in customer) {
            email = (customer as Stripe.Customer).email || undefined;
          }
        } catch {}
      }

      // metadata for name
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

      // interval
      const line = invoice.lines?.data?.[0];
      const interval = line?.price?.recurring?.interval; // 'week' | 'month'

      // demo code + window
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
        toRaw: email, // only send to guest email (no fallback)
        subject: 'Your Relax Inn door code',
        text,
        token: pmToken,
      });
    }

    // 2) Fallback path (sometimes arrives sooner)
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

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

      const first = (session.metadata?.first as string) || '';
      const last  = (session.metadata?.last as string)  || '';

      // try to detect interval
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
        toRaw: email, // only send to guest email (no fallback)
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
