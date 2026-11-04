'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from './SessionProvider';
import { Button, cx } from './ui';
import Icon from './ui/Icon';

export function Logo({ className }) {
  return (
    <Link href="/" className={cx('flex items-center gap-2 font-bold tracking-tight text-slate-900', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30">
        <Icon name="search" className="h-4 w-4" strokeWidth={2.4} />
      </span>
      <span className="text-lg">Find<span className="text-brand-600">It</span></span>
    </Link>
  );
}

function NavLink({ href, children, onClick }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)) || pathname === href;
  return (
    <Link href={href} onClick={onClick}
      className={cx('rounded-lg px-3 py-2 text-sm font-semibold transition',
        active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
      {children}
    </Link>
  );
}

export default function Navbar() {
  const { user, loading, logout, unread } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const links = [
    { href: '/browse', label: 'Browse items' },
    ...(user ? [{ href: '/dashboard', label: 'Dashboard' }, { href: '/claims', label: 'Claims' }] : []),
    ...(user?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  async function handleLogout() {
    await logout();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => <NavLink key={l.href} href={l.href}>{l.label}</NavLink>)}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {loading ? null : user ? (
            <>
              <Button href="/report/new" size="sm" icon="plus">Report item</Button>
              <Link href="/notifications" className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                <Icon name="bell" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                  {user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </span>
                <div className="hidden leading-tight lg:block">
                  <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.role === 'ADMIN' ? 'Administrator' : user.srn}</p>
                </div>
                <button type="button" onClick={handleLogout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Log out" title="Log out">
                  <Icon name="logout" className="h-5 w-5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm">Log in</Button>
              <Button href="/register" size="sm">Create account</Button>
            </>
          )}
        </div>

        <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
          <Icon name={open ? 'x' : 'menu'} />
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <nav className="container-page flex flex-col gap-1 py-3">
            {links.map((l) => <NavLink key={l.href} href={l.href}>{l.label}</NavLink>)}
            {user ? (
              <>
                <NavLink href="/notifications">Notifications {unread > 0 && `(${unread})`}</NavLink>
                <NavLink href="/report/new">Report an item</NavLink>
                <button type="button" onClick={handleLogout} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100">Log out</button>
              </>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button href="/login" variant="secondary">Log in</Button>
                <Button href="/register">Create account</Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
