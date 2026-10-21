# Public website visual refresh — 21 October 2026

Scope: public marketing routes only. No database writes, plan entitlements or billing logic changed.

## Original illustrations

Built-in image_gen, imagegen skill. Five additional 1536 × 1024 originals, in addition to the two About illustrations documented in chi-siamo-visuals.md. These are editorial brand illustrations, not product screenshots or photographs of customers.

Shared visual prompt direction: premium landscape 3:2 tactile architectural 3D still life, matte off-white stone, charcoal, brushed aluminium, restrained orange accents, soft studio daylight, generous negative space. No readable UI, text, numbers, logos or people.

Subject prompts:
- finance: miniature construction project connected to calculator and abstract financial charts.
- people: hardhats, planning board and orderly team scheduling tools.
- sales: proposal documents leading toward a completed miniature house.
- automation: connected geometric cubes and a tablet, representing controlled workflows.
- documents: folders, construction plans and material samples arranged as one coherent still life.

Saved assets: public/images/marketing/{finance,people,sales,automation,documents}-{640,960,1536}.webp. Responsive srcSet, explicit dimensions, lazy loading below the fold. Original PNG files preserved in the local generated_images directory.

## Published video embeds

- y2GEKRVgFnY: portrait, 25 seconds, “Il fatturato non è quello che ti resta”.
- XBFZYERpQuA: horizontal, 2:57, “Dove perdi soldi in cantiere? I 5 buchi da controllare”.

Both verified playing within the local website. Covers come from the original Edilizia in Cloud editorial archive, with the original logo; no generated logo. Local optimized covers: video-margine.webp and video-costi-cantiere.webp. Player loaded on explicit click, privacy-enhanced YouTube domain, keyboard focus returned on close. Scheduled future videos are excluded until public. These are editorial videos, not product walkthroughs; new walkthroughs can use InlineYouTube when recorded.

## Reproducible verification

- scripts/marketing-route-inventory.mjs: route/template and article census.
- scripts/audit-marketing-html.mjs: generated HTML headings, titles, JSON-LD and local image references.
- Website regression tests run in CI, including click-to-play and prerender article discovery.

## Three contextual videos — 22 October update

| Page | Video | Scheduled publication (Europe/Rome) |
| --- | --- | --- |
| /confronto/ | PdwfISQVXPw — 7 domande prima di scegliere un gestionale | 22 October 2026, 20:00 CEST |
| /pianifica-migrazione/ | Yk0hJ01HKco — Da Excel e WhatsApp a un’impresa organizzata | 30 October 2026, 20:00 CET |
| /funzionalita/tesoreria/ | SdOsQ9YyMvI — Impresa in utile, conto in rosso | 26 October 2026, 20:00 CET |

Dates are from PROGRAMMAZIONE.json in the original editorial archive. Before the scheduled time, show an original local cover and publication date, without iframe, play button or external video link. At the scheduled time, enable click-to-play inline playback; never autoplay on page load. The schedule uses explicit UTC offsets across the 25 October daylight-saving change. Also refresh availability when a browser tab becomes visible again. This follows the confirmed publication schedule; it does not change YouTube visibility or upload videos.

Original covers: SPOT09, SPOT06 and SPOT03, variant A LOGO_ORIGINALE_v2. Optimized 960 × 540 WebP copies: public/images/marketing/video-{scelta-gestionale,migrazione-excel,utile-liquidita}.webp. No AI changes to the covers or original logo.
