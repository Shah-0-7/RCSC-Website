import re

for p in ['index.html', 'about.html', 'executive.html']:
    txt = open('d:/Projects/RCSC/' + p, encoding='utf-8').read()
    # Check if any static HTML tag inside navbar has n-active
    nav_m = re.search(r'<nav id="rcsc-nav".*?</nav>', txt, re.DOTALL)
    if nav_m:
        matches = re.findall(r'<[^>]+class=[\'"][^\'"]*n-active[^\'"]*[\'"][^>]*>', nav_m.group(0))
        print(p, 'Static n-active elements:', len(matches), matches)
