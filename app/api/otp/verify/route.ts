// app/api/otp/verify/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const { email, code, token } = await req.json();
  if (!email || !code || !token) return new NextResponse('Missing fields', { status: 400 });

  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return new NextResponse('Bad token', { status: 400 });
  const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');

  const secret = process.env.APP_SECRET as string;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  if (expectedSig !== sig) return new NextResponse('Invalid token signature', { status: 400 });

  const payload = JSON.parse(payloadStr) as { email: string; exp: number; codeHash: string };
  if (payload.email !== email) return new NextResponse('Email mismatch', { status: 400 });
  if (Date.now() > payload.exp) return new NextResponse('Code expired', { status: 400 });

  const calcHash = crypto.createHash('sha256').update(`${code}.${email}.${secret}`).digest('hex');
  if (calcHash !== payload.codeHash) return new NextResponse('Invalid code', { status: 400 });

  return NextResponse.json({ verified: true });
}
