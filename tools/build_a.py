#!/usr/bin/env python3
"""Build step for Variant A (Gut Run).

Usage:  python3 -I tools/build_a.py <path-to-original-task-repo> <path-to-this-repo>

What it does
  1. copies only the images the ad really uses (optimised PNG/JPG),
  2. re-encodes the audio (mono, low bitrate; the long applause is trimmed),
  3. generates js/hitmasks.js: eroded alpha masks of every obstacle, the
     player's outline points and the profile of the top/bottom gut walls.
     Hitboxes are built from the real pixels (alpha), not from the image
     rectangles, and are deliberately a few px *smaller* than the artwork so
     that the player never dies without visibly touching something.
"""
import base64, json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC, DST = sys.argv[1], sys.argv[2]
A_SRC = os.path.join(SRC, "variant-a-game", "assets")
A_DST = os.path.join(DST, "variant-a-game", "assets")

# ---------------------------------------------------------------- images
IMAGES = {
    "bg.jpg": "bg.jpg",
    "border.png": "border.png",
    "logo.png": "logo.png",
    "gesture.png": "gesture.png",
    "01_game/bg_texture.png": "bg_texture.png",
    "01_game/gameplay.png": "gameplay.png",
    "01_game/player.png": "player.png",
    "01_game/tut.png": "tut.png",
}
for i in range(1, 7):
    IMAGES[f"01_game/bac{i}.png"] = f"obstacles/bac{i}.png"
for i in range(1, 10):
    IMAGES[f"01_game/txt{i}.png"] = f"obstacles/txt{i}.png"
for n in ["bubble", "cta", "hl", "replay", "sad", "bac1", "bac2", "bac3", "bac4", "bac5"]:
    IMAGES[f"02_endcard/fail/{n}.png"] = f"fail/{n}.png"
for n in ["bubble", "cta", "hl", "happy", "konfetti"]:
    IMAGES[f"02_endcard/win/{n}.png"] = f"win/{n}.png"

total = 0
for s, d in IMAGES.items():
    out = os.path.join(A_DST, d)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = Image.open(os.path.join(A_SRC, s))
    if s.endswith(".jpg"):
        im.convert("RGB").save(out, quality=82, optimize=True)
    else:
        im.save(out, optimize=True)
    total += os.path.getsize(out)
print(f"images: {len(IMAGES)} files, {total/1024:.0f} KB")

# ----------------------------------------------------------------- audio
M = os.path.join(A_SRC, "music")
AUDIO = [
    # (source, target, extra ffmpeg args)
    ("background_music/Funny Game Loop.mp3", "music.mp3", ["-b:a", "48k"]),
    ("crash/Cartoon Crash Boing.mp3", "crash.mp3", ["-b:a", "56k"]),
    ("endcard_fail/Fail.mp3", "fail.mp3", ["-b:a", "56k"]),
    ("endcard_win/Celebrative Happy Woohoo Cheer 2.mp3", "cheer.mp3", ["-b:a", "56k"]),
    # the original applause is 15 s / 588 KB - 6 s with a fade-out is plenty
    ("endcard_win/applause.mp3", "applause.mp3", ["-t", "6", "-af", "afade=t=out:st=4.5:d=1.5", "-b:a", "48k"]),
]
os.makedirs(os.path.join(A_DST, "audio"), exist_ok=True)
atotal = 0
for s, d, extra in AUDIO:
    out = os.path.join(A_DST, "audio", d)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(M, s), "-ac", "1", "-ar", "32000",
                    "-codec:a", "libmp3lame", *extra, out], check=True)
    atotal += os.path.getsize(out)
print(f"audio: {len(AUDIO)} files, {atotal/1024:.0f} KB")

# ------------------------------------------------------------- hit masks
def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r

def alpha_of(name):
    return np.array(Image.open(os.path.join(A_SRC, "01_game", name + ".png")).convert("RGBA"))[:, :, 3]

def pack(mask):
    return base64.b64encode(np.packbits(mask.astype(np.uint8).ravel()).tobytes()).decode()

OBST_ERODE = 3     # px @2x (1.5 css px): obstacle hitbox is smaller than the art
PLAYER_ERODE = 5   # px @2x: the player's hitbox is smaller than the art as well
data = {"obstacles": {}}
for n in [f"bac{i}" for i in range(1, 7)] + [f"txt{i}" for i in range(1, 10)]:
    a = alpha_of(n)
    # pad so erosion at the sprite edge behaves like erosion in free space
    m = ndi.binary_erosion(np.pad(a > 110, OBST_ERODE + 1), structure=disk(OBST_ERODE))[OBST_ERODE + 1:-(OBST_ERODE + 1), OBST_ERODE + 1:-(OBST_ERODE + 1)]
    data["obstacles"][n] = {"w": int(a.shape[1]), "h": int(a.shape[0]), "bits": pack(m)}

pa = alpha_of("player")
pm = ndi.binary_erosion(np.pad(pa > 110, PLAYER_ERODE + 1), structure=disk(PLAYER_ERODE))[PLAYER_ERODE + 1:-(PLAYER_ERODE + 1), PLAYER_ERODE + 1:-(PLAYER_ERODE + 1)]
edge = pm & ~ndi.binary_erosion(pm)
ys, xs = np.where(edge)
# sample points of the eroded player mask: the outline every ~3px plus a filled 4px grid,
# so even a small bacterium that would end up *inside* the player is detected
pts = {(int(x // 3 * 3), int(y // 3 * 3)) for x, y in zip(xs, ys) if pm[int(y // 3 * 3), int(x // 3 * 3)] or True}
pts = {p for p in pts if 0 <= p[0] < pm.shape[1] and 0 <= p[1] < pm.shape[0] and pm[p[1], p[0]]}
for y in range(0, pm.shape[0], 4):
    for x in range(0, pm.shape[1], 4):
        if pm[y, x]:
            pts.add((x, y))
pts = sorted(pts)
data["player"] = {"w": int(pa.shape[1]), "h": int(pa.shape[0]), "pts": [list(p) for p in pts]}

# top / bottom gut walls (border.png): per column, how far the opaque cloud reaches
b = np.array(Image.open(os.path.join(A_SRC, "border.png")).convert("RGBA"))[:, :, 3] > 110
top, bot = [], []
for x in range(b.shape[1]):
    col = b[:, x]
    t = np.where(col[:700])[0]
    u = np.where(col[700:])[0]
    top.append(int(t.max()) + 1 if len(t) else 337)
    bot.append(int(u.min()) + 700 if len(u) else 1280)
data["top"], data["bottom"] = top, bot
print(f"playfield: top wall reaches y={min(top)}..{max(top)}, bottom wall starts y={min(bot)}..{max(bot)}")

js = "/* generated by tools/build_a.py - do not edit */\nwindow.GUT_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n"
with open(os.path.join(DST, "variant-a-game", "js", "hitmasks.js"), "w") as f:
    f.write(js)
print(f"hitmasks.js: {len(js)/1024:.1f} KB, player outline points: {len(pts)}")
