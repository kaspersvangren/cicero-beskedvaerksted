/* Beskedværkstedet – editor til Ciceros beskedskabeloner. Kræver FTL, CAT, MODEL og window.CATALOG_RAW. */
(function () {
  'use strict';
  const VERSION = 'v0.2';
  const CATALOG = CAT.load(window.CATALOG_RAW);
  const STORE = 'beskedvaerksted.v1';
  const LANGS = { da: 'Dansk', en: 'Engelsk', sv: 'Svensk', nb: 'Norsk', de: 'Tysk', fo: 'Færøsk' };
  const CAT_ORDER = ['Aflevering', 'Reservation', 'Udlån', 'Fjernlån', 'Mellemværende', 'Låner', 'Låner medlemskab', 'Booking', 'Leverandør', 'Ordre', 'Andet'];
  const DATE_FORMATS = [
    ['dd.MM.yyyy', 'Tal med punktum'],
    ['d. MMMM yyyy', 'Dag og måned med navn'],
    ["EEEE 'den' d. MMMM", 'Ugedag og dato'],
    ["EEEE '('d.M.yyyy')'", 'Ugedag (dato)'],
    ['dd/MM-yyyy', 'Skråstreg og bindestreg'],
    ['dd-MM-yyyy', 'Bindestreger'],
    ['d/M', 'Kort dag/måned']
  ];
  const NUM_FORMATS = [['', 'Standard'], ['0', 'Heltal'], ['0.00', 'To decimaler'], [',##0.00', 'Med tusindtalsseparator']];

  // ---------- eksempel ved første besøg ----------
  const SAMPLE = '<#-- @ftlvariable name="data" type="com.dantek.dl.api.notification.datamodel.ReturnDateExceededReminderDataModel" -->\n' +
    '<#assign erBarn = false />\n<#list (data.loaner.loanerGroups)![] as g><#if g.loanerGroupName?starts_with("Børn")><#assign erBarn = true /></#if></#list>\n' +
    'Påmindelse: <#if data.materialLoans?size == 1>dit lån skal snart afleveres<#else>dine lån skal snart afleveres</#if>\n' +
    'Kære ${(data.loaner.name)!"låner"}\n\n' +
    '<#if data.materialLoans?size == 1>\nAfleveringsfristen for dette lån nærmer sig:\n<#else>\nAfleveringsfristen for disse ${(data.materialLoans?size)!0} lån nærmer sig:\n</#if>\n\n' +
    '<#list data.materialLoans as lån>\n- ${(lån.record.title)!""}<#if (lån.record.author)?has_content> af ${(lån.record.author)!""}</#if>\n' +
    '  Afleveres senest ${(lån.loan.returnDate?date?string["dd.MM.yyyy"])!""}\n\n</#list>\n' +
    '<#if !erBarn>\nHvis materialerne ikke afleveres eller fornyes til tiden, skal du betale gebyr.\n\n</#if>\n' +
    'Du kan forny dine lån på bibliotekets hjemmeside.\n\nMed venlig hilsen\n${(data.agency.name)!""}\n';

  // ---------- tilstand ----------
  const defaults = () => ({
    settings: { langs: ['da'], conds: [{ id: 'c1', name: 'Under 18 år', cond: { k: 'age', op: 'under', years: 18 } }], ftlTypes: {}, libraryName: '' },
    drafts: {}, typeId: null,
    test: { count: 2, lang: 'da', groups: 'Voksne', child: false, periodical: false, json: null }
  });
  let S = defaults();
  let msg = null;            // UI-udgave af beskeden (blokke)
  let active = 0;            // aktiv variant
  let view = 'preview';
  let lastRender = { out: '', err: null, variant: -1, code: '' };
  let undoStack = [];
  const chipNodes = new Map();

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const d = JSON.parse(raw);
        S = Object.assign(defaults(), d);
        S.settings = Object.assign(defaults().settings, d.settings || {});
        S.test = Object.assign(defaults().test, d.test || {});
      }
    } catch (e) { /* ingen lagring */ }
  }
  let saveT = null;
  function saveStore() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        if (msg && S.typeId) S.drafts[S.typeId] = toModel(msg);
        localStorage.setItem(STORE, JSON.stringify(S));
      } catch (e) { /* ingen lagring */ }
    }, 300);
  }

  // ---------- hjælpere ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const type = () => CATALOG.byId[S.typeId];
  function toast(t) {
    const el = h('div', { class: 'toast', role: 'status' }, t);
    document.body.append(el);
    setTimeout(() => el.remove(), 3200);
  }
  const ICON = {
    plus: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>',
    copy: '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1.5 1.5 0 0 1 4.5 2h6"/></svg>',
    up: '↑', down: '↓', del: '✕'
  };
  const svg = (k) => h('span', { html: ICON[k], style: { display: 'inline-flex' } });

  // ---------- blokke <-> modelnoder ----------
  const INLINE = new Set(['text', 'field', 'expr', 'plural']);
  function ensureIds(n) { if (!n.id) n.id = MODEL.nid(); return n; }
  function toBlocks(nodes) {
    const out = [];
    let run = null;
    for (const n0 of nodes || []) {
      const n = clone(n0);
      if (INLINE.has(n.t)) {
        if (!run) { run = { t: 'run', id: MODEL.nid(), nodes: [] }; out.push(run); }
        run.nodes.push(n.t === 'text' ? n : ensureIds(n));
        continue;
      }
      run = null;
      if (n.t === 'list') out.push({ t: 'list', id: MODEL.nid(), path: n.path, as: n.as, body: toBlocks(n.body) });
      else if (n.t === 'if') out.push({ t: 'if', id: MODEL.nid(), branches: n.branches.map((b) => ({ cond: b.cond, body: toBlocks(b.body) })), else: n.else ? toBlocks(n.else) : null });
      else if (n.t === 'code') out.push({ t: 'code', id: MODEL.nid(), code: n.code });
      else if (n.t === 'comment') out.push({ t: 'comment', id: MODEL.nid(), text: n.text });
    }
    return normalize(out);
  }
  function normalize(blocks) {
    const out = [];
    const emptyRun = () => ({ t: 'run', id: MODEL.nid(), nodes: [] });
    blocks.forEach((b) => {
      const prev = out[out.length - 1];
      if (b.t === 'run' && prev && prev.t === 'run') { prev.nodes.push(...b.nodes); return; }
      if (b.t !== 'run' && (!prev || prev.t !== 'run')) out.push(emptyRun());
      out.push(b);
    });
    if (!out.length || out[out.length - 1].t !== 'run') out.push(emptyRun());
    return out;
  }
  function fromBlocks(blocks) {
    const out = [];
    const push = (n) => {
      const last = out[out.length - 1];
      if (n.t === 'text') { if (!n.v) return; if (last && last.t === 'text') { last.v += n.v; return; } }
      out.push(n);
    };
    for (const b of blocks || []) {
      if (b.t === 'run') b.nodes.forEach((n) => push(clone(n)));
      else if (b.t === 'list') push({ t: 'list', id: b.id, path: b.path, as: b.as, body: fromBlocks(b.body) });
      else if (b.t === 'if') push({ t: 'if', id: b.id, branches: b.branches.map((x) => ({ cond: x.cond, body: fromBlocks(x.body) })), else: b.else ? fromBlocks(b.else) : null });
      else if (b.t === 'code') { if (b.code.trim()) push({ t: 'code', id: b.id, code: b.code }); }
      else if (b.t === 'comment') { if (b.text.trim()) push({ t: 'comment', id: b.id, text: b.text }); }
    }
    return out;
  }
  function toUi(m) {
    const u = clone(m);
    u.prelude = toBlocks(m.prelude);
    u.variants = m.variants.map((v) => ({
      id: v.id || MODEL.nid(), cond: v.cond || null,
      subject: { t: 'run', id: MODEL.nid(), nodes: (v.subject || []).map((n) => n.t === 'text' ? clone(n) : ensureIds(clone(n))) },
      body: toBlocks(v.body), head: v.head || null, tail: v.tail || null
    }));
    return u;
  }
  function toModel(u) {
    const m = Object.assign({}, u);
    m.prelude = fromBlocks(u.prelude);
    m.variants = u.variants.map((v) => ({ id: v.id, cond: v.cond, subject: v.subject.nodes.map(clone), body: fromBlocks(v.body), head: v.head, tail: v.tail }));
    return clone(m);
  }

  // ---------- felter og scope ----------
  function resolve(path, scope) {
    if (!path) return null;
    const clean = path.replace(/\[\d+\]/g, '');
    const first = clean.split('.')[0];
    if (scope && scope[first]) return scope[first] + clean.slice(first.length);
    return clean;
  }
  function fieldOf(path, scope) { const t = type(); return t ? t.byPath[resolve(path, scope)] : null; }
  function labelOf(path, scope) {
    const f = fieldOf(path, scope);
    if (f && f.desc) return f.desc.replace(/\.$/, '');
    return path.split('.').pop();
  }
  function crumbOf(f) {
    const parts = [];
    for (let p = f.parent; p; p = p.parent) parts.unshift(p.desc || p.name);
    return parts.join(' › ');
  }
  function listsInScope(scope) {
    const t = type(); if (!t) return [];
    const out = [];
    const globals = t.fields.filter((f) => f.isList && !inList(f));
    globals.forEach((f) => out.push({ path: f.path, f }));
    for (const [v, full] of Object.entries(scope || {})) {
      const lf = t.byPath[full];
      if (!lf) continue;
      t.fields.filter((f) => f.isList && f.path.startsWith(full + '.') && nearestList(f) === lf).forEach((f) => out.push({ path: v + f.path.slice(full.length), f }));
    }
    return out;
  }
  function inList(f) { for (let p = f.parent; p; p = p.parent) if (p.isList) return true; return false; }
  function nearestList(f) { for (let p = f.parent; p; p = p.parent) if (p.isList) return p; return null; }
  function scalarFields(scope) {
    const t = type(); if (!t) return [];
    const out = [];
    t.fields.filter((f) => !f.isObj && !f.isList && !inList(f)).forEach((f) => out.push({ path: f.path, f }));
    for (const [v, full] of Object.entries(scope || {})) {
      const lf = t.byPath[full]; if (!lf) continue;
      t.fields.filter((f) => f.path.startsWith(full + '.') && !f.isObj && !f.isList && nearestList(f) === lf).forEach((f) => out.push({ path: v + f.path.slice(full.length), f, loop: v }));
    }
    return out;
  }

  // ---------- betingelser ----------
  function condText(c) {
    if (!c) return 'Alle andre';
    switch (c.k) {
      case 'lang': return 'Sprog er ' + (LANGS[c.code] || c.code).toLowerCase();
      case 'group': return 'Lånergruppe ' + ({ starts: 'starter med', contains: 'indeholder', equals: 'hedder', ends: 'slutter med' }[c.match] || '') + ' "' + c.value + '"' + (c.scope === 'path' ? ' (hele stien)' : c.scope === 'root' ? ' (øverste niveau)' : '');
      case 'age': return (c.op === 'under' ? 'Under ' : 'Mindst ') + c.years + ' år';
      case 'underage': return 'Mindreårig (Ciceros markering)';
      case 'has': return labelOf(c.path, curScope) + ' har indhold';
      case 'exists': return labelOf(c.path, curScope) + ' findes';
      case 'true': return labelOf(c.path, curScope) + ' er ja';
      case 'count': return 'Antal ' + labelOf(c.path, curScope).toLowerCase() + ' ' + ({ one: 'er præcis 1', many: 'er flere end 1', none: 'er 0', some: 'er mindst 1' }[c.op] || '');
      case 'not': return 'Ikke: ' + condText(c.c);
      case 'all': case 'any': return (c.items || []).map(condText).join(c.k === 'all' ? ' og ' : ' eller ') || '(tom)';
      case 'raw': return 'Kode: ' + c.code;
    }
    return '?';
  }
  let curScope = {};
  function variantLabel(v, i) {
    if (!v.cond) return msg.variants.length > 1 ? 'Alle andre' : 'Alle lånere';
    const saved = S.settings.conds.find((s) => JSON.stringify(s.cond) === JSON.stringify(stripFlag(v.cond)));
    if (saved) return saved.name;
    if (v.cond.k === 'lang') return LANGS[v.cond.code] || v.cond.code;
    return condText(v.cond);
  }
  function stripFlag(c) {
    const x = clone(c);
    const walk = (o) => { if (o && typeof o === 'object') { delete o.flag; delete o.listPath; Object.values(o).forEach(walk); } };
    walk(x); return x;
  }

  // ---------- historik ----------
  function snapshot() { undoStack.push(JSON.stringify({ msg, active })); if (undoStack.length > 60) undoStack.shift(); updateUndo(); }
  function undo() {
    const s = undoStack.pop(); if (!s) return;
    const d = JSON.parse(s); msg = d.msg; active = Math.min(d.active, msg.variants.length - 1);
    renderAll(); changed();
  }
  function updateUndo() { const b = $('#undo'); if (b) b.disabled = !undoStack.length; }

  // ---------- ændringer ----------
  let pvT = null;
  function changed() { saveStore(); clearTimeout(pvT); pvT = setTimeout(renderPreview, 160); }

  // ---------- opstart ----------
  function init() {
    loadStore();
    if (!S.typeId || !CATALOG.byId[S.typeId]) {
      const r = MODEL.importFtl(SAMPLE, { ftlTypes: CAT.KNOWN_FTL_TYPES, protocol: 'EMAIL' });
      S.typeId = r.msg.typeId;
      r.msg.notes = ['Dette er et eksempel. Vælg en beskedtype ovenfor, eller indsæt en af jeres egne skabeloner.'];
      msg = toUi(r.msg);
    } else {
      const d = S.drafts[S.typeId];
      msg = d ? toUi(d) : toUi(MODEL.newMessage(type(), 'EMAIL'));
    }
    document.addEventListener('selectionchange', trackCaret);
    renderAll();
    renderPreview();
  }

  // ---------- caret ----------
  let caret = null; // { run: Element, range }
  function trackCaret() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const run = node && node.closest ? node.closest('.run') : null;
    if (run) caret = { run, range: r.cloneRange() };
  }

  // ---------- render: alt ----------
  function renderAll() {
    const app = $('#app');
    app.replaceChildren(
      renderTop(),
      renderSetup(),
      h('div', { class: 'main' },
        h('section', { class: 'panel', id: 'editor', 'aria-label': 'Editor' }, renderEditorPanel()),
        h('section', { class: 'panel preview-col', id: 'preview', 'aria-label': 'Forhåndsvisning' }, renderPreviewShell())
      ),
      h('a', { class: 'btn primary jump', href: '#preview' }, 'Forhåndsvisning ↓')
    );
    updateUndo();
  }

  function renderTop() {
    return h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', null, 'Beskedværkstedet'), h('span', { class: 'sub' }, 'skabeloner til Cicero'), h('span', { class: 'ver' }, VERSION)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', id: 'undo', onclick: undo, title: 'Fortryd seneste ændring af blokke og varianter' }, 'Fortryd'),
        h('button', { class: 'btn', onclick: openImport }, 'Indsæt skabelon'),
        h('button', { class: 'btn', onclick: openNew }, 'Start forfra'),
        h('button', { class: 'btn', onclick: openSettings }, 'Indstillinger')
      )
    );
  }

  function renderSetup() {
    const t = type();
    const sel = h('select', { id: 'type-sel', onchange: (e) => switchType(e.target.value) });
    const groups = {};
    CATALOG.types.forEach((x) => { (groups[x.cat] = groups[x.cat] || []).push(x); });
    Object.keys(groups).sort((a, b) => (CAT_ORDER.indexOf(a) + 99) % 99 - (CAT_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b)).forEach((g) => {
      sel.append(h('optgroup', { label: g }, groups[g].map((x) => h('option', { value: x.id, selected: x.id === S.typeId }, x.title + '  (' + x.id + ')'))));
    });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Protokol' },
      (t ? t.protocols : ['EMAIL']).map((p) => h('button', { 'aria-pressed': String(msg.protocol === p), onclick: () => switchProtocol(p) }, CAT.PROTOCOLS[p].label)));
    const key = t && t.keys[msg.protocol];
    return h('section', { class: 'setup' },
      h('div', null, h('label', { class: 'lbl', for: 'type-sel' }, 'Beskedtype'), sel),
      h('div', null, h('span', { class: 'lbl' }, 'Skabelon til'), seg),
      h('div', { class: 'keyline' },
        key ? h('span', null, 'Nøgle i Cicero: ', h('code', null, key)) : null,
        t && t.other.length ? h('span', null, 'Se også: ', t.other.map((o) => h('code', { title: o[2] }, o[0]))) : null,
        h('span', null, 'Afsnit ' + (t ? t.id : '') + ' i USM0013')
      )
    );
  }

  function switchType(id) {
    if (msg && S.typeId) S.drafts[S.typeId] = toModel(msg);
    S.typeId = id;
    const d = S.drafts[id];
    const t = type();
    msg = d ? toUi(d) : toUi(MODEL.newMessage(t, t.protocols.includes(msg.protocol) ? msg.protocol : t.protocols[0]));
    active = 0; undoStack = [];
    renderAll(); changed();
  }
  function switchProtocol(p) {
    snapshot();
    const fromHtml = msg.format !== 'text';
    msg.protocol = p;
    const toHtml = CAT.PROTOCOLS[p].format === 'html';
    if (toHtml && msg.format === 'text') msg.format = 'html-frame';
    if (!toHtml && fromHtml) {
      if (msg.format === 'html-raw') {
        msg.variants.forEach((v) => { v.head = null; v.tail = null; });
        msg.notes = (msg.notes || []).concat('HTML-rammen er fjernet, fordi ' + CAT.PROTOCOLS[p].label + ' er ren tekst. Tjek teksten for HTML-mærker som <br>.');
      }
      msg.format = 'text';
    }
    renderAll(); changed();
  }

  // ---------- editor ----------
  function renderEditorPanel() {
    chipNodes.clear();
    const frag = [];
    frag.push(h('div', { class: 'panel-h' }, h('h2', null, 'Besked'), h('span', { class: 'muted', style: { fontSize: '13px' } }, msg.variants.length > 1 ? msg.variants.length + ' varianter' : 'Én besked til alle')));
    // varianter
    const tabs = h('div', { class: 'vtabs', role: 'tablist' },
      msg.variants.map((v, i) => h('button', { class: 'vtab', role: 'tab', 'aria-selected': String(i === active), onclick: () => { active = i; renderEditorOnly(); } },
        lastRender.variant === i ? h('span', { class: 'live', title: 'Det er denne variant, forhåndsvisningen viser' }) : null,
        h('span', { class: 't' }, variantLabel(v, i)))),
      h('button', { class: 'btn ghost small', onclick: addVariantMenu }, svg('plus'), 'Variant')
    );
    frag.push(tabs);
    const v = msg.variants[active];
    curScope = {};
    if (msg.variants.length > 1) {
      frag.push(h('div', { class: 'vhead' },
        h('span', { class: 'when' }, v.cond ? h('span', null, 'Bruges når: ', h('b', null, condText(v.cond))) : h('span', null, h('b', null, 'Bruges for alle andre'), ' – dvs. når ingen af de andre varianter passer')),
        h('span', { class: 'sp' }),
        v.cond ? h('button', { class: 'btn small', onclick: () => openCond(v.cond, (c) => { snapshot(); v.cond = c; renderEditorOnly(); changed(); }, {}) }, 'Ret betingelse') : null,
        v.cond && active > 0 ? h('button', { class: 'btn small ghost', title: 'Flyt til venstre (tjekkes før)', onclick: () => moveVariant(-1) }, '←') : null,
        v.cond && active < msg.variants.length - 1 && msg.variants[active + 1].cond ? h('button', { class: 'btn small ghost', title: 'Flyt til højre (tjekkes senere)', onclick: () => moveVariant(1) }, '→') : null,
        h('button', { class: 'btn small ghost', onclick: duplicateVariant }, 'Kopiér'),
        h('button', { class: 'btn small ghost danger', onclick: deleteVariant }, 'Slet')
      ));
    }
    // værktøjslinje
    frag.push(h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Indsæt' },
      h('button', { class: 'btn small t-field', onclick: () => openPicker() }, svg('plus'), 'Felt'),
      h('button', { class: 'btn small', onclick: insertPlural }, svg('plus'), 'Ental/flertal'),
      h('button', { class: 'btn small t-list', onclick: () => insertBlockAtCaret('list') }, svg('plus'), 'For hvert …'),
      h('button', { class: 'btn small t-if', onclick: () => insertBlockAtCaret('if') }, svg('plus'), 'Hvis …'),
      h('button', { class: 'btn small ghost', onclick: () => insertBlockAtCaret('comment') }, 'Note'),
      h('button', { class: 'btn small ghost', onclick: () => insertBlockAtCaret('code') }, 'Kode'),
      h('span', { class: 'hint' }, 'Sæt markøren i teksten, og vælg hvad der skal ind')
    ));
    const ed = h('div', { class: 'ed' });
    if (msg.notes && msg.notes.length) {
      ed.append(h('div', { class: 'notes' }, h('b', null, 'Bemærk'), h('ul', null, msg.notes.map((n) => h('li', null, n))),
        h('div', null, h('button', { class: 'btn small', onclick: () => { msg.notes = []; renderEditorOnly(); saveStore(); } }, 'Skjul'))));
    }
    const proto = CAT.PROTOCOLS[msg.protocol];
    if (proto.subject) {
      ed.append(h('div', { class: 'row-subject' }, h('span', { class: 'lbl' }, 'Emne'), renderRun(v.subject, { single: true, ph: 'Skriv emnet …' })));
    }
    if (msg.prelude && fromBlocks(msg.prelude).length) {
      ed.append(h('details', { class: 'frame' }, h('summary', null, 'Teknisk opsætning før beskeden (' + fromBlocks(msg.prelude).length + ')'),
        h('div', { style: { padding: '8px' } }, renderBlocks(msg.prelude, {}))));
    }
    if (msg.format === 'html-raw' && v.head) {
      ed.append(h('details', { class: 'frame' }, h('summary', null, 'HTML før teksten (ramme)'), h('pre', null, MODEL.generate({ protocol: 'EMAIL', format: 'text', prelude: [], variants: [{ cond: null, subject: [], body: v.head }] }, type()))));
    }
    ed.append(h('div', { class: 'fld' }, h('span', { class: 'lbl' }, msg.protocol === 'SMS' ? 'SMS-tekst' : 'Tekst'), renderBlocks(v.body, {}, true)));
    if (msg.format === 'html-raw' && v.tail) {
      ed.append(h('details', { class: 'frame' }, h('summary', null, 'HTML efter teksten (ramme)'), h('pre', null, MODEL.generate({ protocol: 'EMAIL', format: 'text', prelude: [], variants: [{ cond: null, subject: [], body: v.tail }] }, type()))));
    }
    if (msg.format === 'html-raw') {
      ed.append(h('div', { class: 'inline muted', style: { fontSize: '13px' } }, 'Skabelonen har sin egen HTML-ramme.',
        h('button', { class: 'btn small', onclick: useStandardFrame }, 'Brug standardramme i stedet')));
    }
    frag.push(ed);
    return frag;
  }
  function renderEditorOnly() {
    const p = $('#editor');
    const y = window.scrollY;
    p.replaceChildren(...renderEditorPanel());
    window.scrollTo(0, y);
  }
  function useStandardFrame() {
    snapshot();
    msg.variants.forEach((v) => { v.head = null; v.tail = null; });
    msg.format = 'html-frame';
    renderEditorOnly(); changed();
  }

  // ---------- varianter ----------
  function addVariantMenu(ev) {
    const items = [];
    S.settings.langs.filter((l) => l !== 'da').forEach((l) => items.push([LANGS[l] + ' tekst', () => addVariant({ k: 'lang', code: l })]));
    S.settings.conds.forEach((s) => items.push([s.name, () => addVariant(clone(s.cond))]));
    items.push(['Anden betingelse …', () => openCond(null, (c) => addVariant(c), {})]);
    menu(ev.currentTarget, items, 'Ny variant ud fra den aktuelle tekst');
  }
  function addVariant(cond) {
    snapshot();
    const src = msg.variants[active];
    const v = toUi({ variants: [Object.assign(toModel({ prelude: [], variants: [src] }).variants[0], { cond, id: MODEL.nid() })], prelude: [] }).variants[0];
    // nye varianter med betingelse indsættes før "alle andre"
    const elseIdx = msg.variants.findIndex((x) => !x.cond);
    if (elseIdx < 0) {
      msg.variants.push(v);
      active = msg.variants.length - 1;
    } else {
      msg.variants.splice(elseIdx, 0, v);
      active = elseIdx;
    }
    renderEditorOnly(); changed();
  }
  function moveVariant(d) {
    snapshot();
    const a = active, b = active + d;
    [msg.variants[a], msg.variants[b]] = [msg.variants[b], msg.variants[a]];
    active = b; renderEditorOnly(); changed();
  }
  function duplicateVariant() {
    snapshot();
    const src = msg.variants[active];
    openCond(null, (c) => {
      const v = toUi({ variants: [Object.assign(toModel({ prelude: [], variants: [src] }).variants[0], { cond: c, id: MODEL.nid() })], prelude: [] }).variants[0];
      msg.variants.splice(active, 0, v);
      renderEditorOnly(); changed();
    }, { title: 'Betingelse for kopien' });
  }
  function deleteVariant() {
    if (msg.variants.length === 1) return;
    ask('Slet varianten "' + variantLabel(msg.variants[active], active) + '"?', 'Teksten i varianten forsvinder. Du kan fortryde bagefter.', 'Slet', () => {
      snapshot();
      msg.variants.splice(active, 1);
      if (msg.variants.length === 1) msg.variants[0].cond = null;
      else if (!msg.variants.some((v) => !v.cond)) { /* ingen "alle andre" – helt i orden */ }
      active = Math.max(0, active - 1);
      renderEditorOnly(); changed();
    });
  }

  // ---------- blokke ----------
  function renderBlocks(blocks, scope, root) {
    const wrap = h('div', { class: 'blocks' });
    blocks.forEach((b, i) => wrap.append(renderBlock(b, blocks, i, scope, root && blocks.length === 1)));
    return wrap;
  }
  function blockTools(blocks, i) {
    const mv = (d) => () => {
      snapshot();
      // spring over tomme tekstfelter, så blokken faktisk flytter forbi indhold
      let j = i + d;
      while (j > 0 && j < blocks.length - 1 && blocks[j].t === 'run' && !blocks[j].nodes.some((n) => n.t !== 'text' || n.v.trim())) j += d;
      if (j < 0 || j >= blocks.length) return;
      const [b] = blocks.splice(i, 1); blocks.splice(j, 0, b);
      const n = normalize(blocks); blocks.splice(0, blocks.length, ...n);
      renderEditorOnly(); changed();
    };
    const del = () => {
      snapshot();
      blocks.splice(i, 1);
      const n = normalize(blocks); blocks.splice(0, blocks.length, ...n);
      renderEditorOnly(); changed();
    };
    return [
      h('button', { class: 'iconbtn', title: 'Flyt op', 'aria-label': 'Flyt op', onclick: mv(-1) }, ICON.up),
      h('button', { class: 'iconbtn', title: 'Flyt ned', 'aria-label': 'Flyt ned', onclick: mv(1) }, ICON.down),
      h('button', { class: 'iconbtn', title: 'Slet blok', 'aria-label': 'Slet blok', onclick: del }, ICON.del)
    ];
  }
  function renderBlock(b, blocks, i, scope, only) {
    if (b.t === 'run') {
      const isEmpty = !b.nodes.some((n) => n.t !== 'text' || n.v);
      const lone = blocks.length === 1;
      return renderRun(b, { scope, ph: lone ? 'Skriv teksten her …' : (isEmpty ? 'Skriv tekst her …' : ''), root: only, gap: !lone });
    }
    if (b.t === 'list') {
      const inner = Object.assign({}, scope, { [b.as]: resolve(b.path, scope) });
      const lf = fieldOf(b.path, scope);
      return h('div', { class: 'blk blk-list' },
        h('div', { class: 'blk-h' }, h('span', { class: 'k' }, 'For hvert'),
          h('button', { class: 'pathbtn', onclick: () => pickList(scope, (p) => { snapshot(); b.path = p; renderEditorOnly(); changed(); }) }, lf ? (lf.desc || b.path) : b.path),
          h('span', { class: 'muted', style: { fontSize: '13px' } }, 'kaldet'),
          h('input', { class: 'asinput', value: b.as, size: Math.max(4, b.as.length + 1), 'aria-label': 'Navn på hvert element', onchange: (e) => renameLoopVar(b, e.target.value) }),
          h('span', { class: 'sp' }), blockTools(blocks, i)),
        h('div', { class: 'blk-b' }, renderBlocks(b.body, inner)));
    }
    if (b.t === 'if') {
      const el = h('div', { class: 'blk blk-if' });
      b.branches.forEach((br, k) => {
        el.append(h('div', { class: k ? 'br-h' : 'blk-h' }, h('span', { class: 'k' }, k ? 'Ellers hvis' : 'Hvis'),
          h('button', { class: 'condbtn', onclick: () => { curScope = scope; openCond(br.cond, (c) => { snapshot(); br.cond = c; renderEditorOnly(); changed(); }, { scope }); } }, withScope(scope, () => condText(br.cond))),
          h('span', { class: 'sp' }),
          k ? h('button', { class: 'iconbtn', title: 'Fjern denne gren', onclick: () => { snapshot(); b.branches.splice(k, 1); renderEditorOnly(); changed(); } }, ICON.del) : blockTools(blocks, i)));
        el.append(h('div', { class: 'blk-b' }, renderBlocks(br.body, scope)));
      });
      if (b.else) {
        el.append(h('div', { class: 'br-h' }, h('span', { class: 'k' }, 'Ellers'), h('span', { class: 'sp' }),
          h('button', { class: 'iconbtn', title: 'Fjern "ellers"', onclick: () => { snapshot(); b.else = null; renderEditorOnly(); changed(); } }, ICON.del)));
        el.append(h('div', { class: 'blk-b' }, renderBlocks(b.else, scope)));
      }
      el.append(h('div', { class: 'br-h' },
        h('button', { class: 'btn small ghost', onclick: () => openCond(null, (c) => { snapshot(); b.branches.push({ cond: c, body: normalize([]) }); renderEditorOnly(); changed(); }, { scope }) }, svg('plus'), 'Ellers hvis'),
        !b.else ? h('button', { class: 'btn small ghost', onclick: () => { snapshot(); b.else = normalize([]); renderEditorOnly(); changed(); } }, svg('plus'), 'Ellers') : null));
      return el;
    }
    if (b.t === 'code') {
      const ta = h('textarea', { spellcheck: 'false', 'aria-label': 'FreeMarker-kode', rows: Math.min(14, b.code.split('\n').length + 1), oninput: (e) => { b.code = e.target.value; changed(); } });
      ta.value = b.code;
      return h('div', { class: 'blk blk-code' }, h('div', { class: 'blk-h' }, h('span', { class: 'k' }, 'Kode'), h('span', { class: 'muted', style: { fontSize: '13px' } }, codeHint(b.code)), h('span', { class: 'sp' }), blockTools(blocks, i)), ta);
    }
    if (b.t === 'comment') {
      return h('div', { class: 'blk blk-note' }, h('div', { class: 'blk-h' }, h('span', { class: 'k' }, 'Note'), h('span', { class: 'muted', style: { fontSize: '13px' } }, 'ses ikke af låneren'), h('span', { class: 'sp' }), blockTools(blocks, i)),
        h('input', { value: b.text, 'aria-label': 'Note', oninput: (e) => { b.text = e.target.value; changed(); } }));
    }
    return h('div');
  }
  function withScope(scope, fn) { const s = curScope; curScope = scope; try { return fn(); } finally { curScope = s; } }
  function codeHint(code) {
    if (/^<#setting\s+locale/.test(code)) return 'sprogindstilling for datoer og tal';
    if (/^<#assign\s+\w+>/.test(code)) return 'gemmer en værdi til senere brug';
    if (/^<#assign/.test(code)) return 'sætter en variabel';
    return 'bevares uændret';
  }
  function renameLoopVar(b, name) {
    name = name.trim().replace(/[^\p{L}\p{N}_]/gu, '');
    if (!name || name === b.as) { renderEditorOnly(); return; }
    snapshot();
    const old = b.as;
    const re = (p) => p && (p === old || p.startsWith(old + '.') || p.startsWith(old + '[')) ? name + p.slice(old.length) : p;
    const fixCond = (c) => { if (!c) return; if (c.path) c.path = re(c.path); if (c.c) fixCond(c.c); (c.items || []).forEach(fixCond); };
    const walk = (blocks) => blocks.forEach((x) => {
      if (x.t === 'run') x.nodes.forEach((n) => { if (n.path) n.path = re(n.path); if (n.t === 'expr') n.code = n.code.replace(new RegExp('(^|[^\\w.])' + old + '\\b', 'gu'), '$1' + name); });
      if (x.t === 'list') { x.path = re(x.path); walk(x.body); }
      if (x.t === 'if') { x.branches.forEach((br) => { fixCond(br.cond); walk(br.body); }); if (x.else) walk(x.else); }
    });
    walk(b.body);
    b.as = name;
    renderEditorOnly(); changed();
  }

  // ---------- tekstfelter med brikker ----------
  function chipEl(n, scope) {
    chipNodes.set(n.id, n);
    let el;
    if (n.t === 'field') {
      const f = fieldOf(n.path, scope);
      const known = !!f || !/^data\./.test(resolve(n.path, scope) || '');
      let fmt = '';
      if (n.date) fmt = FTL.formatDate(new Date(2026, 9, 13), n.date, 'da');
      else if (n.trunc) fmt = 'maks. ' + n.trunc + ' tegn';
      else if (n.numfmt) fmt = n.numfmt;
      el = h('span', { class: 'chip chip-field' + (known ? '' : ' unknown'), title: n.path + (known ? '' : ' – findes ikke i denne beskedtype') },
        labelOf(n.path, scope), fmt ? h('span', { class: 'fmt' }, fmt) : null);
    } else if (n.t === 'plural') {
      el = h('span', { class: 'chip chip-plural', title: 'Ental/flertal ud fra antal i ' + n.path }, (n.one || '…') + ' / ' + (n.many || '…'));
    } else {
      const m = /^\(?\(?([\w.\[\]]+?)\)?(?:!\[\])?\)?\?size\)?(?:!0)?$/.exec(n.code.replace(/\s+/g, '')) || /^\(([\w.\[\]]+)\?size\)!0$/.exec(n.code.replace(/\s+/g, ''));
      if (m) el = h('span', { class: 'chip chip-field', title: '${' + n.code + '}' }, 'Antal: ' + labelOf(m[1], scope).replace(/^./, (c) => c.toLowerCase()));
      else el = h('span', { class: 'chip chip-expr', title: 'FreeMarker-udtryk' }, '${' + n.code + '}');
    }
    el.contentEditable = 'false';
    el.dataset.id = n.id;
    el.addEventListener('click', (e) => { e.preventDefault(); openChip(n, scope); });
    return el;
  }
  function renderRun(block, o) {
    o = o || {};
    const el = h('div', { class: 'run' + (o.single ? ' subject' : '') + (o.root ? ' body-root' : '') + (o.gap ? ' gap' : ''), contenteditable: 'true', spellcheck: 'true', 'data-ph': o.ph || '', role: 'textbox', 'aria-multiline': String(!o.single), 'aria-label': o.single ? 'Emne' : 'Tekst' });
    el._block = block; el._scope = o.scope || {}; el._single = !!o.single;
    block.nodes.forEach((n, i) => {
      if (n.t === 'text') el.append(document.createTextNode(o.single ? n.v.replace(/\n/g, ' ') : n.v));
      else {
        // usynlige tegn omkring brikker, så markøren kan stå før og efter dem
        if (i === 0 || block.nodes[i - 1].t !== 'text') el.append(document.createTextNode('\u200b'));
        el.append(chipEl(ensureIds(n), o.scope));
        if (i === block.nodes.length - 1 || block.nodes[i + 1].t !== 'text') el.append(document.createTextNode('\u200b'));
      }
    });
    el.append(endBr());
    markEmpty(el);
    el.addEventListener('input', () => { readInto(el); markEmpty(el); changed(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (el._single) return;
        insertTextAtSelection('\n');
        readInto(el); changed();
      }
    });
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      let t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
      if (el._single) t = t.replace(/\s*\n\s*/g, ' ');
      if (/\$\{|<#/.test(t)) toast('Teksten indeholder FreeMarker-kode. Brug "Indsæt skabelon" for at få den lavet om til brikker.');
      insertTextAtSelection(t);
      readInto(el); markEmpty(el); changed();
    });
    el.addEventListener('drop', (e) => e.preventDefault());
    return el;
  }
  const endBr = () => { const b = document.createElement('br'); b.dataset.end = '1'; return b; };
  function markEmpty(el) {
    const empty = !el._block.nodes.some((n) => n.t !== 'text' || n.v);
    el.classList.toggle('is-empty', empty);
  }
  function insertTextAtSelection(text) {
    const sel = document.getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const tn = document.createTextNode(text);
    r.insertNode(tn);
    r.setStartAfter(tn); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }
  function readRun(el, marker) {
    const out = [];
    let buf = '';
    let before = null;
    const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
    const walk = (node) => {
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType === 3) buf += c.nodeValue.replace(/\u200b/g, '');
        else if (c.nodeType === 1) {
          if (c === marker) { flush(); before = out.length; continue; }
          if (c.classList.contains('chip')) { flush(); const n = chipNodes.get(c.dataset.id); if (n) out.push(n); }
          else if (c.tagName === 'BR') { if (!c.dataset.end) buf += '\n'; }
          else if (c.tagName === 'DIV' || c.tagName === 'P') { if (buf || out.length) buf += '\n'; walk(c); }
          else walk(c);
        }
      }
    };
    walk(el);
    flush();
    if (el._single) out.forEach((n) => { if (n.t === 'text') n.v = n.v.replace(/\n/g, ' '); });
    return marker ? { nodes: out, at: before } : out;
  }
  function readInto(el) { el._block.nodes = readRun(el); }

  // indsæt brik ved markøren
  function currentRun() {
    if (caret && document.body.contains(caret.run)) return caret;
    return null;
  }
  function insertChip(n) {
    ensureIds(n);
    const c = currentRun();
    let run;
    if (c) {
      run = c.run;
      const sel = document.getSelection();
      sel.removeAllRanges(); sel.addRange(c.range);
      const r = c.range;
      r.deleteContents();
      const chip = chipEl(n, run._scope);
      const after = document.createTextNode('\u200b');
      r.insertNode(after);
      r.insertNode(chip);
      r.setStart(after, 1); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      caret = { run, range: r.cloneRange() };
    } else {
      // ingen markør: sæt ind sidst i teksten
      const v = msg.variants[active];
      const last = v.body[v.body.length - 1];
      last.nodes.push(n);
      renderEditorOnly(); changed();
      toast('Indsat sidst i teksten. Sæt markøren i teksten for at vælge stedet.');
      return;
    }
    readInto(run); markEmpty(run); changed();
    run.focus();
  }

  // del teksten ved markøren og indsæt en blok
  function insertBlockAtCaret(kind) {
    const make = (cb) => {
      if (kind === 'list') {
        const c = currentRun();
        pickList(c ? c.run._scope : {}, (p) => {
          const lf = fieldOf(p, c ? c.run._scope : {});
          const as = suggestVar(lf);
          cb({ t: 'list', id: MODEL.nid(), path: p, as, body: normalize([]) });
        });
      } else if (kind === 'if') {
        const c = currentRun();
        openCond(null, (cond) => cb({ t: 'if', id: MODEL.nid(), branches: [{ cond, body: normalize([]) }], else: null }), { scope: c ? c.run._scope : {} });
      } else if (kind === 'code') cb({ t: 'code', id: MODEL.nid(), code: '' });
      else cb({ t: 'comment', id: MODEL.nid(), text: '' });
    };
    const c = currentRun();
    const target = c ? findContainer(c.run._block) : null;
    make((blk) => {
      snapshot();
      if (c && target && !c.run._single) {
        const marker = h('span', { class: 'caret-mark' });
        const r = c.range.cloneRange(); r.collapse(true); r.insertNode(marker);
        const { nodes, at } = readRun(c.run, marker);
        marker.remove();
        const a = nodes.slice(0, at == null ? nodes.length : at), b = at == null ? [] : nodes.slice(at);
        // flyt et linjeskift lige før markøren med i første del
        const runA = { t: 'run', id: MODEL.nid(), nodes: a }, runB = { t: 'run', id: MODEL.nid(), nodes: b };
        target.arr.splice(target.idx, 1, runA, blk, runB);
      } else {
        const v = msg.variants[active];
        v.body.push(blk);
        const n = normalize(v.body); v.body.splice(0, v.body.length, ...n);
      }
      caret = null;
      renderEditorOnly(); changed();
      const el = document.querySelector('[data-blk="' + blk.id + '"]');
      if (el) el.focus();
    });
  }
  function suggestVar(lf) {
    if (!lf) return 'x';
    const n = lf.name;
    if (/reservation/i.test(n)) return 'reservation';
    if (/fee/i.test(n)) return 'gebyr';
    if (/compensation/i.test(n)) return 'erstatning';
    if (/loan/i.test(n)) return 'lån';
    if (/openingHours/.test(n)) return 'dag';
    if (/group/i.test(n)) return 'gruppe';
    return 'element';
  }
  function findContainer(block) {
    let found = null;
    const walk = (arr) => {
      arr.forEach((x, i) => {
        if (found) return;
        if (x === block) { found = { arr, idx: i }; return; }
        if (x.body) walk(x.body);
        if (x.branches) x.branches.forEach((b) => walk(b.body));
        if (x.else) walk(x.else);
      });
    };
    msg.variants.forEach((v) => walk(v.body));
    walk(msg.prelude);
    return found;
  }

  function insertPlural() {
    const c = currentRun();
    const lists = listsInScope(c ? c.run._scope : {}).filter((x) => x.f.children.length || x.f.isList);
    if (!lists.length) { toast('Denne beskedtype har ingen lister at tælle.'); return; }
    const main = lists.find((x) => /materialLoans$|reservations$|fees$/.test(x.path)) || lists[0];
    const n = { t: 'plural', id: MODEL.nid(), path: main.path, one: 'dit lån', many: 'dine lån' };
    if (/reservation/i.test(main.path)) { n.one = 'din reservering'; n.many = 'dine reserveringer'; }
    if (/fee/i.test(main.path)) { n.one = 'gebyr'; n.many = 'gebyrer'; }
    const keep = c;
    openChip(n, c ? c.run._scope : {}, () => { caret = keep; insertChip(n); });
  }

  // ---------- menu / dialoger ----------
  function menu(anchor, items, title) {
    modal(title || 'Vælg', (body, close) => {
      body.append(h('div', { class: 'saved' }, items.map(([label, fn]) => h('button', { class: 'btn', style: { justifyContent: 'flex-start' }, onclick: () => { close(); fn(); } }, label))));
    }, null, { small: true });
  }
  function modal(title, build, footer, o) {
    o = o || {};
    const prevFocus = document.activeElement;
    const bg = h('div', { class: 'modal-bg', role: 'presentation' });
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { } };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const body = h('div', { class: 'modal-b' });
    const foot = h('div', { class: 'modal-f' });
    const m = h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-h' }, h('h3', null, title), h('button', { class: 'iconbtn', 'aria-label': 'Luk', onclick: close }, ICON.del)), body, foot);
    bg.append(m);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    document.addEventListener('keydown', onKey);
    build(body, close, foot);
    if (footer) footer(foot, close);
    if (!foot.children.length) foot.remove();
    document.body.append(bg);
    const f = m.querySelector('input, select, textarea, button.pitem, .pitem');
    if (f && !o.noFocus) setTimeout(() => f.focus(), 30);
    return close;
  }
  function ask(title, text, okLabel, fn) {
    modal(title, (b) => b.append(h('p', { style: { margin: 0 } }, text)), (f, close) => {
      f.append(h('button', { class: 'btn', onclick: close }, 'Annullér'), h('button', { class: 'btn primary', onclick: () => { close(); fn(); } }, okLabel));
    });
  }

  // ---------- feltvælger ----------
  // de mest brugte felter først; filial- og placeringsdetaljer sidst
  const PRIO = ['title', 'author', 'returnDate', 'latestPickupDate', 'reservationPickupInformation', 'periodicalName', 'itemNumber', 'materialNumber',
    'loanDate', 'dateOfInterest', 'queueNumber', 'amount', 'dueDate', 'text', 'classification', 'name'];
  function prio(f) {
    const deep = /Branch|Department|Location|Section|Sublocation|theme|openingHours|vatInformation|transactions/.test(f.path) ? 100 : 0;
    const i = PRIO.indexOf(f.name);
    return deep + (i < 0 ? 50 : i);
  }
  function openPicker() {
    const c = currentRun();
    const scope = c ? c.run._scope : {};
    const keep = c;
    const t = type();
    modal('Indsæt felt', (body, close) => {
      const search = h('input', { type: 'search', placeholder: 'Søg, fx "titel", "afhentning", "navn"', 'aria-label': 'Søg i felter' });
      const list = h('div', { style: { display: 'grid', gap: '10px' } });
      body.append(h('div', { class: 'picker-search' }, search), list);
      const pick = (path, f) => { close(); caret = keep; insertChip(defaultChipFor(path, f)); };
      const item = (path, f, depth) => h('div', { class: 'pitem' + (depth === 1 ? ' sub' : depth > 1 ? ' sub2' : ''), tabindex: '0', role: 'button',
        onclick: () => pick(path, f), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(path, f); } } },
        h('span', { class: 'd' }, f.desc || f.name, f.isDate ? h('span', { class: 'tag', style: { background: 'var(--field-soft)', color: 'var(--field)' } }, 'dato') : null),
        h('span', { class: 'p' }, path));
      const draw = () => {
        const q = search.value.trim().toLowerCase();
        list.replaceChildren();
        // felter for hvert element i løkker
        for (const [v, full] of Object.entries(scope)) {
          const lf = t.byPath[full]; if (!lf) continue;
          const fs = t.fields.filter((f) => f.path.startsWith(full + '.') && !f.isObj && !f.isList && nearestList(f) === lf).sort((a, b) => prio(a) - prio(b));
          const shown = fs.filter((f) => !q || (f.desc + ' ' + f.path + ' ' + crumbOf(f)).toLowerCase().includes(q));
          if (!shown.length) continue;
          list.append(h('details', { class: 'pgroup loop', open: true }, h('summary', null, 'For hvert element: ' + (lf.desc || lf.name), h('span', { class: 'cnt' }, v)),
            shown.map((f) => { const it = item(v + f.path.slice(full.length), f, 0); const cr = crumbOf(f).split(' › ').slice(-(f.path.split('.').length - full.split('.').length - 1)).join(' › '); if (cr) it.insertBefore(h('span', { class: 'crumb' }, cr), it.children[1]); return it; })));
        }
        for (const top of t.top) {
          const all = [];
          const walk = (f, depth) => {
            if (f.isList) { all.push({ list: f, depth }); return; }
            if (f.isObj || f.children.length) { f.children.forEach((c2) => walk(c2, depth + 1)); return; }
            all.push({ f, depth });
          };
          if (top.isList || top.isObj || top.children.length) walk(top, -1); else all.push({ f: top, depth: 0 });
          const match = (x) => !q || ((x.f || x.list).desc + ' ' + (x.f || x.list).path + ' ' + crumbOf(x.f || x.list)).toLowerCase().includes(q);
          const shown = all.filter(match);
          if (!shown.length) continue;
          const g = h('details', { class: 'pgroup', open: !!q || t.top.length < 6 || /^(loaner|agency|loanerModel)$/.test(top.name) },
            h('summary', null, top.isObj || top.isList ? (top.desc || top.name) : 'Øvrige', h('span', { class: 'cnt' }, shown.length)));
          shown.forEach((x) => {
            if (x.f) {
              const it = item(x.f.path, x.f, Math.max(0, x.depth));
              const cr = crumbOf(x.f).split(' › ').slice(1).join(' › ');
              if (cr) it.insertBefore(h('span', { class: 'crumb' }, cr), it.children[1]);
              g.append(it);
            } else {
              const L = x.list;
              const prim = !L.children.length;
              g.append(h('div', { class: 'pitem', style: { cursor: 'default' } }, h('span', { class: 'd' }, L.desc || L.name, h('span', { class: 'tag' }, 'liste')), h('span', { class: 'p' }, L.path)));
              g.append(h('div', { class: 'pacts' },
                !prim ? h('button', { class: 'btn small', onclick: () => { close(); caret = keep; insertBlockForList(L.path); } }, 'Indsæt "For hvert"-blok') : null,
                h('button', { class: 'btn small', onclick: () => { close(); caret = keep; insertChip({ t: 'expr', code: '(' + L.path + '![])?size' }); } }, 'Indsæt antal'),
                prim ? h('button', { class: 'btn small', onclick: () => { close(); caret = keep; insertChip({ t: 'expr', code: '(' + L.path + '![])?join(", ")' }); } }, 'Indsæt alle, adskilt med komma') : null));
            }
          });
          list.append(g);
        }
        if (!list.children.length) list.append(h('p', { class: 'muted' }, 'Ingen felter passer til søgningen.'));
      };
      search.addEventListener('input', draw);
      draw();
    }, null, { wide: true });
  }
  function insertBlockForList(path) {
    const c = currentRun();
    const lf = fieldOf(path, c ? c.run._scope : {});
    const blk = { t: 'list', id: MODEL.nid(), path, as: suggestVar(lf), body: normalize([]) };
    snapshot();
    if (c && !c.run._single) {
      const target = findContainer(c.run._block);
      const marker = h('span');
      const r = c.range.cloneRange(); r.collapse(true); r.insertNode(marker);
      const { nodes, at } = readRun(c.run, marker);
      marker.remove();
      target.arr.splice(target.idx, 1, { t: 'run', id: MODEL.nid(), nodes: nodes.slice(0, at == null ? nodes.length : at) }, blk, { t: 'run', id: MODEL.nid(), nodes: at == null ? [] : nodes.slice(at) });
    } else {
      const v = msg.variants[active]; v.body.push(blk);
      const n = normalize(v.body); v.body.splice(0, v.body.length, ...n);
    }
    caret = null; renderEditorOnly(); changed();
  }
  function defaultChipFor(path, f) {
    if (f.isBool) return { t: 'expr', code: '((' + path + ')!false)?string("Ja", "Nej")' };
    const n = { t: 'field', path, fb: '' };
    if (f.isDate) n.date = 'dd.MM.yyyy';
    if (/^(name)$/.test(f.name) && /loaner/i.test(f.parent ? f.parent.name : '')) n.fb = 'låner';
    return n;
  }
  function pickList(scope, cb) {
    const lists = listsInScope(scope).filter((x) => x.f.children.length);
    modal('Hvilken liste skal gennemløbes?', (body, close) => {
      if (!lists.length) body.append(h('p', { class: 'muted' }, 'Denne beskedtype har ingen lister.'));
      lists.forEach((x) => body.append(h('div', { class: 'pitem', tabindex: '0', role: 'button', onclick: () => { close(); cb(x.path); }, onkeydown: (e) => { if (e.key === 'Enter') { close(); cb(x.path); } } },
        h('span', { class: 'd' }, x.f.desc || x.f.name), h('span', { class: 'p' }, x.path))));
    });
  }

  // ---------- brik-editor ----------
  function openChip(n, scope, onInsert) {
    const isNew = !!onInsert;
    const f = n.t === 'field' ? fieldOf(n.path, scope) : null;
    const title = n.t === 'field' ? labelOf(n.path, scope) : n.t === 'plural' ? 'Ental eller flertal' : 'FreeMarker-udtryk';
    const work = clone(n);
    modal(title, (body) => {
      if (n.t === 'field') {
        body.append(h('div', { class: 'muted mono', style: { fontSize: '12.5px', overflowWrap: 'anywhere' } }, n.path + (f ? '' : '  (findes ikke i denne beskedtype)')));
        const fbIn = h('input', { type: 'text', id: 'chip-fb', value: work.fb == null ? '' : work.fb, disabled: work.fb == null, oninput: (e) => { work.fb = e.target.value; } });
        const req = h('input', { type: 'checkbox', id: 'chip-req', checked: work.fb == null, onchange: (e) => { work.fb = e.target.checked ? null : ''; fbIn.disabled = e.target.checked; fbIn.value = ''; } });
        body.append(h('label', { class: 'fld' }, h('span', null, 'Hvis feltet er tomt, skriv i stedet'), fbIn,
          h('span', { class: 'help' }, 'Fx "låner" i "Kære …". Lad feltet være tomt for at skrive ingenting.')));
        body.append(h('label', { class: 'inline', style: { fontSize: '14px' } }, req, 'Feltet er altid udfyldt (giver fejl i Cicero, hvis det mangler)'));
        if ((f && f.isDate) || work.date) {
          const custom = h('input', { type: 'text', value: work.date || '', 'aria-label': 'Eget datoformat', class: 'mono', oninput: (e) => { work.date = e.target.value; ex.textContent = fmtEx(work.date); } });
          const ex = h('span', { class: 'help' }, fmtEx(work.date));
          const sel = h('select', { id: 'chip-date', onchange: (e) => { if (e.target.value) { work.date = e.target.value; custom.value = work.date; ex.textContent = fmtEx(work.date); } } },
            h('option', { value: '' }, 'Vælg format …'),
            DATE_FORMATS.map(([p, l]) => h('option', { value: p, selected: work.date === p }, fmtEx(p) + '  –  ' + l)));
          body.append(h('div', { class: 'fld' }, h('span', null, 'Datoformat'), sel, custom, ex,
            h('span', { class: 'help' }, 'Ugedage og månedsnavne følger beskedens sprog. Editoren indsætter selv sprogindstillingen.')));
        } else if (f && f.isNum) {
          body.append(h('label', { class: 'fld' }, h('span', null, 'Talformat'),
            h('select', { onchange: (e) => { work.numfmt = e.target.value || undefined; } }, NUM_FORMATS.map(([p, l]) => h('option', { value: p, selected: (work.numfmt || '') === p }, l + (p ? '  (' + FTL.formatNumber(1234.5, p, 'da') + ')' : '  (1.234,5)'))))));
        } else {
          body.append(h('label', { class: 'fld' }, h('span', null, 'Afkort til højst antal tegn (fx til SMS)'),
            h('input', { type: 'number', min: '0', value: work.trunc || '', placeholder: 'ingen afkortning', oninput: (e) => { work.trunc = parseInt(e.target.value, 10) || undefined; } })));
        }
      } else if (n.t === 'plural') {
        const lists = listsInScope(scope).filter((x) => x.f.isList);
        body.append(h('label', { class: 'fld' }, h('span', null, 'Tæl elementer i'),
          h('select', { onchange: (e) => { work.path = e.target.value; } }, lists.map((x) => h('option', { value: x.path, selected: x.path === work.path }, (x.f.desc || x.f.name) + '  (' + x.path + ')')))));
        body.append(h('label', { class: 'fld' }, h('span', null, 'Tekst når der er præcis 1'), h('input', { type: 'text', value: work.one, oninput: (e) => { work.one = e.target.value; } })));
        body.append(h('label', { class: 'fld' }, h('span', null, 'Tekst når der er flere'), h('input', { type: 'text', value: work.many, oninput: (e) => { work.many = e.target.value; } })));
      } else {
        body.append(h('label', { class: 'fld' }, h('span', null, 'Udtryk (det der står inde i ${ … })'),
          h('textarea', { spellcheck: 'false', style: { minHeight: '90px' }, oninput: (e) => { work.code = e.target.value; } }, work.code)));
      }
    }, (foot, close) => {
      if (!isNew) foot.append(h('button', { class: 'btn danger left', onclick: () => { close(); removeChip(n); } }, 'Fjern brik'));
      foot.append(h('button', { class: 'btn', onclick: close }, 'Annullér'),
        h('button', { class: 'btn primary', onclick: () => {
          close();
          if (work.t === 'field') { if (!work.date) delete work.date; if (!work.trunc) delete work.trunc; if (!work.numfmt) delete work.numfmt; }
          if (isNew) { Object.assign(n, work); onInsert(); return; }
          snapshot(); Object.keys(n).forEach((k) => delete n[k]); Object.assign(n, work);
          renderEditorOnly(); changed();
        } }, isNew ? 'Indsæt' : 'Gem'));
    });
  }
  function fmtEx(p) { try { return p ? FTL.formatDate(new Date(2026, 9, 13), p, 'da') : ''; } catch (e) { return ''; } }
  function removeChip(n) {
    snapshot();
    const walk = (blocks) => blocks.forEach((b) => {
      if (b.t === 'run') { const i = b.nodes.indexOf(n); if (i >= 0) b.nodes.splice(i, 1); }
      if (b.body) walk(b.body);
      if (b.branches) b.branches.forEach((x) => walk(x.body));
      if (b.else) walk(b.else);
    });
    msg.variants.forEach((v) => { const i = v.subject.nodes.indexOf(n); if (i >= 0) v.subject.nodes.splice(i, 1); walk(v.body); });
    renderEditorOnly(); changed();
  }

  // ---------- betingelses-editor ----------
  function condKinds(scope) {
    const t = type(); const P = t.paths;
    const k = [];
    if (P.lang) k.push(['lang', 'Lånerens sprog']);
    if (P.groups) k.push(['group', 'Lånergruppe']);
    if (P.dob) k.push(['age', 'Alder']);
    if (P.underage) k.push(['underage', 'Mindreårig (Ciceros egen markering)']);
    k.push(['has', 'Et felt har indhold']);
    k.push(['true', 'Et ja/nej-felt er ja']);
    if (listsInScope(scope).length) k.push(['count', 'Antal i en liste']);
    k.push(['raw', 'Egen FreeMarker-betingelse']);
    return k;
  }
  function blankCond(kind, scope) {
    const t = type();
    switch (kind) {
      case 'lang': return { k: 'lang', code: S.settings.langs.find((l) => l !== 'da') || 'en' };
      case 'group': return { k: 'group', match: 'starts', value: '', scope: 'name' };
      case 'age': return { k: 'age', op: 'under', years: 18 };
      case 'underage': return { k: 'underage' };
      case 'has': { const f = scalarFields(scope)[0]; return { k: 'has', path: f ? f.path : 'data.' }; }
      case 'true': { const f = scalarFields(scope).filter((x) => x.f.isBool)[0]; return { k: 'true', path: f ? f.path : '' }; }
      case 'count': { const l = listsInScope(scope)[0]; return { k: 'count', path: l ? l.path : '', op: 'one' }; }
      default: return { k: 'raw', code: '' };
    }
  }
  function fieldSelect(opts, value, onch) {
    const groups = {};
    opts.forEach((o) => { const g = o.loop ? 'For hvert element (' + o.loop + ')' : (o.f.parent ? (topOf(o.f).desc || topOf(o.f).name) : 'Øvrige'); (groups[g] = groups[g] || []).push(o); });
    const sel = h('select', { onchange: (e) => onch(e.target.value) });
    Object.entries(groups).forEach(([g, os]) => sel.append(h('optgroup', { label: g }, os.map((o) => h('option', { value: o.path, selected: o.path === value }, (o.f.desc || o.f.name) + '  ·  ' + o.path.split('.').slice(-2).join('.'))))));
    return sel;
  }
  function topOf(f) { while (f.parent) f = f.parent; return f; }
  function openCond(cond, onSave, o) {
    o = o || {};
    const scope = o.scope || {};
    let mode = 'all';
    let rows;
    if (!cond) rows = [{ not: false, c: blankCond(condKinds(scope)[0][0], scope) }];
    else if (cond.k === 'all' || cond.k === 'any') { mode = cond.k; rows = cond.items.map((c) => c.k === 'not' ? { not: true, c: clone(c.c) } : { not: false, c: clone(c) }); }
    else rows = [cond.k === 'not' ? { not: true, c: clone(cond.c) } : { not: false, c: clone(cond) }];
    const build = () => {
      const items = rows.map((r) => r.not ? { k: 'not', c: r.c } : r.c);
      return items.length === 1 ? items[0] : { k: mode, items };
    };
    modal(o.title || 'Betingelse', (body) => {
      const savedBar = S.settings.conds.length ? h('div', { class: 'inline' }, h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Gemte:'),
        S.settings.conds.map((s) => h('button', { class: 'btn small', onclick: () => { rows = s.cond.k === 'all' || s.cond.k === 'any' ? (mode = s.cond.k, s.cond.items.map((c) => ({ not: false, c: clone(c) }))) : [{ not: false, c: clone(s.cond) }]; draw(); } }, s.name))) : null;
      const box = h('div', { style: { display: 'grid', gap: '8px' } });
      const sum = h('div', { class: 'csum' });
      if (savedBar) body.append(savedBar);
      body.append(box, sum);
      const draw = () => {
        box.replaceChildren();
        rows.forEach((r, i) => box.append(condRow(r, scope, () => { rows.splice(i, 1); if (!rows.length) rows.push({ not: false, c: blankCond('lang', scope) }); draw(); }, draw)));
        box.append(h('div', { class: 'inline' },
          h('button', { class: 'btn small', onclick: () => { rows.push({ not: false, c: blankCond(condKinds(scope)[0][0], scope) }); draw(); } }, svg('plus'), 'Tilføj betingelse'),
          rows.length > 1 ? h('label', { class: 'inline', style: { fontSize: '14px' } }, 'Skal',
            h('select', { onchange: (e) => { mode = e.target.value; drawSum(); } }, h('option', { value: 'all', selected: mode === 'all' }, 'alle passe'), h('option', { value: 'any', selected: mode === 'any' }, 'mindst én passe'))) : null));
        drawSum();
      };
      const drawSum = () => { sum.replaceChildren(h('b', null, 'Betyder: '), withScope(scope, () => condText(build()))); };
      draw();
      body._redraw = drawSum;
    }, (foot, close) => {
      foot.append(
        h('button', { class: 'btn left', onclick: () => {
          const c = build();
          modal('Gem betingelsen', (b) => { b.append(h('label', { class: 'fld' }, h('span', null, 'Navn'), h('input', { type: 'text', id: 'save-name', placeholder: 'Fx Børnelåner' }))); }, (f2, close2) => {
            f2.append(h('button', { class: 'btn', onclick: close2 }, 'Annullér'), h('button', { class: 'btn primary', onclick: () => {
              const name = $('#save-name').value.trim(); if (!name) return;
              S.settings.conds.push({ id: MODEL.nid(), name, cond: stripFlag(c) }); saveStore(); close2(); toast('Gemt som "' + name + '"');
            } }, 'Gem'));
          });
        } }, 'Gem til senere'),
        h('button', { class: 'btn', onclick: close }, 'Annullér'),
        h('button', { class: 'btn primary', onclick: () => { close(); onSave(build()); } }, 'Brug'));
    });
  }
  function condRow(r, scope, onDel, redraw) {
    const kinds = condKinds(scope);
    const c = r.c;
    const ctl = h('div', { class: 'ctl' });
    const kindSel = h('select', { 'aria-label': 'Type af betingelse', onchange: (e) => { r.c = blankCond(e.target.value, scope); redraw(); } },
      kinds.map(([k, l]) => h('option', { value: k, selected: c.k === k || (c.k === 'exists' && k === 'has') }, l)));
    if (!kinds.some(([k]) => k === c.k || (c.k === 'exists' && k === 'has'))) kindSel.prepend(h('option', { selected: true, value: c.k }, c.k));
    ctl.append(kindSel);
    const set = (k, v) => { c[k] = v; delete c.flag; redraw(); };
    switch (c.k) {
      case 'lang':
        ctl.append(h('span', null, 'er'), h('select', { onchange: (e) => set('code', e.target.value) }, Object.entries(LANGS).map(([k, l]) => h('option', { value: k, selected: c.code === k }, l))));
        break;
      case 'group':
        ctl.append(
          h('select', { onchange: (e) => set('match', e.target.value) }, [['starts', 'starter med'], ['contains', 'indeholder'], ['equals', 'hedder præcis'], ['ends', 'slutter med']].map(([k, l]) => h('option', { value: k, selected: c.match === k }, l))),
          h('input', { type: 'text', value: c.value, placeholder: 'Fx Børn', 'aria-label': 'Gruppenavn', onchange: (e) => set('value', e.target.value) }),
          h('select', { onchange: (e) => set('scope', e.target.value), 'aria-label': 'Hvad der sammenlignes' },
            [['name', 'gruppens eget navn'], ['path', 'hele stien (fx Skole/Elever/9b)'], ['root', 'øverste niveau + navn']].map(([k, l]) => h('option', { value: k, selected: c.scope === k }, l))));
        ctl.append(h('span', { class: 'muted', style: { fontSize: '12.5px', flexBasis: '100%' } }, 'Passer, hvis mindst én af lånerens grupper passer.'));
        break;
      case 'age':
        ctl.append(h('select', { onchange: (e) => set('op', e.target.value) }, h('option', { value: 'under', selected: c.op === 'under' }, 'under'), h('option', { value: 'atleast', selected: c.op === 'atleast' }, 'mindst')),
          h('input', { type: 'number', min: '1', max: '120', value: c.years, style: { width: '5em' }, onchange: (e) => set('years', parseInt(e.target.value, 10) || 18) }), h('span', null, 'år'));
        ctl.append(h('span', { class: 'muted', style: { fontSize: '12.5px', flexBasis: '100%' } }, 'Beregnes ud fra lånerens fødselsdato på den dag, beskeden sendes.'));
        break;
      case 'has': case 'exists': case 'true': {
        const opts = scalarFields(scope).filter((x) => c.k !== 'true' || x.f.isBool);
        ctl.append(fieldSelect(opts, c.path, (v) => set('path', v)), h('span', null, c.k === 'true' ? 'er ja' : 'har indhold'));
        if (c.k === 'exists') ctl.append(h('span', { class: 'muted', style: { fontSize: '12.5px', flexBasis: '100%' } }, 'Fra den indsatte skabelon: tjekker kun, om feltet findes, ikke om det er tomt.'));
        break;
      }
      case 'count': {
        const lists = listsInScope(scope);
        ctl.append(h('select', { onchange: (e) => set('path', e.target.value) }, lists.map((x) => h('option', { value: x.path, selected: x.path === c.path }, x.f.desc || x.path))),
          h('select', { onchange: (e) => set('op', e.target.value) }, [['one', 'er præcis 1'], ['many', 'er flere end 1'], ['some', 'er mindst 1'], ['none', 'er 0']].map(([k, l]) => h('option', { value: k, selected: c.op === k }, l))));
        break;
      }
      case 'underage': ctl.append(h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Bruger Ciceros egen markering af mindreårige lånere.')); break;
      default:
        ctl.append(h('textarea', { spellcheck: 'false', 'aria-label': 'FreeMarker-betingelse', oninput: (e) => { c.code = e.target.value; } }, c.code || ''));
    }
    const notC = h('label', { class: 'not' }, h('input', { type: 'checkbox', checked: r.not, onchange: (e) => { r.not = e.target.checked; redraw(); } }), 'ikke');
    return h('div', { class: 'crow' }, notC, ctl, h('button', { class: 'iconbtn', 'aria-label': 'Fjern', title: 'Fjern', onclick: onDel }, ICON.del));
  }

  // ---------- import / ny / indstillinger ----------
  function openImport() {
    modal('Indsæt eksisterende skabelon', (body) => {
      body.append(h('p', { style: { margin: 0 }, class: 'muted' }, 'Kopiér skabelonen fra Cicero (Admin → Notifikationer i Mobile, eller F7 → Serveropsætning i LMS), og sæt den ind her. Editoren laver den om til tekst, brikker og blokke.'));
      body.append(h('label', { class: 'fld' }, h('span', null, 'Skabelon'), h('textarea', { id: 'imp-src', spellcheck: 'false', placeholder: '<#-- @ftlvariable name="data" type="..." -->\nKære ${(data.loaner.name)!"låner"} …' })));
      const tsel = h('select', { id: 'imp-type' }, h('option', { value: '' }, 'Find selv ud fra skabelonen'),
        CATALOG.types.map((t) => h('option', { value: t.id }, t.title + ' (' + t.id + ')')));
      body.append(h('div', { class: 'inline', style: { alignItems: 'end' } },
        h('label', { class: 'fld', style: { flex: '2 1 260px' } }, h('span', null, 'Beskedtype'), tsel),
        h('label', { class: 'fld', style: { flex: '1 1 160px' } }, h('span', null, 'Den er til'), h('select', { id: 'imp-prot' }, h('option', { value: '' }, 'Gæt selv'), Object.entries(CAT.PROTOCOLS).map(([k, p]) => h('option', { value: k }, p.label))))));
      body.append(h('div', { id: 'imp-err' }));
    }, (foot, close) => {
      foot.append(h('button', { class: 'btn', onclick: close }, 'Annullér'), h('button', { class: 'btn primary', onclick: () => doImport(close) }, 'Indlæs'));
    }, { wide: true });
  }
  function doImport(close) {
    const src = $('#imp-src').value;
    const err = $('#imp-err');
    if (!src.trim()) { err.replaceChildren(h('div', { class: 'err' }, 'Sæt en skabelon ind først.')); return; }
    let r;
    const ftlTypes = Object.assign({}, CAT.KNOWN_FTL_TYPES, S.settings.ftlTypes);
    try { r = MODEL.importFtl(src, { ftlTypes, protocol: $('#imp-prot').value || null }); }
    catch (e) { err.replaceChildren(h('div', { class: 'err' }, h('b', null, 'Skabelonen kunne ikke læses' + (e.line ? ' (linje ' + e.line + ')' : '') + ': '), e.message)); return; }
    const chosen = $('#imp-type').value;
    const tid = chosen || r.msg.typeId;
    if (!tid) {
      err.replaceChildren(h('div', { class: 'err' }, h('b', null, 'Vælg beskedtypen. '), r.msg.ftlType ? 'Editoren kender ikke typen "' + r.msg.ftlType + '" endnu. Når du vælger den, husker editoren den til næste gang.' : 'Skabelonen siger ikke selv, hvilken type den er.'));
      $('#imp-type').focus();
      return;
    }
    if (r.msg.ftlType && chosen && !CAT.KNOWN_FTL_TYPES[r.msg.ftlType]) S.settings.ftlTypes[r.msg.ftlType] = chosen;
    if (msg && S.typeId) S.drafts[S.typeId] = toModel(msg);
    r.msg.typeId = tid;
    S.typeId = tid;
    const t = type();
    if (!t.protocols.includes(r.msg.protocol)) r.msg.notes.push('Beskedtypen har normalt ikke en ' + CAT.PROTOCOLS[r.msg.protocol].label + '-skabelon.');
    let blocksCount = 0;
    const countCode = (nodes) => MODEL.walkNodes(nodes, (n) => { if (n.t === 'code' && !/^<#setting\s+locale/.test(n.code)) blocksCount++; });
    countCode(r.msg.prelude); r.msg.variants.forEach((v) => countCode(v.body));
    if (blocksCount) r.msg.notes.push(blocksCount + ' stykke(r) kode kunne ikke laves om til brikker og står som kodeblokke. De bevares uændret.');
    msg = toUi(r.msg); active = 0; undoStack = [];
    close();
    renderAll(); changed();
    toast('Skabelonen er indlæst.');
  }
  function openNew() {
    ask('Start forfra på "' + type().title + '"?', 'Den nuværende tekst til denne beskedtype erstattes af en tom besked. Du kan fortryde bagefter.', 'Start forfra', () => {
      snapshot();
      msg = toUi(MODEL.newMessage(type(), msg.protocol));
      active = 0; renderAll(); changed();
    });
  }
  function openSettings() {
    modal('Indstillinger', (body) => {
      body.append(h('div', { class: 'fld' }, h('span', null, 'Sprog, I skriver beskeder på'),
        h('div', { class: 'inline' }, Object.entries(LANGS).map(([k, l]) => h('label', { class: 'inline', style: { gap: '4px' } },
          h('input', { type: 'checkbox', checked: S.settings.langs.includes(k), disabled: k === 'da', onchange: (e) => { S.settings.langs = Object.keys(LANGS).filter((x) => x === 'da' || (x === k ? e.target.checked : S.settings.langs.includes(x))); saveStore(); } }), l))),
        h('span', { class: 'help' }, 'Valgte sprog kan tilføjes som varianter med ét klik. Lånere med andre sprog får den danske tekst.')));
      const saved = h('div', { class: 'saved' });
      const drawSaved = () => {
        saved.replaceChildren(...(S.settings.conds.length ? S.settings.conds.map((s, i) => h('div', { class: 's' },
          h('span', { class: 'n' }, h('b', null, s.name), h('br'), h('span', { class: 'd' }, condText(s.cond))),
          h('button', { class: 'iconbtn', title: 'Slet', 'aria-label': 'Slet ' + s.name, onclick: () => { S.settings.conds.splice(i, 1); saveStore(); drawSaved(); } }, ICON.del))) : [h('span', { class: 'muted' }, 'Ingen gemte betingelser endnu.')]));
      };
      drawSaved();
      body.append(h('div', { class: 'fld' }, h('span', null, 'Gemte betingelser'), saved,
        h('span', { class: 'help' }, 'Gem betingelser fra betingelses-dialogen med "Gem til senere". Lånergrupper hedder noget forskelligt på hvert bibliotek, så skriv jeres egne.')));
      body.append(h('label', { class: 'fld' }, h('span', null, 'Bibliotekets navn i forhåndsvisningen'),
        h('input', { type: 'text', value: S.settings.libraryName, placeholder: 'Fx Gladsaxe Bibliotekerne', oninput: (e) => { S.settings.libraryName = e.target.value; saveStore(); changed(); } })));
      const own = Object.entries(S.settings.ftlTypes);
      if (own.length) body.append(h('div', { class: 'fld' }, h('span', null, 'Typenavne editoren har lært'),
        h('div', { class: 'saved' }, own.map(([k, v]) => h('div', { class: 's' }, h('span', { class: 'n mono', style: { fontSize: '12.5px' } }, k + ' → ' + v),
          h('button', { class: 'iconbtn', onclick: (e) => { delete S.settings.ftlTypes[k]; saveStore(); e.target.closest('.s').remove(); } }, ICON.del))))));
      body.append(h('div', { class: 'fld' }, h('span', null, 'Kladder'), h('span', { class: 'help' }, 'Editoren husker én kladde pr. beskedtype i denne browser (' + Object.keys(S.drafts).length + ' gemt). Intet sendes nogen steder hen.'),
        h('div', null, h('button', { class: 'btn small danger', onclick: () => ask('Slet alle kladder og indstillinger?', 'Alt, editoren har gemt i denne browser, slettes.', 'Slet alt', () => { try { localStorage.removeItem(STORE); } catch (e) { } S = defaults(); init(); }) }, 'Slet alt gemt'))));
    }, (foot, close) => { foot.append(h('button', { class: 'btn primary', onclick: () => { close(); renderAll(); } }, 'Færdig')); });
  }

  // ---------- forhåndsvisning ----------
  function renderPreviewShell() {
    const t = S.test;
    const langs = Array.from(new Set(['da'].concat(S.settings.langs)));
    return [
      h('div', { class: 'panel-h' }, h('h2', null, 'Resultat'),
        h('div', { class: 'pv-tabs', role: 'tablist' },
          h('button', { role: 'tab', 'aria-selected': String(view === 'preview'), onclick: () => { view = 'preview'; renderPreviewOnly(); } }, 'Forhåndsvisning'),
          h('button', { role: 'tab', 'aria-selected': String(view === 'code'), onclick: () => { view = 'code'; renderPreviewOnly(); } }, 'Kode')),
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'btn primary', onclick: copyCode }, svg('copy'), 'Kopiér til Cicero')),
      h('div', { class: 'testdata' },
        h('div', { class: 'f' }, h('label', { for: 'td-count' }, 'Antal'), h('select', { id: 'td-count', onchange: (e) => { S.test.count = +e.target.value; changed(); } }, [1, 2, 3].map((n) => h('option', { value: n, selected: t.count === n }, n)))),
        h('div', { class: 'f' }, h('label', { for: 'td-lang' }, 'Sprog'), h('select', { id: 'td-lang', onchange: (e) => { S.test.lang = e.target.value; changed(); } }, Object.entries(LANGS).map(([k, l]) => h('option', { value: k, selected: t.lang === k }, l)))),
        h('div', { class: 'f' }, h('label', { for: 'td-groups' }, 'Lånergrupper'), h('input', { type: 'text', id: 'td-groups', value: t.groups, title: 'Adskil flere grupper med komma. Brug / for niveauer, fx Skole/Elever/9b', oninput: (e) => { S.test.groups = e.target.value; changed(); } })),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'td-child', checked: t.child, onchange: (e) => { S.test.child = e.target.checked; changed(); } }), 'Under 18'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'td-per', checked: t.periodical, onchange: (e) => { S.test.periodical = e.target.checked; changed(); } }), 'Periodikum'),
        h('button', { class: 'btn small ghost lnk', onclick: openTestJson }, S.test.json ? 'Egne testdata (aktiv)' : 'Ret testdata')),
      h('div', { class: 'panel-b', id: 'pv-body' })
    ];
  }
  function renderPreviewOnly() { const p = $('#preview'); p.replaceChildren(...renderPreviewShell()); renderPreview(); }
  function testData() {
    const t = type();
    if (S.test.json) {
      try { return JSON.parse(S.test.json, (k, v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) ? new Date(v) : v); } catch (e) { /* falder tilbage */ }
    }
    return CAT.buildData(t, { count: S.test.count, lang: S.test.lang, groups: S.test.groups.split(',').map((s) => s.trim()).filter(Boolean), child: S.test.child, periodical: S.test.periodical, libraryName: S.settings.libraryName, protocol: msg.protocol });
  }
  function openTestJson() {
    modal('Testdata', (body) => {
      body.append(h('p', { class: 'muted', style: { margin: 0 } }, 'Her kan du rette de data, forhåndsvisningen bruger. Datoer skrives som 2026-10-13T12:00:00.000Z.'));
      const ta = h('textarea', { id: 'td-json', class: 'tdjson', spellcheck: 'false' });
      ta.value = S.test.json || JSON.stringify(CAT.buildData(type(), { count: S.test.count, lang: S.test.lang, groups: S.test.groups.split(',').map((s) => s.trim()).filter(Boolean), child: S.test.child, periodical: S.test.periodical, libraryName: S.settings.libraryName }), null, 2);
      body.append(ta, h('div', { id: 'td-err' }));
    }, (foot, close) => {
      foot.append(h('button', { class: 'btn left', onclick: () => { S.test.json = null; close(); renderPreviewOnly(); saveStore(); } }, 'Brug standarddata'),
        h('button', { class: 'btn', onclick: close }, 'Annullér'),
        h('button', { class: 'btn primary', onclick: () => {
          const v = $('#td-json').value;
          try { JSON.parse(v); } catch (e) { $('#td-err').replaceChildren(h('div', { class: 'err' }, 'Ugyldig JSON: ' + e.message)); return; }
          S.test.json = v; close(); renderPreviewOnly(); saveStore();
        } }, 'Brug'));
    }, { wide: true });
  }

  function currentCode() { return MODEL.generate(toModel(msg), type()); }

  function renderPreview() {
    const body = $('#pv-body');
    if (!body) return;
    const t = type();
    const model = toModel(msg);
    let code = '', out = '', err = null, vi = -1;
    try { code = MODEL.generate(model, t); } catch (e) { err = e; }
    const data = testData();
    if (!err) {
      try { out = FTL.render(code, data); } catch (e) { err = e; }
      try {
        const probe = MODEL.generate(model, t, { probe: true });
        const m = /\u00a7(\d+)\u00a7/.exec(FTL.render(probe, data));
        vi = m ? +m[1] : -1;
      } catch (e) { vi = -1; }
    }
    const prevV = lastRender.variant;
    lastRender = { out, err, variant: vi, code };
    if (prevV !== vi) document.querySelectorAll('.vtab').forEach((el, i) => {
      const dot = el.querySelector('.live');
      if (i === vi && !dot) el.prepend(h('span', { class: 'live', title: 'Det er denne variant, forhåndsvisningen viser' }));
      if (i !== vi && dot) dot.remove();
    });
    body.replaceChildren();
    if (view === 'code') {
      const lines = code.split('\n');
      const pre = h('pre', { class: 'codeview', 'aria-label': 'FreeMarker-kode' });
      lines.forEach((l, i) => { const el = h('span', { class: 'l' + (err && err.line === i + 1 ? ' hl' : ''), html: hl(l) }); pre.append(el); });
      if (err) body.append(errorBox(err));
      body.append(pre);
    } else {
      if (msg.variants.length > 1 && vi >= 0) body.append(h('div', { style: { marginBottom: '10px' } }, h('span', { class: 'vbadge' }, 'Viser varianten: ' + variantLabel(msg.variants[vi], vi))));
      if (err) body.append(errorBox(err));
      else body.append(renderOutput(out));
    }
    body.append(lintBox(model));
    const key = t.keys[msg.protocol];
    body.append(h('div', { class: 'where' },
      h('div', null, h('b', null, 'Sæt den ind i Cicero:')),
      h('div', null, 'Mobile: Admin → Notifikationer → "' + t.title + '" → skabelonen for ' + CAT.PROTOCOLS[msg.protocol].label + '.'),
      key ? h('div', null, 'LMS: F7 → Serveropsætning → ', h('code', null, key)) : null,
      h('div', null, 'Brug Ciceros egen Forhåndsvisning, før du gemmer. Den er facit.')));
  }
  function hl(line) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let s = esc(line);
    s = s.replace(/(&lt;#--.*?--&gt;)/g, '\u0001cm\u0002$1\u0003');
    s = s.replace(/(&lt;\/?#[^&]*?(?:&gt;|$))/g, (m) => m.includes('\u0001') ? m : '\u0001tg\u0002' + m + '\u0003');
    s = s.replace(/(\$\{[^}]*\})/g, '\u0001ip\u0002$1\u0003');
    return s.replace(/\u0001(\w+)\u0002/g, '<span class="$1">').replace(/\u0003/g, '</span>');
  }
  function errorBox(e) {
    return h('div', { class: 'err', style: { marginBottom: '10px' } }, h('b', null, 'Cicero ville stoppe her' + (e.line ? ' (linje ' + e.line + ')' : '') + ': '), e.message,
      view !== 'code' && e.line ? h('div', null, h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => { view = 'code'; renderPreviewOnly(); } }, 'Vis i koden')) : null);
  }
  function renderOutput(out) {
    const proto = CAT.PROTOCOLS[msg.protocol];
    let text = out.replace(/^\s+/, '');
    if (msg.protocol === 'SMS') {
      const t = text.replace(/\s+$/, '');
      const gsm = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/.test(t);
      const ext = (t.match(/[\^{}\\[~\]|€]/g) || []).length;
      const len = t.length + (gsm ? ext : 0);
      const per = gsm ? (len <= 160 ? 160 : 153) : (len <= 70 ? 70 : 67);
      const parts = Math.max(1, Math.ceil(len / per));
      return h('div', null, h('div', { class: 'sms' }, t || ' '),
        h('div', { class: 'smsmeta' }, len + ' tegn · ', parts > 1 ? h('b', { class: 'warn' }, parts + ' SMS\'er') : '1 SMS', gsm ? '' : ' · indeholder tegn, der gør SMS\'en kortere (fx emoji)'));
    }
    let subject = '', rest = text;
    if (proto.subject) { const i = text.indexOf('\n'); subject = (i < 0 ? text : text.slice(0, i)).trim(); rest = i < 0 ? '' : text.slice(i + 1); }
    const mail = h('div', { class: 'mail' }, h('div', { class: 'mail-h' }, h('span', { class: 'meta' }, proto.label + ' · emne'), h('span', { class: 's' }, subject || h('span', { class: 'muted' }, '(intet emne)'))));
    if (msg.format !== 'text') {
      const host = h('div', { class: 'mail-b html' });
      try {
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<style>:host{display:block;font:15px/1.5 system-ui,sans-serif;color:#111}</style>' + rest.replace(/<script[\s\S]*?<\/script>/gi, '');
      } catch (e) { host.textContent = rest; }
      mail.append(host);
    } else mail.append(h('div', { class: 'mail-b' }, rest.replace(/\s+$/, '')));
    return mail;
  }
  function lintBox(model) {
    const t = type();
    const warns = [];
    const seen = new Set();
    const check = (path, scope, where) => {
      if (!path) return;
      const full = resolve(path, scope);
      if (!/^data\./.test(full) || t.byPath[full] || seen.has(full)) return;
      // tillad dele af stier (fx data.reservations[0])
      if (t.fields.some((f) => f.path.startsWith(full + '.'))) return;
      seen.add(full);
      warns.push(h('div', { class: 'w' }, 'Feltet ', h('code', null, path), ' findes ikke i "' + t.title + '"' + (where ? ' (' + where + ')' : '') + '. Cicero vil vise en fejl eller ingenting.'));
    };
    const scanCode = (code, scope) => { (code.match(/\bdata(\.[\p{L}_$][\p{L}\p{N}_$]*|\[\d+\])+/gu) || []).forEach((p) => check(p, scope, 'i kode')); };
    const condPaths = (c, scope) => { if (!c) return; if (c.path) check(c.path, scope, 'i betingelse'); if (c.c) condPaths(c.c, scope); (c.items || []).forEach((x) => condPaths(x, scope)); if (c.k === 'raw') scanCode(c.code || '', scope); };
    const walk = (nodes, scope) => (nodes || []).forEach((n) => {
      if (n.t === 'field' || n.t === 'plural') check(n.path, scope);
      if (n.t === 'expr' || n.t === 'code') scanCode(n.code, scope);
      if (n.t === 'list') { check(n.path, scope, 'i liste'); walk(n.body, Object.assign({}, scope, { [n.as]: resolve(n.path, scope) })); }
      if (n.t === 'if') { n.branches.forEach((b) => { condPaths(b.cond, scope); walk(b.body, scope); }); walk(n.else, scope); }
    });
    walk(model.prelude, {});
    model.variants.forEach((v) => { condPaths(v.cond, {}); walk(v.subject, {}); walk(v.head, {}); walk(v.body, {}); walk(v.tail, {}); });
    if (msg.protocol !== 'SMS' && model.variants.some((v) => !v.subject.length)) warns.push(h('div', { class: 'w' }, 'En variant har intet emne. Første linje i teksten bliver så emnet.'));
    if (/\b(200|100|50)\s*kr/.test(JSON.stringify(model.variants.map((v) => v.body))) && t.byPath['data.loanerBlockNoticeAmountThreshold']) warns.push(h('div', { class: 'w' }, 'Teksten nævner et fast beløb. Feltet "Konfigureret beløbsgrænse" følger med, hvis grænsen ændres i Cicero.'));
    return warns.length ? h('div', { class: 'lint' }, warns) : h('span');
  }
  function copyCode() {
    const code = currentCode();
    const done = () => toast('Kopieret. Sæt den ind i Cicero, og tjek med Ciceros forhåndsvisning.');
    const fallback = () => {
      view = 'code'; renderPreviewOnly();
      const pre = $('.codeview');
      if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      toast('Koden er markeret. Tryk Ctrl+C (eller Kopiér) for at kopiere.');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
