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

// ---------- Decorative SVG (theme: classical music × Mediterranean) ----------

const svgOpen = (viewBox, cls) =>
  `<svg class="${cls}" viewBox="${viewBox}" aria-hidden="true" focusable="false">`;

// Line icons, 48×48, drawn with currentColor.
const ICON_PATHS = {
  lyre: `
    <path d="M17 40 C9 34 8 20 12 10 C13.5 6.5 17 7 16 10.5"/>
    <path d="M31 40 C39 34 40 20 36 10 C34.5 6.5 31 7 32 10.5"/>
    <path d="M13 15 Q24 11 35 15"/><path d="M15 41 H33"/>
    <path d="M20 14 V40 M24 13.3 V40 M28 14 V40"/>`,
  harp: `
    <path d="M12 42 V7 C24 9 32 24 38 42 Z"/>
    <path d="M16.5 9.2 V42 M21 11 V42 M25.5 14.5 V42 M30 20 V42 M34 28 V42"/>
    <path d="M9 42 H41"/>`,
  glass: `
    <path d="M12 12 Q24 28 36 12 Z"/><path d="M24 21 V39"/><path d="M16.5 39 H31.5"/>
    <path d="M17 16.5 H31"/>`,
  notes: `
    <ellipse cx="15" cy="36" rx="4.6" ry="3.4" transform="rotate(-20 15 36)" fill="currentColor"/>
    <ellipse cx="33" cy="32" rx="4.6" ry="3.4" transform="rotate(-20 33 32)" fill="currentColor"/>
    <path d="M19.2 35 V12 M37.2 31 V8"/><path d="M19.2 12 L37.2 8" stroke-width="3"/>`,
  toast: `
    <g transform="rotate(-14 17 24)"><path d="M14 8 H20 L19.5 22 C19 25.5 14.5 25.5 14.5 22 Z"/><path d="M17 24.5 V38 M13.5 38 H20.5"/></g>
    <g transform="rotate(14 31 24)"><path d="M28 8 H34 L33.5 22 C33 25.5 28.5 25.5 28.5 22 Z"/><path d="M31 24.5 V38 M27.5 38 H34.5"/></g>
    <path d="M24 2 V6.5 M19.5 3.5 L21.5 7 M28.5 3.5 L26.5 7"/>`,
};

export function icon(name, cls = "icon") {
  return `${svgOpen("0 0 48 48", cls)}<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ICON_PATHS.lyre}</g></svg>`;
}

// Olive wreath, open at the top, 200×200 — filled olive leaves with navy olives.
export function wreath(cls = "wreath") {
  const leaves = [];
  const cx = 100, cy = 104, r = 76;
  const colours = ["#5E6B3C", "#76834F", "#8E9A67"];
  [1, -1].forEach((side) => {
    let i = 0;
    for (let a = 102; a <= 248; a += 9, i++) {
      const th = ((side === 1 ? a : 180 - a) * Math.PI) / 180;
      const x = cx + r * Math.cos(th);
      const y = cy + r * Math.sin(th);
      const tangent = (th * 180) / Math.PI + 90;
      const tilt = (i % 2 ? -32 : 32) * side;
      const out = i % 2 ? -5 : 5;
      const lx = x + out * Math.cos(th);
      const ly = y + out * Math.sin(th);
      leaves.push(`<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="13" ry="4.4" transform="rotate(${(tangent + tilt).toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})" fill="${colours[i % 3]}"/>`);
    }
  });
  const stems = `
    <path d="M${cx - 10} ${cy + r - 1} A${r} ${r} 0 0 1 ${cx - 28} ${cy - r + 6}" fill="none" stroke="#6B6A45" stroke-width="1.2"/>
    <path d="M${cx + 10} ${cy + r - 1} A${r} ${r} 0 0 0 ${cx + 28} ${cy - r + 6}" fill="none" stroke="#6B6A45" stroke-width="1.2"/>`;
  const olives = [[44, 152], [156, 152], [27, 104], [173, 104], [38, 62], [162, 62]]
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="4" fill="#1C2F57"/>`).join("");
  return `${svgOpen("0 0 200 200", cls)}${stems}${leaves.join("")}${olives}</svg>`;
}

// Monogram: lyre over "A | F" inside the olive wreath.
export function monogram(initials = ["A", "F"], cls = "monogram") {
  return `
    <div class="${cls}" aria-hidden="true">
      ${wreath(`${cls}__wreath`)}
      <span class="${cls}__lyre">${icon("lyre", `${cls}__lyre-icon`)}</span>
      <span class="${cls}__letters">${esc(initials[0])}<i></i>${esc(initials[1])}</span>
    </div>`;
}

// A flowing five-line staff with a few notes, 600×90.
export function staff(cls = "staff") {
  const lines = [0, 1, 2, 3, 4].map((k) => {
    const y = 34 + k * 7;
    return `<path d="M0 ${y} C120 ${y - 18} 220 ${y + 18} 330 ${y} S520 ${y - 16} 600 ${y - 4}"/>`;
  }).join("");
  const note = (x, y, up = true, flag = false) => `
    <ellipse cx="${x}" cy="${y}" rx="5" ry="3.7" transform="rotate(-20 ${x} ${y})" fill="currentColor" stroke="none"/>
    <path d="M${x + 4.4} ${y - 1} V${y - 26}"/>${flag ? `<path d="M${x + 4.4} ${y - 26} q8 6 6 16"/>` : ""}`;
  const pair = (x1, y1, x2, y2) => `${note(x1, y1)}${note(x2, y2)}<path d="M${x1 + 4.4} ${y1 - 26} L${x2 + 4.4} ${y2 - 26}" stroke-width="3"/>`;
  return `${svgOpen("0 0 600 90", cls)}
    <g fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.55">${lines}</g>
    <text x="6" y="70" font-family="'Noto Music', serif" font-size="58" fill="currentColor">𝄞</text>
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      ${pair(120, 42, 150, 35)}${note(205, 50, true, true)}${pair(290, 47, 318, 40)}
      ${note(400, 33, true, true)}${pair(470, 30, 500, 24)}${note(560, 29)}
    </g></svg>`;
}

// Gold wax seal with the couple's initials.
export function seal(initials = ["A", "F"], cls = "seal") {
  return `
    <div class="${cls}" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <defs>
          <filter id="seal-wobble" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11"/>
            <feDisplacementMap in="SourceGraphic" scale="8" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
          <radialGradient id="seal-gold" cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stop-color="#F1DFAE"/><stop offset="0.55" stop-color="#C9A45C"/><stop offset="1" stop-color="#94743A"/>
          </radialGradient>
        </defs>
        <g filter="url(#seal-wobble)"><circle cx="50" cy="50" r="44" fill="url(#seal-gold)"/></g>
        <circle cx="50" cy="50" r="33" fill="none" stroke="#9A7B3C" stroke-width="1.5" opacity="0.8"/>
      </svg>
      <span>${esc(initials[0])}${esc(initials[1])}</span>
    </div>`;
}
