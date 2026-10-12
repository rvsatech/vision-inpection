'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';
import styles from './app.module.css';

type NavItem = { href: string; label: string; perm?: Parameters<ReturnType<typeof useAuth>['can']>[0] };

const NAV: NavItem[] = [
  { href: '/app', label: 'Painel' },
  { href: '/app/analyses', label: 'Análises' },
  { href: '/app/users', label: 'Usuários', perm: 'users:read' },
  { href: '/app/billing', label: 'Plano e cobrança' },
  { href: '/app/audit', label: 'Auditoria', perm: 'audit:read' },
  { href: '/app/settings', label: 'Configurações' },
  { href: '/app/admin', label: 'Plataforma', perm: 'platform:manage' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) {
    return (
      <div className={styles.boot} role="status">
        Carregando…
      </div>
    );
  }

  const isActive = (href: string) => (href === '/app' ? pathname === '/app' : pathname.startsWith(href));

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <Link href="/app" className={styles.brand}>
          <Logo inverted size={24} />
        </Link>
        <nav aria-label="Menu do sistema">
          <ul className={styles.navList}>
            {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={isActive(n.href) ? styles.navActive : styles.navLink} aria-current={isActive(n.href) ? 'page' : undefined}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.me}>
          <span className={styles.meName}>{user.name}</span>
          <span className={styles.meRole}>{ROLE_LABEL[user.role]}</span>
          <button type="button" className={styles.logout} onClick={logout}>
            Sair
          </button>
        </div>
      </aside>
      <div className={styles.main}>
        <div className={styles.mobileBar}>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Menu
          </button>
          <Logo size={20} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description && <p className={styles.pageDesc}>{description}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className={styles.pager} aria-label="Paginação">
      <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Próxima
      </button>
    </nav>
  );
}
