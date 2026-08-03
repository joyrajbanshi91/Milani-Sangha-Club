# Logo masters — deliberately outside `frontend/public/`

Anything inside `frontend/public/` is **published to the website and precached by
the service worker**, so every visitor downloads it on their first visit. These two
files are 1.6 MB each and are never displayed, which meant a 4.8 MB precache for a
logo shown at 48 pixels.

They live here instead: kept in the repository, never served.

| File | What it is |
| --- | --- |
| `logo-master-transparent.png` | 1024px RGBA. **The master.** Use this to regenerate anything |
| `logo-original-no-alpha.png` | The first download. No alpha channel — the transparency chequerboard is baked in as grey pixels. Kept only for reference; do not use it |

The file the site actually serves is `frontend/public/brand/logo_web.png` — a 512px
transparent copy, 313 KB. Regenerate it after changing the master:

```bash
sips -s format png -z 512 512 brand-masters/logo-master-transparent.png \
  --out frontend/public/brand/logo_web.png
```

And the phone app icons:

```bash
npm run icons:from-logo brand-masters/logo-master-transparent.png
```
