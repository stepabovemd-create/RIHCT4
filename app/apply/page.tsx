'use client'
import React, { useMemo, useState, useRef } from 'react'

type Plan = 'weekly' | 'monthly'

export default function Apply() {
  const [plan, setPlan] = useState<Plan>('weekly')
  const [checkin, setCheckin] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [agree, setAgree] = useState(false)
  const [idPreview, setIdPreview] = useState<string | null>(null)
  const [idFile, setIdFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')

  const fileInput = useRef<HTMLInputElement | null>(null)

  const start = useMemo(() => {
    const d = checkin ? new Date(checkin) : new Date()
    d.setHours(15, 0, 0, 0) // 3pm check-in
    return d
  }, [checkin])

  const end = useMemo(() => {
    const d = new Date(start)
    d.setDate(d.getDate() + (plan === 'monthly' ? 30 : 7))
    d.setHours(11, 0, 0, 0) // 11am check-out
    return d
  }, [start, plan])

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  function onPickId(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setIdFile(f || null)
    if (f) {
      const reader = new FileReader()
      reader.onload = () => setIdPreview(reader.result as string)
      reader.readAsDataURL(f)
    } else {
      setIdPreview(null)
    }
  }

  const formComplete =
    first.trim() && last.trim() && email.trim() && phone.trim() && idFile && agree

  async function goToCheckout() {
    if (!formComplete) return
    try {
      setLoading(true)
      // For now: pass core fields to the server so they land on Stripe
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          plan,
          first, last, email, phone,
          // NOTE: we’ll handle ID upload to storage in the next step
        }),
      })
      if (!r.ok) {
        const t = await r.text()
        alert(`Checkout error: ${t}`)
        return
      }
      const { url } = await r.json()
      if (!url) {
        alert('Checkout error: No URL returned')
        return
      }
      window.location.href = url
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-600" />
            <div>
              <p className="font-semibold">Relax Inn</p>
              <p className="text-xs text-slate-500">Hartford City · Extended Stay</p>
            </div>
          </div>
          <a href="/" className="text-sm">Home</a>
        </div>
      </header>

      <div className="bg-blue-50 border-b border-blue-100">
        <div className="mx-auto max-w-6xl px-4 py-2 text-sm text-blue-800">
          <strong>TEST MODE:</strong> Demo only—no real charges, keys, or emails.
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold">Application & Payment</h1>
        <p className="text-slate-600 mt-1 text-sm">Please complete all fields before paying.</p>

        <div className="mt-6 grid lg:grid-cols-3 gap-8">
          {/* Form card */}
          <div className="lg:col-span-2 rounded-2xl ring-1 ring-slate-200 p-6 bg-white">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium">First name</span>
                <input className="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2"
                  value={first} onChange={e=>setFirst(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Last name</span>
                <input className="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2"
                  value={last} onChange={e=>setLast(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Email</span>
                <input type="email" className="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2"
                  value={email} onChange={e=>setEmail(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Phone</span>
                <input inputMode="tel" className="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2"
                  value={phone} onChange={e=>setPhone(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Plan</span>
                <select className="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2"
                  value={plan} onChange={e=>setPlan(e.target.value as Plan)}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Check-in date</span>
                <input type="date" className="mt-1 w-full rounded-2xl border border-slate-300 px-3 py-2"
                  value={checkin} onChange={e=>setCheckin(e.target.value)} />
              </label>
            </div>

            {/* ID upload */}
            <div className="mt-6">
              <span className="text-sm font-medium">Photo ID (front)</span>
              <div className="mt-2 flex items-center gap-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onPickId}
                  className="block text-sm"
                />
                {idPreview && (
                  <img src={idPreview} alt="ID preview" className="h-16 w-24 object-cover rounded-md ring-1 ring-slate-200" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Accepted: image or PDF. (We’ll store this securely in the next step.)</p>
            </div>

            {/* Terms */}
            <div className="mt-6 flex items-start gap-2">
              <input id="agree" type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} className="mt-1" />
              <label htmlFor="agree" className="text-sm text-slate-700">
                I have read and agree to the{" "}
                <a className="text-blue-700 underline" href="/terms" target="_blank" rel="noreferrer">
                  Terms & Conditions
                </a>.
              </label>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={()=>setCode(String(Math.floor(100000+Math.random()*900000)))}
                className="rounded-2xl px-5 py-3 text-sm font-semibold border border-slate-300 hover:bg-slate-50"
              >
                Simulate door code (demo)
              </button>
              <button
                onClick={goToCheckout}
                disabled={!formComplete || loading}
                className={`rounded-2xl px-5 py-3 text-sm font-semibold border ${
                  !formComplete || loading
                    ? 'border-slate-300 text-slate-400 bg-slate-100 cursor-not-allowed'
                    : 'border-blue-600 text-white bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? 'Opening Checkout…' : 'Pay in Test Mode'}
              </button>
            </div>

            {!formComplete && (
              <p className="mt-3 text-xs text-slate-500">
                Please complete all fields, upload your ID, and agree to Terms to continue.
              </p>
            )}
          </div>

          {/* Summary card */}
          <aside className="rounded-2xl ring-1 ring-slate-200 p-6 bg-white">
            <p className="font-semibold">Stay summary</p>
            <dl className="mt-3 text-sm text-slate-700 space-y-1">
              <div className="flex justify-between"><dt>Plan</dt><dd className="font-medium capitalize">{plan}</dd></div>
              <div className="flex justify-between"><dt>Check-in</dt><dd className="font-medium">{fmt(start)}</dd></div>
              <div className="flex justify-between"><dt>Check-out</dt><dd className="font-medium">{fmt(end)}</dd></div>
            </dl>
            {code && (
              <div className="mt-6 rounded-xl ring-1 ring-slate-200 p-4">
                <p className="text-sm text-slate-500">Door code (demo):</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">{code}</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
