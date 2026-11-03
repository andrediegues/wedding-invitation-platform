// Shared helpers for the guest site (app.js) and the printable invite (invite.js).

export const config = window.APP_CONFIG || { apiUrl: "", siteUrl: "" };

export async function loadContent() {
  const res = await fetch("content/wedding.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load content (${res.status})`);
  return res.json();
}

// ---------- HTML helpers ----------

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Guest codes ----------

export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codeFromUrl() {
  const params = new URLSearchParams(location.search);
  return normalizeCode(params.get("c") || params.get("code") || "");
}

export function personalLink(code) {
  const base = config.siteUrl || location.origin + location.pathname.replace(/[^/]*$/, "");
  return code ? `${base}?c=${encodeURIComponent(code)}` : base;
}

// ---------- Time zones ----------

function tzOffsetMs(timeZone, utcMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

// Convert a local wall-clock ISO string ("2027-09-24T12:00:00") in `timeZone` to a Date.
export function zonedDate(localIso, timeZone) {
  const [d, t = "00:00:00"] = localIso.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm, ss = 0] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm, ss);
  const first = guess - tzOffsetMs(timeZone, guess);
  return new Date(guess - tzOffsetMs(timeZone, first));
}

// ---------- RSVP phase ----------
// "open" until the first deadline, "late" until the final deadline, then "closed".
export function rsvpPhase(content, now = new Date()) {
  const endOf = (day) => zonedDate(`${day}T23:59:59`, content.timezone);
  if (now <= endOf(content.rsvp.deadline)) return "open";
  if (now <= endOf(content.rsvp.finalDeadline)) return "late";
  return "closed";
}

// ---------- API ----------

const DEMO_HOUSEHOLDS = {
  DEMO01: { code: "DEMO01", name: "Família Exemplo", seats: 4 },
  AVOS22: { code: "AVOS22", name: "Avó Rosa e Avô Manuel", seats: 2 },
};

function demoStore() {
  try {
    return JSON.parse(localStorage.getItem("wedding-demo-rsvps") || "{}");
  } catch {
    return {};
  }
}

function demoSave(store) {
  try {
    localStorage.setItem("wedding-demo-rsvps", JSON.stringify(store));
  } catch {
    /* storage unavailable — demo keeps working in memory only */
  }
}

const demoApi = {
  demo: true,
  async lookup(code) {
    await new Promise((r) => setTimeout(r, 250));
    const household = DEMO_HOUSEHOLDS[code];
    if (!household) return { ok: false, error: "not_found" };
    return { ok: true, household: { ...household, response: demoStore()[code] || null } };
  },
  async submit(payload) {
    await new Promise((r) => setTimeout(r, 400));
    const household = DEMO_HOUSEHOLDS[payload.code];
    if (!household) return { ok: false, error: "not_found" };
    const store = demoStore();
    store[payload.code] = { ...payload, updatedAt: new Date().toISOString() };
    demoSave(store);
    return { ok: true };
  },
};

const remoteApi = {
  demo: false,
  async lookup(code) {
    const url = `${config.apiUrl}?action=lookup&code=${encodeURIComponent(code)}`;
    const res = await fetch(url, { redirect: "follow" });
    return res.json();
  },
  async submit(payload) {
    // text/plain avoids a CORS preflight, which Apps Script does not answer.
    const res = await fetch(config.apiUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "rsvp", ...payload }),
    });
    return res.json();
  },
};

export const api = config.apiUrl ? remoteApi : demoApi;

// ---------- Decorative SVG ----------

// Thin gold rule with the four-point star from the monogram.
export const DIVIDER = `
<svg class="sprig" viewBox="0 0 160 24" aria-hidden="true" focusable="false">
  <path d="M6 12 H66 M94 12 H154" stroke="currentColor" stroke-width="1" fill="none"/>
  <path d="M80 2 L82.6 9.4 L90 12 L82.6 14.6 L80 22 L77.4 14.6 L70 12 L77.4 9.4 Z" fill="currentColor"/>
  <circle cx="62" cy="12" r="1.6" fill="currentColor"/><circle cx="98" cy="12" r="1.6" fill="currentColor"/>
</svg>`;

// Monogram from the couple's chosen reference (arched gold frame, A F, star, waves, shell).
export const MONOGRAM = `<img class="monogram" src="assets/monogram.webp" width="600" height="835" alt="Monograma A F com moldura dourada em arco, estrela, ondas e concha">`;
