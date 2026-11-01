# RSVP backend (Google Sheets + Apps Script)

The guest list lives in a private Google Sheet. A small Apps Script attached to
that sheet is published as a web app; the website calls it to look up an invite
code and to save answers. Nothing about the guests is stored in this repository.

## One-time setup (≈10 minutes)

1. **Create the sheet.** In Google Drive, create a new Google Sheet, e.g. "Casamento – Convidados".
2. **Add the script.** In the sheet: *Extensions → Apps Script*. Replace the contents of
   `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs).
   In *Project Settings*, tick "Show appsscript.json" and paste
   [`apps-script/appsscript.json`](apps-script/appsscript.json) (sets the Lisbon time zone).
3. **Prepare the sheets.** Reload the spreadsheet. A **Casamento** menu appears.
   Run *Casamento → 1. Preparar folhas* and accept the permission prompt.
   This creates three tabs: `Convidados`, `Respostas` (a log of every answer) and `Resumo` (totals).
4. **Fill the guest list.** One row per household in `Convidados`:
   - `Nome no convite` — how the invite is addressed ("Família Silva", "Tia Rosa e Tio Zé")
   - `Lugares` — how many people are invited from that household
   - `Tipo de convite` — Digital, Físico or Ambos
   - `Contacto` — optional
5. **Generate codes.** *Casamento → 2. Gerar códigos em falta*. Run it again whenever you add rows;
   existing codes are never changed.
6. **Publish the web app.** In Apps Script: *Deploy → New deployment → Web app*,
   *Execute as: Me*, *Who has access: Anyone*. Copy the URL that ends in `/exec`.
7. **Connect the site.** Put that URL in [`site/config.js`](../site/config.js) as `apiUrl` and push.

> After editing `Code.gs` later, use *Deploy → Manage deployments → Edit → New version*
> so the same `/exec` URL keeps working.

## Day-to-day

- Answers from the website fill columns `Resposta` → `Via` automatically (Via = "Site").
- Answers received by phone or in person: fill the same columns by hand and set `Via`.
- `Notas` is for you only; the website never reads it.
- Guests can change their answer until the final deadline (`FINAL_DEADLINE` in `Code.gs`).
- *Casamento → Copiar lista para impressão de convites* gives the `CODE;Name` list for
  households with a physical invite, ready to paste into `invite.html`.

## API

| Request | Response |
|---|---|
| `GET ?action=lookup&code=ABC123` | `{ ok, household: { code, name, seats, response \| null } }` or `{ ok: false, error: "not_found" }` |
| `POST` body `{ action: "rsvp", code, attending: "yes"\|"no", count, names, dietary, message }` sent as `text/plain` | `{ ok: true }` or `{ ok: false, error: "not_found" \| "closed" \| "bad_request" }` |

The POST uses `text/plain` on purpose: it avoids a CORS preflight, which Apps Script cannot answer.
