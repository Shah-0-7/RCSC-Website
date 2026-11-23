#!/usr/bin/env python3
"""
Injects theme.css into all RCSC HTML pages and updates navbar + contour color.
"""
import os, re

ROOT = r"d:\Projects\RCSC"
PAGES = [
    "about.html","activities.html","blog.html","chess-hub.html",
    "contact.html","dashboard.html","devsprint.html","executive.html",
    "gallery.html","index.html","publication.html","science-fest.html"
]

THEME_LINK = '<link rel="stylesheet" href="theme.css" />'

# Read new navbar snippet
with open(os.path.join(ROOT, "scratch", "navbar-snippet.html"), encoding="utf-8") as f:
    NAVBAR = f.read().strip()

for page in PAGES:
    path = os.path.join(ROOT, page)
    with open(path, encoding="utf-8") as f:
        html = f.read()

    # 1. Inject theme.css as the VERY FIRST stylesheet in <head> (before Tailwind)
    #    Remove old link if present, then re-inject.
    html = html.replace(THEME_LINK + "\n", "")
    html = html.replace(THEME_LINK, "")
    # Insert before the Tailwind CDN script
    html = html.replace(
        '<script src="https://cdn.tailwindcss.com">',
        THEME_LINK + '\n  <script src="https://cdn.tailwindcss.com">',
        1
    )

    # 2. Replace navbar block
    html = re.sub(
        r'<!-- \[RCSC-NAV-START\] -->.*?<!-- \[RCSC-NAV-END\] -->',
        NAVBAR,
        html,
        flags=re.DOTALL
    )

    # 3. Update ContourLines call: color: '#242423' → color: 'auto'
    html = re.sub(
        r"ContourLines\.mountFixed\(\s*\{[^}]*\}\s*\)",
        lambda m: re.sub(r"color\s*:\s*'[^']*'", "color: 'auto'", m.group(0)),
        html
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Done: {page}")

print("All pages updated.")
