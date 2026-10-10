import json, os, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(R, p), encoding='utf-8').read()
cat = rd('build/catalog.min.json')
css = rd('src/app.css')
js = '\n'.join(rd('src/' + f) for f in ['engine.js', 'catalog.js', 'model.js'])
app = rd('src/app.js')
fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,600;1,400&display=swap">'
body = f'''<title>Beskedværkstedet</title>
{fonts}
<style>
{css}
</style>
<div class="wrap" id="app"><p style="padding:24px 0">Indlæser editoren …</p></div>
<script>window.CATALOG_RAW = {cat};</script>
<script>
{js}
</script>
<script>
{app}
</script>
'''
os.makedirs(os.path.join(R, 'dist'), exist_ok=True)
open(os.path.join(R, 'dist/artifact.html'), 'w', encoding='utf-8').write(body)
full = '<!doctype html>\n<html lang="da">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + body.replace('<div class="wrap"', '</head>\n<body>\n<div class="wrap"', 1) + '</body>\n</html>\n'
open(os.path.join(R, 'index.html'), 'w', encoding='utf-8').write(full)
print('ok', len(body.encode()), 'bytes')
