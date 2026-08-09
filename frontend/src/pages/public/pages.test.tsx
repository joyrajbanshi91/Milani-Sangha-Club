import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { about } from '@/content/site'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AboutPage } from '@/pages/public/AboutPage'
import { CommitteePage } from '@/pages/public/CommitteePage'
import { ContactPage } from '@/pages/public/ContactPage'
import { DocumentsPage } from '@/pages/public/DocumentsPage'
import { EventsPage } from '@/pages/public/EventsPage'
import { GalleryPage } from '@/pages/public/GalleryPage'
import { HistoryPage } from '@/pages/public/HistoryPage'
import { HomePage } from '@/pages/public/HomePage'
import { MembershipPage } from '@/pages/public/MembershipPage'
import { MissionVisionPage } from '@/pages/public/MissionVisionPage'
import { NewsPage } from '@/pages/public/NewsPage'

/**
 * Smoke test for every public page.
 *
 * Each page reads from the content file, so an editing mistake — a renamed key,
 * a list emptied to nothing — can break a page that nothing else covers. This
 * asserts the minimum: the page renders, and it has exactly one `h1`.
 */
const PAGES: ReadonlyArray<{ name: string; Component: ComponentType }> = [
  { name: 'HomePage', Component: HomePage },
  { name: 'AboutPage', Component: AboutPage },
  { name: 'MissionVisionPage', Component: MissionVisionPage },
  { name: 'HistoryPage', Component: HistoryPage },
  { name: 'CommitteePage', Component: CommitteePage },
  { name: 'MembershipPage', Component: MembershipPage },
  { name: 'EventsPage', Component: EventsPage },
  { name: 'GalleryPage', Component: GalleryPage },
  { name: 'NewsPage', Component: NewsPage },
  { name: 'DocumentsPage', Component: DocumentsPage },
  { name: 'ContactPage', Component: ContactPage },
  { name: 'NotFoundPage', Component: NotFoundPage },
]

/**
 * A page may fetch — the home page counts the club's members — so all of them are given
 * a query client. Not one of them may *need* the fetch to succeed: a public page whose
 * heading depends on the API would disappear the moment the API did, and that is what
 * this smoke test is here to catch.
 */
function renderPage(Component: ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe.each(PAGES)('$name', ({ Component }) => {
  it('renders with exactly one level-one heading', () => {
    renderPage(Component)

    // One h1 per page is what keeps the heading outline usable for screen
    // readers and for search engines.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('AboutPage picture', () => {
  it('shows the club’s photograph, or its stand-in tile', () => {
    renderPage(AboutPage)

    // Read from the content file rather than assuming either state: the club fills
    // these in over time, and a test asserting a placeholder would fail the day a
    // photograph arrived — which is the opposite of useful.
    if (about.picture.image) {
      expect(screen.getByRole('img', { name: about.picture.label })).toHaveAttribute(
        'src',
        about.picture.image
      )
    } else {
      expect(
        screen.getByLabelText(`Placeholder image for ${about.picture.label}`)
      ).toBeInTheDocument()
    }
  })
})

describe('ContactPage form', () => {
  it('labels every field and marks the required ones', () => {
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    )

    expect(screen.getByLabelText(/your name/i)).toBeRequired()
    expect(screen.getByLabelText(/^email/i)).toBeRequired()
    expect(screen.getByLabelText(/subject/i)).toBeRequired()
    expect(screen.getByLabelText(/message/i)).toBeRequired()
    // Phone is genuinely optional and must not be marked otherwise.
    expect(screen.getByLabelText(/phone/i)).not.toBeRequired()
  })
})

describe('EventsPage', () => {
  it('offers upcoming, past and all filters', () => {
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    )

    for (const label of ['Upcoming', 'Past', 'All']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })
})
