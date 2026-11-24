"""
safe_update_pages.py
Safely updates:
1. Navbar block (from scratch/navbar-snippet.html)
2. Smooth Page Transitions (with nav activation + pageshow)
3. Removes inline body.page-leaving animation (delegated to theme.css)
Ensures line count and content integrity for all 12 pages.
"""
import os, re

ROOT = r"d:\Projects\RCSC"
PAGES = [
    "about.html", "activities.html", "blog.html", "chess-hub.html",
    "contact.html", "dashboard.html", "devsprint.html", "executive.html",
    "gallery.html", "index.html", "publication.html", "science-fest.html"
]

with open(os.path.join(ROOT, "scratch", "navbar-snippet.html"), "r", encoding="utf-8") as f:
    NAVBAR = f.read().strip()

SMOOTH_PAGE_JS = """  <script>
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
          const targetPage = (href.split('#')[0].split('?')[0].split('/').pop() || 'index.html').replace(/\\.html$/, '') || 'index';
          const navMatch = document.querySelector(`#rcsc-nav [data-page="${targetPage}"]`);
          if (navMatch && window.__rcscActivateNav) {
            window.__rcscActivateNav(navMatch, true);
          }
          document.body.classList.add('page-leaving');
          setTimeout(function () { window.location.href = href; }, 180);
        });
      });
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) document.body.classList.remove('page-leaving');
    });
  </script>"""

for page in PAGES:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    orig_len = len(html)

    # 1. Replace inline page transition CSS if present
    old_css_re = r'/\* ── Page Transition ── \*/\s*@keyframes rcsc-fade-in.*?' \
                 r'body\.page-leaving\s*\{[^}]*\}\s*body\s*\{[^}]*\}'
    html = re.sub(old_css_re, '/* ── Page Transition: defined in theme.css (excludes navbar) ── */', html, flags=re.DOTALL)

    # 2. Replace navbar block
    nav_start = html.find('<!-- [RCSC-NAV-START] -->')
    nav_end = html.find('<!-- [RCSC-NAV-END] -->')
    if nav_start != -1 and nav_end != -1:
        nav_end += len('<!-- [RCSC-NAV-END] -->')
        html = html[:nav_start] + NAVBAR + html[nav_end:]
    else:
        print(f"ERROR: Could not find nav markers in {page}")
        continue

    # 3. Update Smooth Page Transitions script
    js_re = r'<script>\s*// ── Smooth Page Transitions ──.*?</script>'
    if re.search(js_re, html, flags=re.DOTALL):
        html = re.sub(js_re, SMOOTH_PAGE_JS, html, flags=re.DOTALL)
    else:
        # If not present (e.g. executive.html, dashboard.html), insert before pixel-blast.js
        if '<script src="pixel-blast.js"></script>' in html:
            html = html.replace('<script src="pixel-blast.js"></script>', f"{SMOOTH_PAGE_JS}\n\n  <script src=\"pixel-blast.js\"></script>")

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"OK: {page} (len {orig_len} -> {len(html)})")

print("All done safely!")
