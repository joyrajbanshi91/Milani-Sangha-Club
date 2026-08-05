import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

/**
 * The committee page, with and without the details a club supplies.
 *
 * Photographs and email addresses arrive one at a time — a club fills in the
 * president in March and the joint secretary in June — so both states are on screen
 * at once, and neither may look broken. What is easy to get wrong and cannot be seen
 * from the code is the closing note: printing six addresses while asking visitors to
 * write to the club office instead reads as though nobody checked the page.
 */

vi.mock('@/content/site', () => ({
  club: { contact: { email: 'office@example.club' } },
  committee: {
    eyebrow: 'Executive committee',
    title: 'The office bearers',
    lead: 'Elected by the general body.',
    term: '2026–2028',
    members: [
      {
        name: 'With A Photo',
        role: 'President',
        since: '2026',
        photo: '/committee/with-a-photo.jpg',
        email: 'president@example.club',
      },
      { name: 'Without One', role: 'Treasurer', since: '', photo: '', email: '' },
    ],
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <CommitteePage />
    </MemoryRouter>
  )
}

const { CommitteePage } = await import('@/pages/public/CommitteePage')

describe('a bearer whose photograph and address the club has supplied', () => {
  it('shows the photograph itself, not the monogram', () => {
    renderPage()

    const photo = document.querySelector('img[src="/committee/with-a-photo.jpg"]')
    expect(photo).not.toBeNull()
    // Empty alt on purpose: the name is the heading directly below it, and a screen
    // reader should not read the same person twice.
    expect(photo?.getAttribute('alt')).toBe('')
    expect(photo?.getAttribute('loading')).toBe('lazy')

    expect(screen.queryByLabelText(/placeholder image for With A Photo/i)).not.toBeInTheDocument()
  })

  it('shows it as a circle, cropped rather than squashed', () => {
    renderPage()

    // The club asked for round photographs. Without object-cover a non-square file
    // would be stretched into the circle, which is worse than cropping it.
    const photo = document.querySelector('img[src="/committee/with-a-photo.jpg"]')
    expect(photo?.className).toContain('rounded-full')
    expect(photo?.className).toContain('object-cover')
  })

  it('offers their address as a mail link', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /president@example\.club/ })).toHaveAttribute(
      'href',
      'mailto:president@example.club'
    )
  })
})

describe('a bearer with neither', () => {
  it('keeps the coloured monogram, so the grid does not change shape', () => {
    renderPage()

    const monogram = screen.getByLabelText(/placeholder image for Without One/i)
    expect(monogram).toBeInTheDocument()
    // Round like the photographs beside it, and the same size, so a half-filled
    // committee still reads as one design rather than as two.
    expect(monogram.className).toContain('rounded-full')
    expect(monogram.className).toContain('h-28 w-28')

    expect(document.querySelector('img[src=""]')).toBeNull()
  })

  it('shows no address and no empty mail button', () => {
    renderPage()

    expect(screen.queryByRole('link', { name: /mailto:$/ })).not.toBeInTheDocument()
  })
})

describe('the closing note', () => {
  it('points enquiries at the bearer once any address is published', () => {
    renderPage()

    expect(screen.getByText(/write to the bearer whose office your enquiry concerns/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/rather than to members directly/i)
    ).not.toBeInTheDocument()
  })
})
