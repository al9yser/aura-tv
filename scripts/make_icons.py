"""Generates Android launcher icons + TV banner (violet / gold). Output: resources/android/res/..."""
from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = os.path.join(os.path.dirname(__file__), '..', 'resources', 'android', 'res')
VIOLET_HI, GOLD, BG = (154, 120, 214), (226, 187, 78), (18, 16, 24)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def mark(size, scale=1.0, ring_w=0.085):
    """Ring (violet->gold gradient) + gold play triangle on transparent bg, drawn 4x for AA."""
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    r = S * 0.5 * scale
    cx = cy = S / 2
    grad = Image.new('RGBA', (S, S))
    gp = grad.load()
    for y in range(S):
        for x in range(S):
            gp[x, y] = lerp(VIOLET_HI, GOLD, (x + y) / (2 * S)) + (255,)
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    inner = r * (1 - ring_w * 2 / scale * 1.0)
    md.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=0)
    im.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(im)
    t = inner * 0.62
    d.polygon([(cx - t * 0.42, cy - t * 0.62), (cx - t * 0.42, cy + t * 0.62), (cx + t * 0.70, cy)], fill=GOLD + (255,))
    return im.resize((size, size), Image.LANCZOS)

def save(img, rel):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p)

dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, f in dens.items():
    # adaptive foreground: 108dp canvas, content inside the 66dp safe zone
    fg_px = int(108 * f)
    fg = Image.new('RGBA', (fg_px, fg_px), (0, 0, 0, 0))
    m = mark(int(fg_px * 0.60))
    fg.paste(m, ((fg_px - m.width) // 2, (fg_px - m.height) // 2), m)
    save(fg, f'mipmap-{name}/ic_launcher_foreground.png')
    # legacy square + round icons (48dp)
    px = int(48 * f)
    sq = Image.new('RGBA', (px, px), BG + (255,))
    m2 = mark(int(px * 0.82))
    sq.paste(m2, ((px - m2.width) // 2, (px - m2.height) // 2), m2)
    save(sq, f'mipmap-{name}/ic_launcher.png')
    rd = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    circ = Image.new('L', (px * 4, px * 4), 0)
    ImageDraw.Draw(circ).ellipse([0, 0, px * 4 - 1, px * 4 - 1], fill=255)
    circ = circ.resize((px, px), Image.LANCZOS)
    rd.paste(sq, (0, 0), circ)
    save(rd, f'mipmap-{name}/ic_launcher_round.png')

os.makedirs(os.path.join(OUT, 'values'), exist_ok=True)
open(os.path.join(OUT, 'values', 'ic_launcher_background.xml'), 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#121018</color>\n</resources>\n')

# Android TV banner 320x180 (xhdpi => 320x180 px)
b = Image.new('RGBA', (320, 180), BG + (255,))
bm = mark(110)
b.paste(bm, (28, 35), bm)
dr = ImageDraw.Draw(b)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
except Exception:
    font = ImageFont.load_default()
dr.text((150, 70), 'Aura TV', font=font, fill=GOLD)
save(b.convert('RGB'), 'drawable-xhdpi/banner.png')
print('icons written to', os.path.abspath(OUT))
