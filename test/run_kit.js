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
console.log(fail ? 'FEJL: ' + fail : 'ALLE OK');
