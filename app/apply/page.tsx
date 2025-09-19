'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic'; // avoid prerender errors on this page

type Plan = 'weekly' | 'monthly';

function ApplyContent() {
  const params = useSearchParams();

  const [plan, setPlan] = useState<Plan>('weekly');
  const [checkin, setCheckin] = useState('');
  const [first, setFirst]   = useState('');
  const [last, setLast]     = useState('');
  const [email, setEmail]   = useState('');
  const [phone, setPhone]   = useState('');
  const [agree, setAgree]   = useState(false);

  // Email OTP
  const [otpToken, setOtpToken]       = useState('');
  const [otpCode, setOtpCode]         = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingOtp, setSendingOtp]   = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // ID verification (Stripe Identity)
  const [idVerified, setIdVerified]   = useState(false);
  const [idChecking, setIdChecking]   = useState(false);

  // Phone verification (disabled until Twilio is configured)
  const smsRequired = false;
  const phoneVerified = true; // treat as satisfied while disabled

  const [loading, setLoading] = useState(false);

  // Dates & formatting
  const start = useMemo(() => {
    const d = checkin ? new Date(checkin) : new Date();
    d.setHours(15, 0, 0, 0);
    return d;
  }, [checkin]);

  const end = useMemo(() => {
    const d = new Date(start);
    d.setDate(d.getDate() + (plan === 'monthly' ? 30 : 7));
    d.setHours(11, 0, 0, 0);
    return d;
  }, [start, plan]);

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  // If we returned from Stripe Identity, check status (?vs=...)
  useEffect(() => {
    const vs = params.get('vs');
    if (!vs) return;
    setIdChecking(true);
    fetch(`/api/identity/status?id=${encodeURIComponent(vs)}`)
      .then((r) => r.json())
      .then((j) => setIdVerified(j?.status === 'verified'))
      .finally(() => setIdChecking(false));
  }, [params]);

  const formComplete = Boolean(first && last && email && phone && agree);
  const canPay = formComplete && emailVerified && idVerified && (!smsRequired || phoneVerified);

  async function goToCheckout() {
    if (!canPay) return;
    try {
      setLoading(true);
      const r = await fetch('/api/checkout'
