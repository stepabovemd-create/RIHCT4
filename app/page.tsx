export default function Home() {
  return (
    <main style={{ padding: '3rem', fontFamily: 'system-ui' }}>
      <h1>Relax Inn – Hartford City</h1>
      <p style={{ marginTop: 8 }}>
        This is the home page. Use the link below to visit the Apply demo.
      </p>
      <p style={{ marginTop: 16 }}>
        <a
          href="/apply"
          style={{
            padding: '8px 12px',
            border: '1px solid #1d4ed8',
            background: '#1d4ed8',
            color: '#fff',
            borderRadius: 12,
            textDecoration: 'none'
          }}
        >
          Go to Apply (Test Mode)
        </a>
      </p>
    </main>
  );
}
