# Third-party notices

The web site (`web/`) bundles icon glyphs and the Web Analytics loader from the projects below. Their license texts are reproduced in full.

## Lucide (`@lucide/svelte` 1.59.0)

- Project: https://lucide.dev (source: https://github.com/lucide-icons/lucide)
- Used for: the white glyphs in the circular category badges. Every mapping is in `web/src/lib/icons.ts`.
- License: ISC. Icons derived from Feather are also under the MIT License. Both texts follow, copied verbatim from the package's `LICENSE` file.

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Vercel Web Analytics loader (`@vercel/analytics` 2.0.1)

- Project: https://github.com/vercel/analytics (package `packages/web`); documentation: https://vercel.com/docs/analytics
- Used for: `inject()`, which adds Vercel's Web Analytics script to the public site only (`web/src/main.ts`, `web/src/lib/analytics.ts`). The script itself (`/_vercel/insights/script.js`) is served by Vercel at run time; it is not bundled or in this repository.
- License: MIT. The text follows, copied verbatim from the package's `LICENSE` file.

```text
The MIT License (MIT)

Copyright (c) 2026 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## U.S. Census Bureau district boundaries and ZIP tables (`geo/ca-2026-districts.json`)

- Publisher: U.S. Census Bureau (TIGER/Line 2026 shapefiles, block equivalency files, 2020 ZCTA relationship file).
- Used for: the "My ballot" ZIP and location lookup. The data is simplified and re-encoded by `npm run import:districts`; it is bundled into the page and never sent anywhere.
- License: public domain, as a work of the U.S. federal government (17 U.S.C. § 105). Provenance, file hashes and verification: `geo/README.md` and `geo/manifest.json`.

## Fonts from Google Fonts: Public Sans, Source Serif 4, IBM Plex Mono (loaded, not bundled)

- Used for: interface text (Public Sans), quotes (Source Serif 4) and monospaced text (IBM Plex Mono); see `web/src/app.css`.
- The site loads these fonts from Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`; see `web/index.html`). It does not bundle them, and the font files are not in this repository.
- License: each is under the SIL Open Font License, Version 1.1, as its license file in the Google Fonts repository states: [Public Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/OFL.txt), [Source Serif 4](https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/OFL.txt), [IBM Plex Mono](https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt).
