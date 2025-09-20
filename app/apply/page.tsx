'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Plan = 'weekly' | 'monthly';

/** ---------- Error Boundary so the page never goes blank ---------- */
class ApplyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; msg?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, msg: String(err?.message || err) };
  }
  componentDidCatch(error: any, info: any) {
    console.error('ApplyErrorBoundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <main style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Something went wrong on this page.</h1>
          <p style={{ marginTop: 8, color: '#b91c1c', wordBreak: 'break-word' }}>
            Error: {this.state.msg}
          </p>
          <p style={{ marginTop: 12 }}>
            Refresh the page and try again, or click “Start ID verification” once more.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}

/** -------------------- Main Page -------------------- */
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
  const [debugVs, setDebugVs] = useState<string>(''); // shows current VS id (or (none))

  // Phone verification (disabled for now)
  const smsRequired = false;
  const phoneVerified = true;

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch {}
  }, []);

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

  // On return from Stripe Identity, poll status using either ?vs=... or sessionStorage('rihc_vs')
  useEffect(() => {
    const vsFromUrl = params.get('vs');
    const vsFromStorage =
      typeof window !== 'undefined' ? window.sessionStorage.getItem('rihc_vs') : null;
    const vsId = vsFromUrl || vsFromStorage || '';

    setDebugVs(vsId || '(none)');
    if (!vsId) return;

    let cancelled = false;

    const check = async (vs: string, attempt: number = 0) => {
      if (cancelled) return;
      setIdChecking(true);
      setIdError('');

      try {
        const r = await fetch(`/api/identity/status?id=${encodeURIComponent(vs)}`, {
          cache: 'no-store',
        });
        const j = await r.json().catch(() => null);

        if (cancelled) return;

        if (j?.ok && j.status === 'verified') {
          setIdVerified(true);
          try { window.sessionStorage.removeItem('rihc_vs'); } catch {}
        } else if (j?.ok && j.status === 'processing' && attempt < 10) {
          setTimeout(() => { void check(vs, attempt + 1); }, 2000);
        } else if (j?.ok && j.status === 'requires_input') {
          setIdError('ID verification needs more input. Please restart the verification step.');
          try { window.sessionStorage.removeItem('rihc_vs'); } catch {}
        } else if (j?.ok && j.status === 'canceled') {
          setIdError('ID verification was canceled.');
          try { window.sessionStorage.removeItem('rihc_vs'); } catch {}
        } else {
          setIdError(j?.error || 'Could not confirm ID yet. Try again in a moment.');
        }
      } catch (e: any) {
        setIdError(e?.message || String(e));
      } finally {
        if (!cancelled) setIdChecking(false);
      }
    };

    void check(vsId, 0);
    return () => { cancelled = true; };
  }, [params]);

  const formComplete = Boolean(first && last && email && phone && agree);
  const canPay = formComplete && emailVerified && idVerified && phoneVerified;

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

    // IMPORTANT: send the exact origin we're on so Stripe returns to the same host
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    const r = await fetch('/api/identity/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, first, last, baseUrl }),
    });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    const j = await r.json();

    // Save the verification session ID locally; we'll use it after redirect
    try { window.sessionStorage.setItem('rihc_vs', j.id); } catch {}

    // Stripe will return to `${baseUrl}/apply`
    window.location.href = j.url;
  }

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 16,
    background: '#fff',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    color: '#0f172a',
  };

  return (
    <main>
      {/* Debug ribbon: shows which VS id (if any) we're using */}
      <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
        <div style={{ ...containerStyle, paddingTop: 10, paddingBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#1e40af' }}>
            Debug — VS: <code>{debugVs || '(none)'}</code> · emailVerified:
            <b> {String(emailVerified)}</b> · idVerified:<b> {String(idVerified)}</b> · canPay:
            <b> {String(canPay)}</b>
            <button
              onClick={() => {
                try { window.sessionStorage.removeItem('rihc_vs'); } catch {}
                location.reload();
              }}
              style={{ marginLeft: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #93c5fd', background: '#dbeafe' }}
              title="Clear saved VS id and reload"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div style={containerStyle}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Application & Payment</h1>
        <p style={{ marginTop: 6, color: '#475569' }}>
          Complete verification steps, then proceed to payment.
        </p>

        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr', alignItems: 'start' }}>
          {/* Left column (stacked on mobile) */}
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Guest info */}
            <div style={cardStyle}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Guest information</h2>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>First name</div>
                  <input value={first} onChange={(e) => setFirst(e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }} />
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Last name</div>
                  <input value={last} onChange={(e) => setLast(e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }} />
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Email</div>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }} />
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Phone</div>
                  <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }} />
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Plan</div>
                  <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Check-in date</div>
                  <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }} />
                </label>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
                <span style={{ fontSize: 13, color: '#334155' }}>
                  I agree to the <a href="/terms" target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>Terms & Conditions</a>.
                </span>
              </label>
            </div>

            {/* Email verification */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Step 1 — Verify your email</h2>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: emailVerified ? '#dbeafe' : '#e2e8f0',
                  color: emailVerified ? '#1e40af' : '#475569',
                  fontSize: 12
                }}>
                  {emailVerified ? 'Verified' : 'Required'}
                </span>
              </div>
              {!emailVerified && (
                <div style={{ marginTop: 12, display: 'grid', gap: 12, gridTemplateColumns: 'auto 1fr auto' }}>
                  <button onClick={sendOtp} disabled={!email || sendingOtp} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
                    {sendingOtp ? 'Sending…' : 'Send code'}
                  </button>
                  <input
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px' }}
                  />
                  <button onClick={verifyOtp} disabled={!otpToken || !otpCode || verifyingOtp} style={{ padding: '8px 12px', borderRadius: 10, background: '#1d4ed8', color: '#fff', border: 0 }}>
                    {verifyingOtp ? 'Verifying…' : 'Verify'}
                  </button>
                </div>
              )}
              {emailVerified && <p style={{ marginTop: 8, color: '#166534', fontSize: 13 }}>Email verified.</p>}
            </div>

            {/* ID verification */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Step 2 — Verify your ID</h2>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: idVerified ? '#dbeafe' : '#e2e8f0',
                  color: idVerified ? '#1e40af' : '#475569',
                  fontSize: 12
                }}>
                  {idVerified ? 'Verified' : 'Required'}
                </span>
              </div>

              {!idVerified && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={startIdVerification}
                    disabled={!first || !last || !email || idChecking}
                    style={{ padding: '8px 12px', borderRadius: 10, background: '#1d4ed8', color: '#fff', border: 0 }}
                  >
                    {idChecking ? 'Checking…' : 'Start ID verification'}
                  </button>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    You’ll be redirected to a secure Stripe Identity page and returned here.
                  </p>

                  {idChecking && <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Confirming your verification…</p>}
                  {!!idError && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>Problem: {idError}</p>}
                </div>
              )}

              {idVerified && <p style={{ marginTop: 8, color: '#166534', fontSize: 13 }}>ID verified.</p>}
            </div>

            {/* Actions */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={goToCheckout}
                  disabled={!canPay || loading}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 0,
                    background: !canPay || loading ? '#e2e8f0' : '#1d4ed8',
                    color: !canPay || loading ? '#475569' : '#fff',
                    cursor: !canPay || loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Opening Checkout…' : 'Pay in Test Mode'}
                </button>
              </div>
              {!canPay && (
                <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  Complete all fields, verify <b>email</b> and <b>ID</b>, and accept Terms to continue.
                </p>
              )}
            </div>
          </div>

          {/* Right column (simple summary) */}
          <aside style={{ ...cardStyle }}>
            <p style={{ fontWeight: 600 }}>Stay summary</p>
            <dl style={{ marginTop: 8, fontSize: 14, color: '#334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt>Plan</dt><dd style={{ margin: 0, fontWeight: 600, textTransform: 'capitalize' }}>{plan}</dd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <dt>Check-in</dt><dd style={{ margin: 0, fontWeight: 600 }}>{fmt(start)}</dd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <dt>Check-out</dt><dd style={{ margin: 0, fontWeight: 600 }}>{fmt(end)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function Apply() {
  return (
    <ApplyErrorBoundary>
      <Suspense
        fallback={
          <main style={{ padding: 24, fontFamily: 'system-ui' }}>
            <h1 style={{ fontSize: 22, margin: 0 }}>Application & Payment</h1>
            <p style={{ marginTop: 8, color: '#475569' }}>Loading…</p>
          </main>
        }
      >
        <ApplyContent />
      </Suspense>
    </ApplyErrorBoundary>
  );
}
