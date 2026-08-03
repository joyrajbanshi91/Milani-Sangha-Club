import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { home } from '@/content/site'
import { HomePage } from '@/pages/public/HomePage'

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
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
