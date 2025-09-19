'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic'; // avoid prerender issues

type Plan = 'weekly' | 'monthly';

function ApplyContent() {
  const params = useSearchParams();

  const [plan, setPlan] = useState<Plan>('weekly');
  const [checkin, setCheckin] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);

  // Email OTP
  const [otpToken, setOtpToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // ID verification
  const [idVerified, setIdVerified] = useState(false);
  const [idChecking, setIdChecking] = useState(false);
  const [idError, setIdError] = useState<string>('');

  // Phone verification (disabled for now)
  const smsRequired = false;
  const phoneVerified = true; // treat as satisfied until Twilio is added

  const [loading, setLoading] = useState(false);

  // Dates
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

  // After returning from Stripe Identity (?vs=...), poll for status until it's verified
  useEffect(() => {
    const vs = params.get('vs');
    if (!vs) return;

    let cancelled = false;

    async function check(attempt = 0) {
      if (cancelled) return;
      setIdChecking(true);
      setIdError('');

      try {
        const r = await fetch(`/api/identity/status?id=${encodeURIComponent(vs)}`, { cache: 'no-store' });
        const j = await r.json().catch(() => null);

        if (cancelled) return;

        if (j?.ok && j.status === 'verified') {
          setIdVerified(true);
        } else if (j?.ok && j.status === 'processing' && attempt < 8) {
          // Stripe sometimes needs a few seconds to finalize; poll a few times
          setTimeout(() => check(attempt + 1), 2000);
        } else if (j?.ok && j.status === 'requires_input') {
          setIdError('ID verification needs more input. Please restart the verification step.');
        } else if (j?.ok && j.status === 'canceled') {
          setIdError('ID verification was canceled.');
        } else {
          setIdError(j?.error || 'Could not confirm ID yet. Try again in a moment.');
        }
      } catch (e: any) {
        if (!cancelled) setIdError(e?.message || String(e));
      } finally {
        if (!cancelled) setIdChecking(false);
      }
    }

    check(0);
    return () => {
      cancelled = true;
    };
  }, [params]);

  const formComplete = Boolean(first && last && email && phone && agree);
  const canPay = formComplete && emailVerified && idVerified && (!smsRequired || phoneVerified);

  async function goToCheckout() {
    if (!canPay) return;
    try {
      setLoading(true);
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, first, last, email, phone }),
      });
      if (!r.ok) {
        alert(`Checkout error: ${await r.text()}`);
        return;
      }
      const { url } = await r.json();
      if (!url) {
        alert('Checkout error: No URL returned');
        return;
      }
      window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    if (!email) return alert('Enter your email first');
    setSendingOtp(true);
    try {
      const r = await fetch('/api/otp/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        alert(await r.text());
        return;
      }
      const j = await r.json();
      setOtpToken(j.token);
      alert('We sent a 6-digit code to your email.');
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyOtp() {
    if (!otpToken || !otpCode) return;
    setVerifyingOtp(true);
    try {
      const r = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode, token: otpToken }),
      });
      if (!r.ok) {
        alert(await r.text());
        return;
      }
      setEmailVerified(true);
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function startIdVerification() {
    if (!first || !last || !email) return alert('Fill name and email first');
    const r = await fetch('/api/identity/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, first, last }),
    });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    const j = await r.json();
    window.location.href = j.url; // Stripe-hosted Identity flow; returns to /apply?vs=...
  }

  return (
    <main>
      <div className="bg-blue-50 border-b border-blue-100">
        <div className="container py-2 text-sm text-blue-800">
          Email + ID verification required before payment. Phone verification is currently disabled.
        </div>
      </div>

      <div className="container py-10">
        <h1 className="text-2xl font-bold">Application & Payment</h1>
        <p className="text-slate-600 mt-1 text-sm">Complete verification steps, then proceed to payment.</p>

        <div className="mt-6 grid lg:grid-cols-3 gap-8">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Guest info */}
            <div className="card p-6">
              <h2 className="font-semibold">Guest information</h2>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <label className="block">
                  <span className="text-sm font-medium">First name</span>
                  <input className="input mt-1" value={first} onChange={(e) => setFirst(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Last name</span>
                  <input className="input mt-1" value={last} onChange={(e) => setLast(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Email</span>
                  <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Phone</span>
                  <input inputMode="tel" className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Plan</span>
                  <select className="select mt-1" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Check-in date</span>
                  <input type="date" className="input mt-1" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
                </label>
              </div>
              <div className="mt-6 flex items-start gap-2">
                <input
                  id="agree"
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-1"
                />
                <label htmlFor="agree" className="text-sm text-slate-700">
                  I agree to the{' '}
                  <a className="text-[color:var(--brand)] underline" href="/terms" target="_blank" rel="noreferrer">
                    Terms & Conditions
                  </a>.
                </label>
              </div>
            </div>

            {/* Email verification */}
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Step 1 — Verify your email</h2>
                <span className={`badge ${emailVerified ? 'bg-blue-100 text-blue-800' : ''}`}>
                  {emailVerified ? 'Verified' : 'Required'}
                </span>
              </div>
              {!emailVerified && (
                <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3">
                  <button onClick={sendOtp} disabled={!email || sendingOtp} className="btn btn-outline">
                    {sendingOtp ? 'Sending…' : 'Send code'}
                  </button>
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <input
                      className="input"
                      placeholder="Enter 6-digit code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                    <button
                      onClick={verifyOtp}
                      disabled={!otpToken || !otpCode || verifyingOtp}
                      className="btn btn-primary"
                    >
                      {verifyingOtp ? 'Verifying…' : 'Verify'}
                    </button>
                  </div>
                </div>
              )}
              {emailVerified && <p className="mt-3 text-sm text-green-700">Email verified.</p>}
            </div>

            {/* ID verification */}
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Step 2 — Verify your ID</h2>
                <span className={`badge ${idVerified ? 'bg-blue-100 text-blue-800' : ''}`}>
                  {idVerified ? 'Verified' : 'Required'}
                </span>
              </div>

              {!idVerified && (
                <div className="mt-4">
                  <button
                    onClick={startIdVerification}
                    className="btn btn-primary"
                    disabled={!first || !last || !email || idChecking}
                  >
                    {idChecking ? 'Checking…' : 'Start ID verification'}
                  </button>
                  <p className="text-xs text-slate-500 mt-2">
                    You’ll be redirected to a secure Stripe Identity page and returned here.
                  </p>

                  {idChecking && <p className="text-xs text-slate-500 mt-2">Confirming your verification…</p>}
                  {!!idError && <p className="text-xs text-red-600 mt-2">Problem: {idError}</p>}
                </div>
              )}

              {idVerified && <p className="mt-3 text-sm text-green-700">ID verified.</p>}
            </div>

            {/* Actions */}
            <div className="card p-6">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={goToCheckout}
                  disabled={!canPay || loading}
                  className={`btn ${!canPay || loading ? 'btn-outline opacity-60 cursor-not-allowed' : 'btn-primary'}`}
