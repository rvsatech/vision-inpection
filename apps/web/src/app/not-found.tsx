import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: 'var(--t-2xl)' }}>Página não encontrada</h1>
        <p style={{ margin: '8px 0 20px', color: 'var(--ink-soft)' }}>O endereço pode ter mudado ou a página foi removida.</p>
        <Link className="btn btn-primary" href="/">
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
