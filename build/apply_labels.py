# Lægger egne feltnavne (labels.py) ind i catalog.min.json og fjerner eksempelværdier.
# Kataloget indeholder derefter kun: beskedtyper, protokoller, Ciceros nøglenavne og feltstier + egne navne.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from labels import label
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'catalog.min.json')
c = json.load(open(P, encoding='utf-8'))
strings = ['']; idx = {'': 0}
def S(s):
    if s not in idx: idx[s] = len(strings); strings.append(s)
    return idx[s]
missing = set()
for t in c['types']:
    rows = t['r']
    for r in rows:
        parent = rows[r[0]][1] if r[0] >= 0 else 'data'
        lab = label(r[1], parent)
        if not lab:
            missing.add(parent + '>' + r[1]); lab = r[1]
        r[2] = S(lab)
        r[3] = 0
    t['o'] = [[o[0], o[1], ''] for o in t.get('o', [])]
c['s'] = strings
json.dump(c, open(P, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(os.path.getsize(P), 'bytes,', len(strings), 'navne')
if missing: print('MANGLER:', sorted(missing))
