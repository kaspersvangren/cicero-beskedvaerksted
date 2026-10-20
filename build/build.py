# Bygger Beskedværkstedet: index.html (v0.3, byggesæt) og v2/index.html (avanceret editor).
import os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(R, p), encoding='utf-8').read()
cat = rd('build/catalog.min.json')

def page(title, fonts, css, scripts):
    js = '\n'.join(rd('src/' + f) for f in scripts[:-1])
    body = f'''<title>{title}</title>
{fonts}
<style>
{css}
</style>
<div class="wrap" id="app"><p style="padding:24px 0">Indlæser …</p></div>
<script>window.CATALOG_RAW = {cat};</script>
<script>
{js}
</script>
<script>
{rd('src/' + scripts[-1])}
</script>
'''
    full = '<!doctype html>\n<html lang="da">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + body.replace('<div class="wrap"', '</head>\n<body>\n<div class="wrap"', 1) + '</body>\n</html>\n'
    return body, full

os.makedirs(os.path.join(R, 'dist'), exist_ok=True)
os.makedirs(os.path.join(R, 'v2'), exist_ok=True)
f3 = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;600&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap">'
b3, full3 = page('Beskedværkstedet', f3, rd('src/v3.css'), ['engine.js', 'catalog.js', 'model.js', 'kit.js', 'v3.js'])
open(os.path.join(R, 'index.html'), 'w', encoding='utf-8').write(full3)
open(os.path.join(R, 'dist/artifact.html'), 'w', encoding='utf-8').write(b3)
f2 = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,600;1,400&display=swap">'
b2, full2 = page('Beskedværkstedet v0.2', f2, rd('src/app.css'), ['engine.js', 'catalog.js', 'model.js', 'app.js'])
open(os.path.join(R, 'v2/index.html'), 'w', encoding='utf-8').write(full2)
print('ok', len(full3.encode()), 'og', len(full2.encode()), 'bytes')
