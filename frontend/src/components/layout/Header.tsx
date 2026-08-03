import { ChevronDown, LogIn, Menu, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'

import { Container } from '@/components/ui/Container'
import { club, nav, type NavItem } from '@/content/site'
import { cn } from '@/lib/cn'
import { logoClasses } from '@/lib/logoSize'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  // Menus are closed by the link that was clicked (see `onNavigate` below and
  // the dropdown's own handler) rather than by an effect watching the path.
  // Resetting state from an effect runs a second render pass for every
  // navigation, and the React Compiler rules rightly flag it.

  // Prevent the page behind the drawer from scrolling.
  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  // Lift the header off the page once scrolled, so it separates from the hero
  // without needing a permanent border. Written as an attribute rather than
  // state to avoid a re-render on every scroll frame.
  useEffect(() => {
    const node = headerRef.current
    if (!node) return

    let queued = false
    const update = () => {
      queued = false
      node.setAttribute('data-scrolled', String(window.scrollY > 12))
    }
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      ref={headerRef}
      data-scrolled="false"
      className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg transition-shadow duration-300 data-[scrolled=true]:shadow-soft data-[scrolled=true]:ring-1 data-[scrolled=true]:ring-ink-200/70"
    >
      {/* min-height rather than a fixed height, so a larger logo makes the
          header taller instead of being clipped by it. */}
      <Container className="flex min-h-16 items-center justify-between gap-4 py-2.5 lg:min-h-20">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-3"
          aria-label={`${club.name} — home`}
        >
          <img
            src={club.logo.src}
            // When the name is not printed beside it, the logo itself carries
            // the name and must describe it for screen readers.
            alt={club.logo.showNameBeside ? '' : club.name}
            width={96}
            height={96}
            className={cn(
              'w-auto object-contain',
              logoClasses(club.logo.size, 'header'),
              club.logo.rounded && 'rounded-xl shadow-soft'
            )}
          />
          {club.logo.showNameBeside ? (
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-semibold tracking-tight text-brand-900 sm:text-lg">
                <span className="sm:hidden">{club.shortName}</span>
                <span className="hidden sm:inline">{club.name}</span>
              </span>
              {club.tagline ? (
                <span className="mt-1 hidden text-[11px] uppercase tracking-[0.14em] text-ink-400 lg:block">
                  {club.tagline}
                </span>
              ) : null}
            </span>
          ) : null}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
          {nav.map((item) =>
            item.children ? (
              <DropdownItem key={item.label} item={item} />
            ) : (
              <TopLink key={item.to} to={item.to} label={item.label} />
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          {/* No "join" call to action here: Membership is already a top-level nav
              item, and two routes to the same page is noise. */}
          <Link
            to="/login"
            className="hidden h-10 items-center gap-2 rounded-full border border-ink-200 px-4 text-sm font-medium text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 lg:inline-flex"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Member area
          </Link>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-ink-100 lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {mobileOpen ? <MobileNav onNavigate={() => setMobileOpen(false)} /> : null}
    </header>
  )
}

function TopLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'relative rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'text-brand-900' : 'text-ink-600 hover:text-brand-900',
          // Active underline drawn with a pseudo-element so the label does not
          // shift by a pixel when it becomes active.
          isActive &&
            'after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent-400'
        )
      }
    >
      {label}
    </NavLink>
  )
}

/** Hover- and keyboard-accessible dropdown for a nav group. */
function DropdownItem({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  const childPaths = item.children?.map((child) => child.to) ?? []
  const isActive = childPaths.includes(pathname)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'text-brand-900' : 'text-ink-600 hover:text-brand-900',
          isActive &&
            'after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent-400'
        )}
      >
        {item.label}
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute left-0 top-full w-72 pt-2"
          // Keeps the menu reachable while the pointer crosses the gap.
        >
          <ul className="overflow-hidden rounded-card border border-ink-200 bg-white p-1.5 shadow-lift">
            {item.children?.map((child) => (
              <li key={child.to}>
                <NavLink
                  to={child.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive: childActive }) =>
                    cn(
                      'block rounded-lg px-3 py-2.5 transition-colors',
                      childActive ? 'bg-brand-50' : 'hover:bg-ink-50'
                    )
                  }
                >
                  <span className="block text-sm font-medium text-ink-900">{child.label}</span>
                  {child.description ? (
                    <span className="mt-0.5 block text-xs text-ink-500">{child.description}</span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

interface FlatNavLink {
  label: string
  to: string
  /** The parent menu this link came from, or null if it is top level. */
  group: string | null
}

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  // Flatten groups: a nested accordion inside a drawer is more taps, not fewer.
  const links: FlatNavLink[] = nav.flatMap((item): FlatNavLink[] =>
    item.children
      ? item.children.map((child) => ({ label: child.label, to: child.to, group: item.label }))
      : [{ label: item.label, to: item.to, group: null }]
  )

  return (
    <nav
      id="mobile-nav"
      aria-label="Primary"
      className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-ink-200 bg-white lg:hidden"
    >
      <Container className="py-3">
        <ul className="flex flex-col">
          {links.map((link) => (
            <li key={`${link.group ?? 'top'}-${link.to}`}>
              <NavLink
                to={link.to}
                end={link.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between rounded-lg px-3 py-3 text-[15px] transition-colors',
                    isActive
                      ? 'bg-brand-50 font-medium text-brand-900'
                      : 'text-ink-700 hover:bg-ink-50'
                  )
                }
              >
                {link.label}
                {link.group ? (
                  <span className="text-[11px] uppercase tracking-wider text-ink-400">
                    {link.group}
                  </span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-3 grid gap-2">
          <Link
            to="/login"
            onClick={onNavigate}
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-ink-200 text-sm font-medium text-ink-700"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Member area
          </Link>
        </div>
      </Container>
    </nav>
  )
}
