"""
swap_to_pixelblast.py
Replaces ContourLines with PixelBlast on all 12 RCSC HTML pages.
"""
import os, re

ROOT = r"d:\Projects\RCSC"
PAGES = [
    "index.html", "about.html", "activities.html", "blog.html",
    "chess-hub.html", "contact.html", "dashboard.html", "devsprint.html",
    "executive.html", "gallery.html", "publication.html", "science-fest.html",
]

for page in PAGES:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        print(f"SKIP (not found): {page}")
        continue

    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    original = html

    # 1. Replace script src
    html = html.replace(
        '<script src="contour-lines.js"></script>',
        '<script src="pixel-blast.js"></script>'
    )

    # 2. Replace ContourLines.mountFixed({...}) call — single-line version
    html = re.sub(
        r'ContourLines\.mountFixed\s*\(\s*\{[^}]*\}\s*\)',
        "PixelBlast.mountFixed({ color: 'auto', cellSize: 6, coverage: 1.4, density: 0.8, speed: 0.8, interactive: true })",
        html
    )

    if html == original:
        print(f"NO CHANGE: {page}")
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"UPDATED:   {page}")

print("Done.")
