"""
tune_pixelblast.py
Updates PixelBlast opts on all 12 RCSC HTML pages.
"""
import os, re

ROOT = r"d:\Projects\RCSC"
PAGES = [
    "index.html", "about.html", "activities.html", "blog.html",
    "chess-hub.html", "contact.html", "dashboard.html", "devsprint.html",
    "executive.html", "gallery.html", "publication.html", "science-fest.html",
]

OLD = r"PixelBlast\.mountFixed\s*\(\s*\{[^}]*\}\s*\)"
NEW = "PixelBlast.mountFixed({ color: 'auto', cellSize: 7, coverage: 0.6, density: 0.35, speed: 0.6, interactive: true })"

for page in PAGES:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        print(f"SKIP: {page}")
        continue
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    new_html = re.sub(OLD, NEW, html)
    if new_html == html:
        print(f"NO CHANGE: {page}")
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_html)
        print(f"UPDATED:   {page}")

print("Done.")
