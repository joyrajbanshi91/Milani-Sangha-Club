import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { gallery } from '@/content/site'
import { GalleryPage } from '@/pages/public/GalleryPage'

function renderGallery() {
  return render(
    <MemoryRouter>
      <GalleryPage />
    </MemoryRouter>
  )
}

/** Albums are shown newest first, so index 0 is the most recent. */
const newestFirst = [...gallery].sort((a, b) => b.date.localeCompare(a.date))

describe('GalleryPage viewer', () => {
  it('opens the viewer on the album that was clicked', async () => {
    const user = userEvent.setup()
    renderGallery()

    const first = newestFirst[0]
    expect(first).toBeDefined()
    if (!first) return

    await user.click(screen.getByRole('button', { name: new RegExp(first.title, 'i') }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: first.title })).toBeInTheDocument()
    expect(screen.getByText(`Album 1 of ${newestFirst.length}`)).toBeInTheDocument()
  })

  it('steps to the next album and wraps around at the end', async () => {
    const user = userEvent.setup()
    renderGallery()

    const first = newestFirst[0]
    const second = newestFirst[1]
    if (!first || !second) return

    await user.click(screen.getByRole('button', { name: new RegExp(first.title, 'i') }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('heading', { level: 2, name: second.title })).toBeInTheDocument()

    // Stepping back from the first album must land on the last, not dead-end.
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await user.click(screen.getByRole('button', { name: 'Previous' }))

    const last = newestFirst.at(-1)
    if (!last) return
    expect(screen.getByRole('heading', { level: 2, name: last.title })).toBeInTheDocument()
  })

  it('closes on the close button', async () => {
    const user = userEvent.setup()
    renderGallery()

    const first = newestFirst[0]
    if (!first) return

    await user.click(screen.getByRole('button', { name: new RegExp(first.title, 'i') }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the page heading as the only h1 while the viewer is open', async () => {
    const user = userEvent.setup()
    renderGallery()

    const first = newestFirst[0]
    if (!first) return

    await user.click(screen.getByRole('button', { name: new RegExp(first.title, 'i') }))
    // The viewer's own title is an h2, so the outline is not disturbed.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
