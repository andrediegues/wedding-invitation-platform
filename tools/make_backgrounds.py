"""Generates the theme backgrounds in site/assets/:

  marble.jpg   navy / blue / ivory alcohol-ink marble with gold veins and glitter
  silk.jpg     pale blue ground with soft folds at the edges and gold sparkles

Palette (from the couple's reference): #0C3362 #6EA6CD #C3D3E0 #DCAD79 #F4E7D6
Run:  python3 tools/make_backgrounds.py   (needs numpy + opencv-python-headless)
"""
from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "site" / "assets"
rng = np.random.default_rng(24092027)


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


NAVY, BLUE, PALE, GOLD, IVORY = map(hexrgb, ["#0C3362", "#6EA6CD", "#C3D3E0", "#DCAD79", "#F4E7D6"])
DEEP = hexrgb("#071F40")


def value_noise(h, w, cell, seed_shift=0):
    gh, gw = max(2, h // cell + 2), max(2, w // cell + 2)
    g = rng.random((gh, gw)).astype(np.float32)
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)


def fbm(h, w, base=256, octaves=5):
    out = np.zeros((h, w), np.float32)
    amp, total, cell = 1.0, 0.0, base
    for _ in range(octaves):
        out += amp * value_noise(h, w, max(2, cell))
        total += amp
        amp *= 0.5
        cell //= 2
    return out / total


def warp(field, dx, dy, strength):
    h, w = field.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    mx = (xx + (dx - 0.5) * strength).astype(np.float32)
    my = (yy + (dy - 0.5) * strength).astype(np.float32)
    return cv2.remap(field, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def ramp(t, stops):
    """Piecewise-linear colour ramp; stops = [(pos, rgb), ...]."""
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t[m] - p0) / (p1 - p0))[:, None]
        out[m] = c0 * (1 - k) + c1 * k
    out[t < stops[0][0]] = stops[0][1]
    out[t > stops[-1][0]] = stops[-1][1]
    return out


def glitter(h, w, density, mask, size=1.0):
    """Gold specks with a soft bloom, weighted by mask (0..1)."""
    layer = np.zeros((h, w), np.float32)
    n = int(h * w * density)
    ys = rng.integers(0, h, n)
    xs = rng.integers(0, w, n)
    keep = rng.random(n) < mask[ys, xs]
    layer[ys[keep], xs[keep]] = rng.uniform(0.5, 1.0, keep.sum())
    core = cv2.GaussianBlur(layer, (0, 0), 0.6 * size)
    bloom = cv2.GaussianBlur(layer, (0, 0), 3.0 * size) * 6
    return np.clip(core * 3 + bloom, 0, 1)


def save(img, name, q=84):
    path = OUT / name
    cv2.imwrite(str(path), cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_JPEG_QUALITY, q, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


# ------------------------------------------------------------------ marble
def marble(w=1800, h=1200):
    f = fbm(h, w, 420, 6)
    wx, wy = fbm(h, w, 300, 5), fbm(h, w, 300, 5)
    f = warp(f, wx, wy, 520)
    f = warp(f, fbm(h, w, 160, 4), fbm(h, w, 160, 4), 160)
    f = (f - f.min()) / (f.max() - f.min())
    base = ramp(f, [(0.0, DEEP), (0.30, NAVY), (0.52, hexrgb("#2A5C95")), (0.66, BLUE),
                    (0.78, PALE), (0.90, hexrgb("#EDE6DB")), (1.0, IVORY)])
    # gold veins along a few iso-lines of the warped field
    veins = np.zeros((h, w), np.float32)
    mod = fbm(h, w, 120, 4)
    for level, width in [(0.30, 0.010), (0.47, 0.006), (0.62, 0.012), (0.83, 0.007)]:
        veins += np.exp(-((f - level) / (width * (0.6 + mod))) ** 2)
    veins = np.clip(veins, 0, 1) * np.clip((mod - 0.25) * 2.2, 0, 1)
    veins = cv2.GaussianBlur(veins, (0, 0), 0.8)
    sparkle = glitter(h, w, 0.012, np.clip(veins * 3, 0, 1), 0.8)
    gold = GOLD * (0.85 + 0.3 * fbm(h, w, 40, 3))[..., None]
    img = base * (1 - veins[..., None]) + gold * veins[..., None]
    img = img * (1 - sparkle[..., None]) + hexrgb("#F6E2B5") * sparkle[..., None]
    img += rng.normal(0, 2.2, img.shape).astype(np.float32)
    save(img, "marble.jpg")


# ------------------------------------------------------------------ silk
def silk(w=1200, h=1800):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx, ny = xx / w, yy / h
    # distance from the calm centre (an ellipse), 0 inside → 1 at the frame
    d = np.sqrt(((nx - 0.5) / 0.42) ** 2 + ((ny - 0.5) / 0.44) ** 2)
    frame = np.clip((d - 0.78) / 0.45, 0, 1)
    frame = warp(frame, fbm(h, w, 260, 4), fbm(h, w, 260, 4), 220)
    base = PALE * (1 - 0.25 * ny[..., None]) + hexrgb("#9DB8D6") * (0.25 * ny[..., None])
    # folds: stretched, warped stripes shaded light/dark
    folds = np.sin((nx * 9 + ny * 5 + fbm(h, w, 220, 4) * 7) * np.pi)
    folds = warp(folds.astype(np.float32), fbm(h, w, 300, 3), fbm(h, w, 300, 3), 260)
    light = np.clip(folds, 0, 1) ** 2
    dark = np.clip(-folds, 0, 1) ** 1.5
    img = base.copy()
    img = img * (1 - 0.55 * dark[..., None] * frame[..., None]) + hexrgb("#4F7FB4") * (0.55 * dark[..., None] * frame[..., None])
    img = img * (1 - 0.6 * light[..., None] * frame[..., None]) + hexrgb("#EEF3F8") * (0.6 * light[..., None] * frame[..., None])
    # gold sparkles concentrated along the inner edge of the frame
    ring = np.exp(-((d - 0.95) / 0.22) ** 2)
    sp = glitter(h, w, 0.005, np.clip(ring * 1.3 + frame * 0.5, 0, 1), 1.3)
    stars = glitter(h, w, 0.00025, np.clip(ring + frame * 0.6, 0, 1), 4.5)
    # a fine gold thread winding along the frame
    thread = np.exp(-((warp(d, fbm(h, w, 200, 3), fbm(h, w, 200, 3), 120) - 0.93) / 0.006) ** 2)
    thread *= np.clip((fbm(h, w, 90, 3) - 0.35) * 3, 0, 1)
    thread_glow = glitter(h, w, 0.03, np.clip(thread, 0, 1), 0.9)
    sp = np.clip(sp + stars * 2.0 + thread * 0.7 + thread_glow * 0.6, 0, 1)
    img = img * (1 - sp[..., None]) + hexrgb("#F4D9A0") * sp[..., None]
    img += rng.normal(0, 1.6, img.shape).astype(np.float32)
    save(img, "silk.jpg", 82)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    marble()
    silk()
