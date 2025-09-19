'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Plan = 'weekly' | 'monthly'

export default function Apply() {
  const [plan, setPlan] = useState<Plan>('weekly')
  const [checkin, setCheckin] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [agree, setAgree] = useState(false)

  // email OTP
  const [otpToken, setOtpToken] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)

  // ID verification
  const [idVerified, setIdVerified] = useState(false)
  const [idChecking, setIdChecking] = useState(false)

  // Phone (optional)
  const [smsRequired, setSmsRequired] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [smsCode, setSmsCode] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsChecking, setSmsChecking] = useState(false)

  const [loading, setLoading] = useState(false)
  const params = useSearchParams()

  const start = useMemo(() => { const d = checkin ? new Date(checkin) : new Date(); d.setHours(15,0,0,0); return d }, [checkin])
  const end = useMemo(() => { const d = new Date(start); d.setDate(d.getDate() + (plan === 'monthly' ? 30 : 7)); d.setHours(11,0,0,0); return d }, [start, plan])
  const fmt = (d: Date) => d.toLocaleString(undefined, { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' })

  useEffect(() => {
    // Handle return from Identity flow
    const vs = params.get('vs')
    if (vs) {
      setIdChecking(true)
      fetch(`/api/identity/status?id=${encodeURIComponent(vs)}`)
        .then(r=>r.json())
        .then(j=> setIdVerified(j?.status === 'verified'))
        .finally(()=> setIdChecking(false))
    }
    // Check if SMS is configured (twilio keys) — probe start endpoint
    fetch('/api/sms/start', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ phone: '+10000000000' })})
      .then(res => setSmsRequired(res.status !== 500))
      .catch(()=> setSmsRequired(false))
  }, [params])

  const formComplete = first && last && email && phone && agree
  const canPay = formComplete && emailVerified && idVerified && (!smsRequired || phoneVerified)

  async function goToCheckout() {
    if (!canPay) return
    try {
      setLoading(true)
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, first, last, email, phone }),
      })
      if (!r.ok) { alert(`Checkout error: ${await r.text()}`); return }
      const { url } = await r.json()
      if (!url) { alert('Checkout error: No URL returned'); return }
      window.location.href = url
    } finally {
      setLoading(false)
    }
  }

  async function sendOtp() {
    if (!email) return alert('Enter your email first')
    setSendingOtp(true)
    try {
      const r = await fetch('/api/otp/start', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email }) })
      if (!r.ok) { alert(await r.text()); return }
      const j = await r.json()
      setOtpToken(j.token)
      alert('We sent a 6-digit code to your email.')
    } finally { setSendingOtp(false) }
  }

  async function verifyOtp() {
    if (!otpToken || !otpCode) return
    setVerifyingOtp(true)
    try {
      const r = await fetch('/api/otp/verify', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, code: otpCode, token: otpToken }) })
      if (!r.ok) { alert(await r.text()); return }
      setEmailVerified(true)
    } finally { setVerifyingOtp(false) }
  }

  async function startIdVerification() {
    if (!first || !last || !email) return alert('Fill name and email first')
    const r = await fetch('/api/identity/start', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email, first, last }) })
    if (!r.ok) { alert(await r.text()); return }
    const j = await r.json()
    window.location.href = j.url
  }

  async function sendSms() {
    if (!smsRequired) return
    if (!phone) return alert('Enter your phone first')
    setSmsSending(true)
    try {
      const r = await fetch('/api/sms/start', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ phone }) })
      if (!r.ok) { alert(await r.text()); return }
      alert('We texted you a code.')
    } finally { setSmsSending(false) }
  }

  async function checkSms() {
    if (!smsRequired || !smsCode) return
    setSmsChecking(true)
    try {
      const r = await fetch('/api/sms/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ phone, code: smsCode }) })
      const j = await r.json().catch(()=>null)
      if (!r.ok || !j?.ok) { alert('Invalid code'); return }
      setPhoneVerified(true)
    } finally { setSmsChecking(false) }
  }

  return (
    <main>
      <div className="bg-blue-50 border-b border-blue-100">
        <div className="container py-2 text-sm text-blue-800">
          Email + ID verification required before payment. {smsRequired ? 'Phone verification enabled.' : 'Phone verification currently disabled.'}
        </div>
      </div>

      <div className="container py-10">
        <h1 className="text-2xl font-bold">Application & Payment</h1>
        <p className="text-slate-600 mt-1 text-sm">Complete verification steps, then proceed to payment.</p>

        <div className="mt-6 grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-6">
              <h2 className="font-semibold">Guest information</h2>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <label className="block"><span className="text-sm font-medium">First name</span><input className="input mt-1" value={first} onChange={e=>setFirst(e.target.value)} /></label>
                <label className="block"><span className="text-sm font-medium">Last name</span><input className="input mt-1" value={last} onChange={e=>setLast(e.target.value)} /></label>
                <label className="block"><span className="text-sm font-medium">Email</span><input type="email" className="input mt-1" value={email} onChange={e=>setEmail(e.target.value)} /></label>
                <label className="block"><span className="text-sm font-medium">Phone</span><input inputMode="tel" className="input mt-1" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
                <label className="block"><span className="text-sm font-medium">Plan</span>
                  <select className="select mt-1" value={plan} onChange={e=>setPlan(e.target.value as Plan)}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label className="block"><span className="text-sm font-medium">Check-in date</span><input type="date" className="input mt-1" value={checkin} onChange={e=>setCheckin(e.target.value)} /></label>
              </div>
              <div className="mt-6 flex items-start gap-2">
                <input id="agree" type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} className="mt-1" />
                <label htmlFor="agree" className="text-sm text-slate-700">I agree to the <a className="text-[color:var(--brand)] underline" href="/terms" target="_blank" rel="noreferrer">Terms & Conditions</a>.</label>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Step 1 — Verify your email</h2><span className={`badge ${emailVerified ? 'bg-blue-100 text-blue-800' : ''}`}>{emailVerified ? 'Verified' : 'Required'}</span></div>
              {!emailVerified && (
                <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3">
                  <button onClick={sendOtp} disabled={!email || sendingOtp} className="btn btn-outline">{sendingOtp ? 'Sending…' : 'Send code'}</button>
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <input className="input" placeholder="Enter 6-digit code" value={otpCode} onChange={e=>setOtpCode(e.target.value)} />
                    <button onClick={verifyOtp} disabled={!otpToken || !otpCode || verifyingOtp} className="btn btn-primary">{verifyingOtp ? 'Verifying…' : 'Verify'}</button>
                  </div>
                </div>
              )}
              {emailVerified && <p className="mt-3 text-sm text-green-700">Email verified.</p>}
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Step 2 — Verify your ID</h2><span className={`badge ${idVerified ? 'bg-blue-100 text-blue-800' : ''}`}>{idVerified ? 'Verified' : 'Required'}</span></div>
              {!idVerified && (
                <div className="mt-4">
                  <button onClick={startIdVerification} className="btn btn-primary" disabled={!first || !last || !email || idChecking}>
                    {idChecking ? 'Checking…' : 'Start ID verification'}
                  </button>
                  <p className="text-xs text-slate-500 mt-2">You’ll be redirected to a secure Stripe Identity page and returned here.</p>
                </div>
              )}
              {idVerified && <p className="mt-3 text-sm text-green-700">ID verified.</p>}
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Step 3 — Verify your phone {smsRequired ? '' : '(disabled)'}</h2>
                <span className={`badge ${phoneVerified ? 'bg-blue-100 text-blue-800' : ''}`}>{smsRequired ? (phoneVerified ? 'Verified' : 'Required') : 'Optional (off)'}</span></div>
              {smsRequired && !phoneVerified && (
                <div className="mt-4 grid gap-3">
                  <button onClick={sendSms} disabled={!phone || smsSending} className="btn btn-outline">{smsSending ? 'Texting…' : 'Text me a code'}</button>
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <input className="input" placeholder="Enter SMS code" value={smsCode} onChange={e=>setSmsCode(e.target.value)} />
                    <button onClick={checkSms} disabled={!smsCode || smsChecking} className="btn btn-primary">{smsChecking ? 'Checking…' : 'Verify'}</button>
                  </div>
                </div>
              )}
              {phoneVerified && <p className="mt-3 text-sm text-green-700">Phone verified.</p>}
              {!smsRequired && <p className="mt-3 text-sm text-slate-500">Add Twilio keys to require phone verification.</p>}
            </div>

            <div className="card p-6">
              <div className="flex flex-wrap gap-3">
                <button onClick={goToCheckout} disabled={!canPay || loading} className={`btn ${!canPay || loading ? 'btn-outline opacity-60 cursor-not-allowed' : 'btn-primary'}`}>
                  {loading ? 'Opening Checkout…' : 'Pay in Test Mode'}
                </button>
              </div>
              {!canPay && (
                <p className="mt-3 text-xs text-slate-500">Complete all fields, verify <strong>email</strong> and <strong>ID</strong>{smsRequired ? ' and phone' : ''}, and accept Terms to continue.</p>
              )}
            </div>
          </div>

          <aside className="card p-6 h-max sticky top-6">
            <p className="font-semibold">Stay summary</p>
            <dl className="mt-3 text-sm text-slate-700 space-y-1">
              <div className="flex justify-between"><dt>Plan</dt><dd className="font-medium capitalize">{plan}</dd></div>
              <div className="flex justify-between"><dt>Check-in</dt><dd className="font-medium">{fmt(start)}</dd></div>
              <div className="flex justify-between"><dt>Check-out</dt><dd className="font-medium">{fmt(end)}</dd></div>
            </dl>
          </aside>
        </div>
      </div>
    </main>
  )
}
