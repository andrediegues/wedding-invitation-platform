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

## Updating the script (after a change to `Code.gs`)

1. In Apps Script, replace the contents of `Code.gs` with the new version and save.
2. *Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy*. The `/exec` URL stays the same.
3. Reload the spreadsheet and run *Casamento → 1. Preparar folhas* (adds the `Pratos` tab and the new totals; your data is kept).
4. Run *Casamento → Enviar email de teste* once and accept the new permissions (sending email, scheduled triggers).
5. Optional: *Casamento → Ativar lembretes semanais por email*.

## Day-to-day

- Answers from the website fill columns `Resposta` → `Via` automatically (Via = "Site").
- Each guest's fish and meat choice and allergies go to the `Pratos` tab (one row per person);
  `Resumo` counts each dish and the guests with allergies.
- **Alerts:** every new or changed answer is emailed to the script owner. To include more people,
  set `NOTIFY_EMAILS` at the top of `Code.gs` (e.g. `"a@example.com,b@example.com"`).
- **Reminders:** *Casamento → Atualizar lembretes* rebuilds the `Lembretes` tab with every household that
  has not answered, its personal link and an "Abrir WhatsApp" link with the message ready (needs a
  mobile number in `Contacto`). With weekly reminders on, a summary email arrives every Monday at 9:00
  from 6 weeks before the first deadline until the final deadline.
- Answers received by phone or in person: fill the same columns by hand and set `Via`.
- `Notas` is for you only; the website never reads it. Column `Detalhe (não editar)` is hidden and used by the site.
- Guests can change their answer until the final deadline (`FINAL_DEADLINE` in `Code.gs`).
- *Casamento → Copiar lista para impressão de convites* gives the `CODE;Name` list for
  households with a physical invite, ready to paste into `invite.html`.

## API

| Request | Response |
|---|---|
| `GET ?action=lookup&code=ABC123` | `{ ok, household: { code, name, seats, response \| null } }` or `{ ok: false, error: "not_found" }` |
| `POST` body `{ action: "rsvp", code, attending: "yes"\|"no", people: [{ name, fish, meat, allergies, labels }], message }` sent as `text/plain` | `{ ok: true }` or `{ ok: false, error: "not_found" \| "closed" \| "bad_request" }` |

The POST uses `text/plain` on purpose: it avoids a CORS preflight, which Apps Script cannot answer.
