import { ArrowLeft, LogOut, Wallet } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router'

import { DemoDataNotice } from '@/components/layout/DemoDataNotice'
import { Container } from '@/components/ui/Container'
import { club } from '@/content/site'
import { useAuth } from '@/features/auth/authContext'
import { cn } from '@/lib/cn'

/**
 * Shell for the signed-in areas.
 *
 * Deliberately plainer than the public site: this is a working tool, and the
 * decorative background would compete with figures the treasurer needs to read.
 *
 * The navigation is built from what the signed-in person may actually do — a
 * member never sees a link to the finance area at all.
 */
export function AppLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const links = [
    { to: '/portal', label: 'My membership', show: true },
    { to: '/office', label: 'Dashboard', show: user?.isFinanceOfficer ?? false },
    { to: '/office/entries', label: 'Entries', show: user?.isFinanceOfficer ?? false },
    { to: '/office/reports', label: 'Reports', show: user?.isFinanceOfficer ?? false },
  ].filter((link) => link.show)

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={club.logo.src} alt="" width={36} height={36} className="h-9 w-auto object-contain" />
            <span className="hidden font-display text-sm font-semibold text-brand-900 sm:block">
              {club.shortName}
            </span>
            {user?.isFinanceOfficer ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
                <Wallet className="h-3 w-3" aria-hidden="true" />
                Office
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <span className="hidden text-right text-xs leading-tight sm:block">
                <span className="block font-medium text-ink-900">{user.name}</span>
                <span className="block capitalize text-ink-500">{user.role}</span>
              </span>
            ) : null}

            <NavLink
              to="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-ink-600 hover:bg-ink-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Website
            </NavLink>

            <button
              type="button"
              onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 hover:bg-ink-100"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </Container>

        {links.length > 1 ? (
          <Container>
            <nav aria-label="Member area" className="-mb-px flex gap-1 overflow-x-auto">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/office' || link.to === '/portal'}
                  className={({ isActive }) =>
                    cn(
                      'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-brand-600 text-brand-800'
                        : 'border-transparent text-ink-500 hover:text-ink-800'
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </Container>
        ) : null}
      </header>

      {/* Below the header so it sits above the figures it is talking about, and
          inside the scroll flow rather than fixed — it is information, not an alert
          to be dismissed. Renders nothing once a real database is configured. */}
      <DemoDataNotice />

      <main className="flex-1 py-8">
        <Outlet />
      </main>
    </div>
  )
}
