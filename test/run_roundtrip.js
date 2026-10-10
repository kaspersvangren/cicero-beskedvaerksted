const fs = require('fs');
global.FTL = require('../src/engine.js');
const CAT = require('../src/catalog.js');
const MODEL = require('../src/model.js');
const cat = CAT.load(JSON.parse(fs.readFileSync(__dirname + '/../build/catalog.min.json', 'utf8')));
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.ftl')).sort();
const now = new Date(2026, 9, 10, 12);
const norm = (s) => s.replace(/^\s+/, '').replace(/^([^\n]*?)[ \t]+\n/, '$1\n').replace(/\s+$/, '');
const variants = [];
for (const count of [1, 2, 3]) for (const lang of ['da', 'en', 'sv', 'nb']) for (const child of [false, true]) for (const periodical of [false, true])
  variants.push({ count, lang, child, periodical, groups: child ? ['Børn/Børn 0-13'] : ['Voksne'] });
let fails = 0;
const show = process.argv[2];
for (const f of files) {
  const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
  const { msg, warnings } = MODEL.importFtl(src, { ftlTypes: CAT.KNOWN_FTL_TYPES });
  const type = cat.byId[msg.typeId];
  const gen = MODEL.generate(msg, type);
  const gen2 = MODEL.generate(MODEL.importFtl(gen, { ftlTypes: CAT.KNOWN_FTL_TYPES, protocol: msg.protocol }).msg, type);
  let bad = 0;
  for (const o of variants) {
    const data = CAT.buildData(type, Object.assign({ now }, o));
    let a, b;
    try { a = norm(FTL.render(src, data)); } catch (e) { a = 'ERR ' + e.message; }
    try { b = norm(FTL.render(gen, data)); } catch (e) { b = 'ERR ' + e.message; }
    if (a !== b) { bad++; if (bad === 1) { console.log('--- MISMATCH', f, JSON.stringify(o)); console.log(JSON.stringify(a)); console.log(JSON.stringify(b)); } }
  }
  const stable = gen === gen2;
  console.log(f, 'type', msg.typeId, 'prot', msg.protocol, 'format', msg.format, 'variants', msg.variants.length, 'mismatches', bad, '/', variants.length, 'stable', stable, 'notes', msg.notes);
  if (!stable) { console.log('GEN1:\n' + gen + '\nGEN2:\n' + gen2); }
  if (show && f.includes(show)) { console.log(JSON.stringify(msg, null, 1)); console.log('=== GENERATED ===\n' + gen); }
  fails += bad + (stable ? 0 : 1);
}
console.log(fails ? 'FAIL ' + fails : 'ALL OK');
