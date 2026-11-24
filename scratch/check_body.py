import glob, re

for f in sorted(glob.glob('d:/Projects/RCSC/*.html')):
    if 'demo' in f: continue
    text = open(f, encoding='utf-8').read()
    m = re.search(r'<body[^>]*>(.*?)</body>', text, re.DOTALL)
    if not m:
        print("NO BODY:", f)
        continue
    body_content = m.group(1)
    # Find all top-level elements by checking standard tags
    top_tags = re.findall(r'\n  ?<([a-zA-Z0-9]+)([^>]*)>', body_content)
    tag_summaries = []
    for tag, attrs in top_tags:
        id_m = re.search(r'id=[\'"]([^\'"]+)', attrs)
        cls_m = re.search(r'class=[\'"]([^\'"]+)', attrs)
        t_id = ('#' + id_m.group(1)) if id_m else ''
        t_cls = ('.' + cls_m.group(1).split()[0]) if cls_m else ''
        tag_summaries.append(f"{tag}{t_id}{t_cls}")
    print(f.split('\\')[-1], tag_summaries[:15])
