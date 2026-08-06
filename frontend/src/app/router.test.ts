import { describe, expect, it } from 'vitest'

import { router } from '@/app/router'

/**
 * Every page in the menu has a route behind it.
 *
 * This exists because one did not. The **Enquiries** entry was added to the navigation
 * and the route was never added beside it, so `/office/enquiries` fell through to the
 * catch-all, was redirected to `/office`, and the club clicked their new menu item and
 * were shown the finance dashboard. Nothing failed; the wrong page simply appeared.
 *
 * A catch-all makes that failure silent by design — its whole job is to send an unknown
 * address somewhere sensible, and it cannot tell a stale bookmark from a route somebody
 * forgot to write. So the list below is the guard: add a page to the menu, add it here,
 * and a missing route is a failing test rather than a confused office bearer.
 */

/** Every concrete path the route table can match, as '/office/entries' and so on. */
function paths(): string[] {
  const found: string[] = []

  const walk = (routes: readonly { path?: string; children?: readonly unknown[] }[], base = '') => {
    for (const route of routes) {
      const here =
        route.path === undefined
          ? base
          : route.path.startsWith('/')
            ? route.path
            : `${base.replace(/\/$/, '')}/${route.path}`

      if (route.path !== undefined) found.push(here)
      if (route.children) {
        walk(route.children as readonly { path?: string; children?: readonly unknown[] }[], here)
      }
    }
  }

  walk(router.routes as readonly { path?: string; children?: readonly unknown[] }[])
  return found
}

describe('the office menu', () => {
  it.each([
    ['/office/entries', 'Entries'],
    ['/office/payments', "Members' payments"],
    ['/office/members', 'Membership register'],
    ['/office/reports', 'Statements'],
    ['/office/years', 'Club years'],
    ['/office/enquiries', 'Enquiries'],
  ])('has a route for %s (%s in the menu)', (path) => {
    expect(paths()).toContain(path)
  })

  it('keeps the catch-all last, so it cannot swallow a real route', () => {
    // `*` matches anything. Above a real path it would answer for that path too, and the
    // symptom is a page quietly showing the wrong thing rather than an error anybody
    // notices.
    const office = (
      router.routes as ReadonlyArray<{ path?: string; children?: Array<{ path?: string }> }>
    ).find((route) => route.path === '/office')

    const children = office?.children ?? []
    const catchAll = children.findIndex((child) => child.path === '*')

    expect(catchAll).toBe(children.length - 1)
  })
})

describe('the public pages', () => {
  it.each([
    ['/about'],
    ['/committee'],
    ['/membership'],
    ['/events'],
    ['/gallery'],
    ['/news'],
    ['/documents'],
    ['/contact'],
    ['/login'],
  ])('has a route for %s', (path) => {
    // The public menu is built from `nav` in site.ts, and a link there pointing at a
    // page that does not exist would send a visitor to Not Found.
    expect(paths()).toContain(path)
  })
})
