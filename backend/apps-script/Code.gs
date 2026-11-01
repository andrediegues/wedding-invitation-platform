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

const FINAL_DEADLINE = "2027-08-24"; // after this day (Europe/Lisbon) the site stops accepting answers
const GUESTS_SHEET = "Convidados";
const LOG_SHEET = "Respostas";
const SUMMARY_SHEET = "Resumo";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const CODE_LENGTH = 6;

// Column order of the "Convidados" sheet. Do not reorder without updating COL.
const HEADERS = [
  "Código",               // A
  "Nome no convite",      // B  e.g. "Família Silva"
  "Lugares",              // C  seats reserved for the household
  "Tipo de convite",      // D  Digital / Físico / Ambos
  "Contacto",             // E
  "Resposta",             // F  Sim / Não (empty = pending)
  "Nº confirmados",       // G
  "Nomes",                // H
  "Restrições alimentares", // I
  "Mensagem",             // J
  "Atualizado em",        // K
  "Via",                  // L  Site / Telefone / Pessoalmente
  "Notas",                // M  free text for the couple, never shown to guests
];
const COL = {
  code: 1, name: 2, seats: 3, inviteType: 4, contact: 5, response: 6, count: 7,
  names: 8, dietary: 9, message: 10, updatedAt: 11, via: 12, notes: 13,
};

// ------------------------------------------------------------------ menu

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Casamento")
    .addItem("1. Preparar folhas", "setup")
    .addItem("2. Gerar códigos em falta", "generateMissingCodes")
    .addItem("Copiar lista para impressão de convites", "showPrintList")
    .addToUi();
}

/** Creates the sheets, headers, validation and the summary. Safe to run again. */
function setup() {
  const ss = SpreadsheetApp.getActive();

  const guests = ss.getSheetByName(GUESTS_SHEET) || ss.insertSheet(GUESTS_SHEET, 0);
  guests.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight("bold").setBackground("#14294b").setFontColor("#ffffff");
  guests.setFrozenRows(1);
  guests.setColumnWidth(COL.name, 220);
  guests.setColumnWidth(COL.names, 260);
  guests.setColumnWidth(COL.message, 260);

  const rows = guests.getMaxRows() - 1;
  const rule = (values) => SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  guests.getRange(2, COL.inviteType, rows).setDataValidation(rule(["Digital", "Físico", "Ambos"]));
  guests.getRange(2, COL.response, rows).setDataValidation(rule(["Sim", "Não"]));
  guests.getRange(2, COL.via, rows).setDataValidation(rule(["Site", "Telefone", "Pessoalmente"]));
  guests.getRange(2, COL.seats, rows).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(1, 20).setAllowInvalid(false).build());

  const log = ss.getSheetByName(LOG_SHEET) || ss.insertSheet(LOG_SHEET);
  log.getRange(1, 1, 1, 8).setValues([[
    "Data", "Código", "Nome no convite", "Resposta", "Nº confirmados", "Nomes", "Restrições alimentares", "Mensagem",
  ]]).setFontWeight("bold");
  log.setFrozenRows(1);

  const summary = ss.getSheetByName(SUMMARY_SHEET) || ss.insertSheet(SUMMARY_SHEET);
  const g = `'${GUESTS_SHEET}'`;
  summary.getRange("A1:B8").setValues([
    ["Resumo", ""],
    ["Convites (famílias)", `=COUNTA(${g}!B2:B)`],
    ["Lugares reservados", `=SUM(${g}!C2:C)`],
    ["Famílias que responderam", `=COUNTA(${g}!F2:F)`],
    ["Famílias por responder", `=B2-B4`],
    ["Pessoas confirmadas", `=SUMIF(${g}!F2:F,"Sim",${g}!G2:G)`],
    ["Famílias que não vêm", `=COUNTIF(${g}!F2:F,"Não")`],
    ["Com restrições alimentares", `=COUNTIFS(${g}!F2:F,"Sim",${g}!I2:I,"<>")`],
  ]);
  summary.getRange("A1").setFontWeight("bold").setFontSize(14);
  summary.setColumnWidth(1, 240);
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
  const sheet = SpreadsheetApp.getActive().getSheetByName(GUESTS_SHEET);
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const lines = rows
    .filter((r) => r[COL.code - 1] && r[COL.name - 1] && ["Físico", "Ambos"].includes(r[COL.inviteType - 1]))
    .map((r) => `${r[COL.code - 1]};${r[COL.name - 1]}`);
  const html = HtmlService.createHtmlOutput(
    `<p style="font-family:sans-serif">Copie e cole na página de impressão de convites (${lines.length} convites):</p>` +
    `<textarea style="width:100%;height:300px" readonly>${escapeHtml_(lines.join("\n"))}</textarea>`
  ).setWidth(520).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, "Convites físicos");
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
  try {
    const found = findRow_(code);
    if (!found) return { ok: false, error: "not_found" };
    const seats = Number(found.values[COL.seats - 1]) || 1;
    const count = attending === "yes" ? clamp_(Number(body.count) || 1, 1, seats) : 0;
    const clean = (s, max) => String(s || "").replace(/^[=+\-@]+/, "").slice(0, max); // block formula injection
    const names = attending === "yes" ? clean(body.names, 400) : "";
    const dietary = attending === "yes" ? clean(body.dietary, 300) : "";
    const message = clean(body.message, 1000);
    const now = new Date();

    found.sheet.getRange(found.row, COL.response, 1, 7).setValues([[
      attending === "yes" ? "Sim" : "Não", count, names, dietary, message, now, "Site",
    ]]);
    SpreadsheetApp.getActive().getSheetByName(LOG_SHEET).appendRow([
      now, code, found.values[COL.name - 1], attending === "yes" ? "Sim" : "Não", count, names, dietary, message,
    ]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------------ helpers

function findRow_(code) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(GUESTS_SHEET);
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeCode_(values[i][0]) === code) return { sheet, row: i + 2, values: values[i] };
  }
  return null;
}

function isClosed_() {
  const today = Utilities.formatDate(new Date(), "Europe/Lisbon", "yyyy-MM-dd");
  return today > FINAL_DEADLINE;
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
