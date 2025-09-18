// app/api/test-email/route.ts
// Hit GET /api/test-email to see config
// Hit GET /api/test-email?send=1 to attempt a send to TEST_RECIPIENT (or ?to=you@domain.com)

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

function extractEmail(addr?: string | null) {
  if (!addr) return '';
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}
function domainOf(addr: string) {
  const at = addr.lastIndexOf('@');
  return at > -1 ? addr.slice(at + 1).toLowerCase() : '';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const shouldSend = url.searchParams.get('send');
  const overrideTo = url.searchParams.get('to') || '';

  const fromRaw = process.env.SENDER_EMAIL || '';
  const from = extractEmail(fromRaw);
  const to = extractEmail(overrideTo || process.env.TEST_RECIPIENT || '');

  const info = {
    ok: true,
    route: '/api/test-email',
    hasPostmark: Boolean(process.env.POSTMARK_TOKEN),
    senderEmail: fromRaw,
    senderDomain: domainOf(from),
    testRecipient: to,
    recipientDomain: domainOf(to),
    tokenPrefix: (process.env.POSTMARK_TOKEN || '').slice(0, 6),
    messageStream: 'outbound',
  };

  if (!shouldSend) return NextResponse.json(info);

  if (!process.env.POSTMARK_TOKEN || !from || !to) {
    return NextResponse.json(
      { ...info, sendAttempted: false, error: 'Missing POSTMARK_TOKEN or SENDER_EMAIL or TEST_RECIPIENT' },
      { status: 400 }
    );
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN as string,
    },
    body: JSON.stringify({
      From: fromRaw,                 // allow "Name <user@domain>"
      To: to,
      Subject: 'Relax Inn — test message',
      TextBody: 'This is a test message from /api/test-email.',
      MessageStream: 'outbound',
      ReplyTo: from,
    }),
  });

  const body = await res.text();
  return NextResponse.json({
    ...info,
    sendAttempted: true,
    status: res.status,
    response: body,
  });
}
