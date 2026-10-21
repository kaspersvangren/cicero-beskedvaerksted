const fs = require('fs');
global.FTL = require('../src/engine.js');
global.CAT = require('../src/catalog.js');
global.MODEL = require('../src/model.js');
const KIT = require('../src/kit.js');
const cat = CAT.load(JSON.parse(fs.readFileSync(__dirname + '/../build/catalog.min.json', 'utf8')));
const settings = { name: 'Bøgevang Bibliotekerne', address: 'Biblioteksvej 1, 4321 Bøgevang', phone: '70 00 00 00', email: 'bibliotek@example.dk', web: 'bibliotek.example.dk', note: '' };
let fail = 0;
for (const [id, m] of Object.entries(KIT.MESSAGES)) {
  const type = cat.byId[m.typeId];
  const doc = m.starter();
  // ekstra: prøv alle moduler og valg
  const extra = JSON.parse(JSON.stringify(doc));
  extra.sections.push(KIT.newSection('contact'), Object.assign(KIT.newSection('contact'), { items: ['name', 'address', 'phone', 'email', 'web', 'hours'] }), KIT.newSection('loaner'), KIT.newSection('adult'));
  if (m.list) extra.sections.push(Object.assign(KIT.newSection('list'), { cols: ['title', 'author', 'due', 'loan', 'no', 'per'], bullet: '1.', layout: 'line' }));
  extra.sections[0].parts = ['Hej ', { c: 'name', first: false, last: true }, ' / ', { c: 'name', first: true }, ' / ', { c: 'count' }];
  for (const [label, d] of [['start', doc], ['alle moduler', extra]]) {
    for (const prot of ['EMAIL', 'DIGITAL_POST']) {
      const code = MODEL.generate(KIT.toModel(d, m, type, settings, prot), type);
      for (const p of m.personas) {
        const data = KIT.personaData(m, type, p, settings, prot);
        try {
          const out = FTL.render(code, data);
          if (label === 'start' && prot === 'EMAIL') { console.log('=====', id, p.label); console.log(out); }
        } catch (e) { fail++; console.log('FEJL', id, label, prot, p.label, e.message, 'linje', e.line); console.log(code.split('\n').slice(Math.max(0, e.line - 3), e.line + 2).join('\n')); }
      }
      // stabil ved genindlæsning
      const re = MODEL.importFtl(code, { ftlTypes: {}, protocol: prot }).msg;
      const code2 = MODEL.generate(re, type);
      for (const p of m.personas) {
        const data = KIT.personaData(m, type, p, settings, prot);
        const a = FTL.render(code, data).trim(), b = FTL.render(code2, data).trim();
        if (a !== b) { fail++; console.log('GENINDLÆSNING AFVIGER', id, label, prot, p.label); }
      }
    }
  }
  if (id === 'paamind') { console.log('----- KODE (påmindelse) -----'); console.log(MODEL.generate(KIT.toModel(doc, m, type, settings, 'EMAIL'), type)); }
}
// børnelåner-regler: alle kombinationer af opsætning og data
{
  const m = KIT.MESSAGES.paamind, type = cat.byId[m.typeId];
  const rules = [
    ['alder', { age: true, group: false }],
    ['gruppe', { age: false, group: true, groups: 'Børn, Ung' }],
    ['alder først', { age: true, group: true, groups: 'Børn', mode: 'agefirst' }],
    ['én er nok', { age: true, group: true, groups: 'Børn', mode: 'any' }],
    ['begge', { age: true, group: true, groups: 'Børn', mode: 'all' }]
  ];
  const cases = [ // [navn, barn-alder?, fødselsdato?, børnegruppe?]
    ['barn med gruppe', true, true, 'børn 9b'], ['barn uden gruppe', true, true, '9b'], ['voksen', false, true, 'Voksne'],
    ['voksen i børnegruppe', false, true, 'Børn'], ['ingen fødselsdato, børnegruppe', false, false, 'Ung 13-17'], ['ingen fødselsdato, voksengruppe', false, false, 'Voksne'], ['ingen grupper', true, true, null]
  ];
  for (const [rn, r] of rules) {
    const st = Object.assign({}, settings, { child: r });
    const rule = KIT.childRule(st);
    for (const [cn, young, hasDob, grp] of cases) {
      const d = KIT.personaData(m, type, m.personas[0], st, 'EMAIL', { child: young, count: 1 });
      if (!hasDob) delete d.loaner.dateOfBirth;
      d.loaner.loanerGroups = grp ? [{ loanerGroupName: grp, loanerGroupNameWithHierarchyPath: grp, loanerGroupNameWithRoot: grp }] : [];
      const A = hasDob && young;
      const G = !!grp && rule.names.some((n) => grp.toLowerCase().startsWith(n.toLowerCase()));
      const want = !rule.group ? A : !rule.age ? G : rule.mode === 'any' ? A || G : rule.mode === 'all' ? A && G : (hasDob ? A : G);
      const got = KIT.isChild(m, type, d, st);
      if (got !== want) { fail++; console.log('BØRNEREGEL FORKERT', rn, cn, 'fik', got, 'ventede', want); }
      // hele beskeden: gebyr-sætningen (kun voksne) skal følge reglen
      const code = MODEL.generate(KIT.toModel(m.starter(), m, type, st, 'EMAIL'), type);
      const out = FTL.render(code, d);
      if (/gebyr/.test(out) === want) { fail++; console.log('GEBYR-SÆTNING FORKERT', rn, cn); }
      const code2 = MODEL.generate(MODEL.importFtl(code, { ftlTypes: {}, protocol: 'EMAIL' }).msg, type);
      if (FTL.render(code2, d) !== out) { fail++; console.log('GENINDLÆSNING AFVIGER (regel)', rn, cn); }
    }
  }
  console.log('----- kode for "alder først" -----');
  console.log(MODEL.generate(KIT.toModel(m.starter(), m, type, Object.assign({}, settings, { child: rules[2][1] }), 'EMAIL'), type).split('\n').slice(0, 6).join('\n'));
  console.log('----- Cicero-testdata (uddrag) -----');
  const cd = KIT.ciceroData(KIT.personaData(m, type, m.personas[2], settings, 'EMAIL', { count: 2, periodical: [1] }));
  console.log(cd.split('\n').filter((l) => /dateOfBirth|loanerGroupName=|materialLoans\[1\]\.(record\.title|material\.periodical)|returnDate|^data\.loaner\.name/.test(l)).join('\n'));
  console.log(cd.split('\n').length, 'linjer');
}
console.log(fail ? 'FEJL: ' + fail : 'ALLE OK');
