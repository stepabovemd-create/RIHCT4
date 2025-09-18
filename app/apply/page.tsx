'use client'
import React, { useMemo, useRef, useState } from 'react'

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

  const formComplete = first && last && email && phone && idFile && agree

  async function goToCheckout() {
    if (!formComplete) return
    try {
      setLoading(true)
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, first, last, email, phone }),
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
    } catch (e: any) {
      alert(`Checkout error: ${e?.message || 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      {/* Test banner */}
      <div className="bg-blue-50 border-b border-blue-100">
        <div className="container py-2 text-sm text-blue-800">
          <strong>TEST MODE:</strong> Demo only—no real charges, keys, or emails.
        </div>
      </div>

      <div className="container py-10">
        <h1 className="text-2xl font-bold">Application & Payment</h1>
        <p className="text-slate-600 mt-1 text-sm">Please complete all fields before paying.</p>

        <div className="mt-6 grid lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2 card p-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium">First name</span>
                <input className="input mt-1" value={first} onChange={e=>setFirst(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Last name</span>
                <input className="input mt-1" value={last} onChange={e=>setLast(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Email</span>
                <input type="email" className="input mt-1" value={email} onChange={e=>setEmail(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Phone</span>
                <input inputMode="tel" className="input mt-1" value={phone} onChange={e=>setPhone(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Plan</span>
                <select className="select mt-1" value={plan} onChange={e=>setPlan(e.target.value as Plan)}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Check-in date</span>
                <input type="date" className="input mt-1" value={checkin} onChange={e=>setCheckin(e.target.value)} />
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
              <p className="text-xs text-slate-500 mt-1">Accepted: image or PDF. (We’ll store this securely next.)</p>
            </div>

            {/* Terms */}
            <div className="mt-6 flex items-start gap-2">
              <input id="agree" type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} className="mt-1" />
              <label htmlFor="agree" className="text-sm text-slate-700">
                I have read and agree to the{" "}
                <a className="text-[color:var(--brand)] underline" href="/terms" target="_blank" rel="noreferrer">
                  Terms & Conditions
                </a>.
              </label>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={()=>setCode(String(Math.floor(100000+Math.random()*900000)))} className="btn btn-outline">
                Simulate door code (demo)
              </button>
              <button onClick={goToCheckout} disabled={!formComplete || loading}
                      className={`btn ${!formComplete || loading ? 'btn-outline opacity-60 cursor-not-allowed' : 'btn-primary'}`}>
                {loading ? 'Opening Checkout…' : 'Pay in Test Mode'}
              </button>
            </div>

            {!formComplete && (
              <p className="mt-3 text-xs text-slate-500">
                Please complete all fields, upload your ID, and agree to Terms to continue.
              </p>
            )}
          </div>

          {/* Summary */}
          <aside className="card p-6 h-max sticky top-6">
            <p className="font-semibold">Stay summary</p>
            <dl className="mt-3 text-sm text-slate-700 space-y-1">
              <div className="flex justify-between"><dt>Plan</dt><dd className="font-medium capitalize">{plan}</dd></div>
              <div className="flex justify-between"><dt>Check-in</dt><dd className="font-medium">{fmt(start)}</dd></div>
              <div className="flex justify-between"><dt>Check-out</dt><dd className="font-medium">{fmt(end)}</dd></div>
            </dl>
            {code && (
              <div className="mt-6 rounded-xl ring-1 ring-slate-200 p-4">
                <p className="text-sm text-slate-500">Door code (demo):</p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--brand)]">{code}</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
