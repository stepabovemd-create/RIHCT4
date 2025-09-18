'use client'
import React, { useMemo, useState } from 'react'

export default function Apply() {
  const [plan, setPlan] = useState<'weekly' | 'monthly'>('weekly')
  const [checkin, setCheckin] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

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
    d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  async function goToCheckout() {
    setLoading(true)
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      // Show helpful error if the server rejects the request
      if (!r.ok) {
        const text = await r.text()
        alert(`Checkout error: ${text}`)
        return
      }

      const { url } = await r.json()
      if (!url) {
        alert('Checkout error: No URL returned')
        return
      }
      window.location.href = url // go to Stripe Checkout (test mode)
    } catch (e: any) {
      alert(`Checkout error: ${e?.message || 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h2>Apply (TEST MODE) — v3</h2>

      <div style={{ marginTop: 12 }}>
        <label>
          Plan:&nbsp;
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as 'weekly' | 'monthly')}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>
          Check-in:&nbsp;
          <input
            type="date"
            value={checkin}
            onChange={(e) => setCheckin(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() =>
            setCode(String(Math.floor(100000 + Math.random() * 900000)))
          }
        >
          Simulate door code (demo)
        </button>

        <button
          onClick={goToCheckout}
          disabled={loading}
          style={{
            background: '#1d4ed8',
            color: '#fff',
            borderRadius: 8,
            padding: '8px 12px',
            border: 'none',
          }}
        >
          {loading ? 'Opening Checkout…' : 'Pay in Test Mode'}
        </button>
      </div>

      {code && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid #ddd',
            borderRadius: 8,
            maxWidth: 520,
          }}
        >
          <div>
            Door code (demo): <b>{code}</b>
          </div>
          <div>
            Valid {fmt(start)} → {fmt(end)}
          </div>
        </div>
      )}
    </main>
  )
}
