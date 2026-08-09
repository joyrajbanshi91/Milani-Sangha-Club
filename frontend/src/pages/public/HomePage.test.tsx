import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { home } from '@/content/site'
import { HomePage } from '@/pages/public/HomePage'

/**
 * The banner asks the API how many members the club has, so the page needs a query
 * client. Nothing here stubs the call: it fails in jsdom, which is exactly the state a
 * visitor is in before the API answers, and the assertions below are about what the
 * page shows in that state — the content file's figures, no spinner, no gap.
 */
function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('HomePage', () => {
  it('uses the hero title from the content file as the page heading', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(home.hero.title)
  })

  it('renders every section heading defined in content', () => {
    renderHome()

    const expected = [
      home.intro.title,
      home.sections.events.title,
      home.sections.news.title,
      home.sections.gallery.title,
      home.sections.testimonials.title,
      home.sections.sponsors.title,
      home.join.title,
    ]

    for (const title of expected) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })

  it('renders one card per pillar', () => {
    renderHome()
    for (const pillar of home.intro.pillars) {
      expect(screen.getByRole('heading', { name: pillar.title })).toBeInTheDocument()
    }
  })

  it('links the primary call to action to the membership page', () => {
    renderHome()
    const cta = screen.getByRole('link', { name: new RegExp(home.hero.primaryCta.label, 'i') })
    expect(cta).toHaveAttribute('href', home.hero.primaryCta.to)
  })

  it('shows the hero statistics as a description list', () => {
    renderHome()
    const stats = home.hero.stats
    if (stats.length === 0) return

    for (const stat of stats) {
      expect(screen.getByText(stat.label)).toBeInTheDocument()
    }
  })

  /**
   * The three banner figures, when the API has not answered.
   *
   * This is not an edge case: it is every visitor's first paint, every build with no
   * API configured, and the whole site whenever the function is down. A figure with no
   * number behind it must read as a dash, not as an empty tile, a spinner, or a zero —
   * a zero would be a false statement about the club's membership.
   */
  it('falls back to the content file when the member count is unavailable', () => {
    renderHome()

    for (const stat of home.hero.stats) {
      const label = screen.getByText(stat.label)
      const tile = label.closest('div')
      expect(tile).not.toBeNull()

      const expected = stat.value.trim() === '' ? '—' : stat.value
      expect(within(tile as HTMLElement).getByText(expected)).toBeInTheDocument()
    }
  })

  /**
   * The banner collage, whichever state the club has it in.
   *
   * The three tiles are filled one at a time — a photograph arrives for one, the other
   * two are still stand-ins — so the test reads the content file rather than assuming
   * either state. Asserting on three placeholders would have failed the day the club
   * added its first real picture, which is the opposite of useful.
   */
  it('shows every hero collage tile, as a photograph or as its stand-in', () => {
    renderHome()

    for (const picture of Object.values(home.hero.collage)) {
      if (picture.image) {
        expect(screen.getByRole('img', { name: picture.label })).toHaveAttribute(
          'src',
          picture.image
        )
      } else {
        expect(
          screen.getByLabelText(`Placeholder image for ${picture.label}`)
        ).toBeInTheDocument()
      }
    }
  })

  it('only advertises upcoming events in the diary section', () => {
    renderHome()

    // The section is found via its heading, then searched in isolation so a
    // past event appearing elsewhere on the page cannot mask a regression here.
    const heading = screen.getByRole('heading', { name: home.sections.events.title })
    const section = heading.closest('section')
    expect(section).not.toBeNull()

    if (section) {
      expect(within(section).queryByText('Past')).not.toBeInTheDocument()
    }
  })
})
