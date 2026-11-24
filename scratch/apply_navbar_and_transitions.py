"""
apply_navbar_and_transitions.py
Applies the updated navbar snippet and smooth page transitions to all 12 pages.
"""
import os, re

ROOT = r"d:\Projects\RCSC"
PAGES = [
    "about.html","activities.html","blog.html","chess-hub.html",
    "contact.html","dashboard.html","devsprint.html","executive.html",
    "gallery.html","index.html","publication.html","science-fest.html"
]

with open(os.path.join(ROOT, "scratch", "navbar-snippet.html"), "r", encoding="utf-8") as f:
    NAVBAR = f.read().strip()

SMOOTH_PAGE_JS = """    // ── Smooth Page Transitions ──
    document.addEventListener('DOMContentLoaded', function () {
      document.querySelectorAll('a[href]').forEach(function (link) {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('http') ||
            href.startsWith('mailto') || href.startsWith('tel') ||
            href.startsWith('javascript:') || link.target === '_blank' ||
            href.endsWith('.pdf')) return;
        link.addEventListener('click', function (e) {
          e.preventDefault();
          const targetPage = (href.split('#')[0].split('?')[0].split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
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
    });"""

for page in PAGES:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Replace navbar block
    html = re.sub(
        r'<!-- \[RCSC-NAV-START\] -->.*?<!-- \[RCSC-NAV-END\] -->',
        NAVBAR,
        html,
        flags=re.DOTALL
    )

    # 2. Update Smooth Page Transitions script
    js_pattern = r'// ── Smooth Page Transitions ──.*?(?=window\.addEventListener\(\'pageshow\'|document\.addEventListener\(\'DOMContentLoaded\'|function \(\) \{|\</script\>).*?document\.body\.classList\.remove\(\'page-leaving\'\);\s*\}\);'
    if re.search(js_pattern, html, flags=re.DOTALL):
        html = re.sub(js_pattern, SMOOTH_PAGE_JS, html, flags=re.DOTALL)
    else:
        # try replacing older js pattern
        old_pattern = r'// ── Smooth Page Transitions ──.*?(?=</script>)'
        html = re.sub(old_pattern, SMOOTH_PAGE_JS + "\n  ", html, flags=re.DOTALL)

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated: {page}")

print("All 12 pages updated successfully.")
