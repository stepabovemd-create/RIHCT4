// app/api/otp/start/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function b64url(s: string) { return Buffer.from(s).toString('base64url'); }

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return new NextResponse('Missing email', { status: 400 });

  // 6-digit code valid for 10 minutes
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const exp = Date.now() + 10 * 60 * 1000;

  const secret = process.env.APP_SECRET as string;
  const codeHash = crypto.createHash('sha256').update(`${code}.${email}.${secret}`).digest('hex');
  const payload = JSON.stringify({ email, exp, codeHash });
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = `${b64url(payload)}.${sig}`;

  // send via Postmark
  if (process.env.POSTMARK_TOKEN && process.env.SENDER_EMAIL) {
    const text = `Your Relax Inn verification code is: ${code}\n\nThis code expires in 10 minutes.`;
    await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN as string },
      body: JSON.stringify({ From: process.env.SENDER_EMAIL, To: email, Subject: 'Your verification code', TextBody: text, MessageStream: 'outbound' }),
    });
  }

  return NextResponse.json({ token, expiresAt: exp });
}
