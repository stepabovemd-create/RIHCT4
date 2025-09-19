'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic'; // opt out of prerendering for this page

function ThankYouContent() {
  const params = useSearchParams();
  const sessionId = params.get('session_id') || '';
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const r = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!r.ok) {
        alert(await r.text());
        return;
      }
      const { url } = await r.json();
      window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container py-10">
      <h1 className="text-2xl font-bold">Thanks! Payment received.</h1>
      <p className="mt-2 text-slate-600">A door code has been emailed to you.</p>

      <div className="mt-6 flex gap-3">
        <button
          onClick={openPortal}
          className="btn btn-outline"
          disabled={loading || !sessionId}
          aria-disabled={loading || !sessionId}
          title={!sessionId ? 'No session id found' : 'Open Billing Portal'}
        >
          {loading ? 'Opening…' : 'Open Billing Portal'}
        </button>
      </div>
    </main>
  );
}

export default function ThankYou() {
  return (
    <Suspense
      fallback={
        <main className="container py-10">
          <h1 className="text-2xl font-bold">Thanks! Payment received.</h1>
          <p className="mt-2 text-slate-600">Loading…</p>
        </main>
      }
    >
      <ThankYouContent />
    </Suspense>
  );
}
