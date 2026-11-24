import os, re
ROOT = r'd:\Projects\RCSC'
PAGES = ['index.html','about.html','activities.html','blog.html','chess-hub.html','contact.html','dashboard.html','devsprint.html','executive.html','gallery.html','publication.html','science-fest.html']
OLD = r'PixelBlast\.mountFixed\s*\(\s*\{[^}]*\}\s*\)'
NEW = "PixelBlast.mountFixed({ color: 'auto', cellSize: 6, coverage: 1.0, density: 0.52, speed: 0.7, interactive: true })"
for page in PAGES:
    path = os.path.join(ROOT, page)
    with open(path, 'r', encoding='utf-8') as f: html = f.read()
    new_html = re.sub(OLD, NEW, html)
    if new_html != html:
        with open(path, 'w', encoding='utf-8') as f: f.write(new_html)
        print('UPDATED:', page)
print('Done.')
