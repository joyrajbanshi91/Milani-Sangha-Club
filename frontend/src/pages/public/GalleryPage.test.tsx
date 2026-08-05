import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { gallery } from '@/content/site'
import { GalleryPage } from '@/pages/public/GalleryPage'

/**
 * The gallery, with and without photographs in the folders.
 *
 * A club fills a gallery one event at a time, so both states are on the page at once and
 * neither may look broken: an album with photographs shows its own cover and steps
 * through them, and one whose folder is still empty keeps a coloured placeholder and says
 * the photographs have not arrived.
 *
 * These used to assert that the viewer stepped between *albums* — one placeholder each,
 * which was all there was to show. It now walks the photographs inside the album that was
 * opened, which is what a visitor expects of a gallery.
 *
 * The photographs come from `import.meta.glob` over `src/assets/gallery/<slug>/`, a
 * build-time read of the real folders. Mocked here, so these test the behaviour rather
 * than whatever happens to be committed — a test that failed when somebody added a
 * photograph is a test nobody keeps.
 */

const HEALTH_CAMP = 'health-camp'

vi.mock('@/features/gallery/photos', () => ({
  photosFor: (slug: string) =>
    slug === HEALTH_CAMP
      ? [
          { src: '/assets/01-registration-desk.hash.jpg', name: '01-registration-desk.jpg' },
          { src: '/assets/02-blood-pressure-check.hash.jpg', name: '02-blood-pressure-check.jpg' },
          { src: '/assets/IMG_4471.hash.jpg', name: 'IMG_4471.JPG' },
        ]
      : [],
  describe: (photo: { name: string }) =>
    /^(img|dsc)/i.test(photo.name)
      ? ''
      : photo.name
          .replace(/\.[^.]+$/, '')
          .replace(/^\d+[-_\s]*/, '')
          .replace(/[-_]+/g, ' '),
  albumsWithPhotos: () => [HEALTH_CAMP],
}))

function renderGallery() {
  return render(
    <MemoryRouter>
      <GalleryPage />
    </MemoryRouter>
  )
}

const withPhotos = gallery.find((album) => album.slug === HEALTH_CAMP)
const withoutPhotos = gallery.find((album) => album.slug !== HEALTH_CAMP)

describe('an album with photographs in its folder', () => {
  it('uses the first photograph as the cover, and counts them from the folder', () => {
    renderGallery()

    const cover = document.querySelector('img[src="/assets/01-registration-desk.hash.jpg"]')
    expect(cover).not.toBeNull()
    // The description comes from the filename, so a club that names its files
    // descriptively gets useful alt text for nothing.
    expect(cover?.getAttribute('alt')).toBe('registration desk')
    expect(cover?.getAttribute('loading')).toBe('lazy')

    // Counted from the folder, never from a number typed into site.ts that could
    // disagree with it — and eventually would.
    expect(screen.getByText('3 photographs')).toBeInTheDocument()
  })

  it('walks that album’s photographs, and wraps at the end', async () => {
    const user = userEvent.setup()
    renderGallery()
    if (!withPhotos) return

    await user.click(screen.getByRole('button', { name: new RegExp(withPhotos.title, 'i') }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: withPhotos.title })).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    expect(
      document.querySelector('img[src="/assets/02-blood-pressure-check.hash.jpg"]')
    ).not.toBeNull()

    // Past the last comes the first: the arrows must never dead-end.
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('describes a camera-named file by its album instead', async () => {
    const user = userEvent.setup()
    renderGallery()
    if (!withPhotos) return

    await user.click(screen.getByRole('button', { name: new RegExp(withPhotos.title, 'i') }))
    // Backwards from the first lands on the last, which is the IMG_ one.
    await user.click(screen.getByRole('button', { name: 'Previous' }))

    const shown = document.querySelector('img[src="/assets/IMG_4471.hash.jpg"]')
    expect(shown?.getAttribute('alt')).toBe(withPhotos.title)
  })
})

describe('an album whose folder is still empty', () => {
  it('keeps its placeholder and says the photographs are to follow', () => {
    renderGallery()
    if (!withoutPhotos) return

    expect(
      screen.getByLabelText(new RegExp(`placeholder image for ${withoutPhotos.title}`, 'i'))
    ).toBeInTheDocument()
    expect(screen.getAllByText(/photographs to follow/i).length).toBeGreaterThan(0)
  })

  it('offers no arrows, because there is nothing to step through', async () => {
    const user = userEvent.setup()
    renderGallery()
    if (!withoutPhotos) return

    await user.click(screen.getByRole('button', { name: new RegExp(withoutPhotos.title, 'i') }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    // And it says why, rather than showing an empty frame.
    expect(screen.getByText(/have not been added yet/i)).toBeInTheDocument()
  })

  it('does not apologise for the whole gallery once any album has photographs', () => {
    // The note used to be permanent. A standing apology on a page full of photographs
    // reads as though nobody has looked at the site since it was built.
    renderGallery()

    expect(screen.queryByText(/being collected for these albums/i)).not.toBeInTheDocument()
  })
})

describe('the viewer itself', () => {
  it('closes on the close button', async () => {
    const user = userEvent.setup()
    renderGallery()
    if (!withPhotos) return

    await user.click(screen.getByRole('button', { name: new RegExp(withPhotos.title, 'i') }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the page heading as the only h1 while it is open', async () => {
    const user = userEvent.setup()
    renderGallery()
    if (!withPhotos) return

    await user.click(screen.getByRole('button', { name: new RegExp(withPhotos.title, 'i') }))
    // The viewer's own title is an h2, so the page outline is not disturbed.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
