import {
  api, codeFromUrl, esc, loadContent, normalizeCode, OLIVE_SPRIG, rsvpPhase, zonedDate,
} from "./shared.js";

const $ = (sel) => document.querySelector(sel);
const CODE_KEY = "wedding-guest-code";

function rememberCode(code) {
  try { localStorage.setItem(CODE_KEY, code); } catch { /* ignore */ }
}
function recallCode() {
  try { return localStorage.getItem(CODE_KEY) || ""; } catch { return ""; }
}
function forgetCode() {
  try { localStorage.removeItem(CODE_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- render: static content

function renderStatic(c) {
  document.querySelectorAll("[data-sprig]").forEach((el) => { el.innerHTML = OLIVE_SPRIG; });

  $("#names").innerHTML = `${esc(c.couple.first)} <span class="amp">&amp;</span> ${esc(c.couple.second)}`;
  $("#footer-names").textContent = c.couple.joined;
  $("#hero-date").textContent = c.date.display;
  $("#hero-place").textContent = c.events.map((e) => e.venue).join(" · ");

  $("#events").innerHTML = c.events.map((e) => {
    const maps = e.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.mapQuery)}`;
    const waze = `https://waze.com/ul?q=${encodeURIComponent(e.mapQuery)}&navigate=yes`;
    return `
      <li class="event">
        <div class="event__time">${esc(e.time)}</div>
        <div class="event__body">
          <h3>${esc(e.title)}</h3>
          <p class="event__venue">${esc(e.venue)}</p>
          <p class="event__address">${esc(e.address)}</p>
          <div class="event__links">
            <a class="chip" href="${esc(maps)}" target="_blank" rel="noopener">Google Maps</a>
            <a class="chip" href="${esc(waze)}" target="_blank" rel="noopener">Waze</a>
          </div>
        </div>
      </li>`;
  }).join("");

  const m = c.menu;
  $("#menu-card").innerHTML = `
    ${m.draft ? `<p class="badge">${esc(m.note)}</p>` : ""}
    ${m.courses.map((course) => `
      <div class="course">
        <h3>${esc(course.title)}</h3>
        ${course.items.map((i) => `<p>${esc(i)}</p>`).join("")}
      </div>`).join('<span class="course__sep" aria-hidden="true">✦</span>')}
  `;

  $("#info-grid").innerHTML = c.info.map((i) => `
    <article class="info-card">
      <h3>${esc(i.title)}</h3>
      <p>${esc(i.text)}</p>
    </article>`).join("");

  $("#contacts").innerHTML = c.contacts.map((p) => `
    <li><span>${esc(p.name)}</span><a href="tel:${esc(p.phone.replace(/\s/g, ""))}">${esc(p.phone)}</a></li>`).join("");

  setupIcs(c);
  startCountdown(c);
}

function startCountdown(c) {
  const target = zonedDate(c.events[0].start, c.timezone);
  const el = $("#countdown");
  const tick = () => {
    const diff = target - Date.now();
    if (diff <= 0) {
      el.innerHTML = `<p class="countdown__done">Chegou o grande dia!</p>`;
      return false;
    }
    const days = Math.floor(diff / 864e5);
    const hours = Math.floor((diff % 864e5) / 36e5);
    const mins = Math.floor((diff % 36e5) / 6e4);
    const unit = (n, one, many) => `<div><span>${n}</span><small>${n === 1 ? one : many}</small></div>`;
    el.innerHTML = unit(days, "dia", "dias") + unit(hours, "hora", "horas") + unit(mins, "minuto", "minutos");
    return true;
  };
  if (tick()) setInterval(tick, 30_000);
}

function setupIcs(c) {
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escIcs = (s) => String(s).replace(/([,;\\])/g, "\\$1");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//wedding-invitation-platform//PT", "CALSCALE:GREGORIAN"];
  c.events.forEach((e) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}-${c.date.iso}@wedding-invitation-platform`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(zonedDate(e.start, c.timezone))}`,
      `DTEND:${stamp(zonedDate(e.end, c.timezone))}`,
      `SUMMARY:${escIcs(`${c.couple.joined} — ${e.title}`)}`,
      `LOCATION:${escIcs(`${e.venue}, ${e.address}`)}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  $("#ics").href = URL.createObjectURL(blob);
}

// ---------------------------------------------------------------- RSVP

const state = { content: null, household: null, phase: "open" };

function rsvpKicker() {
  const r = state.content.rsvp;
  const text = {
    open: `Até ${r.deadlineDisplay}`,
    late: `Até ${r.finalDeadlineDisplay}`,
    closed: "Confirmações encerradas",
  }[state.phase];
  $("#rsvp-kicker").textContent = text;
}

function showGreeting(household) {
  const el = $("#greeting");
  if (!household) { el.hidden = true; return; }
  el.textContent = `Olá, ${household.name}!`;
  el.hidden = false;
}

function renderCodeForm(message = "") {
  const body = $("#rsvp-body");
  body.innerHTML = `
    <form class="code-form" id="code-form" novalidate>
      <p class="lead">Escreva o código que encontra no seu convite.</p>
      <label class="field">
        <span class="field__label">Código do convite</span>
        <input id="code-input" name="code" autocomplete="off" autocapitalize="characters"
               spellcheck="false" inputmode="text" maxlength="12" placeholder="Ex.: ABC123" required>
      </label>
      ${message ? `<p class="form-error" role="alert">${esc(message)}</p>` : ""}
      <button class="button" type="submit">Continuar</button>
      ${api.demo ? `<p class="hint">Modo de demonstração — experimente o código <strong>DEMO01</strong>.</p>` : ""}
    </form>`;
  $("#code-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const code = normalizeCode($("#code-input").value);
    if (!code) {
      renderCodeForm("Por favor escreva o código do convite.");
      return;
    }
    openHousehold(code, { fromForm: true });
  });
}

function renderLoading() {
  $("#rsvp-body").innerHTML = `<p class="loading">Um momento…</p>`;
}

function contactLine() {
  return state.content.contacts
    .map((p) => `<a href="tel:${esc(p.phone.replace(/\s/g, ""))}">${esc(p.name)} (${esc(p.phone)})</a>`)
    .join(" ou ");
}

async function openHousehold(code, { fromForm = false } = {}) {
  renderLoading();
  let result;
  try {
    result = await api.lookup(code);
  } catch {
    renderCodeForm("Não foi possível ligar ao servidor. Verifique a ligação à internet e tente de novo.");
    return;
  }
  if (!result.ok) {
    forgetCode();
    showGreeting(null);
    renderCodeForm(fromForm
      ? "Não encontrámos esse código. Confirme as letras e os números do convite."
      : "");
    return;
  }
  state.household = result.household;
  rememberCode(code);
  showGreeting(result.household);
  if (result.household.response) renderSummary();
  else if (state.phase === "closed") renderClosed();
  else renderForm();
}

function renderClosed() {
  $("#rsvp-body").innerHTML = `
    <p class="lead">${esc(state.content.rsvp.closedNote)}</p>
    <p class="center">${contactLine()}</p>`;
}

function renderForm() {
  const h = state.household;
  const prev = h.response || {};
  const r = state.content.rsvp;
  const seatOptions = Array.from({ length: h.seats }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${Number(prev.count || h.seats) === n ? "selected" : ""}>${n}</option>`)
    .join("");

  $("#rsvp-body").innerHTML = `
    <form class="rsvp-form" id="rsvp-form" novalidate>
      <p class="lead">
        ${esc(h.name)}, reservámos <strong>${h.seats} ${h.seats === 1 ? "lugar" : "lugares"}</strong> para vós.
      </p>
      ${state.phase === "late" ? `<p class="notice">${esc(r.lateNote)}</p>` : ""}

      <fieldset class="choice">
        <legend class="field__label">Vão estar connosco?</legend>
        <label class="choice__option">
          <input type="radio" name="attending" value="yes" ${prev.attending === "yes" ? "checked" : ""} required>
          <span>Sim, vamos!</span>
        </label>
        <label class="choice__option">
          <input type="radio" name="attending" value="no" ${prev.attending === "no" ? "checked" : ""}>
          <span>Infelizmente não podemos</span>
        </label>
      </fieldset>

      <div class="yes-only" id="yes-only" hidden>
        ${h.seats > 1 ? `
        <label class="field">
          <span class="field__label">Quantas pessoas vêm?</span>
          <select name="count">${seatOptions}</select>
        </label>` : `<input type="hidden" name="count" value="1">`}
        <label class="field">
          <span class="field__label">Nomes de quem vem</span>
          <textarea name="names" rows="2" maxlength="400" placeholder="Ex.: Maria Silva, João Silva">${esc(prev.names || "")}</textarea>
        </label>
        <label class="field">
          <span class="field__label">Alergias ou restrições alimentares <em>(opcional)</em></span>
          <input name="dietary" maxlength="300" value="${esc(prev.dietary || "")}" placeholder="Ex.: vegetariano, sem glúten">
        </label>
      </div>

      <label class="field">
        <span class="field__label">Uma mensagem para os noivos <em>(opcional)</em></span>
        <textarea name="message" rows="3" maxlength="1000">${esc(prev.message || "")}</textarea>
      </label>

      <p class="form-error" id="form-error" role="alert" hidden></p>
      <button class="button button--gold" type="submit">Enviar resposta</button>
      <p class="hint"><button type="button" class="text-button" id="not-us">Não é ${esc(h.name)}? Usar outro código</button></p>
    </form>`;

  const form = $("#rsvp-form");
  const yesOnly = $("#yes-only");
  const sync = () => { yesOnly.hidden = form.attending.value !== "yes"; };
  form.querySelectorAll('input[name="attending"]').forEach((el) => el.addEventListener("change", sync));
  sync();

  $("#not-us").addEventListener("click", () => {
    forgetCode();
    state.household = null;
    showGreeting(null);
    history.replaceState(null, "", location.pathname + "#rsvp");
    renderCodeForm();
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#form-error");
    const attending = form.attending.value;
    if (!attending) {
      err.textContent = "Por favor indique se vão estar connosco.";
      err.hidden = false;
      return;
    }
    const payload = {
      code: h.code,
      attending,
      count: attending === "yes" ? Number(form.count.value) : 0,
      names: attending === "yes" ? form.names.value.trim() : "",
      dietary: attending === "yes" ? form.dietary.value.trim() : "",
      message: form.message.value.trim(),
    };
    if (attending === "yes" && !payload.names) {
      err.textContent = "Por favor escreva os nomes de quem vem.";
      err.hidden = false;
      form.names.focus();
      return;
    }
    err.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "A enviar…";
    try {
      const res = await api.submit(payload);
      if (!res.ok) throw new Error(res.error || "error");
      state.household.response = { ...payload, updatedAt: new Date().toISOString() };
      renderSummary({ justSent: true });
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Enviar resposta";
      err.innerHTML = e.message === "closed"
        ? `As confirmações já fecharam. Fale connosco: ${contactLine()}`
        : `Não conseguimos guardar a resposta. Tente de novo ou fale connosco: ${contactLine()}`;
      err.hidden = false;
    }
  });
}

function renderSummary({ justSent = false } = {}) {
  const h = state.household;
  const r = h.response;
  const yes = r.attending === "yes";
  const canEdit = state.phase !== "closed";
  $("#rsvp-body").innerHTML = `
    <div class="summary ${yes ? "summary--yes" : ""}">
      <p class="summary__title">${justSent ? "Obrigado!" : "Já recebemos a vossa resposta"}</p>
      <p class="lead">${yes
        ? `Contamos convosco: <strong>${r.count} ${Number(r.count) === 1 ? "pessoa" : "pessoas"}</strong>. Até dia 24 de setembro!`
        : "Vamos sentir a vossa falta. Obrigado por nos avisarem."}</p>
      ${yes && r.names ? `<p class="summary__line"><span>Quem vem</span>${esc(r.names)}</p>` : ""}
      ${yes && r.dietary ? `<p class="summary__line"><span>Restrições</span>${esc(r.dietary)}</p>` : ""}
      ${canEdit ? `<button type="button" class="button button--ghost" id="edit">Alterar resposta</button>` : ""}
    </div>`;
  if (canEdit) $("#edit").addEventListener("click", renderForm);
}

async function initRsvp() {
  state.phase = rsvpPhase(state.content);
  rsvpKicker();
  const code = codeFromUrl() || recallCode();
  if (code) await openHousehold(code);
  else if (state.phase === "closed") renderClosed();
  else renderCodeForm();
}

// ---------------------------------------------------------------- boot

(async function main() {
  try {
    state.content = await loadContent();
  } catch (e) {
    $("#rsvp-body").innerHTML = `<p class="form-error">Não foi possível carregar a página. Tente atualizar.</p>`;
    console.error(e);
    return;
  }
  renderStatic(state.content);
  initRsvp();
})();
