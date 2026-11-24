# Test selector against index.html
with open('d:/Projects/RCSC/index.html', encoding='utf-8') as f:
    html = f.read()

# Let's check where the nav starts and ends in index.html
nav_start = html.find('<!-- [RCSC-NAV-START] -->')
nav_end = html.find('<!-- [RCSC-NAV-END] -->')
print("Nav start index:", nav_start, "Nav end index:", nav_end)
print("Length of nav block:", nav_end - nav_start)
