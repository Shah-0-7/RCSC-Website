"""
update_page_transitions.py
Excludes navbar (#rcsc-nav), theme button (#rcsc-theme-fab), and background canvas
from page transitions across theme.css and all 12 RCSC HTML pages.
"""
import os, re

ROOT = r"d:\Projects\RCSC"
PAGES = [
    "about.html", "activities.html", "blog.html", "chess-hub.html",
    "contact.html", "dashboard.html", "devsprint.html", "executive.html",
    "gallery.html", "index.html", "publication.html", "science-fest.html"
]

NEW_CSS = """    /* ── Page Transition (excludes navbar, theme button, and canvas) ── */
    @keyframes rcsc-fade-in  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes rcsc-fade-out { from { opacity: 1; } to { opacity: 0; } }
    body.page-leaving { pointer-events: none; }
    body > *:not(#rcsc-nav):not(#rcsc-theme-fab):not(#rcsc-pixelblast-canvas):not(#rcsc-contour-canvas):not(script):not(style) {
      animation: rcsc-fade-in 0.25s ease;
    }
    body.page-leaving > *:not(#rcsc-nav):not(#rcsc-theme-fab):not(#rcsc-pixelblast-canvas):not(#rcsc-contour-canvas):not(script):not(style) {
      animation: rcsc-fade-out 0.18s ease forwards !important;
    }
    #rcsc-nav, #rcsc-theme-fab, #rcsc-pixelblast-canvas, #rcsc-contour-canvas {
      animation: none !important;
      opacity: 1 !important;
    }"""

NEW_JS = """  <script>
    // ── Smooth Page Transitions ──
    document.addEventListener('DOMContentLoaded', function () {
      document.querySelectorAll('a[href]').forEach(function (link) {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('http') ||
            href.startsWith('mailto') || href.startsWith('tel') ||
            href.startsWith('javascript:') || link.target === '_blank' ||
            href.endsWith('.pdf')) return;
        link.addEventListener('click', function (e) {
          e.preventDefault();
          document.body.classList.add('page-leaving');
          setTimeout(function () { window.location.href = href; }, 180);
        });
      });
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) document.body.classList.remove('page-leaving');
    });
  </script>"""

# 1. Update theme.css
theme_path = os.path.join(ROOT, "theme.css")
with open(theme_path, "r", encoding="utf-8") as f:
    theme_css = f.read()

# Add pixelblast canvas dark background if not present
if "#rcsc-pixelblast-canvas" not in theme_css:
    theme_css = theme_css.replace(
        "html[data-theme=\"dark\"] #rcsc-contour-canvas {",
        "html[data-theme=\"dark\"] #rcsc-contour-canvas,\nhtml[data-theme=\"dark\"] #rcsc-pixelblast-canvas {"
    )

# Add Page Transitions block to theme.css if not present
if "/* ── Page Transitions (excludes navbar" not in theme_css:
    theme_transition_block = """
/* ── Page Transitions (excludes navbar, theme button, and canvas) ────────── */
@keyframes rcsc-fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes rcsc-fade-out { from { opacity: 1; } to { opacity: 0; } }

body.page-leaving {
  pointer-events: none;
}

body > *:not(#rcsc-nav):not(#rcsc-theme-fab):not(#rcsc-pixelblast-canvas):not(#rcsc-contour-canvas):not(script):not(style) {
  animation: rcsc-fade-in 0.25s ease;
}

body.page-leaving > *:not(#rcsc-nav):not(#rcsc-theme-fab):not(#rcsc-pixelblast-canvas):not(#rcsc-contour-canvas):not(script):not(style) {
  animation: rcsc-fade-out 0.18s ease forwards !important;
}

#rcsc-nav,
#rcsc-theme-fab,
#rcsc-pixelblast-canvas,
#rcsc-contour-canvas {
  animation: none !important;
  opacity: 1 !important;
}
"""
    theme_css += theme_transition_block
    with open(theme_path, "w", encoding="utf-8") as f:
        f.write(theme_css)
    print("Updated theme.css")

# 2. Update each HTML page
for page in PAGES:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    # Replace existing CSS block if present
    css_pattern = r'/\* ── Page Transition.*?body \{ animation: rcsc-fade-in 0\.3s ease; \}'
    if re.search(css_pattern, html, flags=re.DOTALL):
        html = re.sub(css_pattern, NEW_CSS, html, flags=re.DOTALL)
    elif "/* ── Page Transition" not in html:
        # Insert before first </style>
        html = html.replace("</style>", f"\n{NEW_CSS}\n  </style>", 1)

    # Replace or add JS block
    js_pattern = r'<script>\s*// ── Smooth Page Transitions ──.*?</script>'
    if re.search(js_pattern, html, flags=re.DOTALL):
        html = re.sub(js_pattern, NEW_JS, html, flags=re.DOTALL)
    elif "// ── Smooth Page Transitions ──" not in html:
        # Insert before pixel-blast.js script
        if '<script src="pixel-blast.js"></script>' in html:
            html = html.replace(
                '<script src="pixel-blast.js"></script>',
                f"{NEW_JS}\n\n  <script src=\"pixel-blast.js\"></script>"
            )
        else:
            html = html.replace("</body>", f"{NEW_JS}\n</body>")

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated: {page}")

print("All done!")
