import { esc, loadContent, normalizeCode, OLIVE_SPRIG, personalLink } from "./shared.js";
import qrcode from "./vendor/qrcode.mjs";

const $ = (sel) => document.querySelector(sel);
const STORE_KEY = "wedding-print-list";

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function parseList(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, ...rest] = line.split(/[;\t]/);
      return { code: normalizeCode(code), name: rest.join(" ").trim() };
    })
    .filter((h) => h.code || h.name);
}

function front(c, h) {
  const [ceremony, reception] = c.events;
  const eventBlock = (e) => `
    <div class="ev">
      <p class="ev__title">${esc(e.title)}</p>
      <p class="ev__time">${esc(e.time)}</p>
      <p class="ev__venue">${esc(e.venue)}</p>
      <p class="ev__address">${esc(e.address)}</p>
    </div>`;
  return `
    <section class="sheet sheet--front">
      <div class="band"></div>
      <div class="sheet__body">
        <p class="kicker">Vamos casar</p>
        ${h.name ? `
          <p class="intro">Com muita alegria, convidamos</p>
          <p class="guest">${esc(h.name)}</p>
          <p class="intro">para celebrar connosco o nosso casamento</p>
        ` : `<p class="intro">Com muita alegria, convidamos-vos a celebrar connosco o nosso casamento</p>`}
        <h2 class="names">${esc(c.couple.first)}<span class="amp">&amp;</span>${esc(c.couple.second)}</h2>
        <div class="sprig-wrap">${OLIVE_SPRIG}</div>
        <p class="date">${esc(c.date.display)}</p>
        <div class="events">${eventBlock(ceremony)}<span class="events__rule"></span>${eventBlock(reception)}</div>
      </div>
      <div class="band band--bottom"></div>
    </section>`;
}

function back(c, h) {
  const link = personalLink(h.code);
  const shortLink = link.replace(/^https?:\/\//, "").replace(/\/?\?c=.*$/, "");
  const phones = c.contacts.map((p) => `
    <p class="phone"><span>${esc(p.name)}</span>${esc(p.phone)}</p>`).join("");
  return `
    <section class="sheet sheet--back">
      <div class="sheet__body">
        <div class="menu">
          <p class="kicker">Menu</p>
          ${c.menu.courses.map((course) => `
            <p class="course"><span>${esc(course.title)}</span>${course.items.map(esc).join(" · ")}</p>`).join("")}
        </div>
        <div class="sprig-wrap">${OLIVE_SPRIG}</div>
        <div class="rsvp">
          <p class="rsvp__title">Confirme a sua presença<br>até ${esc(c.rsvp.deadlineDisplay)}</p>
          <div class="rsvp__grid">
            <div class="rsvp__phones">
              <p class="rsvp__how">Por telefone</p>
              ${phones}
            </div>
            <div class="rsvp__qr">
              <p class="rsvp__how">Ou com o telemóvel</p>
              <div class="qr">${qrSvg(link)}</div>
              ${h.code ? `<p class="code">Código <strong>${esc(h.code)}</strong></p>` : ""}
            </div>
          </div>
          <p class="site">${esc(shortLink)}</p>
        </div>
      </div>
      <div class="band band--bottom"></div>
    </section>`;
}

let content;

function render() {
  const raw = $("#households").value;
  try { localStorage.setItem(STORE_KEY, raw); } catch { /* ignore */ }
  const list = parseList(raw);
  const households = list.length ? list : [{ code: "", name: "" }];
  const withBack = $("#with-back").checked;
  $("#sheets").innerHTML = households
    .map((h) => front(content, h) + (withBack ? back(content, h) : ""))
    .join("");
  $("#count").textContent = list.length
    ? `${list.length} convite(s) · ${list.length * (withBack ? 2 : 1)} página(s)`
    : "Convite genérico (sem nome)";
}

(async function main() {
  content = await loadContent();
  try { $("#households").value = localStorage.getItem(STORE_KEY) || ""; } catch { /* ignore */ }
  $("#generate").addEventListener("click", render);
  $("#with-back").addEventListener("change", render);
  $("#print").addEventListener("click", () => { render(); window.print(); });
  render();
})();
