# Cultural evening

Put this album's photographs **in this folder**. They appear on the gallery page as
soon as they are here — there is no list to update and no filename to type anywhere.

    frontend/src/assets/gallery/cultural-evening/01-something.jpg

## The four rules

1. **Order comes from the filename.** Prefix them `01-`, `02-`, `03-` and they run in
   that order; the first one becomes the album's cover on the gallery page.
2. **Name them for what they show** — `03-blood-pressure-check.jpg`, not `IMG_4471.JPG`.
   The name becomes the description a screen reader (and Google) reads. A camera name
   is ignored and the album's title is used instead, so nothing breaks either way.
3. **`.jpg`, `.png`, `.webp` or `.avif`.** `.HEIC` from an iPhone will not show in most
   browsers — set the phone to *Most Compatible*, or export as JPEG first.
4. **Shrink them before committing:** `npm run gallery:resize`. A photograph off a phone
   is 3-6 MB and the page shows it at a fraction of that size. The script does the whole
   gallery at once and is safe to re-run.

Then commit the photographs and push:

    npm run gallery:resize
    git add frontend/src/assets/gallery
    git commit -m "Photographs from the cultural evening"
    git push origin main

## To add a whole new album

Two steps, and the folder name is the link between them:

1. Add an entry to `gallery` in `frontend/src/content/site.ts` with a new `slug`.
2. Create a folder here with **exactly that slug** as its name, and put the
   photographs in it.
