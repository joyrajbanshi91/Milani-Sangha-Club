# Editing the website

**Everything the public website says lives in one file:**

```
frontend/src/content/site.ts
```

Open it, change the text between the quote marks, save. The browser updates in
about a second while `npm run dev` is running. You do not need to touch any page
or component to change wording, add an event, or update the committee list.

---

## Before you start

```bash
cd /Users/joy/Documents/Milani_Sangha_Club
npm run dev
```

Then open <http://localhost:5173> and keep it beside your editor. Every save
refreshes the page.

### Four rules that prevent nearly every mistake

1. **Change only what is between the quote marks.**
   `title: 'Coming up',` → `title: 'What’s on',`
   Leave the `title:`, the quotes, and the comma exactly as they are.

2. **Use a curly apostrophe `’`, not a straight one `'`.**
   A straight apostrophe ends the text early and breaks the page.
   `'the club's history'` breaks. `'the club’s history'` is correct.
   On a Mac, `’` is <kbd>⌥</kbd> + <kbd>⇧</kbd> + <kbd>]</kbd>.

3. **Dates are always `YYYY-MM-DD`.**
   20 September 2026 is `'2026-09-20'`. The site formats it for display.

4. **If the page goes blank, undo your last change** (<kbd>⌘</kbd>+<kbd>Z</kbd>).
   The terminal running `npm run dev` will show the line number of the problem.

### Check your work before publishing

```bash
npm run verify
```

This runs the automated checks. They catch a menu link pointing at a page that
does not exist, two events sharing the same identifier, a date typed in the wrong
format, and similar — so you find out from a test rather than from a member.

---

## Where each part of the site comes from

The file is numbered in the same order as the site. Search for the section number
(for example `2. NAVIGATION`) to jump to it.

| # | Section in the file | Controls |
| --- | --- | --- |
| 1 | `club` | Club name, tagline, address, phone, email, social links, map |
| 2 | `nav` | The menu across the top |
| 3 | `home` | Everything on the home page |
| 4 | `about` | The About page |
| 5 | `missionVision` | The Mission & vision page |
| 6 | `history` | The History timeline |
| 7 | `committee` | The Executive committee page |
| 8 | `membership` | Benefits, fee table, how-to-join steps |
| 9 | `events` | The Events page and the home page diary |
| 10 | `news` | The News page and the home page notice board |
| 11 | `gallery` | Album list on the Gallery page |
| 12 | `documents` | The Documents page |
| 13 | `testimonials` | The quotes band on the home page |
| 14 | `sponsors` | The supporters band on the home page |
| 15 | `contact` | Contact page wording and the form's subject list |
| 16 | `footer` | Footer columns and links |

---

## Common jobs, step by step

### Change the club's name, address or phone number

Section 1, `club`. Leave a value as `''` (two quote marks, nothing between) to
**hide that row entirely** — an empty phone number does not show an empty line.

```ts
contact: {
  addressLines: ['12 Station Road', 'Near the community hall'],
  city: 'Siliguri',
  state: 'West Bengal',
  postcode: '734001',
  phone: '+91 98765 43210',
  email: 'office@example.org',
  ...
}
```

Setting `email` also switches on the contact form — until an address is set, the
form is deliberately disabled rather than silently discarding messages.

### Add an event

Section 9. Copy an existing block and change the values. `slug` must be unique
and lower-case-with-hyphens; it is an internal identifier, not shown to visitors.

```ts
{
  slug: 'sports-day-2027',
  title: 'Annual sports day',
  date: '2027-01-26',
  time: '07:30',
  venue: 'Club ground',
  category: 'Sport',
  summary: 'Track events for all age groups, followed by prize distribution.',
},
```

Events whose date has passed move to the **Past** tab automatically, and drop off
the home page. You do not need to delete them.

### Post a notice

Section 10. Set `pinned: true` to hold one notice at the top of the list —
only one at a time, which the checks enforce.

### Update the committee after an election

Section 7. Replace each `name`, set `term` (for example `'2026–2028'`), and add
or remove entries to match the actual committee.

The page ships with the club's **eight offices** — President, Secretary, Secretary,
Cultural Secretary, Treasurer, Cashier, Game Secretary, Game Secretary — each
waiting for a name, a photograph and an address. Each bearer takes four fields:

```ts
{
  name: 'Anita Sharma',
  role: 'Secretary',
  since: '2026',
  photo: '/committee/secretary-1.jpg',
  email: 'secretary@example.org',
},
```

**Photographs are shown as circles.** Save the image in
`frontend/public/committee/`, then write the path from the site root — a file saved
as `frontend/public/committee/secretary-1.jpg` is written as
`photo: '/committee/secretary-1.jpg'`.

- **crop it square before saving**, about **600 × 600 pixels**, **under 200 KB**,
  face centred with a little space around the head. The card takes a circle from
  the centre of the file, so a tall photograph simply loses its top and bottom
- a photograph straight off a phone is 3–6 MB and every visitor downloads all of
  it. Preview → Tools → Adjust Size on a Mac, or any online resizer
- lower-case file names, hyphens instead of spaces. A space in a filename breaks
  the address
- suggested names, already written as comments beside each bearer in `site.ts`:
  `president.jpg`, `secretary-1.jpg`, `secretary-2.jpg`,
  `cultural-secretary.jpg`, `treasurer.jpg`, `cashier.jpg`,
  `game-secretary-1.jpg`, `game-secretary-2.jpg`
- leave `photo: ''` and that card keeps its coloured monogram — round and the same
  size as the photographs beside it, so a half-finished committee still reads as one
  design. **Fill in the file and the path together:** a path pointing at a file that
  is not there shows visitors a broken image

Two bearers share the title **Secretary** and two share **Game Secretary**, as the
club has them. If visitors would find that confusing, change one of each to
`'Joint Secretary'` and `'Assistant Game Secretary'` — the wording in `role` is
exactly what the card prints.

**Email addresses.** Leave `email: ''` and no address is shown, which is how the
site ships. Fill it in and the card gets a mail button — and the note at the
bottom of the page changes from *write to the club office* to *write to the bearer
whose office your enquiry concerns*, so the page does not contradict itself.

Prefer an address that belongs to the **office rather than the person** —
`secretary@example.org` rather than somebody's personal Gmail. An address on a
public page is harvested by spammers within days, and an office address can be
handed to the next bearer at the end of the term without editing the site or
losing the mail.

### Change where members pay by UPI

Section 1, `club.upi`. Set the UPI ID and the name the payment app will show for it, then
regenerate the QR code:

```bash
npm run upi:qr
```

That writes `frontend/public/brand/upi-qr.svg` from the ID you just set, so the QR and the
printed ID can never disagree. **A stale QR sends money to the old account**, quietly, so
run it every time the ID changes and commit the SVG with the change.

Scan the new QR yourself with a payment app before pushing, and check the name it shows.
That name is what the portal tells members to expect, and it is the only protection they
have against a swapped code.

### The three figures under the banner

Section 3 of `site.ts`, `stats:` inside `hero:`. Each figure says where its number comes
from:

```ts
stats: [
  { source: 'members', value: '',   label: 'Members' },
  { source: 'manual',  value: '24', label: 'Events a year' },
  { source: 'manual',  value: '11', label: 'Years serving the area' },
],
```

- **`source: 'members'` counts itself.** The website asks the API how many accounts the
  club has and prints that. There is nothing to keep up to date: add a member in the
  office area and the front page follows within half an hour. Leave `value` empty.
- **`source: 'manual'` is whatever you type.** Nothing in the system knows how many
  events the club runs in a year, so that one is yours to set and yours to revise.
- **Write the numeral only** — `'24'`, not `'24 events'`. The label underneath already
  says what it is, and the figure counts up when it scrolls into view, which only works
  on a plain number. A suffix does survive, so `'500+'` is fine.
- **An empty `value` shows a dash.** That is deliberate: a dash reads as *not stated*,
  which is honest, where a `0` would be a false claim about the club.

Two things about the counted figure:

- **It counts every account, office bearers included** — they are members of the club
  too.
- **It needs `VITE_API_BASE_URL` set** to the API's own domain. On Appwrite the site and
  the API are separate domains, so without it the site asks itself, gets no number, and
  quietly shows the dash. See [03-environment-variables.md](03-environment-variables.md).
  Nothing breaks either way; the figure is simply absent until it is set.

### Put three photographs in the home page banner

The top of the home page shows three tiles beside the headline. Until you supply
pictures they are coloured squares with initials on them — **NC**, **CE** and **SW** —
which is the stand-in, not a fault.

Two steps:

1. Save the files in `frontend/public/home/`.
2. Open section 3 of `site.ts`, find `collage:` inside `hero:`, and fill in the paths:

   ```ts
   collage: {
     tall:       { image: '/home/ground.jpg',       label: 'The club ground on a match day' },
     topRight:   { image: '/home/blood-camp.jpg',   label: 'Our blood donation camp' },
     bottomLeft: { image: '/home/puja-evening.jpg', label: 'The cultural evening' },
   },
   ```

   The path starts with `/home/` — a leading slash, and the word `public` never appears
   in it. This is the same rule as the logo and the committee photographs.

- **`tall` is the big upright one** in the centre, roughly 4 wide by 5 tall.
  `topRight` and `bottomLeft` are the two small square ones. Each is cropped from the
  centre, so put the subject in the middle of the frame.
- **`label` is read aloud** to visitors using a screen reader, and it is where the
  stand-in tile's initials come from. Say what is in the picture, not "photo 1".
- **Fill in one, two or all three.** Any left as `''` keeps its coloured tile at the same
  size, so a banner filled in over several weeks never looks half-built.
- **Copy the filename, capitals and all.** `Outside.jpeg` and `/home/outside.jpeg` are
  the same file on a Mac and two different files on the Linux machine that builds the
  site — so a wrong capital letter looks right locally and shows an empty tile once
  deployed. Name the files in lower case with hyphens and the problem cannot arise.
- **Shrink the files first.** There is no resize command for this folder — all three load
  before the visitor sees anything, so aim for about 300 KB each. On macOS, Preview →
  Tools → Adjust Size.
- **Phones show all three too**, as a row of squares *below* the buttons — under them
  rather than above, so "Become a member" is still on the first screen. The tall one is
  cropped square there, so a subject near the top or bottom of that photograph will be
  lost on a phone even though it looks right on a laptop.

`frontend/public/home/README.md` repeats these notes beside the files.

### The picture on the About page

Section 6 of `site.ts`, `picture:` inside `about:`. Same rule as the banner — the file
goes in `frontend/public/home/` and the path is written from the site root:

```ts
picture: {
  image: '/home/outside.jpeg',
  label: 'New Barrackpore Milani Sangha Club',
},
```

It sits beside the opening paragraphs, in a **wide** frame — roughly 16 across by 10
down — so a landscape photograph suits it, and it is cropped from the centre. Leave
`image` as `''` and it shows the coloured **NC** tile at the same size instead.

The same file can be used here and in the banner; nothing minds being pointed at twice.

### Add photographs to the gallery

Each album has a folder named after its slug. **Copy the photographs in and they are on
the website** — there is no list to update:

```
frontend/src/assets/gallery/health-camp/01-registration.jpg
frontend/src/assets/gallery/health-camp/02-blood-pressure-check.jpg
frontend/src/assets/gallery/health-camp/03-prize-giving.jpg
```

The folders that exist today are `cultural-evening`, `tournament`, `health-camp` and
`founders-day`, and each has a README beside it repeating these notes.

- **Order comes from the filename.** Prefix them `01-`, `02-`, `03-`; the first becomes
  the album's cover on the gallery page. The count on the card is however many are in the
  folder.
- **Name them for what they show** — `03-prize-giving.jpg`, not `IMG_4471.JPG`. The name
  becomes the description a screen reader and a search engine read. A camera name is
  ignored and the album's title used instead, so nothing breaks either way.
- **Shrink them before committing**, or the page will crawl on a phone:

  ```bash
  npm run gallery:resize              # the whole gallery
  npm run gallery:resize health-camp  # one album
  ```

  It resizes anything wider than 1600px, re-saves JPEGs at quality 80, keeps the
  originals in `frontend/.gallery-originals/` (git-ignored), and is safe to re-run. A
  photograph off a phone is 3–6 MB and the page shows it at a fraction of that size.
- **`.jpg`, `.png`, `.webp` or `.avif`.** An iPhone `.HEIC` will not display in most
  browsers — set the phone to *Most Compatible*, or export as JPEG first.

Then:

```bash
npm run gallery:resize
git add frontend/src/assets/gallery
git commit -m "Photographs from the health check-up camp"
git push origin main
```

**To add a whole new album**, two steps — the folder name is the link between them:

1. Add an entry to `gallery` in section 11 of `site.ts` with a new `slug`, title, date and
   description.
2. Create a folder of **exactly that slug** in `frontend/src/assets/gallery/` and put the
   photographs in it.

An album whose folder is empty keeps a coloured placeholder and says the photographs are
to follow, so a gallery being filled one event at a time never looks broken.

> **Before you publish somebody's photograph**, be sure they are happy to be on a public
> page — especially photographs of children. It is easier to ask first than to explain
> afterwards, and a photograph pushed to a public repository stays in its history.

### Set the membership fees

Section 8, `types`. Change `fee: null` to the agreed amount in rupees:

```ts
{ key: 'regular', name: 'Regular', fee: 500, period: 'per year', ... },
```

`null` displays as **“To be confirmed”**. The amounts ship as `null` on purpose —
inventing a club's fees would be worse than showing them as pending. Rupee
formatting (₹1,20,000 rather than ₹120,000) is handled for you.

### Hide a whole section

Empty the list. `testimonials: []` and `sponsors: []` remove those bands from the
home page completely, rather than leaving an empty heading behind.

### Remove a page from the menu

Delete its entry from `nav` in section 2. The page still exists at its address —
it is just no longer advertised. The checks will fail if you point the menu at a
page that does not exist, which is the mistake worth catching.

### Add the club's logo

There are **two** logos, and they are different things.

**1. The logo on the page** (header and footer)

1. Save the image in `frontend/public/brand/` — for example
   `frontend/public/brand/logo.png`.
2. In section 1 of the content file, set the path:

   ```ts
   logo: {
     src: '/brand/logo.png',   // leading slash, and no "public" in the path
     showNameBeside: true,
     rounded: true,
   },
   ```

3. Save. The header and footer update immediately.

Anything inside `frontend/public/` is served from the root of the site, which is
why the path is `/brand/logo.png` and not `frontend/public/brand/logo.png`.

Three settings control how it appears:

| Setting | Use it when |
| --- | --- |
| `size: 'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl'` | Make the logo bigger or smaller. The header grows taller to fit, so nothing is clipped |
| `showNameBeside: false` | The logo image already contains the club's name, so it is not printed twice |
| `rounded: false` | The logo is a circle, is wide, or has a transparent background and should sit directly on the page rather than on a rounded square plate |

**If the logo still looks small at `'2xl'`**, the image itself almost certainly
has empty space around the artwork. No setting can enlarge blank padding — crop
the margin out of the file instead.

### Two traps with logo files

**A "transparent" PNG that is not transparent.** Some editors and download sites
export the grey-and-white chequerboard *as real pixels*. On the page you then get
a chequered square behind the logo. To check on a Mac:

```bash
sips -g hasAlpha frontend/public/brand/your-logo.png
```

`hasAlpha: no` means it cannot be transparent, whatever it looks like in Preview.
Re-export it, or use a copy that reports `hasAlpha: yes`.

**A file that is far too large.** A logo shown at 60px does not need to be 1.6 MB —
that is a slow page for a member on mobile data, on every single page. Resize a
copy to 512px:

```bash
sips -s format png -z 512 512 frontend/public/brand/your-logo.png \
  --out frontend/public/brand/logo-web.png
```

Then point `logo.src` at the smaller copy and keep the original as your master.

Format: **SVG, or PNG with a transparent background.** Around 512 × 512 for a
square badge. Avoid a JPEG with a white box around it — the white square will
show against the coloured backgrounds.

**2. The icon on someone's phone home screen**

This is a separate set of files in `frontend/public/icons/`, currently holding
generated placeholders. Build the real ones from the same logo:

```bash
npm run icons:from-logo frontend/public/brand/logo.png
```

Your existing icons are backed up to `frontend/.icon-backups/` first. Restart
`npm run dev` afterwards — browsers cache icons hard — and reinstall the app to
see the home-screen icon change.

The script needs a PNG or JPEG; it cannot read SVG. If your logo is an SVG,
export a PNG at 512px or larger for the icons and keep using the SVG for
`logo.src` on the page.

### Add the Google map

Section 1, `club.map`.

- `directionsUrl` — a normal Google Maps link. Always safe.
- `embedUrl` — puts an interactive map in the page. **Off by default**, because
  an embedded map loads Google's scripts and cookies for every visitor. That is
  the club's decision to make, not one to inherit silently.

To enable it: Google Maps → find the club → **Share** → **Embed a map** → copy
only the `src="…"` value from the code Google gives you.

---

## Turning off the "Placeholder content" reminder

While the site ships with sample copy, a small yellow note appears in the corner
**during local development only** — never for real visitors. Once you have
replaced the placeholders, edit the top of the content file:

```ts
export const contentStatus: 'placeholder' | 'reviewed' = 'reviewed'
```

Please do that only when it is true. It exists to stop the site going live with
`Full name` still listed as the club president.

### What must be replaced before launch

- Committee names (section 7) — currently `'Full name'` on all eight offices.
  Photographs and email addresses are optional; the cards look finished without them
- Testimonial quotes and attributions (section 13) — never publish a quote a
  member did not give you
- The history timeline (section 6) — currently `'Year'` placeholders
- Membership fees (section 8) — currently `null`
- Address, phone and email (section 1)
- Sample events, news and albums (sections 9–11)
- The PWA icons in `frontend/public/icons/` — replace with the club's logo,
  keeping the filenames and sizes

---

## Changing how it looks, not what it says

Colours, fonts, spacing, shadows and animations are defined once, at the top of
`frontend/src/index.css`:

```css
@theme {
  --color-brand-900: #0f3d2e;   /* buttons, headings, the logo plate */
  --color-accent-400: #f5ad1b;  /* eyebrows, rules, highlights */
  --font-display: ui-serif, Georgia, …;  /* headings */
  --shadow-glow: …;             /* the halo on primary buttons */
}
```

Change `--color-brand-900` and the header, footer, buttons and hero all follow.
That is the point of doing it there rather than page by page.

Two notes on the type: headings use a **serif** face to give the club an
institutional voice, and both faces are ones already on the reader's device, so
nothing is fetched from Google Fonts. That keeps the site fast on a slow
connection and working offline.

### The coloured backgrounds

The soft multi-colour washes behind the hero and the page banners are
`bg-aurora` and `bg-aurora-soft`, defined in the same file. They are built from
layered CSS gradients — **no image is downloaded**, so they cost nothing and
work offline. To change the mood of the whole site, edit the colour stops in
those two rules.

Section backgrounds are chosen with the `tone` prop, so a page never hard-codes
a colour:

```tsx
<Section tone="white">      {/* plain */}
<Section tone="tint">       {/* faint warm grey */}
<Section tone="auroraSoft"> {/* gentle colour wash */}
<Section tone="aurora">     {/* full colour mesh — one or two bands per page */}
<Section tone="brand">      {/* deep green panel, light text */}
```

### Category colours

Event categories, news categories and document types are colour-coded
automatically. "Sport" is always the same green everywhere it appears, because
the colour is derived from the word itself in `frontend/src/lib/hues.ts`. Add a
new category in the content file and it picks up a colour with no styling work.

To change the palette, edit the six entries in that file. Write class names out
in full — `bg-amber-100`, not `bg-${hue}-100` — because Tailwind finds classes by
scanning the source text and an assembled name is invisible to it.

### The movement

Sections settle into place as you scroll (`Reveal`), the hero figures count up
(`AnimatedNumber`), the supporters row scrolls continuously (`Marquee`), cards
lift on hover, and a "back to top" button appears once you have scrolled.

All of it stops for anyone who has switched on **Reduce Motion** in their system
settings, and revealed content is then shown immediately rather than staying
hidden — an animation preference must never cost someone the information.

---

## What is not editable here (yet)

These are database-driven in later phases, and the committee will manage them in
the admin portal rather than in a file:

| Currently in the content file | Becomes managed in |
| --- | --- |
| Events | Admin portal → Events |
| News and notices | Admin portal → News |
| Gallery albums and photographs | Admin portal → Gallery |
| Documents and their files | Admin portal → Documents |
| Committee members and photographs | Admin portal → Committee |
| Membership fees | Admin portal → Settings |

When that happens, the wording in the content file — the headings, the leads, the
menu — stays exactly where it is. Only the lists move.
