const fs = require('fs');
global.FTL = require('../src/engine.js');
const CAT = require('../src/catalog.js');
const M = require('../src/model.js');
const cat = CAT.load(JSON.parse(fs.readFileSync(__dirname + '/../build/catalog.min.json', 'utf8')));
const type = cat.byId['3.27'];
console.log('paths', type.paths);
const msg = M.newMessage(type, 'EMAIL');
msg.variants = [
  { id: 'a', cond: { k: 'lang', code: 'en' }, subject: [{ t: 'text', v: 'Reminder' }], body: [{ t: 'text', v: 'Dear ' }, { t: 'field', path: 'data.loaner.name', fb: 'patron' }] },
  { id: 'b', cond: { k: 'all', items: [{ k: 'group', match: 'starts', value: 'Børn', scope: 'name' }, { k: 'age', op: 'under', years: 18 }] }, subject: [{ t: 'text', v: 'Husk dine bøger' }], body: [{ t: 'text', v: 'Hej ' }, { t: 'field', path: 'data.loaner.name', fb: 'låner' }, { t: 'text', v: '\n' }] },
  { id: 'c', cond: null, subject: [{ t: 'text', v: 'Påmindelse om ' }, { t: 'plural', path: 'data.materialLoans', one: 'dit lån', many: 'dine lån' }], body: [
    { t: 'text', v: 'Kære ' }, { t: 'field', path: 'data.loaner.name', fb: 'låner' }, { t: 'text', v: '\n\n' },
    { t: 'list', path: 'data.materialLoans', as: 'lån', body: [
      { t: 'text', v: '- ' }, { t: 'field', path: 'lån.record.title', fb: '', trunc: 30 },
      { t: 'if', branches: [{ cond: { k: 'has', path: 'lån.record.author' }, body: [{ t: 'text', v: ' af ' }, { t: 'field', path: 'lån.record.author', fb: '' }] }], else: null },
      { t: 'text', v: ', afleveres ' }, { t: 'field', path: 'lån.loan.returnDate', fb: '', date: "EEEE 'd.' d. MMMM" }, { t: 'text', v: '\n' } ] },
    { t: 'if', branches: [{ cond: { k: 'not', c: { k: 'group', match: 'starts', value: 'Børn', scope: 'name' } }, body: [{ t: 'text', v: '\nHusk gebyr ved for sen aflevering.\n' }] }], else: null },
    { t: 'text', v: '\nMed venlig hilsen\n' }, { t: 'field', path: 'data.agency.name', fb: '' } ] }
];
msg.prelude = [{ t: 'code', code: '<#setting locale="da_DK">' }];
const gen = M.generate(msg, type);
console.log(gen);
const now = new Date(2026, 9, 10, 12);
for (const o of [{ count: 1 }, { count: 3 }, { lang: 'en' }, { child: true, groups: ['Børn/Børn 0-13'] }, { child: false, groups: ['Børn 14+'] }]) {
  const data = CAT.buildData(type, Object.assign({ now }, o));
  console.log('-----', JSON.stringify(o)); console.log(FTL.render(gen, data));
}
const re = M.importFtl(gen, { ftlTypes: {}, protocol: 'EMAIL' }).msg;
console.log('re-import variants', re.variants.map(v => JSON.stringify(v.cond)));
console.log('stable', M.generate(Object.assign(re, { ftlType: null }), type) === gen);
