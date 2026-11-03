/**
 * Wedding RSVP backend — Google Apps Script bound to a Google Sheet.
 *
 * The sheet "Convidados" is the guest list and the single source of truth.
 * Each row is one household (family) with a unique invite code.
 * The website reads and writes only through this script; the guest list is
 * never published anywhere else.
 *
 * Setup: see backend/README.md.
 */

// ------------------------------------------------------------------ settings

const FINAL_DEADLINE = "2027-08-24";  // after this day (Europe/Lisbon) the site stops accepting answers
const FIRST_DEADLINE = "2027-06-24";  // the deadline printed on the invites
const SITE_URL = "https://andrediegues.github.io/wedding-invitation-platform/";
const COUPLE = "André & Flávia";

// Who gets an email for every new or changed answer. Empty = the account that owns the script.
// Several addresses: "a@example.com,b@example.com"
const NOTIFY_EMAILS = "";

const GUESTS_SHEET = "Convidados";
const LOG_SHEET = "Respostas";
const SUMMARY_SHEET = "Resumo";
const DISHES_SHEET = "Pratos";
const REMINDERS_SHEET = "Lembretes";
const SENDING_SHEET = "Envio do convite";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const CODE_LENGTH = 6;

// Column order of the "Convidados" sheet. Do not reorder without updating COL.
const HEADERS = [
  "Código",                 // A
  "Nome no convite",        // B  e.g. "Família Silva"
  "Lugares",                // C  seats reserved for the household
  "Tipo de convite",        // D  Digital / Físico / Ambos
  "Contactos",              // E  one or more phones, e.g. "Maria 912 345 678, João 913 456 789"
  "Resposta",               // F  Sim / Não (empty = pending)
  "Nº confirmados",         // G
  "Nomes",                  // H
  "Restrições alimentares", // I
  "Mensagem",               // J
  "Atualizado em",          // K
  "Via",                    // L  Site / Telefone / Pessoalmente
  "Notas",                  // M  free text for the couple, never shown to guests
  "Detalhe (não editar)",   // N  per-guest choices as JSON, written by the site
  "Respondido por",         // O  who answered on the site
];
const COL = {
  code: 1, name: 2, seats: 3, inviteType: 4, contact: 5, response: 6, count: 7,
  names: 8, dietary: 9, message: 10, updatedAt: 11, via: 12, notes: 13, detail: 14, by: 15,
};
const DISH_HEADERS = ["Código", "Nome no convite", "Convidado", "Prato de peixe", "Prato de carne", "Notas (alergias, vegetariano/vegan)", "Atualizado em"];

// ------------------------------------------------------------------ menu

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Casamento")
    .addItem("1. Preparar folhas", "setup")
    .addItem("2. Gerar códigos em falta", "generateMissingCodes")
    .addSeparator()
    .addItem("Preparar envio do convite (WhatsApp)", "prepareInviteSending")
    .addItem("Atualizar lembretes (quem falta responder)", "refreshReminders")
    .addItem("Ativar lembretes semanais por email", "enableWeeklyReminders")
    .addItem("Desativar lembretes semanais", "disableWeeklyReminders")
    .addSeparator()
    .addItem("Enviar email de teste", "sendTestEmail")
    .addItem("Copiar lista para impressão de convites", "showPrintList")
    .addToUi();
}

/** Creates the sheets, headers, validation and the summary. Safe to run again. */
function setup() {
  const ss = SpreadsheetApp.getActive();

  const guests = ss.getSheetByName(GUESTS_SHEET) || ss.insertSheet(GUESTS_SHEET, 0);
  guests.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight("bold").setBackground("#0c3362").setFontColor("#ffffff");
  guests.setFrozenRows(1);
  guests.setColumnWidth(COL.name, 220);
  guests.setColumnWidth(COL.names, 260);
  guests.setColumnWidth(COL.message, 260);
  guests.hideColumns(COL.detail);

  const rows = guests.getMaxRows() - 1;
  const rule = (values) => SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  guests.getRange(2, COL.inviteType, rows).setDataValidation(rule(["Digital", "Físico", "Ambos"]));
  guests.getRange(2, COL.response, rows).setDataValidation(rule(["Sim", "Não"]));
  guests.getRange(2, COL.via, rows).setDataValidation(rule(["Site", "Telefone", "Pessoalmente"]));
  guests.getRange(2, COL.seats, rows).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(1, 20).setAllowInvalid(false).build());

  const log = ss.getSheetByName(LOG_SHEET) || ss.insertSheet(LOG_SHEET);
  log.getRange(1, 1, 1, 9).setValues([[
    "Data", "Código", "Nome no convite", "Resposta", "Nº confirmados", "Nomes", "Restrições alimentares", "Mensagem", "Respondido por",
  ]]).setFontWeight("bold");
  log.setFrozenRows(1);

  const dishes = ss.getSheetByName(DISHES_SHEET) || ss.insertSheet(DISHES_SHEET);
  dishes.getRange(1, 1, 1, DISH_HEADERS.length).setValues([DISH_HEADERS]).setFontWeight("bold");
  dishes.setFrozenRows(1);
  dishes.setColumnWidth(3, 200);
  dishes.setColumnWidth(6, 240);

  const summary = ss.getSheetByName(SUMMARY_SHEET) || ss.insertSheet(SUMMARY_SHEET);
  summary.clear();
  const g = `'${GUESTS_SHEET}'`;
  const d = `'${DISHES_SHEET}'`;
  summary.getRange("A1:B9").setValues([
    ["Resumo", ""],
    ["Convites (famílias)", `=COUNTA(${g}!B2:B)`],
    ["Lugares reservados", `=SUM(${g}!C2:C)`],
    ["Famílias que responderam", `=COUNTA(${g}!F2:F)`],
    ["Famílias por responder", `=B2-B4`],
    ["Pessoas confirmadas", `=SUMIF(${g}!F2:F,"Sim",${g}!G2:G)`],
    ["Famílias que não vêm", `=COUNTIF(${g}!F2:F,"Não")`],
    ["Pessoas com notas (alergias, vegetariano/vegan)", `=COUNTIF(${d}!F2:F,"?*")`],
    ["", ""],
  ]);
  summary.getRange("D1").setValue("Prato de peixe").setFontWeight("bold");
  summary.getRange("D2").setFormula(`=IFERROR(QUERY(${d}!D2:D,"select D, count(D) where D is not null group by D label count(D) ''",0),"—")`);
  summary.getRange("G1").setValue("Prato de carne").setFontWeight("bold");
  summary.getRange("G2").setFormula(`=IFERROR(QUERY(${d}!E2:E,"select E, count(E) where E is not null group by E label count(E) ''",0),"—")`);
  summary.getRange("A1").setFontWeight("bold").setFontSize(14);
  summary.setColumnWidth(1, 240);
  summary.setColumnWidth(4, 240);
  summary.setColumnWidth(7, 240);
}

/** Fills an invite code for every household row that has a name but no code. */
function generateMissingCodes() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(GUESTS_SHEET);
  const last = sheet.getLastRow();
  if (last < 2) return;
  const range = sheet.getRange(2, 1, last - 1, 2);
  const values = range.getValues();
  const used = new Set(values.map((r) => String(r[0]).trim()).filter(Boolean));
  let created = 0;
  values.forEach((row) => {
    if (row[1] && !String(row[0]).trim()) {
      let code;
      do { code = randomCode_(); } while (used.has(code));
      used.add(code);
      row[0] = code;
      created++;
    }
  });
  range.setValues(values);
  SpreadsheetApp.getActive().toast(`${created} código(s) criado(s).`, "Casamento");
}

/** Shows "CODE;Name" lines for households with a physical invite, to paste into invite.html. */
function showPrintList() {
  const rows = guestRows_();
  const lines = rows
    .filter((r) => r[COL.code - 1] && r[COL.name - 1] && ["Físico", "Ambos"].includes(r[COL.inviteType - 1]))
    .map((r) => `${r[COL.code - 1]};${r[COL.name - 1]}`);
  const html = HtmlService.createHtmlOutput(
    `<p style="font-family:sans-serif">Copie e cole na página de impressão de convites (${lines.length} convites):</p>` +
    `<textarea style="width:100%;height:300px" readonly>${escapeHtml_(lines.join("\n"))}</textarea>`
  ).setWidth(520).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, "Convites físicos");
}

// ------------------------------------------------------------------ reminders

/** Rebuilds the "Lembretes" tab: one row per contact of every household without an answer, with a ready WhatsApp message. */
function refreshReminders() {
  const pending = pendingHouseholds_();
  const n = writeContactSheet_(REMINDERS_SHEET, pending, reminderText_, "Enviar lembrete");
  SpreadsheetApp.getActive().toast(`${pending.length} família(s) por responder (${n} contacto(s)).`, "Lembretes");
}

/** Builds the "Envio do convite" tab: one row per contact of every household, with the invite message ready to send. */
function prepareInviteSending() {
  const households = allHouseholds_().filter((h) => h.inviteType !== "Físico");
  const n = writeContactSheet_(SENDING_SHEET, households, inviteText_, "Enviar convite");
  SpreadsheetApp.getActive().toast(`${households.length} família(s), ${n} contacto(s).`, "Envio do convite");
}

/** One row per person: household, person, number, personal link and a WhatsApp link with the message ready. */
function writeContactSheet_(sheetName, households, textFn, linkLabel) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sheet.clear();
  const header = ["Nome no convite", "Lugares", "Tipo de convite", "Pessoa", "Telemóvel", "Link pessoal", "WhatsApp", "Enviado?"];
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold")
    .setBackground("#0c3362").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  const rows = [];
  households.forEach((h) => {
    const link = personalLink_(h.code);
    const people = contacts_(h.contact);
    if (!people.length) people.push({ name: "", phone: "", raw: "" });
    people.forEach((c) => {
      const greeting = c.name || h.name;
      const wa = c.phone
        ? `=HYPERLINK("https://wa.me/${c.phone}?text=${encodeURIComponent(textFn(greeting, link, h.code))}","${linkLabel}")`
        : "sem telemóvel";
      rows.push([h.name, h.seats, h.inviteType, c.name, c.raw, link, wa, false]);
    });
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
    sheet.getRange(2, header.length, rows.length, 1).insertCheckboxes();
  }
  sheet.autoResizeColumns(1, 5);
  sheet.setColumnWidth(6, 360);
  return rows.filter((r) => r[6] !== "sem telemóvel").length;
}

/** Weekly email to the couple with who is still missing, from 6 weeks before the first deadline until the final one. */
function weeklyReminder() {
  const today = todayLisbon_();
  const start = shiftDays_(FIRST_DEADLINE, -42);
  if (today < start || today > FINAL_DEADLINE) return;
  const pending = pendingHouseholds_();
  if (!pending.length) return;
  refreshReminders();
  const deadline = today <= FIRST_DEADLINE ? FIRST_DEADLINE : FINAL_DEADLINE;
  const days = Math.round((Date.parse(deadline) - Date.parse(today)) / 864e5);
  const seats = pending.reduce((n, h) => n + (Number(h.seats) || 0), 0);
  const list = pending.map((h) => `<li>${escapeHtml_(h.name)} — ${h.seats} lugar(es)${h.contact ? ` — ${escapeHtml_(h.contact)}` : ""}</li>`).join("");
  MailApp.sendEmail({
    to: notifyTo_(),
    subject: `Casamento: ${pending.length} família(s) por responder (faltam ${days} dias para o prazo)`,
    htmlBody:
      `<p>Ainda faltam responder <b>${pending.length}</b> famílias (${seats} lugares). Prazo: ${deadline}.</p>` +
      `<ul>${list}</ul>` +
      `<p>No separador <b>Lembretes</b> da folha tem o link pessoal de cada família e um botão para enviar a mensagem por WhatsApp.</p>` +
      `<p><a href="${SpreadsheetApp.getActive().getUrl()}">Abrir a folha</a></p>`,
  });
}

function enableWeeklyReminders() {
  disableWeeklyReminders(true);
  ScriptApp.newTrigger("weeklyReminder").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  SpreadsheetApp.getActive().toast("Lembretes semanais ativos (segundas-feiras às 9h).", "Lembretes");
}

function disableWeeklyReminders(silent) {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "weeklyReminder")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  if (silent !== true) SpreadsheetApp.getActive().toast("Lembretes semanais desativados.", "Lembretes");
}

function sendTestEmail() {
  MailApp.sendEmail(notifyTo_(), "Casamento: email de teste",
    "Os avisos de novas respostas vão chegar a este endereço.");
  SpreadsheetApp.getActive().toast(`Email enviado para ${notifyTo_()}.`, "Casamento");
}

// ------------------------------------------------------------------ web app

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "lookup") return json_(lookup_(normalizeCode_(p.code)));
  return json_({ ok: true, service: "wedding-rsvp" });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad_request" });
  }
  if (body.action !== "rsvp") return json_({ ok: false, error: "bad_request" });
  return json_(saveRsvp_(body));
}

function lookup_(code) {
  if (!code) return { ok: false, error: "not_found" };
  const found = findRow_(code);
  if (!found) return { ok: false, error: "not_found" };
  const r = found.values;
  const answered = r[COL.response - 1];
  let people = [];
  try { people = JSON.parse(r[COL.detail - 1] || "[]"); } catch (err) { people = []; }
  return {
    ok: true,
    household: {
      code,
      name: String(r[COL.name - 1]),
      seats: Number(r[COL.seats - 1]) || 1,
      response: answered ? {
        attending: answered === "Sim" ? "yes" : "no",
        count: Number(r[COL.count - 1]) || 0,
        names: String(r[COL.names - 1] || ""),
        dietary: String(r[COL.dietary - 1] || ""),
        message: String(r[COL.message - 1] || ""),
        people,
        by: String(r[COL.by - 1] || ""),
        via: String(r[COL.via - 1] || ""),
        updatedAt: r[COL.updatedAt - 1] ? new Date(r[COL.updatedAt - 1]).toISOString() : null,
      } : null,
    },
  };
}

function saveRsvp_(body) {
  if (isClosed_()) return { ok: false, error: "closed" };
  const code = normalizeCode_(body.code);
  const attending = body.attending === "yes" ? "yes" : body.attending === "no" ? "no" : null;
  if (!code || !attending) return { ok: false, error: "bad_request" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let household, record;
  try {
    const found = findRow_(code);
    if (!found) return { ok: false, error: "not_found" };
    const seats = Number(found.values[COL.seats - 1]) || 1;
    household = String(found.values[COL.name - 1]);

    // per-guest details (name, dishes, allergies), capped at the seats reserved
    const people = attending === "yes" && Array.isArray(body.people)
      ? body.people.slice(0, seats).map((p) => ({
          name: clean_(p && p.name, 120),
          fish: clean_(p && p.fish, 40),
          meat: clean_(p && p.meat, 40),
          allergies: clean_(p && p.allergies, 200),
          labels: {
            fish: clean_(p && p.labels && p.labels.fish, 120),
            meat: clean_(p && p.labels && p.labels.meat, 120),
          },
        })).filter((p) => p.name)
      : [];
    const count = attending === "yes" ? clamp_(people.length || Number(body.count) || 1, 1, seats) : 0;
    const names = attending === "yes" ? (people.length ? people.map((p) => p.name).join(", ") : clean_(body.names, 400)) : "";
    const dietary = attending === "yes"
      ? (people.length ? people.filter((p) => p.allergies).map((p) => `${p.name}: ${p.allergies}`).join("; ") : clean_(body.dietary, 300))
      : "";
    const message = clean_(body.message, 1000);
    const by = clean_(body.by, 80);
    const now = new Date();
    const answer = attending === "yes" ? "Sim" : "Não";

    found.sheet.getRange(found.row, COL.response, 1, 7).setValues([[answer, count, names, dietary, message, now, "Site"]]);
    found.sheet.getRange(found.row, COL.detail, 1, 2).setValues([[JSON.stringify(people), by]]);
    SpreadsheetApp.getActive().getSheetByName(LOG_SHEET).appendRow([now, code, household, answer, count, names, dietary, message, by]);
    writeDishes_(code, household, people, now);
    record = { code, household, answer, count, seats, people, message, dietary, names, by };
  } finally {
    lock.releaseLock();
  }
  notify_(record);
  return { ok: true };
}

/** Replaces this household's rows in the "Pratos" tab with one row per guest. */
function writeDishes_(code, household, people, when) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(DISHES_SHEET);
  if (!sheet) return;
  const last = sheet.getLastRow();
  if (last >= 2) {
    const codes = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = codes.length - 1; i >= 0; i--) {
      if (normalizeCode_(codes[i][0]) === code) sheet.deleteRow(i + 2);
    }
  }
  if (!people.length) return;
  const rows = people.map((p) => [code, household, p.name, p.labels.fish || p.fish, p.labels.meat || p.meat, p.allergies, when]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, DISH_HEADERS.length).setValues(rows);
}

/** Emails the couple about a new or changed answer. Never blocks the guest's RSVP. */
function notify_(r) {
  if (!r) return;
  try {
    const guests = r.people.length
      ? `<ul>${r.people.map((p) => `<li><b>${escapeHtml_(p.name)}</b> — ${escapeHtml_(p.labels.fish || "")} · ${escapeHtml_(p.labels.meat || "")}${p.allergies ? ` — <i>notas: ${escapeHtml_(p.allergies)}</i>` : ""}</li>`).join("")}</ul>`
      : (r.names ? `<p>${escapeHtml_(r.names)}</p>` : "");
    MailApp.sendEmail({
      to: notifyTo_(),
      subject: `RSVP: ${r.household} — ${r.answer === "Sim" ? `Sim (${r.count} de ${r.seats})` : "Não vem"}`,
      htmlBody:
        `<p><b>${escapeHtml_(r.household)}</b>${r.by ? ` (por ${escapeHtml_(r.by)})` : ""} respondeu <b>${r.answer}</b>${r.answer === "Sim" ? ` — ${r.count} de ${r.seats} lugares` : ""}.</p>` +
        guests +
        (r.message ? `<p>Mensagem: “${escapeHtml_(r.message)}”</p>` : "") +
        `<p><a href="${SpreadsheetApp.getActive().getUrl()}">Abrir a folha</a></p>`,
    });
  } catch (err) {
    console.error("notify failed: " + err);
  }
}

// ------------------------------------------------------------------ helpers

function guestRows_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(GUESTS_SHEET);
  const last = sheet.getLastRow();
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

function allHouseholds_() {
  return guestRows_()
    .filter((r) => r[COL.code - 1] && r[COL.name - 1])
    .map((r) => ({
      code: normalizeCode_(r[COL.code - 1]),
      name: String(r[COL.name - 1]),
      seats: Number(r[COL.seats - 1]) || 1,
      inviteType: String(r[COL.inviteType - 1] || ""),
      contact: String(r[COL.contact - 1] || ""),
      answered: !!r[COL.response - 1],
    }));
}

function pendingHouseholds_() {
  return allHouseholds_().filter((h) => !h.answered);
}

/** "Maria 912 345 678, João +351 913 456 789; 914 567 890" → [{ name, phone, raw }, …] */
function contacts_(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      name: part.replace(/[+\d().\-\s]+/g, " ").trim(),
      phone: whatsappNumber_(part),
      raw: (part.match(/[+\d][\d\s().\-]{6,}/) || [part])[0].trim(),
    }));
}

function findRow_(code) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(GUESTS_SHEET);
  const values = guestRows_();
  for (let i = 0; i < values.length; i++) {
    if (normalizeCode_(values[i][0]) === code) return { sheet, row: i + 2, values: values[i] };
  }
  return null;
}

function personalLink_(code) {
  return `${SITE_URL}?c=${encodeURIComponent(code)}`;
}

function inviteText_(name, link, code) {
  return `Olá, ${name}! Com muita alegria, convidamos-vos para o nosso casamento, a 24 de setembro de 2027. ` +
    `Aqui está toda a informação e a resposta ao convite: ${link}\nUm beijinho, ${COUPLE}`;
}

function reminderText_(name, link) {
  return `Olá, ${name}! Ainda não recebemos a vossa resposta ao convite para o nosso casamento, a 24 de setembro de 2027. ` +
    `Podem responder aqui: ${link}\nUm beijinho, ${COUPLE}`;
}

/** "+351 912 345 678", "912345678" → "351912345678"; anything else without enough digits → "". */
function whatsappNumber_(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("9")) digits = "351" + digits;
  return digits.length >= 11 ? digits : "";
}

function notifyTo_() {
  return NOTIFY_EMAILS || Session.getEffectiveUser().getEmail();
}

function todayLisbon_() {
  return Utilities.formatDate(new Date(), "Europe/Lisbon", "yyyy-MM-dd");
}

function shiftDays_(isoDay, n) {
  const d = new Date(isoDay + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isClosed_() {
  return todayLisbon_() > FINAL_DEADLINE;
}

function clean_(s, max) {
  return String(s || "").replace(/^[=+\-@]+/, "").slice(0, max); // block formula injection
}

function normalizeCode_(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomCode_() {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

function clamp_(n, min, max) { return Math.max(min, Math.min(max, n)); }

function escapeHtml_(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
