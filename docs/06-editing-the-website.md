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

Each bearer takes four fields:

```ts
{
  name: 'Anita Sharma',
  role: 'Secretary',
  since: '2026',
  photo: '/committee/anita-sharma.jpg',
  email: 'secretary@yourclub.in',
},
```

**Photographs.** Save the image in `frontend/public/committee/`, then write the
path from the site root — a file saved as
`frontend/public/committee/anita-sharma.jpg` is written as
`photo: '/committee/anita-sharma.jpg'`.

- lower-case file names, hyphens instead of spaces (`anita-sharma.jpg`). A space
  in a filename breaks the address
- portrait, roughly **800 × 1000 pixels**, **under 300 KB**. A photograph
  straight off a phone is 3–6 MB and every visitor downloads all of it. Preview →
  Tools → Adjust Size on a Mac, or any online resizer
- the card crops to a 4:5 portrait from the centre, so leave a little space above
  the head
- leave `photo: ''` and that card keeps its coloured monogram. Photographs can be
  added one at a time; the grid does not change shape

**Email addresses.** Leave `email: ''` and no address is shown, which is how the
site ships. Fill it in and the card gets a mail button — and the note at the
bottom of the page changes from *write to the club office* to *write to the bearer
whose office your enquiry concerns*, so the page does not contradict itself.

Prefer an address that belongs to the **office rather than the person** —
`secretary@yourclub.in` rather than somebody's personal Gmail. An address on a
public page is harvested by spammers within days, and an office address can be
handed to the next bearer at the end of the term without editing the site or
losing the mail.

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

- Committee names (section 7) — currently `'Full name'`
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
