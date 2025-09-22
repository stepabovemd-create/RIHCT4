'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Plan = 'weekly' | 'monthly';

// ====== Brand setup ======
const BRAND = '#135c92';
const BRAND_DARK = '#0f3f6c';
const ACCENT_BG = '#f8fafc';
const CARD_BORDER = '#e2e8f0';
const LOGO_URL = '/relax-inn-logo.png';

// ====== Persist form between redirects ======
type SavedForm = {
  plan: Plan;
  checkin: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  agree: boolean;
  emailVerified?: boolean;
};
const STORAGE_KEY = 'rihc_apply_form';
const FORCE_KEY = 'rihc_force_once';

// ====== Error Boundary ======
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
            Refresh and try again, or click “Start ID verification” once more.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}

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

  // Phone verification (future)
  const smsRequired = false;
  const phoneVerified = true;

  const [loading, setLoading] = useState(false);

  // NEW: persist `force=1` once across redirects
  const [forceOnce, setForceOnce] = useState(false);
  useEffect(() => {
    const fromParam = params.get('force') === '1';
    try {
      if (fromParam) window.localStorage.setItem(FORCE_KEY, '1');
      const fromStorage = window.localStorage.getItem(FORCE_KEY) === '1';
      setForceOnce(fromParam || fromStorage);
    } catch {}
  }, [params]);

  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch {}
  }, []);

  // Load saved form
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const s = JSON.parse(raw) as SavedForm;
        if (s && typeof s === 'object') {
          if (s.plan) setPlan(s.plan);
          if (s.checkin) setCheckin(s.checkin);
          if (s.first) setFirst(s.first);
          if (s.last) setLast(s.last);
          if (s.email) setEmail(s.email);
          if (s.phone) setPhone(s.phone);
          if (typeof s.agree === 'boolean') setAgree(s.agree);
          if (typeof s.emailVerified === 'boolean') setEmailVerified(s.emailVerified);
        }
      }
    } catch {}
  }, []);

  // Save form
  useEffect(() => {
    const data: SavedForm = { plan, checkin, first, last, email, phone, agree, emailVerified };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }, [plan, checkin, first, last, email, phone, agree, emailVerified]);

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

  // After Stripe Identity returns, poll status (?vs=... or sessionStorage)
  useEffect(() => {
    const vsFromUrl = params.get('vs');
    const vsFromStorage =
      typeof window !== 'undefined' ? window.sessionStorage.getItem('rihc_vs') : null;
    const vsId = vsFromUrl || vsFromStorage || '';

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
        body: JSON.stringify({
          plan, first, last, email, phone,
          forceMoveIn: forceOnce, // <- keep forcing if localStorage said so
        }),
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

      // we used it — clear the one-time force
      try { window.localStorage.removeItem(FORCE_KEY); } catch {}

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

    // Save form & force flag just before leaving
    try {
      const data: SavedForm = { plan, checkin, first, last, email, phone, agree, emailVerified };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (forceOnce) window.localStorage.setItem(FORCE_KEY, '1');
    } catch {}

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
    try { window.sessionStorage.setItem('rihc_vs', j.id); } catch {}
    window.location.href = j.url;
  }

  // --------- Styling helpers ----------
  const containerStyle: React.CSSProperties = {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    color: '#0f172a',
  };
  const card: React.CSSProperties = {
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: 14,
    padding: 18,
    background: '#fff',
    boxShadow: '0 1px 0 rgba(15,23,42,0.03)',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 12,
    border: 0,
    background: BRAND,
    color: '#fff',
    cursor: 'pointer',
  };
  const btnOutline: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 10,
    border: `1px solid ${CARD_BORDER}`,
    background: '#fff',
    cursor: 'pointer',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600 };
  const input: React.CSSProperties = {
    width: '100%',
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: 10,
    padding: '10px 12px',
  };

  return (
    <main style={{ background: ACCENT_BG, minHeight: '100vh' }}>
      {/* Header */}
      <header
        style={{
          background: `linear-gradient(180deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
          color: '#fff',
          padding: '18px 0',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <div style={{ ...containerStyle, paddingTop: 0, paddingBottom: 0, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                flexShrink: 0,
              }}
              aria-label="Relax Inn Logo"
            >
              <img
                src={LOGO_URL}
                alt="Relax Inn logo"
                onError={(e) => { (e.currentTarget.style.display = 'none'); }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <span style={{ color: BRAND, fontWeight: 800 }}>RI</span>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
                Relax Inn of Hartford City
              </div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                Extended-stay application & secure payment
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={containerStyle}>
        <div style={{ marginTop: 18, marginBottom: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Application & Payment
          </h1>
          <p style={{ marginTop: 6, color: '#475569', fontSize: 14 }}>
            Verify your email and ID, then complete checkout. Your door code arrives by email.
          </p>
          {forceOnce && (
            <p style={{ marginTop: 6, color: '#1e40af', fontSize: 12 }}>
              (Test mode: Move-in fee will be <b>forced</b> on this checkout.)
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr', alignItems: 'start' }}>
          {/* Left column */}
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Guest info */}
            <section style={card}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                Guest information
              </h2>
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: '1fr 1fr',
                  marginTop: 12,
                }}
              >
                <label>
                  <div style={label}>First name</div>
                  <input value={first} onChange={(e) => setFirst(e.target.value)} style={input} />
                </label>
                <label>
                  <div style={label}>Last name</div>
                  <input value={last} onChange={(e) => setLast(e.target.value)} style={input} />
                </label>
                <label>
                  <div style={label}>Email</div>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
                </label>
                <label>
                  <div style={label}>Phone</div>
                  <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={input} />
                </label>
                <label>
                  <div style={label}>Plan</div>
                  <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} style={input}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label>
                  <div style={label}>Check-in date</div>
                  <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} style={input} />
                </label>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
                <span style={{ fontSize: 13, color: '#334155' }}>
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noreferrer" style={{ color: BRAND, fontWeight: 600 }}>
                    Terms & Conditions
                  </a>.
                </span>
              </label>
            </section>

            {/* Email verification */}
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Step 1 — Verify your email
                </h2>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: emailVerified ? '#dbeafe' : '#e2e8f0',
                    color: emailVerified ? '#1e40af' : '#475569',
                    fontSize: 12,
                  }}
                >
                  {emailVerified ? 'Verified' : 'Required'}
                </span>
              </div>
              {!emailVerified && (
                <div style={{ marginTop: 12, display: 'grid', gap: 12, gridTemplateColumns: 'auto 1fr auto' }}>
                  <button onClick={sendOtp} disabled={!email || sendingOtp} style={btnOutline}>
                    {sendingOtp ? 'Sending…' : 'Send code'}
                  </button>
                  <input
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    style={input}
                  />
                  <button onClick={verifyOtp} disabled={!otpToken || !otpCode || verifyingOtp} style={btnPrimary}>
                    {verifyingOtp ? 'Verifying…' : 'Verify'}
                  </button>
                </div>
              )}
              {emailVerified && (
                <p style={{ marginTop: 8, color: '#166534', fontSize: 13 }}>Email verified.</p>
              )}
            </section>

            {/* ID verification */}
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Step 2 — Verify your ID
                </h2>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: idVerified ? '#dbeafe' : '#e2e8f0',
                    color: idVerified ? '#1e40af' : '#475569',
                    fontSize: 12,
                  }}
                >
                  {idVerified ? 'Verified' : 'Required'}
                </span>
              </div>

              {!idVerified && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={startIdVerification}
                    disabled={!first || !last || !email || idChecking}
                    style={btnPrimary}
                  >
                    {idChecking ? 'Checking…' : 'Start ID verification'}
                  </button>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    You’ll be redirected to a secure Stripe Identity page and returned here.
                  </p>

                  {idChecking && (
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                      Confirming your verification…
                    </p>
                  )}
                  {!!idError && (
                    <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>
                      Problem: {idError}
                    </p>
                  )}
                </div>
              )}

              {idVerified && (
                <p style={{ marginTop: 8, color: '#166534', fontSize: 13 }}>ID verified.</p>
              )}
            </section>

            {/* Actions */}
            <section style={card}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={goToCheckout}
                  disabled={!canPay || loading}
                  style={{
                    ...btnPrimary,
                    background: !canPay || loading ? '#e2e8f0' : BRAND,
                    color: !canPay || loading ? '#475569' : '#fff',
                    cursor: !canPay || loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Opening Checkout…' : 'Proceed to Payment (Test Mode)'}
                </button>
              </div>
              {!canPay && (
                <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  Complete all fields, verify <b>email</b> and <b>ID</b>, and accept Terms to continue.
                </p>
              )}
              <ul style={{ marginTop: 10, paddingLeft: 18, color: '#475569', fontSize: 12 }}>
                <li>Payments are processed securely by Stripe.</li>
                <li>Once paid, you’ll receive your door code by email.</li>
              </ul>
            </section>
          </div>

          {/* Right column (summary) */}
          <aside style={{ ...card }}>
            <p style={{ fontWeight: 700, margin: 0 }}>Stay summary</p>
            <dl style={{ marginTop: 8, fontSize: 14, color: '#334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt>Plan</dt>
                <dd style={{ margin: 0, fontWeight: 600, textTransform: 'capitalize' }}>{plan}</dd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <dt>Check-in</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(start)}</dd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <dt>Check-out</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(end)}</dd>
              </div>
            </dl>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CARD_BORDER}`, fontSize: 12, color: '#64748b' }}>
              Need help? Call the front desk.
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ background: '#ffffff', borderTop: `1px solid ${CARD_BORDER}`, marginTop: 32 }}>
        <div style={{ ...containerStyle, paddingTop: 18, paddingBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: BRAND, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800
            }}>RI</div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>Relax Inn of Hartford City</div>
          </div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            24/7 Front Desk • <a href="tel:0000000000" style={{ color: BRAND, textDecoration: 'none', fontWeight: 600 }}>({`xxx`}) xxx-xxxx</a>
          </div>
        </div>
      </footer>
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
