# Club logo and brand images

**Put the club's logo in this folder.**

Anything in `frontend/public/` is served from the root of the website, so a file
saved here as `logo.png` is reachable at `/brand/logo.png`.

## Adding the logo

1. Save the file here, for example `frontend/public/brand/logo.png`.
2. Open `frontend/src/content/site.ts` and set the path in section 1:

   ```ts
   logo: {
     src: '/brand/logo.png',   // ← note the leading slash, and no "public"
     showNameBeside: true,
     rounded: true,
   },
   ```

3. Save. The header and footer update immediately.

Two switches worth knowing:

- `showNameBeside: false` — use this if the logo image already contains the
  club's name, so it is not printed twice.
- `rounded: false` — use this for a wide logo, or one with a transparent
  background that should sit directly on the page rather than on a rounded plate.

## What format

| | |
| --- | --- |
| **Best** | SVG, or PNG with a transparent background |
| **Size** | Around 512 × 512 for a square badge; any width for a wide logo |
| **Avoid** | A JPEG with a white box around it — the white square will show against the coloured backgrounds |

The image is displayed at about 48px, but supply it larger: the same file is used
for the phone app icon, and a small image scaled up looks blurred.

## The phone app icon is separate

The logo above appears **on the page**. The icon on someone's phone home screen
when they install the app comes from `frontend/public/icons/`, which currently
holds generated placeholders (a white **M** on club green).

Generate the real ones from your logo in one command:

```bash
npm run icons:from-logo frontend/public/brand/logo.png
```

That writes all the required sizes into `frontend/public/icons/`. It uses `sips`,
which is built into macOS — nothing to install. Your current icons are backed up
to `frontend/.icon-backups/` first, so a bad source file is never destructive.

Two things it does on purpose:

- **A wide logo is padded, not cropped.** An icon that loses half the club's name
  is worse than one with margins. The padding uses the club green, so a
  transparent logo does not end up as a white box.
- **The maskable icon gets an extra margin.** Android crops it to whatever shape
  the launcher uses — a circle, a squircle, a rounded square — so artwork that
  fills the square would lose its edges.

It cannot read SVG. If your logo is an SVG, export a PNG at 512px or larger for
the icons; the SVG itself is still the better choice for `logo.src` on the page.

## Files in this folder

Only images belong here. Everything in `public/` is published as-is to anyone who
visits the site, so do not put draft artwork, scans of documents, or anything
containing members' personal details in here.
