'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

function SafeContent() {
  const params = useSearchParams();
  const [msg, setMsg] = useState('Booting…');
  const [vs, setVs] = useState('');
  const [status, setStatus] = useState<string>('(none)');
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    try {
      const fromUrl = params.get('vs');
      const fromStorage =
        typeof window !== 'undefined' ? window.sessionStorage.getItem('rihc_vs') : null;
      const id = fromUrl || fromStorage || '';
      setVs(id || '(none)');

      if (!id) {
        setMsg('No verification session id found yet.');
        return;
      }

      setMsg('Checking Stripe Identity status…');
      setPolling(true);

      let cancelled = false;

      // Use an arrow function (OK under ES5 target)
      const poll = async (attempt: number = 0) => {
        if (cancelled) return;
        const r = await fetch(
          `/api/identity/status?id=${encodeURIComponent(id)}&t=${Date.now()}`,
          { cache: 'no-store' }
        );
        const j = await r.json().catch(() => ({} as any));
        setStatus(JSON.stringify(j, null, 2));

        if (j?.ok && j.status === 'verified') {
          setMsg('✅ ID verified. You can proceed to checkout.');
          setPolling(false);
          try { window.sessionStorage.removeItem('rihc_vs'); } catch {}
          return;
        }
        if (j?.ok && j.status === 'requires_input') {
          setMsg('ID verification needs more input. Please restart the verification step.');
          setPolling(false);
          return;
        }
        if (j?.ok && j.status === 'canceled') {
          setMsg('ID verification was canceled.');
          setPolling(false);
          return;
        }
        if (attempt < 10) {
          setTimeout(() => { void poll(attempt + 1); }, 1500);
        } else {
          setMsg('Finished polling. If not verified, try the verification again.');
          setPolling(false);
        }
      };

      void poll(0);

      return () => { cancelled = true; };
    } catch (e: any) {
      setMsg('Error: ' + (e?.message || String(e)));
      setPolling(false);
    }
  }, [params]);

  return (
    <main style={{ fontFamily: 'system-ui', padding: '24px', lineHeight: 1.4 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Apply (Safe Mode)</h1>

      <div style={{ marginTop: 10, padding: 12, border: '1px solid #cbd5e1', borderRadius: 12, background: '#f8fafc' }}>
        <p><strong>VS:</strong> <code>{vs}</code></p>
        <p><strong>Status:</strong> {polling ? 'Polling…' : 'Idle'}</p>
        <p style={{ marginTop: 6 }}>{msg}</p>
        <details style={{ marginTop: 8 }}>
          <summary>Last status JSON</summary>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{status}</pre>
        </details>
      </div>

      <p style={{ marginTop: 14 }}>
        When you’re done here, go back to the full page: <a href="/apply">/apply</a>
      </p>
    </main>
  );
}

export default function SafePage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, fontFamily: 'system-ui' }}>Loading…</main>}>
      <SafeContent />
    </Suspense>
  );
}
