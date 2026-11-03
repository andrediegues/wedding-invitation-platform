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

// Monogram: arched gold frame, A F in a high-contrast serif, gold star,
// watercolour waves and a gold scallop shell (after the couple's chosen reference).
const SHELL_RIBS = Array.from({ length: 11 }, (_, i) => {
  const a = ((i - 5) / 5) * 0.95;
  return `<path d="M0 -2 L${(Math.sin(a) * 33).toFixed(1)} ${(-Math.cos(a) * 44 - 4).toFixed(1)}"/>`;
}).join("");

export const MONOGRAM = `
<svg class="monogram" viewBox="0 0 260 390" role="img" aria-label="Monograma A F">
  <defs>
    <linearGradient id="mg-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A97D42"/><stop offset=".3" stop-color="#F1D9A6"/>
      <stop offset=".55" stop-color="#C99A5B"/><stop offset=".75" stop-color="#F6E3BC"/>
      <stop offset="1" stop-color="#A97D42"/>
    </linearGradient>
    <filter id="mg-wc" x="-5%" y="-10%" width="110%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="8"/>
      <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G"/>
      <feGaussianBlur stdDeviation="0.5"/>
    </filter>
    <clipPath id="mg-clip"><path d="M34 150 A96 96 0 0 1 226 150 V344 Q226 372 198 372 H62 Q34 372 34 344 Z"/></clipPath>
  </defs>
  <path d="M130 6 L134.5 25.5 L154 30 L134.5 34.5 L130 54 L125.5 34.5 L106 30 L125.5 25.5 Z" fill="url(#mg-gold)"/>
  <path d="M30 150 A100 100 0 0 1 230 150 V346 Q230 376 200 376 H60 Q30 376 30 346 Z" fill="none" stroke="url(#mg-gold)" stroke-width="1.8"/>
  <path d="M38 150 A92 92 0 0 1 222 150 V342 Q222 368 196 368 H64 Q38 368 38 342 Z" fill="none" stroke="url(#mg-gold)" stroke-width=".7" opacity=".6"/>
  <path d="M62 152 H198" stroke="url(#mg-gold)" stroke-width="1.2"/>
  <text x="104" y="262" text-anchor="middle" font-family="'Cormorant Garamond', 'Bodoni Moda', Didot, serif" font-weight="500" font-size="158" fill="#0C3362">A</text>
  <text x="166" y="300" text-anchor="middle" font-family="'Cormorant Garamond', 'Bodoni Moda', Didot, serif" font-weight="500" font-size="150" fill="#0C3362">F</text>
  <g clip-path="url(#mg-clip)">
    <g filter="url(#mg-wc)">
      <path d="M20 300 C60 282 100 292 140 308 C175 322 208 318 240 296 V390 H20 Z" fill="#6EA6CD" opacity=".85"/>
      <path d="M20 318 C64 300 104 314 146 330 C184 344 214 338 240 322 V390 H20 Z" fill="#0C3362" opacity=".92"/>
      <path d="M20 340 C70 326 112 340 154 352 C190 362 218 358 240 348 V390 H20 Z" fill="#C3D3E0" opacity=".95"/>
      <path d="M20 356 C70 346 120 360 170 368 C200 372 222 370 240 364 V390 H20 Z" fill="#2A5C95" opacity=".85"/>
    </g>
    <g fill="none" stroke="url(#mg-gold)" stroke-linecap="round">
      <path d="M36 302 C70 288 104 296 140 311 C174 325 206 320 232 302" stroke-width="1.6"/>
      <path d="M40 336 C80 324 116 336 154 349" stroke-width="1.1"/>
    </g>
  </g>
  <g fill="url(#mg-gold)">
    <circle cx="52" cy="292" r="1.8"/><circle cx="64" cy="284" r="1.2"/><circle cx="214" cy="292" r="1.4"/>
    <circle cx="44" cy="276" r="1"/><circle cx="222" cy="280" r="1"/>
  </g>
  <g transform="translate(196 350) rotate(-12) scale(1.05)">
    <path d="M-7 -1 H7 V7 H-7 Z" fill="url(#mg-gold)" stroke="#9A7038" stroke-width=".8"/>
    <path d="M-5 0 L-33 -30 Q-37 -46 -24 -52 Q-12 -58 0 -58 Q12 -58 24 -52 Q37 -46 33 -30 L5 0 Z" fill="url(#mg-gold)" stroke="#9A7038" stroke-width="1"/>
    <g stroke="#9A7038" stroke-width=".9" opacity=".75" fill="none">${SHELL_RIBS}</g>
  </g>
</svg>`;
