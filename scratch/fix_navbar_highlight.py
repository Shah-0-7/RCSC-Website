"""
fix_navbar_highlight.py
Fixes the issue where clicking another page in the navbar causes the highlight
to return to the previous page before shifting again.
"""
import os, re

ROOT = r"d:\Projects\RCSC"
SNIPPET_PATH = os.path.join(ROOT, "scratch", "navbar-snippet.html")

with open(SNIPPET_PATH, "r", encoding="utf-8") as f:
    snippet = f.read()

# 1. Update CSS: ensure .n-pill starts with opacity: 0
old_pill_css = """  #rcsc-nav .n-pill {
    position: absolute; top: 4px; left: 0; height: calc(100% - 8px);
    background: rgba(255,255,255,0.14); border-radius: 9999px;
    pointer-events: none;
    transition: transform 0.42s cubic-bezier(0.16,1,0.3,1),
                width   0.42s cubic-bezier(0.16,1,0.3,1);
    will-change: transform, width;
  }"""

new_pill_css = """  #rcsc-nav .n-pill {
    position: absolute; top: 4px; left: 0; height: calc(100% - 8px);
    background: rgba(255,255,255,0.14); border-radius: 9999px;
    pointer-events: none;
    opacity: 0;
    transition: transform 0.38s cubic-bezier(0.16,1,0.3,1),
                width   0.38s cubic-bezier(0.16,1,0.3,1),
                opacity 0.15s ease;
    will-change: transform, width, opacity;
  }"""

snippet = snippet.replace(old_pill_css, new_pill_css)

# Also mobile pill
old_mobile_pill = """    /* Pill: flush inside the links area */
    #rcsc-nav .n-pill {
      top: 1px;
      height: calc(100% - 2px);
      background: rgba(255,255,255,0.15);
    }"""

new_mobile_pill = """    /* Pill: flush inside the links area */
    #rcsc-nav .n-pill {
      top: 1px;
      height: calc(100% - 2px);
      background: rgba(255,255,255,0.15);
      opacity: 0;
    }"""

snippet = snippet.replace(old_mobile_pill, new_mobile_pill)

# 2. Update JS in navbar-snippet
old_js_section = re.search(r'/\* ── Sliding pill ──.*?window\.addEventListener\(\'resize\', function\(\) \{\s*if \(topActive\) movePill\(topActive, true\);\s*\}\);\s*\}', snippet, re.DOTALL)

new_js_section = """/* ── Sliding pill & Active state ─────────────────────────────────────── */
  const topLinks = document.getElementById('n-links');
  const topPill  = document.getElementById('n-pill');
  let topActive  = null;
  let isNavigating = false;

  function movePill(el, instant) {
    if (!el || !topPill || !topLinks) return;
    const lRect = topLinks.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const left  = eRect.left - lRect.left;
    if (instant) {
      topPill.style.transition = 'none';
      topPill.style.transform  = 'translateX(' + left + 'px)';
      topPill.style.width      = eRect.width + 'px';
      topPill.style.opacity    = '1';
      topPill.getBoundingClientRect(); /* force reflow */
      topPill.style.transition = '';
    } else {
      topPill.style.transform = 'translateX(' + left + 'px)';
      topPill.style.width     = eRect.width + 'px';
      topPill.style.opacity   = '1';
    }
  }

  function activateNav(targetEl, animate) {
    if (!targetEl) return;
    isNavigating = true; /* Permanently lock so hover/mouseleave cannot revert */

    /* Find corresponding topLink if target is from dropdown or menu */
    let topLink = targetEl;
    const pageKey = targetEl.dataset.page;
    if (topLinks && !topLink.classList.contains('n-link') && pageKey) {
      topLink = topLinks.querySelector(`.n-link[data-page="${pageKey}"]`) || targetEl;
    }

    /* Remove n-active from all items */
    if (topLinks) {
      topLinks.querySelectorAll('.n-link').forEach(l => l.classList.remove('n-active'));
    }
    const menuBtn  = document.getElementById('n-menu-btn');
    const menuDrop = document.getElementById('n-menu-dropdown');
    if (menuBtn) menuBtn.classList.remove('n-active');
    if (menuDrop) menuDrop.querySelectorAll('a').forEach(a => a.classList.remove('n-active'));

    /* Apply active class */
    targetEl.classList.add('n-active');
    if (topLink !== targetEl) topLink.classList.add('n-active');

    /* Update topActive reference */
    topActive = topLinks ? topLinks.querySelector('.n-link.n-active') : null;

    /* Hamburger-specific items (About / Blog) */
    if (pageKey === 'about' || pageKey === 'blog') {
      if (menuBtn) menuBtn.classList.add('n-active');
      if (topPill) {
        topPill.style.width   = '0';
        topPill.style.opacity = '0';
      }
      return;
    }

    /* Move pill to target link immediately and stay there */
    if (topActive && topPill) {
      movePill(topActive, !animate);
    }
  }

  /* Expose globally for page-level scripts */
  window.__rcscActivateNav = activateNav;

  if (topLinks && topPill) {
    topLinks.querySelectorAll('[data-page]').forEach(el => {
      if (matchesPage(el.dataset.page)) el.classList.add('n-active');
    });

    topActive = topLinks.querySelector('.n-active');

    if (topActive) {
      /* Position synchronously on load before paint */
      var isMobile = window.innerWidth <= 767;
      if (isMobile) {
        topLinks.querySelectorAll('.n-text').forEach(function(t) {
          t.style.transition = 'none';
        });
        topLinks.getBoundingClientRect();
      }
      movePill(topActive, true);
      if (isMobile) {
        setTimeout(function() {
          topLinks.querySelectorAll('.n-text').forEach(function(t) {
            t.style.transition = '';
          });
        }, 50);
      }
    } else {
      topPill.style.width   = '0';
      topPill.style.opacity = '0';
    }

    /* Desktop: hover slides the pill (only while not navigating) */
    topLinks.querySelectorAll('.n-link').forEach(function(link) {
      link.addEventListener('mouseenter', function() {
        if (isNavigating) return;
        if (window.innerWidth >= 768) movePill(link, false);
      });
    });
    topLinks.addEventListener('mouseleave', function() {
      if (isNavigating) return;
      if (window.innerWidth >= 768) {
        if (topActive) movePill(topActive, false);
        else { topPill.style.width = '0'; topPill.style.opacity = '0'; }
      }
    });

    window.addEventListener('resize', function() {
      if (topActive) movePill(topActive, true);
    });
  }

  /* Attach click listeners to all navbar links to activate immediately */
  document.querySelectorAll('#rcsc-nav a[href], #rcsc-nav button.n-link').forEach(function(el) {
    el.addEventListener('click', function() {
      if (el.tagName === 'BUTTON' && el.nextElementSibling && el.nextElementSibling.classList.contains('n-dropdown')) {
        return;
      }
      activateNav(el, true);
    });
  });"""

if old_js_section:
    snippet = snippet.replace(old_js_section.group(0), new_js_section)
    print("Replaced JS section in navbar snippet")
else:
    print("WARNING: Could not find old_js_section in navbar snippet")

with open(SNIPPET_PATH, "w", encoding="utf-8") as f:
    f.write(snippet)

print("navbar-snippet.html written.")
