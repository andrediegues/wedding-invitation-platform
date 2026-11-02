"""Generates site/assets/hero.svg — a watercolour-style Mediterranean terrace scene.

Run:  python3 tools/make_hero.py
The output is a plain SVG (no scripts); tweak the constants below and re-run.
"""
import math
import random
from pathlib import Path

W, H = 1200, 640
random.seed(24092027)

OLIVE = ["#5E6B3C", "#6F7D49", "#86935E", "#9DA675"]
IVORY = "#FBF8F2"
SAND = "#E9DFCD"
SKY = "#C7D4E6"
SEA = "#7E9AC0"
SEA_DEEP = "#4F6E9E"
NAVY = "#1C2F57"

parts = []
add = parts.append


def leaf(x, y, angle, length=26, width=8, color=None, opacity=0.88):
    color = color or random.choice(OLIVE)
    l, w = length, width
    return (f'<path d="M0 0 Q{l/2:.1f} {-w:.1f} {l:.1f} 0 Q{l/2:.1f} {w:.1f} 0 0Z" '
            f'transform="translate({x:.1f} {y:.1f}) rotate({angle:.0f})" fill="{color}" opacity="{opacity}"/>')


def branch(x0, y0, x1, y1, bend, leaves=12, size=1.0, berries=0):
    """A curved twig with leaves alternating along it."""
    cx, cy = (x0 + x1) / 2 + bend[0], (y0 + y1) / 2 + bend[1]
    out = [f'<path d="M{x0} {y0} Q{cx:.1f} {cy:.1f} {x1} {y1}" stroke="#6B6A45" stroke-width="{2*size:.1f}" fill="none"/>']
    for i in range(1, leaves + 1):
        t = i / (leaves + 1)
        px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1
        py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1
        dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx)
        dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy)
        base = math.degrees(math.atan2(dy, dx))
        side = 1 if i % 2 else -1
        out.append(leaf(px, py, base + side * random.uniform(30, 55),
                        length=random.uniform(22, 32) * size, width=random.uniform(6, 8) * size))
    for _ in range(berries):
        t = random.uniform(0.2, 0.9)
        px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1
        py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1
        out.append(f'<ellipse cx="{px + random.uniform(-6, 6):.1f}" cy="{py + random.uniform(4, 10):.1f}" '
                   f'rx="{4.5*size:.1f}" ry="{5.5*size:.1f}" fill="{NAVY}" opacity="0.75"/>')
    return "\n".join(out)


def rose(x, y, r):
    out = [f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{IVORY}" stroke="#D8CBB0" stroke-width="1.2"/>']
    for k in range(3):
        rr = r * (0.75 - k * 0.2)
        a0 = random.uniform(0, 360)
        a1, a2 = math.radians(a0), math.radians(a0 + 250)
        out.append(f'<path d="M{x + rr*math.cos(a1):.1f} {y + rr*math.sin(a1):.1f} '
                   f'A{rr:.1f} {rr:.1f} 0 1 1 {x + rr*math.cos(a2):.1f} {y + rr*math.sin(a2):.1f}" '
                   f'stroke="#D2C29F" stroke-width="1.1" fill="none"/>')
    out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*0.18:.1f}" fill="#E8D9B5"/>')
    return "\n".join(out)


def blossom_cluster(x, y, n, spread, color):
    return "\n".join(
        f'<circle cx="{x + random.uniform(-spread, spread):.1f}" cy="{y + random.uniform(-spread, spread)*0.7:.1f}" '
        f'r="{random.uniform(3.5, 6):.1f}" fill="{color}" opacity="0.8"/>' for _ in range(n))


def bouquet(cx, cy, flip=1):
    out = []
    for _ in range(9):
        a = random.uniform(-160, -20)
        L = random.uniform(110, 190)
        x1 = cx + flip * L * math.cos(math.radians(a)) * random.choice([1, -1]) * 0.9
        y1 = cy + L * math.sin(math.radians(a))
        out.append(branch(cx, cy, x1, y1, (random.uniform(-30, 30), random.uniform(-20, 20)), leaves=7, size=0.9))
    out.append(blossom_cluster(cx + flip * 60, cy - 50, 40, 45, "#C9D6E8"))
    out.append(blossom_cluster(cx - flip * 50, cy - 90, 20, 30, "#DCE5F0"))
    for _ in range(9):
        out.append(rose(cx + random.uniform(-95, 95), cy - random.uniform(-5, 95), random.uniform(20, 32)))
    return "\n".join(out)


# ------------------------------------------------------------------ scene
add(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">
<defs>
  <filter id="wcBig" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="4" seed="9"/>
    <feDisplacementMap in="SourceGraphic" scale="38" xChannelSelector="R" yChannelSelector="G"/>
    <feGaussianBlur stdDeviation="3"/>
  </filter>
  <filter id="wcMed" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="2"/>
    <feDisplacementMap in="SourceGraphic" scale="12" xChannelSelector="R" yChannelSelector="G"/>
    <feGaussianBlur stdDeviation="1.2"/>
  </filter>
  <filter id="wcSmall" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="5"/>
    <feDisplacementMap in="SourceGraphic" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
    <feGaussianBlur stdDeviation="0.4"/>
  </filter>
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2"/>
    <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.26  0 0 0 0.10 0"/>
  </filter>
  <radialGradient id="vign" cx="0.5" cy="0.52" r="0.62">
    <stop offset="0" stop-color="#fff"/>
    <stop offset="0.72" stop-color="#fff"/>
    <stop offset="1" stop-color="#000"/>
  </radialGradient>
  <mask id="m"><rect width="{W}" height="{H}" fill="url(#vign)"/></mask>
  <g id="baluster">
    <path d="M-12 0 H12 V6 C12 10 4 12 4 18 C4 26 16 34 16 50 C16 64 8 70 8 76 H12 V86 H-12 V76 H-8 C-8 70 -16 64 -16 50 C-16 34 -4 26 -4 18 C-4 12 -12 10 -12 6 Z" fill="#F3ECDF" stroke="#C9BBA0" stroke-width="1.2"/>
    <path d="M2 18 C2 26 13 34 13 50 C13 64 6 70 6 76 H2Z" fill="#E2D6BF" opacity="0.6"/>
  </g>
</defs>
<g mask="url(#m)">
''')

# sky
add(f'<g filter="url(#wcBig)">'
    f'<path d="M-40 -40 H1240 V300 C1000 320 800 290 600 310 C400 330 200 300 -40 320 Z" fill="{SKY}" opacity="0.8"/>'
    f'<ellipse cx="700" cy="292" rx="460" ry="38" fill="#F1E5CF" opacity="0.45"/>'
    f'<ellipse cx="880" cy="120" rx="160" ry="34" fill="{IVORY}" opacity="0.6"/>'
    f'<ellipse cx="420" cy="90" rx="200" ry="30" fill="{IVORY}" opacity="0.5"/>'
    f'</g>')
# headlands
add(f'<g filter="url(#wcMed)">'
    f'<path d="M-30 334 C60 252 140 214 232 226 C300 236 342 268 402 298 C444 318 474 326 524 334 Z" fill="#94A7C2" opacity="0.8"/>'
    f'<path d="M-30 344 C40 300 92 282 152 290 C212 298 252 322 302 344 Z" fill="#6F86A8" opacity="0.75"/>'
    f'<path d="M820 334 C900 304 1000 296 1240 318 V336 Z" fill="#A9B8CE" opacity="0.65"/>'
    f'</g>')
# sea
add(f'<g filter="url(#wcBig)">'
    f'<rect x="-40" y="330" width="1280" height="340" fill="{SEA}" opacity="0.88"/>'
    f'<rect x="-40" y="328" width="1280" height="12" fill="{SEA_DEEP}" opacity="0.4"/>'
    f'<ellipse cx="700" cy="420" rx="420" ry="40" fill="#A9BEDB" opacity="0.5"/>'
    f'</g>')
shimmer = []
for _ in range(26):
    x = random.uniform(80, 1120); y = random.uniform(352, 480); L = random.uniform(18, 60)
    shimmer.append(f'<path d="M{x:.0f} {y:.0f} h{L:.0f}" stroke="{IVORY}" stroke-width="2" opacity="{random.uniform(0.35, 0.7):.2f}"/>')
add(f'<g filter="url(#wcSmall)">{"".join(shimmer)}</g>')


def boat(x, y, s):
    return (f'<g transform="translate({x} {y}) scale({s})" filter="url(#wcSmall)">'
            f'<path d="M0 -58 V0" stroke="#55627A" stroke-width="1.6"/>'
            f'<path d="M-2 -54 L-2 -2 L-32 -2 Z" fill="{IVORY}"/>'
            f'<path d="M3 -46 L3 -2 L24 -2 Z" fill="#F0E7D6"/>'
            f'<path d="M-36 2 Q-2 14 32 2 Z" fill="{SEA_DEEP}"/>'
            f'<path d="M-30 12 h52" stroke="{IVORY}" stroke-width="1.5" opacity="0.5"/>'
            f'</g>')


add(boat(660, 352, 1.0))
add(boat(812, 360, 0.7))

# olive tree, hanging from the top-left corner
tree = []
for (x0, y0, x1, y1, bend) in [(-10, 10, 260, 120, (40, -40)), (-10, 60, 220, 210, (30, 10)),
                                (40, -10, 330, 60, (40, -50)), (-10, 140, 140, 260, (40, 20)),
                                (120, -10, 420, 30, (20, -40))]:
    tree.append(branch(x0, y0, x1, y1, bend, leaves=16, size=1.15, berries=3))
add(f'<g filter="url(#wcSmall)">{"".join(tree)}</g>')
add(f'<g filter="url(#wcSmall)">{blossom_cluster(160, 80, 18, 40, IVORY)}</g>')

# balustrade
bal = [f'<rect x="-20" y="498" width="1240" height="24" fill="#EFE7D8" stroke="#CDBFA5" stroke-width="1.2"/>',
       f'<rect x="-20" y="522" width="1240" height="5" fill="#DCCFB6" opacity="0.7"/>']
for x in range(24, 1200, 58):
    bal.append(f'<use href="#baluster" x="{x}" y="527"/>')
bal.append(f'<rect x="-20" y="612" width="1240" height="40" fill="{SAND}" stroke="#CDBFA5" stroke-width="1.2"/>')
add(f'<g filter="url(#wcSmall)">{"".join(bal)}</g>')

# bouquets on the balustrade
add(f'<g filter="url(#wcSmall)">{bouquet(120, 520, 1)}</g>')
add(f'<g filter="url(#wcSmall)">{bouquet(1080, 520, -1)}</g>')

# paper grain over the painting
add(f'<rect width="{W}" height="{H}" filter="url(#grain)"/>')
add('</g>\n</svg>\n')

out = Path(__file__).resolve().parent.parent / "site" / "assets" / "hero.svg"
out.write_text("\n".join(parts), encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
