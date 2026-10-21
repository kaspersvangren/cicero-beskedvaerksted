/* Beskedværkstedet v0.4 – byggesæt med motoren under. Kræver FTL, CAT, MODEL, KIT og window.CATALOG_RAW. */
(function () {
  'use strict';
  const VERSION = 'v0.4';
  const CATALOG = CAT.load(window.CATALOG_RAW);
  const STORE = 'beskedvaerksted.v3';
  const WHO = { all: 'Alle', adult: 'Kun voksne', child: 'Kun børn' };
  const SETTINGS_FIELDS = [['name', 'Bibliotekets navn', 'Fx Gladsaxe Bibliotekerne'], ['address', 'Adresse', 'Fx Søborg Hovedgade 220, 2860 Søborg'], ['phone', 'Telefon', 'Fx 39 57 00 00'], ['email', 'E-mail', 'Fx bibliotek@kommune.dk'], ['web', 'Hjemmeside', 'Fx bibliotek.dk'], ['note', 'Fri tekst, fx åbningstider', 'Fx Åbent alle dage 7–22']];

  // ---------- tilstand ----------
  const defaults = () => ({ settings: { name: '', address: '', phone: '', email: '', web: '', note: '', child: Object.assign({}, KIT.CHILD_DEFAULT) }, docs: {}, protocol: 'EMAIL', persona: {}, msgId: null });
  let S = defaults();
  try { const raw = localStorage.getItem(STORE); if (raw) { const d = JSON.parse(raw); S = Object.assign(defaults(), d); S.settings = Object.assign(defaults().settings, d.settings || {}); S.settings.child = Object.assign({}, KIT.CHILD_DEFAULT, S.settings.child || {}); } } catch (e) { /* ingen lagring */ }
  let view = S.msgId ? 'work' : 'choose';
  let sel = null; // { sec } eller { sec, part } eller { subject: true, part }
  let undoStack = [];
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* ingen lagring */ } }, 250); };
  const M = () => KIT.MESSAGES[S.msgId];
  const T = () => CATALOG.byId[M().typeId];
  const doc = () => { if (!S.docs[S.msgId]) S.docs[S.msgId] = M().starter(); return S.docs[S.msgId]; };
  const persona = () => { const ps = M().personas; return ps.find((p) => p.id === S.persona[S.msgId]) || ps[ps.length > 1 ? 1 : 0]; };
  const settings = () => Object.assign({}, S.settings, { name: S.settings.name || '' });
  function snapshot() { undoStack.push(JSON.stringify(S.docs)); if (undoStack.length > 60) undoStack.shift(); }
  function undo() { const s = undoStack.pop(); if (!s) return; S.docs = JSON.parse(s); sel = null; save(); render(); }

  // ---------- hjælpere ----------
  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    if (a) for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v; else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const I = {
    mail: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M3 5.5l7 5 7-5"/></svg>',
    text: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h12M4 9h12M4 13h8"/></svg>',
    list: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 5h10M7 10h10M7 15h10"/><circle cx="3.5" cy="5" r="1" fill="currentColor"/><circle cx="3.5" cy="10" r="1" fill="currentColor"/><circle cx="3.5" cy="15" r="1" fill="currentColor"/></svg>',
    pin: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17s5-4.6 5-9a5 5 0 0 0-10 0c0 4.4 5 9 5 9z"/><circle cx="10" cy="8" r="1.8"/></svg>',
    card: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="4.5" width="15" height="11" rx="2"/><circle cx="7" cy="9.5" r="1.8"/><path d="M4.8 13.2c.5-1.2 1.3-1.7 2.2-1.7s1.7.5 2.2 1.7M11.5 8.5h4M11.5 11h3"/></svg>',
    wave: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12c2-4 4 4 6 0s4 4 6 0"/></svg>',
    who: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="7" r="3"/><path d="M4 17c1-3.5 3.5-5 6-5s5 1.5 6 5"/></svg>',
    gear: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></svg>',
    copy: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="6" width="11" height="11" rx="2"/><path d="M3.5 13V4.5a1 1 0 0 1 1-1H13"/></svg>',
    plus: '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4v12M4 10h12"/></svg>'
  };
  const ic = (k) => h('span', { html: I[k], style: 'display:inline-flex' });
  const toast = (s) => { const t = h('div', { class: 'toast', role: 'status' }, s); document.body.append(t); setTimeout(() => t.remove(), 2600); };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------- motor: værdier og synlighed ----------
  let DATA = null;
  function data() { if (!DATA) DATA = KIT.personaData(M(), T(), persona(), settings(), S.protocol); return DATA; }
  function renderNodes(nodes) {
    try { return { out: FTL.render(KIT.snippet(nodes, T()), data()) }; } catch (e) { return { err: e }; }
  }
  const cx = () => KIT.ctxOf(M(), T());
  function chipValue(p) { const r = renderNodes(KIT.chipNodes(p, cx(), settings())); return r.err ? '⚠' : r.out; }
  let CHILD = null;
  function isChildNow() { if (CHILD == null) { try { CHILD = KIT.isChild(M(), T(), data(), settings()); } catch (e) { CHILD = false; } } return CHILD; }
  function isVisible(s) {
    if (s.who === 'adult') return !isChildNow();
    if (s.who === 'child') return isChildNow();
    return true;
  }
  function chipLabel(p) {
    switch (p.c) {
      case 'name': return p.first && p.last ? 'Lånerens navn' : p.first ? 'Lånerens fornavn' : 'Lånerens efternavn';
      case 'word': return 'Ord efter antal: ' + p.one + ' / ' + p.many;
      case 'count': return 'Antal ' + (M().list ? M().list.many : '');
      case 'lib': return 'Bibliotekets navn (fra Cicero)';
      case 'fixed': return (SETTINGS_FIELDS.find((f) => f[0] === p.key) || [, p.key])[1] + ' (fra opsætningen)';
      case 'field': { const f = T().byPath[p.path]; return f ? f.desc : p.path; }
    }
    return '';
  }

  // ---------- render ----------
  const app = document.getElementById('app');
  function render() {
    closePop();
    DATA = null; CHILD = null;
    app.replaceChildren(top(), view === 'choose' ? choose() : work());
  }
  function top() {
    return h('header', { class: 'top' },
      h('div', { class: 'logo' }, h('div', { class: 'mark', html: I.mail }), h('div', null, h('h1', null, 'Beskedværkstedet', h('span', { class: 'ver' }, VERSION)), h('small', null, 'Beskeder til Cicero uden kode'))),
      h('span', { class: 'sp' }),
      view === 'work' ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Sendes som' },
        [['EMAIL', 'E-mail'], ['DIGITAL_POST', 'Digital Post']].map(([k, l]) => h('button', { 'aria-pressed': String(S.protocol === k), onclick: () => { S.protocol = k; save(); render(); } }, l))) : null,
      view === 'work' ? h('button', { class: 'btn ghost', onclick: undo, disabled: !undoStack.length, title: 'Fortryd seneste ændring af afsnit' }, 'Fortryd') : null,
      h('button', { class: 'btn', onclick: openSettings }, ic('gear'), 'Opsætning'),
      view === 'work' ? h('button', { class: 'btn primary', onclick: copyDialog }, ic('copy'), 'Kopiér til Cicero') : null);
  }
  function choose() {
    const ready = Object.entries(KIT.MESSAGES);
    const soon = [['Reservation', 'Klar til afhentning'], ['Reservation', 'Afhentningsfrist udløber snart'], ['Aflevering', 'Første hjemkaldelse'], ['Låner', 'Velkommen som låner'], ['Mellemværende', 'Rykker']];
    return h('section', { class: 'choose' }, h('h2', null, 'Hvilken besked vil du tilpasse?'),
      h('p', { class: 'l' }, 'Du starter med en færdig besked. Ret teksten, tilføj eller fjern afsnit, og se hele tiden, hvordan den ser ud for forskellige lånere.'),
      h('div', { class: 'cards' },
        ready.map(([id, m]) => h('button', { class: 'mcard', onclick: () => { S.msgId = id; view = 'work'; sel = null; undoStack = []; save(); render(); } },
          h('span', { class: 'cat' }, m.cat), h('h3', null, m.title), h('p', null, m.desc))),
        soon.map(([c, t]) => h('div', { class: 'mcard soon' }, h('span', { class: 'cat' }, c), h('h3', null, t), h('span', { class: 'badge' }, 'Kommer senere')))),
      h('p', { class: 'later' }, 'Andre beskeder kan indtil videre laves i ', h('a', { href: 'v2/' }, 'den avancerede editor (v0.2)'), ', som også kan læse eksisterende skabeloner ind.'));
  }
  function work() {
    return h('div', { class: 'work' },
      h('div', { class: 'titlerow' }, h('button', { class: 'back', onclick: () => { view = 'choose'; sel = null; render(); } }, '← Alle beskeder'), h('h2', null, M().title)),
      h('div', null,
        h('div', { class: 'viewas' }, 'Vis beskeden, som den ser ud for', h('div', { class: 'seg', role: 'group' },
          M().personas.map((p) => h('button', { 'aria-pressed': String(persona().id === p.id), title: p.sub || null, onclick: () => { S.persona[S.msgId] = p.id; save(); render(); } }, p.label))),
          h('button', { class: 'btn ghost small', onclick: testDataDialog, title: 'Lav testdata, så du kan se beskeden for et barn, med flere lån osv. i Ciceros forhåndsvisning' }, 'Testdata til Cicero')),
        mail()),
      h('aside', { class: 'side' }, sidePanel()));
  }

  // ---------- mailen ----------
  function mail() {
    const d = doc();
    const p = persona();
    const name = (data().loaner || {}).name || '';
    const subj = h('div', { class: 'subject', contenteditable: 'true', 'aria-label': 'Emne', spellcheck: 'true' });
    fillParts(subj, d.subject, { subject: true });
    wireText(subj, d, 'subject', true);
    const body = h('div', { class: 'mbody' });
    body.append(gap(0));
    d.sections.forEach((s, i) => body.append(section(s, i), gap(i + 1)));
    // slip hvor som helst i mailen
    const nearest = (y) => { let best = 0, bd = Infinity; body.querySelectorAll('.gap').forEach((g, k) => { const r = g.getBoundingClientRect(); const dd = Math.abs(r.top + r.height / 2 - y); if (dd < bd) { bd = dd; best = k; } }); return best; };
    const mark = (k) => body.querySelectorAll('.gap').forEach((g, j) => g.classList.toggle('over', j === k));
    body.addEventListener('dragover', (e) => { if (!dragKind) return; e.preventDefault(); mark(nearest(e.clientY)); });
    body.addEventListener('dragleave', (e) => { if (!body.contains(e.relatedTarget)) mark(-1); });
    body.addEventListener('drop', (e) => {
      if (!dragKind) return;
      e.preventDefault(); const idx = nearest(e.clientY); mark(-1); document.body.classList.remove('dragging');
      const k = dragKind; dragKind = null;
      if (k.move) { const from = d.sections.findIndex((x) => x.id === k.move); if (from < 0) return; snapshot(); const [x] = d.sections.splice(from, 1); d.sections.splice(from < idx ? idx - 1 : idx, 0, x); save(); render(); return; }
      insertSection(k.kind, idx);
    });
    // fejl i den samlede skabelon?
    let err = null;
    try { FTL.render(code(), data()); } catch (e2) { err = e2; }
    return h('article', { class: 'mail' },
      h('div', { class: 'mhead' }, h('div', { class: 'meta' }, h('span', { class: 'av' }, initials(S.settings.name || 'Biblioteket')), (S.settings.name || 'Biblioteket'), ' → ', name || p.label), subj),
      err ? h('div', { class: 'errbar' }, h('b', null, 'Cicero vil ikke kunne bruge skabelonen: '), err.message) : null,
      body);
  }
  const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  let dragKind = null;
  function section(s, i) {
    const d = doc();
    const vis = isVisible(s);
    const isSel = sel && sel.sec === s.id;
    const el = h('div', { class: 'sec' + (isSel ? ' sel' : '') + (vis ? '' : ' hidden'), 'data-id': s.id });
    if (s.who !== 'all') el.append(h('span', { class: 'tag' }, WHO[s.who] + (vis ? '' : ' · skjult her')));
    el.append(h('div', { class: 'bar' },
      h('button', { class: 'grip', draggable: 'true', title: 'Træk for at flytte', ondragstart: (e) => { dragKind = { move: s.id }; e.dataTransfer.setData('text/plain', 'flyt'); el.classList.add('dragging'); document.body.classList.add('dragging'); }, ondragend: () => { dragKind = null; el.classList.remove('dragging'); document.body.classList.remove('dragging'); } }, '⠿ Flyt'),
      h('button', { title: 'Flyt op', 'aria-label': 'Flyt op', onclick: () => move(i, -1) }, '↑'),
      h('button', { title: 'Flyt ned', 'aria-label': 'Flyt ned', onclick: () => move(i, 1) }, '↓'),
      h('button', { onclick: () => { sel = { sec: s.id }; render(); } }, ic('who'), WHO[s.who]),
      s.kind !== 'text' ? h('button', { onclick: () => { sel = { sec: s.id }; render(); } }, ic('gear'), 'Indstil') : null,
      h('button', { title: 'Fjern afsnittet', 'aria-label': 'Fjern', onclick: () => { snapshot(); d.sections.splice(i, 1); if (isSel) sel = null; save(); render(); toast('Afsnittet er fjernet. Fortryd øverst, hvis det var en fejl.'); } }, '✕')));
    if (s.kind === 'text') {
      const tx = h('div', { class: 'content', contenteditable: 'true', spellcheck: 'true', 'aria-label': 'Tekstafsnit' });
      fillParts(tx, s.parts, { sec: s.id });
      wireText(tx, s, 'parts', false);
      tx.addEventListener('focus', () => { if (!sel || sel.sec !== s.id || sel.part) { sel = { sec: s.id }; refreshSide(); markSel(); } });
      el.append(tx);
    } else {
      const r = renderNodes(KIT.sectionBody(s, cx(), settings()));
      const label = { list: [I.list, M().list ? M().list.label : 'Liste'], loaner: [I.card, 'Lånerens oplysninger'], contact: [I.pin, 'Kontaktoplysninger · ' + (s.source === 'fixed' ? 'fra opsætningen' : 'fra Cicero')] }[s.kind] || [I.text, ''];
      const empty = !r.err && !r.out.trim();
      el.append(h('div', { class: 'mod', onclick: () => { sel = { sec: s.id }; render(); } },
        h('div', { class: 'mlabel' }, h('span', { html: label[0], style: 'display:inline-flex' }), label[1], ' · klik for at indstille'),
        h('div', { class: 'content' }, r.err ? '⚠ ' + r.err.message : empty ? (s.kind === 'contact' && s.source === 'fixed' ? 'Udfyld bibliotekets oplysninger under Opsætning.' : '(intet valgt)') : r.out.replace(/\n$/, ''))));
    }
    return el;
  }
  function markSel() { document.querySelectorAll('.sec').forEach((x) => x.classList.toggle('sel', !!sel && x.dataset.id === sel.sec)); document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', !!sel && sel.part === c._p)); }
  function move(i, dlt) {
    const d = doc(); const j = i + dlt; if (j < 0 || j >= d.sections.length) return;
    snapshot(); [d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]]; save(); render();
  }
  function gap(idx) { return h('div', { class: 'gap' }, h('button', { onclick: (e) => addMenu(e.currentTarget, idx) }, '+ Tilføj her')); }
  function insertSection(kind, idx) {
    const s = KIT.newSection(kind); if (!s) return;
    snapshot(); doc().sections.splice(idx, 0, s); sel = s.kind === 'text' ? null : { sec: s.id }; save(); render();
    if (s.kind === 'text') { const el = document.querySelector('[data-id="' + s.id + '"] .content'); if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); const g = getSelection(); g.removeAllRanges(); g.addRange(r); } }
  }

  // ---------- tekst med brikker ----------
  function fillParts(el, parts, where) {
    parts.forEach((p, k) => {
      if (typeof p === 'string') { el.append(where.subject ? p.replace(/\n/g, ' ') : p); return; }
      if (k === 0 || typeof parts[k - 1] !== 'string') el.append('​');
      el.append(chipEl(p, where));
      if (k === parts.length - 1 || typeof parts[k + 1] !== 'string') el.append('​');
    });
    if (!parts.length) el.append('');
  }
  function chipEl(p, where) {
    const v = chipValue(p);
    const c = h('span', { class: 'chip' + (p.c === 'word' ? ' word' : '') + (v ? '' : ' empty') + (sel && sel.part === p ? ' sel' : ''), contenteditable: 'false', title: chipLabel(p) + ' – klik for at indstille' }, v || '‹' + chipLabel(p) + ' – tom›');
    c._p = p;
    c.addEventListener('mousedown', (e) => e.preventDefault());
    c.addEventListener('click', (e) => { e.stopPropagation(); sel = Object.assign({ part: p }, where); refreshSide(); markSel(); });
    return c;
  }
  function readParts(el) {
    const out = []; let buf = '';
    const walk = (node) => node.childNodes.forEach((n) => {
      if (n.nodeType === 3) buf += n.nodeValue.replace(/​/g, '');
      else if (n._p) { if (buf) out.push(buf); buf = ''; out.push(n._p); }
      else if (n.tagName === 'BR') { if (!n.dataset.end) buf += '\n'; }
      else if (n.tagName === 'DIV' || n.tagName === 'P') { if (buf || out.length) buf += '\n'; walk(n); }
      else walk(n);
    });
    walk(el);
    if (buf) out.push(buf);
    return out;
  }
  let lastText = null;
  function rememberCaret(el, obj, key) { const g = getSelection(); lastText = { el, obj, key, range: g.rangeCount && el.contains(g.getRangeAt(0).startContainer) ? g.getRangeAt(0).cloneRange() : null }; }
  function wireText(el, obj, key, single) {
    el.addEventListener('input', () => { obj[key] = readParts(el); save(); });
    el.addEventListener('focus', () => rememberCaret(el, obj, key));
    el.addEventListener('keyup', () => rememberCaret(el, obj, key));
    el.addEventListener('mouseup', () => rememberCaret(el, obj, key));
    el.addEventListener('blur', () => { obj[key] = readParts(el); save(); });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); if (single) return;
      insertAtCaret(document.createTextNode('\n'));
      if (!el.lastChild || el.lastChild.nodeType !== 1 || el.lastChild.tagName !== 'BR') { const b = document.createElement('br'); b.dataset.end = '1'; el.append(b); }
      obj[key] = readParts(el); save();
    });
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      let t = e.clipboardData.getData('text/plain') || '';
      if (single) t = t.replace(/\s*\n\s*/g, ' ');
      insertAtCaret(document.createTextNode(t)); obj[key] = readParts(el); save();
    });
    el.addEventListener('drop', (e) => { if (!dragKind) e.preventDefault(); });
  }
  function insertAtCaret(node) {
    const g = getSelection(); if (!g.rangeCount) return;
    const r = g.getRangeAt(0); r.deleteContents(); r.insertNode(node); r.setStartAfter(node); r.collapse(true); g.removeAllRanges(); g.addRange(r);
  }
  function insertChip(p) {
    if (!lastText || !document.body.contains(lastText.el)) { toast('Klik først i teksten, der hvor feltet skal stå'); return; }
    const { el, obj, key } = lastText;
    const span = h('span'); span._p = p;
    if (lastText.range) lastText.range.insertNode(span); else el.append(span);
    obj[key] = readParts(el);
    sel = { part: p, sec: el.closest('.sec') ? el.closest('.sec').dataset.id : null, subject: !el.closest('.sec') };
    save(); render();
  }

  // ---------- menuer ----------
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside); } }
  function outside(e) { if (pop && !pop.contains(e.target)) closePop(); }
  function place(el, anchor) {
    const r = anchor.getBoundingClientRect();
    document.body.append(el);
    const w = el.offsetWidth, hh = el.offsetHeight;
    el.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
    el.style.top = (r.bottom + 6 + hh > innerHeight ? Math.max(12, r.top - hh - 6) : r.bottom + 6) + 'px';
    pop = el; setTimeout(() => document.addEventListener('mousedown', outside), 0);
  }
  function quickFields() {
    const L = M().list;
    const f = [
      [{ c: 'name', first: true, last: true }, 'Lånerens navn'],
      [{ c: 'name', first: true, last: false }, 'Lånerens fornavn'],
      [{ c: 'lib' }, 'Bibliotekets navn'],
      [{ c: 'fixed', key: 'web' }, 'Hjemmeside (opsætning)'],
      [{ c: 'fixed', key: 'phone' }, 'Telefon (opsætning)']
    ];
    if (L) f.push([{ c: 'count' }, 'Antal ' + L.many]);
    return f;
  }
  function fieldMenu(anchor) {
    closePop();
    const L = M().list;
    const el = h('div', { class: 'pop', role: 'menu' },
      h('div', { class: 'h' }, 'Indsæt felt'),
      quickFields().map(([p, l]) => h('button', { onclick: () => { closePop(); insertChip(clone(p)); } }, l, h('small', null, chipValue(p)))),
      L ? [h('div', { class: 'h' }, 'Ord, der følger antallet'),
        [['dit lån', 'dine lån'], [L.one, L.many], ['det', 'dem']].map(([a, b]) => h('button', { onclick: () => { closePop(); insertChip({ c: 'word', one: a, many: b }); } }, a + ' / ' + b))] : null,
      h('div', { class: 'h' }, 'Alt andet'),
      h('button', { onclick: () => { closePop(); allFields(); } }, 'Flere felter …', h('small', null, 'søg i alle')));
    place(el, anchor);
  }
  function allFields() {
    const t = T();
    const inList = (f) => { for (let p = f.parent; p; p = p.parent) if (p.isList) return true; return false; };
    const fields = t.fields.filter((f) => !f.isObj && !f.isList && !inList(f));
    modal('Alle felter i "' + M().title + '"', (b, close) => {
      const q = h('input', { class: 'search', type: 'search', placeholder: 'Søg, fx "filial", "telefon", "fødselsdato"', 'aria-label': 'Søg' });
      const list = h('div', { class: 'flist' });
      const draw = () => {
        const s = q.value.trim().toLowerCase();
        list.replaceChildren(...fields.filter((f) => !s || (f.desc + ' ' + f.path).toLowerCase().includes(s)).slice(0, 200).map((f) => {
          const p = { c: 'field', path: f.path, fb: '' }; if (f.isDate) p.date = 'd. MMMM yyyy';
          return h('button', { onclick: () => { close(); insertChip(p); } }, f.desc, h('small', null, chipValue(p) || '(tom i eksemplet)'));
        }));
      };
      q.addEventListener('input', draw); draw();
      b.append(h('p', { style: 'margin:0;color:var(--muted)' }, 'Alle oplysninger, Cicero sender med denne besked. Feltet sættes ind, hvor markøren stod.'), q, list);
      setTimeout(() => q.focus(), 30);
    }, true);
  }
  function addMenu(anchor, idx) {
    closePop();
    const el = h('div', { class: 'pop', role: 'menu' }, h('div', { class: 'h' }, 'Tilføj afsnit'),
      addKinds().map(([k, , , , t]) => h('button', { onclick: () => { closePop(); insertSection(k, idx); } }, t)));
    place(el, anchor);
  }
  function addKinds() {
    const k = [['text', 'muted-soft', 'ink', 'text', 'Tekst', 'Et afsnit, du selv skriver']];
    if (M().list) k.push(['list', 'mod-soft', 'mod', 'list', M().list.label, 'Vælg selv, hvad der vises']);
    k.push(['adult', 'who-soft', 'who', 'who', 'Tekst kun til voksne', 'Fx om gebyrer'],
      ['loaner', 'field-soft', 'field', 'card', 'Lånerens oplysninger', 'Navn, adresse, e-mail, telefon …'],
      ['contact', 'accent-soft', 'accent', 'pin', 'Kontaktoplysninger', 'Fra filialen i Cicero eller opsætningen'],
      ['bye', 'muted-soft', 'ink', 'wave', 'Hilsen', 'Med venlig hilsen og bibliotekets navn']);
    return k;
  }

  // ---------- højre side ----------
  function refreshSide() { const s = document.querySelector('.side'); if (s) s.replaceChildren(...[].concat(sidePanel()).filter(Boolean)); }
  function sidePanel() {
    if (sel && sel.part) return chipPanel();
    if (sel && sel.sec) { const s = doc().sections.find((x) => x.id === sel.sec); if (s) return s.kind === 'text' ? textPanel(s) : modPanel(s); }
    return addPanel();
  }
  function closeBtn() { return h('button', { class: 'btn ghost small', onclick: () => { sel = null; render(); } }, 'Luk'); }
  function addPanel() {
    const item = ([kind, sw, col, icon, title, sub]) => h('div', { class: 'add', draggable: 'true', tabindex: '0', role: 'button', title: 'Træk ind i mailen, eller tryk Enter for at lægge det nederst',
      ondragstart: (e) => { dragKind = { kind }; e.dataTransfer.setData('text/plain', kind); document.body.classList.add('dragging'); },
      ondragend: () => { dragKind = null; document.body.classList.remove('dragging'); },
      onkeydown: (e) => { if (e.key === 'Enter') insertSection(kind, doc().sections.length); } },
      h('span', { class: 'sw', style: 'background:var(--' + sw + ');color:var(--' + col + ')' }, ic(icon)), h('span', null, h('b', null, title), h('small', null, sub)));
    const empty = !SETTINGS_FIELDS.some(([k]) => S.settings[k]);
    return [
      empty ? h('div', { class: 'note warn' }, h('b', null, 'Første gang? '), 'Udfyld bibliotekets navn, hjemmeside, telefon osv. én gang, så bruges de i alle beskeder. ', h('button', { class: 'btn small', style: 'margin-top:6px', onclick: openSettings }, ic('gear'), 'Udfyld opsætning')) : null,
      h('div', { class: 'panel' }, h('h3', null, 'Tilføj til beskeden'), h('p', { class: 'sub' }, 'Træk et afsnit ind i mailen, eller hold musen mellem to afsnit og klik "+ Tilføj her".'),
        h('div', { class: 'adds' }, addKinds().map(item))),
      h('div', { class: 'panel' }, h('h3', null, 'Felter i teksten'), h('p', { class: 'sub' }, 'Klik i teksten, hvor feltet skal stå, og vælg så her.'),
        h('button', { class: 'btn small', onclick: (e) => fieldMenu(e.currentTarget) }, ic('plus'), 'Indsæt felt')),
      h('div', { class: 'note' }, 'De blå ord er felter, og de grønne skifter mellem ental og flertal. De viser eksempler, så du kan se, hvordan beskeden bliver. Klik på dem for at indstille dem.')
    ];
  }
  function whoQ(s) {
    return h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvem skal se afsnittet?'),
      h('div', { class: 'pills' }, Object.entries(WHO).map(([k, l]) => h('button', { class: 'pill', 'aria-pressed': String(s.who === k), onclick: () => { snapshot(); s.who = k; save(); render(); } }, l))),
      h('span', { class: 'hint' }, KIT.childRuleText(settings()), ' ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); openSettings(); } }, 'Ret i Opsætning')));
  }
  function textPanel(s) {
    return [h('div', { class: 'panel' }, h('h3', null, ic('text'), 'Tekstafsnit', h('span', { class: 'sp' }), closeBtn()),
      h('div', { class: 'q' }, h('span', { class: 'l' }, 'Felt i teksten'), h('button', { class: 'btn small', onclick: (e) => fieldMenu(e.currentTarget) }, ic('plus'), 'Indsæt felt ved markøren')),
      whoQ(s))];
  }
  function checklist(all, selected, onChange, color) {
    const box = h('div', { class: 'cols' });
    const order = selected.filter((k) => all[k]).concat(Object.keys(all).filter((k) => !selected.includes(k)));
    order.forEach((k) => {
      const on = selected.includes(k);
      const i = selected.indexOf(k);
      const row = h('div', { class: 'col' + (on ? ' on' : ''), draggable: on ? 'true' : null },
        h('span', { class: 'grip', title: on ? 'Træk for at ændre rækkefølgen' : '' }, on ? '⠿' : ''),
        h('label', null, h('input', { type: 'checkbox', checked: on, onchange: (e) => { const nx = e.target.checked ? selected.concat(k) : selected.filter((x) => x !== k); onChange(nx); } }), all[k].l),
        on ? h('button', { class: 'mv', 'aria-label': 'Flyt op', onclick: () => { if (i > 0) { const nx = selected.slice(); [nx[i - 1], nx[i]] = [nx[i], nx[i - 1]]; onChange(nx); } } }, '↑') : null,
        on ? h('button', { class: 'mv', 'aria-label': 'Flyt ned', onclick: () => { if (i < selected.length - 1) { const nx = selected.slice(); [nx[i + 1], nx[i]] = [nx[i], nx[i + 1]]; onChange(nx); } } }, '↓') : null);
      if (on) {
        row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'col:' + k); });
        row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop'); });
        row.addEventListener('dragleave', () => row.classList.remove('drop'));
        row.addEventListener('drop', (e) => {
          e.preventDefault(); row.classList.remove('drop');
          const m = /^col:(\w+)$/.exec(e.dataTransfer.getData('text/plain')); if (!m || m[1] === k) return;
          const nx = selected.filter((x) => x !== m[1]); nx.splice(nx.indexOf(k), 0, m[1]); onChange(nx);
        });
      }
      box.append(row);
    });
    return box;
  }
  function pills(opts, cur, set) { return h('div', { class: 'pills' }, opts.map(([k, l]) => h('button', { class: 'pill', 'aria-pressed': String(cur === k), onclick: () => set(k) }, l))); }
  function modPanel(s) {
    const upd = (fn) => { snapshot(); fn(); save(); render(); };
    const out = [];
    if (s.kind === 'list') {
      const L = M().list;
      out.push(h('h3', null, ic('list'), L.label, h('span', { class: 'sp' }), closeBtn()), h('p', { class: 'sub' }, 'Vises én gang for hvert af ' + L.many + ' i beskeden.'),
        h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvad skal vises for hvert lån?'), checklist(L.cols, s.cols, (nx) => upd(() => { s.cols = nx; })), h('span', { class: 'hint' }, 'Sæt flueben, og træk eller brug pilene for at ændre rækkefølgen. Felter, der kan mangle (fx forfatter), springes over, når de er tomme.')),
        h('div', { class: 'q' }, h('span', { class: 'l' }, 'Opstilling'), pills([['stack', 'Hver oplysning på sin linje'], ['line', 'Alt på én linje']], s.layout, (k) => upd(() => { s.layout = k; }))),
        h('div', { class: 'q' }, h('span', { class: 'l' }, 'Tegn foran hvert lån'), pills([['•', '•'], ['–', '–'], ['1.', '1. 2. 3.'], ['', 'Intet']], s.bullet, (k) => upd(() => { s.bullet = k; }))),
        s.cols.some((k) => L.cols[k] && L.cols[k].date) ? h('div', { class: 'q' }, h('span', { class: 'l' }, 'Datoer skrives som'), pills(KIT.DATE_FORMATS.map(([f], k) => [k, FTL.formatDate(new Date(2026, 9, 23), f, 'da')]), s.date || 0, (k) => upd(() => { s.date = k; }))) : null,
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!s.gap, onchange: (e) => upd(() => { s.gap = e.target.checked; }) }), 'Tom linje mellem lånene'));
    } else if (s.kind === 'loaner') {
      out.push(h('h3', null, ic('card'), 'Lånerens oplysninger', h('span', { class: 'sp' }), closeBtn()), h('p', { class: 'sub' }, 'Det, Cicero har registreret om låneren. Mangler en oplysning, står der "ikke oplyst".'),
        h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvad skal med?'), checklist(KIT.LOANER_ITEMS, s.items, (nx) => upd(() => { s.items = nx; })), h('span', { class: 'hint' }, 'Adressen tager c/o-navn, vej, postnummer og by med.')),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!s.labels, onchange: (e) => upd(() => { s.labels = e.target.checked; }) }), 'Skriv overskrifter foran, fx "E-mail:"'));
    } else if (s.kind === 'contact') {
      const items = Object.fromEntries(Object.entries(KIT.CONTACT_ITEMS).filter(([, v]) => s.source === 'fixed' ? !v.cicero : !v.fixedOnly));
      const missing = s.source === 'fixed' && !SETTINGS_FIELDS.some(([k]) => S.settings[k]);
      out.push(h('h3', null, ic('pin'), 'Kontaktoplysninger', h('span', { class: 'sp' }), closeBtn()),
        h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvor kommer oplysningerne fra?'),
          pills([['cicero', 'Lånerens filial (fra Cicero)'], ['fixed', 'Bibliotekets faste (opsætningen)']], s.source, (k) => upd(() => { s.source = k; s.items = s.items.filter((x) => k === 'fixed' ? !KIT.CONTACT_ITEMS[x].cicero : !KIT.CONTACT_ITEMS[x].fixedOnly); })),
          h('span', { class: 'hint' }, s.source === 'fixed' ? 'Den samme tekst til alle lånere. Udfyldes én gang under Opsætning.' : 'Passer automatisk til den filial, låneren hører til. Kommer fra Cicero.')),
        missing ? h('div', { class: 'note warn' }, 'Opsætningen er tom. ', h('button', { class: 'btn small', onclick: openSettings }, 'Udfyld opsætning')) : null,
        h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvad skal med?'), checklist(items, s.items.filter((k) => items[k]), (nx) => upd(() => { s.items = nx; }))),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!s.labels, onchange: (e) => upd(() => { s.labels = e.target.checked; }) }), 'Skriv overskrifter foran, fx "Telefon:"'));
    }
    out.push(whoQ(s));
    out.push(h('details', { class: 'adv' }, h('summary', null, 'Avanceret: se koden for afsnittet'), h('pre', null, KIT.snippet(KIT.sectionBody(s, cx(), settings()), T()).trim())));
    return [h('div', { class: 'panel' }, out)];
  }
  function chipPanel() {
    const p = sel.part;
    const upd = () => { save(); render(); };
    const out = [h('h3', null, p.c === 'word' ? 'Ord efter antal' : 'Felt', h('span', { class: 'sp' }), closeBtn()), h('p', { class: 'sub' }, chipLabel(p))];
    if (p.c === 'name') {
      out.push(h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvad af navnet skal med?'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!p.first, onchange: (e) => { p.first = e.target.checked; if (!p.first && !p.last) p.last = true; upd(); } }), 'Fornavn'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!p.last, onchange: (e) => { p.last = e.target.checked; if (!p.first && !p.last) p.first = true; upd(); } }), 'Efternavn'),
        h('span', { class: 'hint' }, 'Cicero sender hele navnet. Fornavn er det første ord, efternavn det sidste. Mellemnavne og dobbelte efternavne kommer kun med, når begge er valgt.')),
        p.first ? h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvis navnet mangler, skriv'), h('input', { type: 'text', value: p.fb == null ? 'låner' : p.fb, onchange: (e) => { p.fb = e.target.value; upd(); } })) : null);
    } else if (p.c === 'word') {
      out.push(h('div', { class: 'q' }, h('span', { class: 'l' }, 'Når der er ét'), h('input', { type: 'text', value: p.one, onchange: (e) => { p.one = e.target.value; upd(); } })),
        h('div', { class: 'q' }, h('span', { class: 'l' }, 'Når der er flere'), h('input', { type: 'text', value: p.many, onchange: (e) => { p.many = e.target.value; upd(); } })),
        h('span', { class: 'hint' }, 'Skift mellem "Voksen, 1 lån" og "Voksen, 3 lån" øverst for at se begge.'));
    } else if (p.c === 'fixed') {
      out.push(h('div', { class: 'note' }, 'Værdien kommer fra opsætningen: "', S.settings[p.key] || '(tom)', '".'), h('button', { class: 'btn small', onclick: openSettings }, 'Ret opsætningen'));
    } else if (p.c === 'field') {
      const f = T().byPath[p.path];
      out.push(h('div', { class: 'q' }, h('span', { class: 'l' }, 'Hvis feltet er tomt, skriv'), h('input', { type: 'text', value: p.fb || '', placeholder: 'ingenting', onchange: (e) => { p.fb = e.target.value; upd(); } })));
      if (f && f.isDate) out.push(h('div', { class: 'q' }, h('span', { class: 'l' }, 'Datoen skrives som'), pills(KIT.DATE_FORMATS.map(([fm]) => [fm, FTL.formatDate(new Date(2026, 9, 23), fm, 'da')]), p.date, (k) => { p.date = k; upd(); })));
    } else if (p.c === 'lib') {
      out.push(h('div', { class: 'note' }, 'Navnet kommer fra Cicero, så det altid passer. Vil du have adresse eller telefon med, så tilføj afsnittet "Kontaktoplysninger".'));
    } else if (p.c === 'count') {
      out.push(h('div', { class: 'note' }, 'Skriver antallet som tal, fx "3".'));
    }
    out.push(h('button', { class: 'btn small', onclick: () => removeChip(p) }, 'Fjern feltet'));
    return [h('div', { class: 'panel' }, out)];
  }
  function removeChip(p) {
    const d = doc();
    snapshot();
    const i = d.subject.indexOf(p); if (i >= 0) d.subject.splice(i, 1);
    d.sections.forEach((s) => { if (s.parts) { const j = s.parts.indexOf(p); if (j >= 0) s.parts.splice(j, 1); } });
    sel = null; save(); render();
  }

  // ---------- kode, opsætning, kopiering ----------
  function code() { return MODEL.generate(KIT.toModel(doc(), M(), T(), settings(), S.protocol), T()); }
  function modal(title, build, wide) {
    const bg = h('div', { class: 'modal-bg' });
    const close = () => { bg.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title }, h('h3', null, title));
    let downOnBg = false;
    bg.addEventListener('mousedown', (e) => { downOnBg = e.target === bg && e.clientX < bg.clientWidth; });
    bg.addEventListener('click', (e) => { if (downOnBg && e.target === bg) close(); downOnBg = false; });
    document.addEventListener('keydown', esc);
    build(box, close);
    bg.append(box); document.body.append(bg);
    return close;
  }
  function openSettings() {
    modal('Opsætning', (b, close) => {
      b.append(h('p', { style: 'margin:0;color:var(--muted)' }, 'Bibliotekets faste oplysninger. De bruges i "Kontaktoplysninger" og i felter som hjemmeside og telefon. De gemmes kun i denne browser.'));
      const grid = h('div', { class: 'grid2' });
      SETTINGS_FIELDS.forEach(([k, l, ph]) => grid.append(h('label', { class: 'q' }, h('span', { class: 'l' }, l), h('input', { type: 'text', value: S.settings[k] || '', placeholder: ph, oninput: (e) => { S.settings[k] = e.target.value; save(); } }))));
      const kids = h('div', { class: 'childset' });
      const drawKids = () => kids.replaceChildren(...childSettings(drawKids).filter(Boolean));
      drawKids();
      b.append(grid, kids, h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { close(); render(); } }, 'Færdig')));
    });
  }
  function childSettings(redraw) {
    const c = S.settings.child;
    const set = (k, v) => { c[k] = v; if (!c.age && !c.group) c[k === 'age' ? 'group' : 'age'] = true; save(); redraw(); };
    const both = c.age && c.group;
    return [
      h('h4', null, 'Hvem er børnelånere?'),
      h('p', { class: 'sub' }, 'Bruges i afsnit, der kun skal ses af børn eller kun af voksne. Alle, der ikke er børn, regnes som voksne, også hvis oplysningen mangler.'),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!c.age, onchange: (e) => set('age', e.target.checked) }), 'Alder: under 18 år, ud fra fødselsdatoen'),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!c.group, onchange: (e) => set('group', e.target.checked) }), 'Lånergruppe: navnet starter med …'),
      c.group ? h('label', { class: 'q indent' }, h('input', { type: 'text', value: c.groups || '', placeholder: 'Fx Børn', oninput: (e) => { c.groups = e.target.value; save(); hintEl.textContent = KIT.childRuleText(settings()); } }),
        h('span', { class: 'hint' }, 'Skriv begyndelsen af gruppens navn, som det hedder i Cicero. Flere navne adskilles med komma, fx "Børn, Skole". Store og små bogstaver er ligegyldige.')) : null,
      both ? h('div', { class: 'q' }, h('span', { class: 'l' }, 'Når begge er valgt'),
        h('div', { class: 'radios' }, Object.entries(KIT.CHILD_MODES).map(([k, [l, d]]) => h('label', { class: 'radio' + (c.mode === k ? ' on' : '') },
          h('input', { type: 'radio', name: 'childmode', checked: c.mode === k, onchange: () => set('mode', k) }), h('span', null, h('b', null, l), h('small', null, d)))))) : null,
      (hintEl = h('div', { class: 'note' }, KIT.childRuleText(settings())))
    ];
  }
  let hintEl = null;

  // ---------- testdata til Cicero ----------
  function testDataDialog() {
    const p = persona();
    const po = p.o || {};
    const st = { child: !!po.child, count: po.count || 2, per: Array.isArray(po.periodical), noPhone: p.id === 'm2', noDob: false };
    const hasList = !!M().list;
    modal('Testdata til Cicero', (b, close) => {
      const body = h('div', { style: 'display:grid;gap:14px' });
      let txt = '';
      const draw = () => {
        const extra = { child: st.child, noPhone: st.noPhone, noDob: st.noDob };
        if (hasList) { extra.count = st.count; extra.periodical = st.per ? [Math.min(1, st.count - 1)] : false; }
        const d = KIT.personaData(M(), T(), { o: {}, adult18: !!p.adult18 }, settings(), S.protocol, extra);
        txt = KIT.ciceroData(d);
        let kid = false; try { kid = KIT.isChild(M(), T(), d, settings()); } catch (e) { /* ignore */ }
        const upd = (k, v) => { st[k] = v; draw(); };
        body.replaceChildren(...[
          h('p', { style: 'margin:0;color:var(--muted)' }, 'Cicero viser forhåndsvisningen med nogle testdata, som man selv kan rette i. Her kan du lave nye, så du kan se beskeden for et barn, med flere lån osv. Det er de samme opdigtede data, som værkstedet bruger.'),
          h('div', { class: 'grid2' },
            h('div', { class: 'q' }, h('span', { class: 'l' }, 'Låneren'), pills([[false, 'Voksen'], [true, 'Barn']], st.child, (v) => upd('child', v)),
              h('span', { class: 'hint' }, st.child ? 'Under 18 år og i lånergruppen "' + (KIT.childRule(settings()).names[0] || 'Børn') + '".' : 'Voksen og i lånergruppen "Voksne".')),
            hasList ? h('div', { class: 'q' }, h('span', { class: 'l' }, 'Antal lån'), pills([1, 2, 3, 4, 5].map((n) => [n, String(n)]), st.count, (v) => upd('count', v))) : h('div')),
          h('div', { class: 'checks' },
            hasList ? h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.per, onchange: (e) => upd('per', e.target.checked) }), 'Et af lånene er et tidsskrift') : null,
            h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.noPhone, onchange: (e) => upd('noPhone', e.target.checked) }), 'Låneren mangler telefon og e-mail'),
            h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.noDob, onchange: (e) => upd('noDob', e.target.checked) }), 'Låneren mangler fødselsdato')),
          h('div', { class: 'note' + (kid !== st.child ? ' warn' : '') }, 'Med jeres opsætning regnes låneren som ', h('b', null, kid ? 'barn' : 'voksen'), '. ', KIT.childRuleText(settings())),
          h('button', { class: 'btn primary', style: 'justify-self:start', onclick: () => copyText(txt, 'Testdata kopieret') }, ic('copy'), 'Kopiér testdata'),
          h('ol', null,
            h('li', null, 'Åbn skabelonen i Cicero, og find testdata ved forhåndsvisningen.'),
            h('li', null, 'Markér alle testdata, og sæt de kopierede ind i stedet.'),
            h('li', null, 'Opdatér forhåndsvisningen.')),
          h('details', { class: 'adv' }, h('summary', null, 'Se testdata (' + txt.trim().split('\n').length + ' linjer)'), h('pre', null, txt)),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Luk'))].filter(Boolean));
      };
      draw();
      b.append(body);
    }, true);
  }
  function copyText(t, msg) {
    const fallback = () => { const det = document.querySelector('.modal details'); if (det) det.open = true; const pre = document.querySelector('.modal pre'); if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const g = getSelection(); g.removeAllRanges(); g.addRange(r); toast('Teksten er markeret. Tryk Ctrl+C for at kopiere.'); } };
    try { navigator.clipboard.writeText(t).then(() => toast(msg || 'Kopieret'), fallback); } catch (e) { fallback(); }
  }
  function copyDialog() {
    const c = code();
    const t = T();
    const key = t.keys[S.protocol];
    let err = null; try { FTL.render(c, data()); } catch (e) { err = e; }
    const copy = () => {
      const ok = () => toast('Kopieret');
      try { navigator.clipboard.writeText(c).then(ok, () => selectPre()); } catch (e) { selectPre(); }
    };
    const selectPre = () => { const det = document.querySelector('.modal details'); if (det) det.open = true; const pre = document.querySelector('.modal pre'); if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const g = getSelection(); g.removeAllRanges(); g.addRange(r); toast('Koden er markeret. Tryk Ctrl+C for at kopiere.'); } };
    modal('Sæt beskeden ind i Cicero', (b, close) => {
      if (err) b.append(h('div', { class: 'errbar', style: 'margin:0' }, h('b', null, 'Bemærk: '), err.message));
      b.append(h('button', { class: 'btn primary', style: 'justify-self:start', onclick: copy }, ic('copy'), 'Kopiér skabelonen'),
        h('ol', null,
          h('li', null, 'Gå til ', h('b', null, 'Admin → Notifikationer'), ' i Cicero, og find "', t.title, '".'),
          h('li', null, 'Vælg skabelonen for ', h('b', null, S.protocol === 'EMAIL' ? 'E-mail' : 'Digital Post'), '. I den gamle klient hedder nøglen ', h('code', null, key || '?'), '.'),
          h('li', null, 'Markér alt i feltet, og sæt den kopierede skabelon ind i stedet.'),
          h('li', null, 'Tryk ', h('b', null, 'Forhåndsvisning'), ' i Cicero. Ser den rigtig ud, så gem.')),
        h('p', { class: 'hint', style: 'margin:0;color:var(--muted);font-size:14px' }, 'Vil du se beskeden for et barn eller med flere lån i Cicero? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); close(); testDataDialog(); } }, 'Lav testdata til Cicero'), '.'),
        h('details', { class: 'adv' }, h('summary', null, 'Se koden'), h('pre', null, c)),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Luk')));
    }, true);
  }

  render();
})();
