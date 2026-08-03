import { describe, expect, it } from 'vitest'

import {
  committee,
  documents,
  events,
  footer,
  gallery,
  home,
  membership,
  nav,
  news,
} from '@/content/site'
import { MEMBERSHIP_TYPES } from '@/config/constants'

/**
 * Guards on the content file.
 *
 * Content is edited by hand, often by someone who is not a developer, so these
 * tests catch the mistakes that editing produces — a duplicated slug, a menu
 * entry pointing at a route that does not exist, a date typed in the wrong
 * format — rather than testing that React renders.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Every path the router serves. Keep in step with app/router.tsx. */
const ROUTES = new Set([
  '/',
  '/about',
  '/mission-vision',
  '/history',
  '/committee',
  '/membership',
  '/events',
  '/gallery',
  '/news',
  '/documents',
  '/contact',
])

describe('navigation', () => {
  it('only links to routes that exist', () => {
    const targets = nav.flatMap((item) => [
      ...(item.children ? item.children.map((child) => child.to) : [item.to]),
    ])

    for (const target of targets) {
      expect(ROUTES.has(target), `nav links to unknown route ${target}`).toBe(true)
    }
  })

  it('has no duplicate top-level labels', () => {
    const labels = nav.map((item) => item.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('footer', () => {
  it('only links to routes that exist', () => {
    for (const column of footer.columns) {
      for (const link of column.links) {
        expect(ROUTES.has(link.to), `footer links to unknown route ${link.to}`).toBe(true)
      }
    }
  })
})

describe('home page content', () => {
  it('points its calls to action at real routes', () => {
    const targets = [
      home.hero.primaryCta.to,
      home.hero.secondaryCta.to,
      home.sections.events.cta.to,
      home.sections.news.cta.to,
      home.sections.gallery.cta.to,
      home.join.primaryCta.to,
      home.join.secondaryCta.to,
    ]

    for (const target of targets) {
      expect(ROUTES.has(target), `unknown route ${target}`).toBe(true)
    }
  })

  it('shows exactly three pillars, which the layout is built for', () => {
    expect(home.intro.pillars).toHaveLength(3)
  })
})

describe('events', () => {
  it('has unique slugs', () => {
    const slugs = events.map((event) => event.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('uses ISO dates that parse to a real day', () => {
    for (const event of events) {
      expect(event.date, `${event.slug} has a malformed date`).toMatch(ISO_DATE)
      expect(Number.isNaN(Date.parse(event.date))).toBe(false)
    }
  })

  it('gives every event a title, venue and summary', () => {
    for (const event of events) {
      expect(event.title.length).toBeGreaterThan(0)
      expect(event.venue.length).toBeGreaterThan(0)
      expect(event.summary.length).toBeGreaterThan(0)
    }
  })
})

describe('news', () => {
  it('has unique slugs', () => {
    const slugs = news.map((item) => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('uses ISO dates', () => {
    for (const item of news) {
      expect(item.date, `${item.slug} has a malformed date`).toMatch(ISO_DATE)
    }
  })

  it('pins at most one item, so the notice board has one clear lead', () => {
    expect(news.filter((item) => item.pinned).length).toBeLessThanOrEqual(1)
  })
})

describe('gallery', () => {
  it('has unique slugs and ISO dates', () => {
    const slugs = gallery.map((album) => album.slug)
    expect(new Set(slugs).size).toBe(slugs.length)

    for (const album of gallery) {
      expect(album.date).toMatch(ISO_DATE)
    }
  })
})

describe('documents', () => {
  it('uses ISO dates', () => {
    for (const item of documents) {
      expect(item.updated, `"${item.title}" has a malformed date`).toMatch(ISO_DATE)
    }
  })
})

describe('membership', () => {
  it('covers every membership type the system supports', () => {
    const keys = membership.types.map((type) => type.key).sort()
    expect(keys).toEqual([...MEMBERSHIP_TYPES].sort())
  })

  it('features at most one category', () => {
    expect(membership.types.filter((type) => type.highlight).length).toBeLessThanOrEqual(1)
  })

  it('never shows a negative fee', () => {
    for (const type of membership.types) {
      if (type.fee !== null) expect(type.fee).toBeGreaterThanOrEqual(0)
    }
  })

  it('describes the payment step as verified before a receipt is issued', () => {
    // The manual-verification rule is a requirement, not a wording preference:
    // the site must not promise an instant receipt.
    const text = membership.steps.map((step) => step.body).join(' ').toLowerCase()
    expect(text).toContain('receipt is issued only after')
  })
})

describe('committee', () => {
  it('lists a president, secretary and treasurer', () => {
    const roles = committee.members.map((member) => member.role.toLowerCase())
    for (const required of ['president', 'secretary', 'treasurer']) {
      expect(
        roles.some((role) => role.includes(required)),
        `no committee member holds the ${required} role`
      ).toBe(true)
    }
  })
})
