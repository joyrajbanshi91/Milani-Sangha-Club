import { describe as describeSuite, expect, it } from 'vitest'

import { albumsWithPhotos, describe, photosFor } from '@/features/gallery/photos'
import { gallery } from '@/content/site'

/**
 * Finding the photographs in the folders.
 *
 * This runs against the **real** folders under `src/assets/gallery/`, deliberately: the
 * whole feature is "copy a file in and it appears", and a test with a mocked folder
 * would not notice the glob failing to match a real filename. The club's own files are
 * what proved it — one of them is `.jpeg` rather than `.jpg`, one has a capitalised
 * extension elsewhere in the repository's history, and one has a stray space in it.
 *
 * Written so it keeps passing as photographs are added: it asserts the rules, never a
 * particular count.
 */

describeSuite('the folders', () => {
  it('finds photographs for an album that has them', () => {
    const filled = albumsWithPhotos()

    // If this ever finds nothing, either every folder is empty — in which case the club
    // has a gallery of placeholders and would like to know — or the glob has stopped
    // matching, which is the bug worth catching.
    expect(filled.length).toBeGreaterThan(0)

    for (const slug of filled) {
      expect(photosFor(slug).length).toBeGreaterThan(0)
    }
  })

  it('only groups photographs under albums that exist in site.ts', () => {
    // A folder whose name does not match a slug is invisible on the site, and the
    // person who made it would have no idea why.
    const slugs = gallery.map((album) => album.slug)
    for (const found of albumsWithPhotos()) {
      expect(slugs).toContain(found)
    }
  })

  it('orders them by filename, so 01- comes before 02-', () => {
    for (const slug of albumsWithPhotos()) {
      const names = photosFor(slug).map((photo) => photo.name)
      const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      expect(names).toEqual(sorted)
    }
  })

  it('gives every photograph a built URL', () => {
    for (const slug of albumsWithPhotos()) {
      for (const photo of photosFor(slug)) {
        expect(photo.src).toBeTruthy()
        expect(typeof photo.src).toBe('string')
      }
    }
  })

  it('returns nothing for an album with no folder, rather than throwing', () => {
    expect(photosFor('an-album-nobody-has-created')).toEqual([])
  })
})

describeSuite('the description taken from a filename', () => {
  it('reads the words a club typed', () => {
    expect(describe({ src: '', name: '01-blood-pressure-check.jpg' })).toBe('blood pressure check')
    expect(describe({ src: '', name: '02-Our-club-member-donating-blood.jpeg' })).toBe(
      'Our club member donating blood'
    )
  })

  it('tidies the spacing people leave around a hyphen', () => {
    // A real filename from the club: '04-Guest- felicitation.jpeg' read with a double
    // space before this was fixed.
    expect(describe({ src: '', name: '04-Guest- felicitation.jpeg' })).toBe('Guest felicitation')
  })

  it('says nothing for a camera’s own name, so the album title is used instead', () => {
    for (const name of ['IMG_4471.JPG', 'DSC_0002.jpg', 'PXL_20260805_101112.jpg']) {
      expect(describe({ src: '', name })).toBe('')
    }
  })
})
