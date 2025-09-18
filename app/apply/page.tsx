'use client'
import React, { useMemo, useState } from 'react'

export default function Apply() {
  const [plan, setPlan] = useState('weekly')
  const [checkin, setCheckin] = useState('')
  const [code, setCode] = useState('')
  const start = useMemo(()=>{ const d = checkin? new Date(checkin): new Date(); d.setHours(15,0,0,0); return d }, [checkin])
  const end = useMemo(()=>{ const d = new Date(start); d.setDate(d.getDate() + (plan==='monthly'?30:7)); d.setHours(11,0,0,0); return d }, [start, plan])
  const fmt = (d: Date) => d.toLocaleString()
  return (
    <main style={{padding:'2rem', fontFamily:'system-ui'}}>
      <h2>Apply (TEST MODE)</h2>
      <div style={{marginTop:12}}>
        <label>Plan:&nbsp;
          <select value={plan} onChange={e=>setPlan(e.target.value)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
      <div style={{marginTop:12}}>
        <label>Check-in:&nbsp;
          <input type="date" value={checkin} onChange={e=>setCheckin(e.target.value)} />
        </label>
      </div>
      <button style={{marginTop:16}} onClick={()=>setCode(String(Math.floor(100000+Math.random()*900000)))}>
        Simulate checkout & email code
      </button>
      {code && (
        <div style={{marginTop:16, padding:12, border:'1px solid #ddd', borderRadius:8}}>
          <div>Door code (demo): <b>{code}</b></div>
          <div>Valid {fmt(start)} → {fmt(end)}</div>
        </div>
      )}
    </main>
  )
}
