# Wedding Invitation Platform

André & Flávia — 24 September 2027.

A small website guests open from a shared link to see everything about the day
(ceremony, reception, menu, practical info) and to RSVP, plus a printable A5 invite
with the same information for guests who prefer paper.

- **Guest-facing text** is in European Portuguese; code and docs are in English.
- **No build step.** Plain HTML, CSS and ES modules in [`site/`](site/).
- **One content file.** [`site/content/wedding.json`](site/content/wedding.json) feeds both the
  website and the printed invite, so they never drift apart.
- **Private guest list.** Guests and answers live in a Google Sheet behind a small Apps Script
  ([`backend/`](backend/)); nothing about guests is committed here.

## Design

Navy and gold: palette #0C3362 · #6EA6CD · #C3D3E0 · #DCAD79 · #F4E7D6, navy/gold alcohol-ink
marble bands, a pale blue silk background with gold sparkles, and an A F monogram in a gold ring with
flowers, a gold swash and a wave (`site/assets/monogram.webp`, cut from the couple's reference).

## How it works

```
 guest (link or QR with ?c=CODE) ──▶ site/index.html ──▶ Apps Script web app ──▶ Google Sheet
                                                                                   ▲
 couple (phone answers, notes) ────────────────────────────────────────────────────┘
```

Each household gets a 6-character invite code. The personal link (`…/?c=ABC123`) or the
code printed on the invite lets the site greet the family by name and limit the number of
seats. Answers can be changed until the final deadline.

| RSVP phase | Dates (Europe/Lisbon) | Behaviour |
|---|---|---|
| Open | until 24 Jun 2027 | Normal form |
| Late | 25 Jun – 24 Aug 2027 | Form still works, with a "deadline passed" note |
| Closed | from 25 Aug 2027 | Form closed, guests are shown the couple's phone numbers |

Dates live in `wedding.json` (`rsvp.deadline`, `rsvp.finalDeadline`) and in `Code.gs`
(`FINAL_DEADLINE`, enforced server-side).

## Project layout

```
site/
  index.html, app.js, styles.css   guest website + RSVP
  invite.html, invite.js, invite.css  printable A5 invites (front + back, per-household QR)
  shared.js                        content loading, API client, time-zone helpers
  config.js                        apiUrl (Apps Script) and public siteUrl
  content/wedding.json             all event content
  assets/marble.jpg, silk.jpg      navy/gold marble and blue silk backgrounds (tools/make_backgrounds.py)
  assets/favicon.svg               gold star icon
  vendor/qrcode.mjs                qrcode-generator 2.0.4 (MIT)
backend/
  apps-script/Code.gs              RSVP API + sheet helpers
  README.md                        setup guide for the Google Sheet
.github/workflows/pages.yml        deploys site/ to GitHub Pages
tools/make_backgrounds.py          regenerates the background images
```

## Run locally

```sh
cd site && python3 -m http.server 8000
# open http://localhost:8000
```

With `apiUrl` empty in `config.js` the site runs in **demo mode**: try code `DEMO01`
(4 seats) or `AVOS22` (2 seats); answers are kept only in your browser.

## Deploy

1. In the repository: *Settings → Pages → Source: GitHub Actions*.
   (GitHub Pages on a private repository requires a paid GitHub plan.)
2. Push to `main`; the workflow publishes `site/`.
3. Set up the Google Sheet backend — see [`backend/README.md`](backend/README.md) — and put its
   `/exec` URL in `site/config.js`.

## Printing invites

Open `invite.html`, paste the `CODE;Name` list (from the sheet menu
*Casamento → Copiar lista para impressão de convites*), click **Imprimir / guardar PDF**
and save as PDF for the print shop. A5, no margins, background graphics on, double-sided.

## Content still to confirm

Search for `_todo` in `wedding.json`:

- [ ] Real phone numbers for André and Flávia
- [ ] Final menu (`menu.draft` → `false` removes the "provisório" badge)
- [ ] Travel time church → quinta, parking, dress code
- [ ] IBAN / gift list
