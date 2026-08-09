# Home page banner photographs

**Put the three pictures for the top of the home page in this folder.**

The About page's picture lives here too — it is set in section 6 of `site.ts`,
`picture:` inside `about:`, and may point at one of the same files. Nothing minds
being used twice.

Anything in `frontend/public/` is served from the root of the website, so a file
saved here as `ground.jpg` is reachable at `/home/ground.jpg`.

## Adding them

1. Save the files here, for example `frontend/public/home/ground.jpg`.
2. Open `frontend/src/content/site.ts`, find `hero:` in section 3 (home page),
   and fill in the paths:

   ```ts
   collage: {
     tall:       { image: '/home/ground.jpg',       label: 'The club ground on a match day' },
     topRight:   { image: '/home/blood-camp.jpg',   label: 'Our blood donation camp' },
     bottomLeft: { image: '/home/puja-evening.jpg', label: 'The cultural evening' },
   },
   ```

   Note the leading slash, and that the word `public` does not appear in the path.

3. Save. The browser updates within a second.

Leave any `image` as `''` to keep its coloured tile with initials on it. The
three tiles stay the same size either way, so filling them in one at a time
never leaves the banner looking broken.

## Where each one goes

| Key | Position | Shape to supply |
| --- | --- | --- |
| `tall` | The large picture, centre | Upright, about 4 wide × 5 tall (e.g. 1200 × 1500) |
| `topRight` | Small, above right | Square (e.g. 800 × 800) |
| `bottomLeft` | Small, below left | Square (e.g. 800 × 800) |

Each is cropped from the centre to fit its frame, so choose files with the
subject in the middle — a face or a group at the very edge will be cut off.

## `label` is not decoration

It is read aloud to visitors using a screen reader, and it is the word the
stand-in tile takes its initials from. Describe what is in the picture — "Our
blood donation camp", not "photo 1".

## Type the filename exactly, capitals included

`Outside.jpeg` and `/home/outside.jpeg` are the same file on a Mac and two different
files on the server the site is built on. A mismatched capital letter therefore looks
perfectly fine on your own machine and shows an empty tile on the live site.

The safe habit is **lower-case filenames with hyphens** — `club-ground.jpeg`, not
`Club Ground.jpeg` — and copying the name rather than retyping it.

## Two things to check first

- **Size the files down before saving them here.** A photograph straight off a
  phone can be 6 MB, and all three load before the visitor sees anything. Around
  300 KB each is plenty; anything over about 1 MB is worth shrinking. On macOS,
  Preview → Tools → Adjust Size does it.
- **HEIC files will not show.** Photographs from an iPhone often arrive as
  `.HEIC`, which Safari can display and no other browser can. Export as JPEG
  first.

## These are published to everyone

Everything in `public/` is served as-is to anyone who visits the site. Only put
pictures here that the club is happy to publish, and get the agreement of anyone
clearly identifiable in them before they go up.
