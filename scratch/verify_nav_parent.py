import glob, re

for f in sorted(glob.glob('d:/Projects/RCSC/*.html')):
    if 'demo' in f: continue
    txt = open(f, encoding='utf-8').read()
    m = re.search(r'<body[^>]*>(.*?)<nav id=[\"\']rcsc-nav', txt, re.DOTALL)
    if m:
        before = m.group(1)
        tags_opened = re.findall(r'<([a-zA-Z0-9]+)[^/>]*>', before)
        tags_closed = re.findall(r'</([a-zA-Z0-9]+)>', before)
        # Filter out script and style
        tags_opened = [t for t in tags_opened if t not in ['script', 'style']]
        tags_closed = [t for t in tags_closed if t not in ['script', 'style']]
        diff = len(tags_opened) - len(tags_closed)
        print(f.split('\\')[-1], "Diff unclosed before rcsc-nav:", diff)
    else:
        print(f.split('\\')[-1], "rcsc-nav not found")
