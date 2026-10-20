/* Byggesæt: beskeder bygget af afsnit og brikker med valg. Omsættes til motorens beskedmodel (MODEL) og derfra til FreeMarker.
   Kræver MODEL (model.js) og CAT (catalog.js). */
(function (root) {
  'use strict';

  const DAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
  const DATE_FORMATS = [
    ['dd.MM.yyyy', '23.10.2026'],
    ['d. MMMM yyyy', '23. oktober 2026'],
    ["EEEE 'd.' d. MMMM", 'fredag d. 23. oktober'],
    ['dd/MM-yyyy', '23/10-2026']
  ];

  // ---------- beskeder ----------
  // Lister: oplysninger pr. element (relative stier) og om de kan mangle.
  const LOAN_COLS = {
    title: { l: 'Titel', p: 'record.title', pre: { line: '', stack: '' } },
    author: { l: 'Forfatter', p: 'record.author', opt: true, pre: { line: ' af ', stack: '' } },
    due: { l: 'Afleveringsdato', p: 'loan.returnDate', date: true, pre: { line: ' – afleveres ', stack: 'Afleveres senest ' } },
    loan: { l: 'Udlånsdato', p: 'loan.loanDate', date: true, pre: { line: ' – lånt ', stack: 'Lånt ' } },
    no: { l: 'Materialenummer', p: 'material.itemNumber', opt: true, pre: { line: ' (', stack: 'Materialenr. ' }, post: { line: ')', stack: '' } },
    per: { l: 'Periodikanummer', p: 'material.periodicalName', opt: true, pre: { line: ', ', stack: 'Nummer ' } }
  };
  const LOANER_ITEMS = {
    name: { l: 'Navn', lab: 'Navn' },
    address: { l: 'Adresse', lab: 'Adresse' },
    email: { l: 'E-mail', lab: 'E-mail', p: 'email' },
    phone: { l: 'Telefon', lab: 'Telefon', p: 'phoneNumber' },
    number: { l: 'Lånernummer', lab: 'Lånernummer', p: 'loanerNumber' },
    dob: { l: 'Fødselsdato', lab: 'Fødselsdato', p: 'dateOfBirth', date: true },
    branch: { l: 'Filial', lab: 'Filial', p: 'branch.name' }
  };
  const CONTACT_ITEMS = {
    name: { l: 'Navn', lab: '', p: 'name', fix: 'name' },
    address: { l: 'Adresse', lab: '', fix: 'address' },
    phone: { l: 'Telefon', lab: 'Telefon', p: 'phone', fix: 'phone' },
    email: { l: 'E-mail', lab: 'E-mail', p: 'email', fix: 'email' },
    web: { l: 'Hjemmeside', lab: '', p: 'website', fix: 'web' },
    hours: { l: 'Åbningstider', lab: 'Åbningstider', cicero: true },
    note: { l: 'Fri tekst fra opsætningen', lab: '', fix: 'note', fixedOnly: true }
  };

  const MESSAGES = {
    paamind: {
      typeId: '3.27', title: 'Påmindelse før afleveringsfrist', cat: 'Aflevering', desc: 'Sendes et par dage før lånene skal afleveres.',
      list: { path: 'data.materialLoans', as: 'lån', one: 'lånet', many: 'lånene', label: 'Liste med lån', cols: LOAN_COLS },
      personas: [
        { id: 'v1', label: 'Voksen, 1 lån', o: { count: 1 } },
        { id: 'v3', label: 'Voksen, 3 lån', o: { count: 3 } },
        { id: 'b2', label: 'Barn, 2 lån', o: { count: 2, child: true, groups: ['Børn'] }, name: 'Emil Lund' }
      ],
      starter: () => ({
        subject: ['Husk at aflevere ', { c: 'word', one: 'dit lån', many: 'dine lån' }],
        sections: [
          sec('text', { parts: ['Kære ', { c: 'name', first: true, last: true }, ','] }),
          sec('text', { parts: ['Afleveringsfristen nærmer sig for ', { c: 'word', one: 'dette lån', many: 'disse lån' }, ':'] }),
          sec('list', { cols: ['title', 'author', 'due'], layout: 'stack', bullet: '•', date: 2, gap: true }),
          sec('text', { parts: ['Afleverer du for sent, koster det et gebyr.'], who: 'adult' }),
          sec('text', { parts: ['Du kan forny ', { c: 'word', one: 'lånet', many: 'lånene' }, ' på ', { c: 'fixed', key: 'web' }, ', hvis ingen andre venter på ', { c: 'word', one: 'det', many: 'dem' }, '.'] }),
          sec('text', { parts: ['Med venlig hilsen\n', { c: 'lib' }] })
        ]
      })
    },
    myndig: {
      typeId: '3.34', title: 'Låner er ikke længere mindreårig', cat: 'Låner', desc: 'Sendes, når en låner fylder 18 år.',
      personas: [
        { id: 'm1', label: 'Alle oplysninger', o: {}, adult18: true },
        { id: 'm2', label: 'Mangler telefon og e-mail', o: {}, adult18: true, patch: (d) => { delete d.loaner.phoneNumber; delete d.loaner.email; } }
      ],
      starter: () => ({
        subject: ['Tillykke med de 18 år'],
        sections: [
          sec('text', { parts: ['Kære ', { c: 'name', first: true, last: false }, ','] }),
          sec('text', { parts: ['Tillykke med de 18 år. Du står nu selv for dit lånerkort, og vi sender beskeder direkte til dig.'] }),
          sec('text', { parts: ['Vil du tjekke, at vi har de rigtige oplysninger om dig?'] }),
          sec('loaner', { items: ['name', 'address', 'email', 'phone'], labels: true }),
          sec('text', { parts: ['Er noget forkert, kan du rette det på ', { c: 'fixed', key: 'web' }, ' eller kontakte biblioteket.'] }),
          sec('text', { parts: ['Med venlig hilsen\n', { c: 'lib' }] }),
          sec('contact', { source: 'fixed', items: ['address', 'phone', 'email'], labels: true })
        ]
      })
    }
  };

  let uid = 1;
  const nid = () => 'k' + (uid++).toString(36) + Math.random().toString(36).slice(2, 5);
  function sec(kind, o) {
    const s = Object.assign({ id: nid(), kind, who: 'all' }, o || {});
    if (kind === 'list') s.cols = s.cols || ['title', 'due'];
    if (kind === 'contact') s.items = s.items || ['name', 'address', 'phone'];
    if (kind === 'loaner') s.items = s.items || ['name', 'address'];
    return s;
  }
  function newSection(kind) {
    if (kind === 'text') return sec('text', { parts: ['Skriv din tekst her.'] });
    if (kind === 'adult') return sec('text', { parts: ['Tekst, som kun voksne ser.'], who: 'adult' });
    if (kind === 'list') return sec('list', { cols: ['title', 'due'], layout: 'line', bullet: '•', date: 0, gap: false });
    if (kind === 'loaner') return sec('loaner', { items: ['name', 'address', 'email', 'phone'], labels: true });
    if (kind === 'contact') return sec('contact', { source: 'cicero', items: ['name', 'address', 'phone'], labels: true });
    if (kind === 'bye') return sec('text', { parts: ['Med venlig hilsen\n', { c: 'lib' }] });
    return null;
  }

  // ---------- brikker og afsnit -> motorens noder ----------
  const T = (v) => ({ t: 'text', v });
  const F = (path, fb, extra) => Object.assign({ t: 'field', path, fb: fb == null ? '' : fb }, extra || {});
  const X = (code) => ({ t: 'expr', code });
  const IF = (cond, body, els) => ({ t: 'if', branches: [{ cond, body }], else: els || null });
  const HAS = (path) => ({ k: 'has', path });

  function ctxOf(msgDef, type) {
    const P = type.paths;
    const loaner = (P.name || 'data.loaner.name').replace(/\.name$/, '');
    return { P, loaner, list: msgDef.list, type };
  }

  function chipNodes(ch, cx, settings) {
    const L = cx.loaner;
    switch (ch.c) {
      case 'name': {
        const full = L + '.name';
        if (ch.first && ch.last !== false && ch.last) return [F(full, ch.fb == null ? 'låner' : ch.fb)];
        if (ch.first) return [X('((' + full + ')!"' + (ch.fb == null ? 'låner' : ch.fb) + '")?keep_before(" ")')];
        if (ch.last) return [X('((' + full + ')!"")?keep_after_last(" ")')];
        return [F(full, 'låner')];
      }
      case 'word': return cx.list ? [{ t: 'plural', path: cx.list.path, one: ch.one || '', many: ch.many || '' }] : [T(ch.one || '')];
      case 'count': return cx.list ? [X('(' + cx.list.path + '![])?size')] : [];
      case 'lib': return [F('data.agency.name', '')];
      case 'fixed': return [T((settings && settings[ch.key]) || '')];
      case 'field': return [F(ch.path, ch.fb || '', ch.date ? { date: ch.date } : {})];
    }
    return [];
  }

  function partsNodes(parts, cx, settings) {
    const out = [];
    for (const p of parts || []) {
      if (typeof p === 'string') { if (p) out.push(T(p)); } else out.push(...chipNodes(p, cx, settings));
    }
    return out;
  }

  function whoCond(who, cx) {
    if (who === 'adult') return { k: 'age', op: 'atleast', years: 18 };
    if (who === 'child') return { k: 'age', op: 'under', years: 18 };
    return null;
  }

  // afsnittets indhold (uden hvem-betingelse)
  function sectionBody(s, cx, settings) {
    if (s.kind === 'text') return partsNodes(s.parts, cx, settings);
    if (s.kind === 'list') return listNodes(s, cx);
    if (s.kind === 'loaner') return loanerNodes(s, cx);
    if (s.kind === 'contact') return contactNodes(s, cx, settings);
    return [];
  }

  function listNodes(s, cx) {
    const Ld = cx.list; if (!Ld) return [];
    const v = Ld.as;
    const fmt = DATE_FORMATS[s.date || 0][0];
    const body = [];
    if (s.bullet === '1.') body.push(X(v + '?counter'), T('. '));
    else if (s.bullet) body.push(T(s.bullet + ' '));
    const cols = (s.cols || []).filter((k) => Ld.cols[k]);
    cols.forEach((k, j) => {
      const c = Ld.cols[k];
      const path = v + '.' + c.p;
      const val = F(path, '', c.date ? { date: fmt } : {});
      let piece;
      if (j === 0) piece = [val];
      else if (s.layout === 'line') piece = [T(c.pre.line), val].concat(c.post ? [T(c.post.line)] : []);
      else piece = [T('\n   ' + c.pre.stack), val];
      if (j === 0 && c.opt) piece = [IF(HAS(path), piece)];
      else if (c.opt) piece = [IF(HAS(path), piece)];
      body.push(...piece.filter((n) => n.t !== 'text' || n.v));
    });
    body.push(T('\n'));
    if (s.gap) body.push(IF({ k: 'raw', code: v + '?has_next' }, [T('\n')]));
    return [{ t: 'list', path: Ld.path, as: v, body }];
  }

  function line(label, valueNodes, labels, first) {
    const out = [];
    if (!first) out.push(T('\n'));
    if (labels && label) out.push(T(label + ': '));
    return out.concat(valueNodes);
  }
  function orMissing(path, nodes) { return [IF(HAS(path), nodes, [T('ikke oplyst')])]; }

  function loanerNodes(s, cx) {
    const L = cx.loaner;
    const out = [];
    (s.items || []).forEach((k, j) => {
      const it = LOANER_ITEMS[k]; if (!it) return;
      let val;
      if (k === 'name') val = [F(L + '.name', '')];
      else if (k === 'address') {
        val = [IF(HAS(L + '.addressStreet'),
          [IF(HAS(L + '.coName'), [F(L + '.coName', ''), T(', ')]), F(L + '.addressStreet', ''), T(', '), F(L + '.zipCode', ''), T(' '), F(L + '.addressCity', '')],
          [T('ikke oplyst')])];
      } else if (it.date) val = orMissing(L + '.' + it.p, [F(L + '.' + it.p, '', { date: 'd. MMMM yyyy' })]);
      else val = orMissing(L + '.' + it.p, [F(L + '.' + it.p, '')]);
      out.push(...line(it.lab, val, s.labels, out.length === 0));
    });
    return out;
  }

  function contactNodes(s, cx, settings) {
    const out = [];
    const fixed = s.source === 'fixed';
    const B = cx.loaner + '.branch';
    (s.items || []).forEach((k) => {
      const it = CONTACT_ITEMS[k]; if (!it) return;
      if (fixed) {
        if (it.cicero) return;
        const v = (settings && settings[it.fix]) || '';
        if (!v) return;
        out.push(...line(it.lab, [T(v)], s.labels, out.length === 0));
        return;
      }
      if (it.fixedOnly) return;
      let val;
      if (k === 'address') val = [F(B + '.address', ''), T(', '), F(B + '.zipCode', ''), T(' '), F(B + '.city', '')];
      else if (k === 'hours') {
        val = [{ t: 'list', path: B + '.openingHours', as: 'dag', body: [
          T('\n'), X('["' + DAYS.join('","') + '"][dag.day - 1]'), T(': '),
          IF({ k: 'true', path: 'dag.open' }, [F('dag.openHoursStartTime', ''), T('–'), F('dag.openHoursEndTime', '')], [T('Lukket')])
        ] }];
      } else val = [F(B + '.' + it.p, '')];
      out.push(...line(it.lab, val, s.labels, out.length === 0));
    });
    return out;
  }

  // ---------- hele beskeden -> motorens model ----------
  function toModel(doc, msgDef, type, settings, protocol) {
    const cx = ctxOf(msgDef, type);
    const body = [];
    const secs = doc.sections || [];
    secs.forEach((s, i) => {
      let nodes = sectionBody(s, cx, settings);
      const last = i === secs.length - 1;
      const endsNl = s.kind === 'list';
      if (!last) nodes = nodes.concat([T(endsNl ? '\n' : '\n\n')]);
      const c = whoCond(s.who, cx);
      if (c) body.push(IF(c, nodes)); else body.push(...nodes);
    });
    body.push(T('\n'));
    const p = protocol || 'EMAIL';
    return {
      v: 1, typeId: type.id, ftlType: null, protocol: p,
      format: p === 'DIGITAL_POST' ? 'html-frame' : 'text', prelude: [], notes: [],
      variants: [{ id: 'v', cond: null, subject: partsNodes(doc.subject, cx, settings), body: mergeText(body) }]
    };
  }
  function mergeText(nodes) {
    const out = [];
    for (const n of nodes) {
      const last = out[out.length - 1];
      if (n.t === 'text' && last && last.t === 'text') last.v += n.v; else out.push(n);
      if (n.body) n.body = mergeText(n.body);
      if (n.branches) n.branches.forEach((b) => { b.body = mergeText(b.body); });
      if (n.else) n.else = mergeText(n.else);
    }
    return out;
  }
  // et udsnit som selvstændig skabelon (til visning i editoren)
  function snippet(nodes, type) {
    return MODEL.generate({ v: 1, protocol: 'EMAIL', format: 'text', prelude: [], variants: [{ cond: null, subject: [], body: mergeText(JSON.parse(JSON.stringify(nodes))) }] }, type);
  }

  // ---------- testdata ----------
  function personaData(msgDef, type, persona, settings, protocol) {
    const o = Object.assign({ libraryName: (settings && settings.name) || '', protocol: protocol || 'EMAIL' }, persona.o || {});
    const d = CAT.buildData(type, o);
    const ln = d.loaner || d.loanerModel;
    if (persona.name && ln) ln.name = persona.name;
    if (persona.adult18 && ln) { const b = new Date(); b.setFullYear(b.getFullYear() - 18); b.setDate(b.getDate() - 2); ln.dateOfBirth = b; }
    if (persona.patch) persona.patch(d);
    return d;
  }

  const api = { MESSAGES, LOAN_COLS, LOANER_ITEMS, CONTACT_ITEMS, DATE_FORMATS, newSection, sectionBody, chipNodes, partsNodes, whoCond, toModel, snippet, personaData, ctxOf, nid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KIT = api;
})(typeof window !== 'undefined' ? window : globalThis);
