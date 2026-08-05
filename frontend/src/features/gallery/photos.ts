/**
 * The club's photographs, found by looking in the folders.
 *
 * Drop files into `frontend/src/assets/gallery/<album-slug>/` and they appear on the
 * gallery page. Nothing else to edit: no list of filenames to keep in step, no count to
 * update by hand, no path to mistype. Adding a photograph is copying a file.
 *
 * ## Why the folder is the list
 *
 * The alternative is an array of filenames in site.ts beside each album, and it goes
 * wrong in one direction every time: somebody adds three photographs and lists two, or
 * lists a name they later rename, and the page shows a broken image. A list that can
 * disagree with the folder eventually will. Here the folder *is* the list.
 *
 * ## Why `src/assets` and not `public/`
 *
 * `import.meta.glob` is a build-time feature and only reaches inside `src`. That is the
 * price; what it buys is worth more than the inconvenience:
 *
 *   • **Discovery.** Vite resolves the glob when it builds, so the folder is read then
 *     rather than guessed at runtime.
 *   • **Cache-busting.** Each file comes out with a hash in its name, so a replaced
 *     photograph is seen immediately instead of being served from a browser cache for a
 *     fortnight.
 *   • **A missing file is a build error, not a broken image on the live site.**
 *
 * `eager: true` because these are URLs, not modules: the strings are wanted at render
 * time and lazy loading a string is pointless. The `<img>` tags carry `loading="lazy"`,
 * which is where the actual saving is.
 */

/**
 * Every gallery image, keyed by its path.
 *
 * Extensions are listed in both cases because a photograph off a phone or a camera very
 * often arrives as `.JPG`, and a glob that quietly ignored those would be a mystery
 * nobody enjoys solving. HEIC is deliberately absent — Safari can show it, no other
 * browser can, so it has to be converted rather than pretended about.
 */
const FILES = import.meta.glob<string>(
  '/src/assets/gallery/*/*.{jpg,JPG,jpeg,JPEG,png,PNG,webp,WEBP,avif,AVIF}',
  { eager: true, import: 'default', query: '?url' }
)

export interface Photo {
  /** The built URL, hashed by Vite. */
  src: string
  /** The file's own name, e.g. '01-registration.jpg'. Used for ordering and alt text. */
  name: string
}

/**
 * Folder name → its photographs, in filename order.
 *
 * Filename order, not modification time, so the club decides the sequence: prefix the
 * files `01-`, `02-` and they run in that order. Sorted with `localeCompare` and
 * `numeric`, so `2.jpg` comes before `10.jpg` rather than after it.
 */
const BY_ALBUM: Record<string, Photo[]> = {}

for (const [path, src] of Object.entries(FILES)) {
  const match = /\/gallery\/([^/]+)\/([^/]+)$/.exec(path)
  if (!match) continue

  const [, album, name] = match as unknown as [string, string, string]
  ;(BY_ALBUM[album] ??= []).push({ src, name })
}

for (const photos of Object.values(BY_ALBUM)) {
  photos.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
}

/** The photographs in one album. Empty when the folder is empty or absent. */
export function photosFor(slug: string): Photo[] {
  return BY_ALBUM[slug] ?? []
}

/**
 * A caption for a screen reader, from the filename.
 *
 * `01-blood-pressure-check.jpg` becomes "blood pressure check". Not perfect, and much
 * better than "image": a club naming its files descriptively gets useful alt text for
 * nothing, and one that names them `IMG_4471.JPG` gets the album's title instead, which
 * is what `GalleryPage` falls back to.
 */
export function describe(photo: Photo): string {
  const words = photo.name
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[-_\s]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim()

  // A bare camera name says nothing, so let the caller use the album title instead.
  return /^(img|dsc|photo|image|pxl|screenshot)[\s\d]*$/i.test(words) ? '' : words
}

/** Which albums actually have photographs. Used by the page to stop apologising. */
export function albumsWithPhotos(): string[] {
  return Object.keys(BY_ALBUM).filter((slug) => (BY_ALBUM[slug]?.length ?? 0) > 0)
}
