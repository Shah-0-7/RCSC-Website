import re, glob

with open(r'd:\Projects\RCSC\scratch\navbar-snippet.html', encoding='utf-8') as f:
    new_nav = f.read()

files = [f for f in glob.glob(r'd:\Projects\RCSC\*.html') if 'contour-lines-demo' not in f]

IIFE_END_MARKER = '})();\n</script>'
IIFE_END_MARKER2 = '})();</script>'

for path in files:
    with open(path, encoding='utf-8') as f:
        c = f.read()

    body_m = re.search(r'<body[^>]*>', c)
    if not body_m:
        print(f'No body tag: {path}')
        continue

    body_end = body_m.end()

    if '<!-- [RCSC-NAV-START] -->' in c:
        # Already has new marker — replace between markers
        c2 = re.sub(
            r'\n<!-- \[RCSC-NAV-START\] -->[\s\S]*?<!-- \[RCSC-NAV-END\] -->',
            '\n' + new_nav,
            c
        )
    else:
        # Old format — find end of navbar IIFE script
        iife_end = c.find(IIFE_END_MARKER, body_end)
        if iife_end != -1:
            iife_end += len(IIFE_END_MARKER)
        else:
            iife_end = c.find(IIFE_END_MARKER2, body_end)
            if iife_end != -1:
                iife_end += len(IIFE_END_MARKER2)

        if iife_end == -1:
            print(f'No IIFE end found: {path}')
            continue

        c2 = c[:body_end] + '\n' + new_nav + c[iife_end:]

    with open(path, 'w', encoding='utf-8') as f:
        f.write(c2)
    print(f'Done: {path.split(chr(92))[-1]}')

print('All pages updated.')
