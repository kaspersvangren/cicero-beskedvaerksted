/* Beskedmodel: indlæsning af FreeMarker -> varianter/blokke/brikker, og generering tilbage.
   Kræver FTL (engine.js). */
(function (root) {
  'use strict';
  const FTL = root.FTL || (typeof require !== 'undefined' ? require('./engine.js') : null);

  const FRAME_HEAD = '<html>\n<head>\n<meta http-equiv="content-type" content="text/html;charset=UTF-8"/>\n<style>p { margin-top: 0; white-space: pre-line; }</style>\n</head>\n<body>\n<p>';
  const FRAME_TAIL = '</p>\n</body>\n</html>\n';
  const FTL_PKG = 'com.dantek.dl.api.notification.datamodel.';
  let uid = 1;
  const nid = () => 'n' + (uid++).toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- hjælpere til udtryk ----------
  function unparen(e) { while (e && e.k === 'paren') e = e.e; return e; }
  function pathOf(e) {
    e = unparen(e);
    if (!e) return null;
    if (e.k === 'var') return e.name;
    if (e.k === 'dot') { const b = pathOf(e.e); return b ? b + '.' + e.name : null; }
    if (e.k === 'index' && e.idx.k === 'num') { const b = pathOf(e.e); return b ? b + '[' + e.idx.v + ']' : null; }
    return null;
  }
  const isPathExpr = (e) => { e = unparen(e); return !!e && (e.k === 'var' || e.k === 'dot') && pathOf(e) != null; };

  // ---------- betingelser ----------
  function condFromExpr(e, flags) {
    const raw = { k: 'raw', code: e.src.trim() };
    e = unparen(e);
    if (!e) return raw;
    if (e.k === 'var' && flags[e.name]) return Object.assign({}, flags[e.name]);
    if (e.k === 'not') { const c = condFromExpr(e.e, flags); return c.k === 'raw' ? raw : { k: 'not', c }; }
    // sprog: a?? && a.preferredLanguage?? && a.preferredLanguage == "en"   eller  ((x.preferredLanguage)!"") == "en"
    const lang = langOf(e);
    if (lang) return { k: 'lang', code: lang };
    const age = ageOf(e.src || '');
    if (age) return age;
    if (e.k === 'and' || e.k === 'or') {
      const items = [];
      const walk = (x, top) => { const u = unparen(x); if (u.k === e.k && (top || (!ageOf(x.src || '') && !langOf(u)))) { walk(u.l); walk(u.r); } else items.push(x); };
      walk(e, true);
      const conds = items.map((x) => condFromExpr(x, flags));
      if (conds.some((c) => c.k === 'raw')) return raw;
      return { k: e.k === 'and' ? 'all' : 'any', items: conds };
    }
    if (e.k === 'bi' && e.name === 'has_content' && !e.args && isPathExpr(e.e)) return { k: 'has', path: pathOf(e.e) };
    if (e.k === 'exists' && isPathExpr(e.e)) return { k: 'exists', path: pathOf(e.e) };
    if (e.k === 'default' && e.d && e.d.k === 'bool' && e.d.v === false && isPathExpr(e.e)) return { k: 'true', path: pathOf(e.e) };
    if (isPathExpr(e)) return { k: 'true', path: pathOf(e), strict: true };
    if (e.k === 'cmp') {
      const l = unparen(e.l), r = unparen(e.r);
      const sizeOf = (x) => { x = unparen(x); if (x.k === 'bi' && x.name === 'size' && !x.args) { const inner = unparen(x.e); if (isPathExpr(inner)) return pathOf(inner); if (inner.k === 'default' && isPathExpr(inner.e) && inner.d && inner.d.k === 'seq' && !inner.d.items.length) return pathOf(inner.e); } return null; };
      const sp = sizeOf(l);
      if (sp && r.k === 'num') {
        if (e.op === '==' && r.v === 1) return { k: 'count', path: sp, op: 'one' };
        if (e.op === '==' && r.v === 0) return { k: 'count', path: sp, op: 'none' };
        if ((e.op === '>' && r.v === 1) || (e.op === '>=' && r.v === 2)) return { k: 'count', path: sp, op: 'many' };
        if ((e.op === '>' && r.v === 0) || (e.op === '>=' && r.v === 1) || (e.op === '!=' && r.v === 0)) return { k: 'count', path: sp, op: 'some' };
      }
    }
    return raw;
  }
  function langOf(e) {
    e = unparen(e);
    const cmpLang = (x) => {
      x = unparen(x);
      if (x.k !== 'cmp' || x.op !== '==') return null;
      const r = unparen(x.r); if (r.k !== 'str') return null;
      let l = unparen(x.l);
      if (l.k === 'default' && l.d && l.d.k === 'str' && l.d.v === '') l = unparen(l.e);
      const p = pathOf(l);
      return p && /(^|\.)(preferredLanguage|loanerPreferredLanguage)$/.test(p) ? r.v : null;
    };
    const direct = cmpLang(e);
    if (direct) return direct;
    if (e.k === 'and') {
      const items = [];
      const walk = (x) => { x = unparen(x); if (x.k === 'and') { walk(x.l); walk(x.r); } else items.push(x); };
      walk(e);
      const last = cmpLang(items[items.length - 1]);
      if (last && items.slice(0, -1).every((x) => x.k === 'exists' && isPathExpr(x.e))) return last;
    }
    return null;
  }
  const AGE_RE = /^\(\((.+?)\)\?\? && \(\1\)\?date\?string\("yyyyMMdd"\)\?number \+ (\d+)0000 (>|<=) \.now\?date\?string\("yyyyMMdd"\)\?number\)$/;
  function ageOf(src) {
    src = src.trim();
    const m = AGE_RE.exec(src) || AGE_RE.exec('(' + src + ')');
    return m ? { k: 'age', op: m[3] === '>' ? 'under' : 'atleast', years: parseInt(m[2], 10) } : null;
  }

  // ---------- indlæsning ----------
  function importFtl(src, opts) {
    opts = opts || {};
    const warnings = [];
    const tree = FTL.parse(src);
    const msg = { v: 1, typeId: null, ftlType: null, protocol: opts.protocol || null, format: 'text', prelude: [], variants: [], notes: [] };
    let body = tree.body.slice();

    // @ftlvariable
    body = body.filter((n) => {
      if (n.type === 'comment') {
        const m = /@ftlvariable\s+name\s*=\s*"data"\s+type\s*=\s*"([\w.$]+)"/.exec(n.text);
        if (m) { msg.ftlType = m[1].split('.').pop(); msg.ftlTypeFull = m[1]; return false; }
      }
      return true;
    });

    // flag-mønstre (lånergruppe og sprog) i starten
    const flags = {};
    const isWs = (n) => n.type === 'text' && !/\S/.test(n.v);
    for (let i = 0; i < body.length; i++) {
      const n = body[i];
      // gruppe-flag: <#assign X = false> ... <#list GROUPS as g><#if g.FIELD?starts_with("v")><#assign X = true></#if></#list>
      if (n.type === 'assign' && n.assigns.length === 1 && unparen(n.assigns[0].expr).k === 'bool' && unparen(n.assigns[0].expr).v === false) {
        const name = n.assigns[0].name;
        let j = i + 1; while (j < body.length && (isWs(body[j]) || body[j].type === 'comment')) j++;
        const L = body[j];
        const g = L && L.type === 'list' ? groupPattern(L, name) : null;
        if (g) {
          flags[name] = Object.assign({ k: 'group', flag: name }, g);
          // fjern evt. kommentarer lige før og selve mønstret
          let a = i; while (a > 0 && (body[a - 1].type === 'comment' || isWs(body[a - 1]))) a--;
          body.splice(a, j - a + 1); i = a - 1; continue;
        }
      }
      if (n.type === 'assign' && n.assigns.length && n.assigns.every((a) => langOf(a.expr))) {
        for (const a of n.assigns) flags[a.name] = { k: 'lang', code: langOf(a.expr), flag: a.name };
        body.splice(i, 1); i--; continue;
      }
    }

    // omsæt alle noder
    const conv = (nodes) => convertNodes(nodes, flags, src, warnings);
    // prelude: noder uden output før første output
    const pre = [];
    while (body.length && (body[0].type === 'comment' || body[0].type === 'setting' || body[0].type === 'assign' || body[0].type === 'capture' || isWs(body[0]) || body[0].type === 'noop')) {
      const n = body.shift();
      if (!isWs(n)) pre.push(n);
    }
    msg.prelude = conv(pre);

    // varianter: alle top-niveau-if'er har samme betingelseskæde, og første output ligger i en if
    const ifs = body.filter((n) => n.type === 'if');
    const firstOut = body.find((n) => !isWs(n) && n.type !== 'comment');
    const chainKey = (n) => n.branches.map((b) => b.cond.src.replace(/\s+/g, '')).join('|') + (n.elseBody ? '|else' : '');
    const rest = body.filter((n) => n.type !== 'if' && !isWs(n));
    const canExpand = ifs.length && firstOut && firstOut.type === 'if' && ifs.every((n) => chainKey(n) === chainKey(ifs[0])) &&
      rest.every((n) => ['text', 'comment', 'setting', 'interp'].includes(n.type)) && !isPluralIf(firstOut);
    if (canExpand) {
      const k = ifs[0].branches.length + (ifs[0].elseBody ? 1 : 0);
      for (let b = 0; b < k; b++) {
        const nodes = [];
        for (const n of body) {
          if (n.type === 'if') nodes.push(...(b < n.branches.length ? n.branches[b].body : n.elseBody));
          else nodes.push(n);
        }
        const cond = b < ifs[0].branches.length ? condFromExpr(ifs[0].branches[b].cond, flags) : null;
        msg.variants.push({ id: nid(), cond, body: conv(nodes) });
      }
    } else {
      msg.variants.push({ id: nid(), cond: null, body: conv(body) });
    }

    // format og protokol
    const allText = msg.variants.map((v) => v.body.filter((x) => x.t === 'text').map((x) => x.v).join('')).join('');
    if (/<html[\s>]/i.test(allText)) {
      msg.format = 'html';
      if (!msg.protocol) msg.protocol = 'DIGITAL_POST';
    }
    if (!msg.protocol) msg.protocol = guessSms(msg) ? 'SMS' : 'EMAIL';
    const hasSubject = msg.protocol !== 'SMS';
    for (const v of msg.variants) {
      trimLeading(v.body);
      const s = hasSubject ? splitSubject(v.body) : [];
      v.subject = s || [];
      if (hasSubject && s === null) msg.notes.push('Emnelinjen kunne ikke skilles ud i en af varianterne – den står som første linje i teksten.');
    }
    if (msg.format === 'html') {
      // kun hvis alle varianter er i vores egen ramme, kan teksten redigeres uden HTML
      const un = msg.variants.map((v) => unframe(v.body));
      if (un.every(Boolean)) { msg.variants.forEach((v, i) => { v.body = un[i]; }); msg.format = 'html-frame'; }
      else {
        msg.format = 'html-raw';
        for (const v of msg.variants) {
          const sp = splitFrame(v.body);
          if (sp) { v.head = sp.head; v.body = sp.body; v.tail = sp.tail; }
        }
      }
    }
    if (msg.ftlType && opts.ftlTypes && opts.ftlTypes[msg.ftlType]) msg.typeId = opts.ftlTypes[msg.ftlType];
    const unusedLang = Object.entries(flags).filter(([name]) => !JSON.stringify(msg).includes('"flag":"' + name + '"')).map(([n]) => n);
    if (unusedLang.length) msg.notes.push('Variablen ' + unusedLang.join(', ') + ' blev defineret, men aldrig brugt. Den er udeladt.');
    return { msg, warnings };
  }

  function guessSms(msg) {
    const v = msg.variants[msg.variants.length - 1];
    const text = v.body.filter((x) => x.t === 'text').map((x) => x.v).join('');
    const lines = text.trim().split('\n').filter((l) => l.trim());
    return lines.length <= 3 && !/^(Kære|Dear|Hej)/m.test(text);
  }

  function groupPattern(L, name) {
    // <#list GROUPS as g> <#if g.FIELD?starts_with("x")> <#assign name = true /> </#if> </#list>
    const strip = (arr) => arr.filter((n) => !(n.type === 'text' && !/\S/.test(n.v)) && n.type !== 'comment');
    const inner = strip(L.body);
    if (inner.length !== 1 || inner[0].type !== 'if' || inner[0].branches.length !== 1 || inner[0].elseBody) return null;
    const ifn = inner[0];
    const ib = strip(ifn.branches[0].body);
    if (ib.length !== 1 || ib[0].type !== 'assign' || ib[0].assigns.length !== 1 || ib[0].assigns[0].name !== name) return null;
    const val = unparen(ib[0].assigns[0].expr); if (val.k !== 'bool' || val.v !== true) return null;
    let seq = unparen(L.seq); if (seq.k === 'default') seq = seq.e;
    const listPath = pathOf(seq); if (!listPath || !/loanerGroups$/.test(listPath)) return null;
    let c = unparen(ifn.branches[0].cond);
    let match = null, value = null, field = null;
    if (c.k === 'bi' && ['starts_with', 'contains', 'ends_with'].includes(c.name) && c.args && c.args.length === 1 && unparen(c.args[0]).k === 'str') {
      match = { starts_with: 'starts', contains: 'contains', ends_with: 'ends' }[c.name]; value = unparen(c.args[0]).v; field = pathOf(c.e);
    } else if (c.k === 'cmp' && c.op === '==' && unparen(c.r).k === 'str') {
      match = 'equals'; value = unparen(c.r).v; field = pathOf(c.l);
    }
    if (!field || !field.startsWith(L.v + '.')) return null;
    const f = field.slice(L.v.length + 1);
    const scope = { loanerGroupName: 'name', loanerGroupNameWithHierarchyPath: 'path', loanerGroupNameWithRoot: 'root' }[f];
    if (!scope) return null;
    return { match, value, scope, listPath };
  }

  function isPluralIf(n) {
    if (!n || n.type !== 'if' || n.branches.length !== 1 || !n.elseBody) return false;
    const c = condFromExpr(n.branches[0].cond, {});
    const pure = (arr) => arr.every((x) => x.type === 'text' && !x.v.includes('\n'));
    return c.k === 'count' && c.op === 'one' && pure(n.branches[0].body) && pure(n.elseBody);
  }

  function convertNodes(nodes, flags, src, warnings) {
    const out = [];
    const push = (x) => {
      const last = out[out.length - 1];
      if (x.t === 'text' && last && last.t === 'text') last.v += x.v; else out.push(x);
    };
    for (const n of nodes) {
      switch (n.type) {
        case 'text': push({ t: 'text', v: n.v }); break;
        case 'comment': push({ t: 'comment', id: nid(), text: n.text.trim() }); break;
        case 'interp': push(interpNode(n.expr)); break;
        case 'if': {
          if (isPluralIf(n)) {
            const c = condFromExpr(n.branches[0].cond, {});
            push({ t: 'plural', id: nid(), path: c.path, one: n.branches[0].body.map((x) => x.v).join(''), many: n.elseBody.map((x) => x.v).join('') });
            break;
          }
          push({
            t: 'if', id: nid(),
            branches: n.branches.map((b) => ({ cond: condFromExpr(b.cond, flags), body: convertNodes(b.body, flags, src, warnings) })),
            else: n.elseBody ? convertNodes(n.elseBody, flags, src, warnings) : null
          });
          break;
        }
        case 'list': {
          const p = pathOf(n.seq);
          if (p && !n.elseBody && !n.v2 && !n.body.some((x) => x.type === 'sep')) {
            push({ t: 'list', id: nid(), path: p, as: n.v, body: convertNodes(n.body, flags, src, warnings) });
            break;
          }
          push(codeNode(src.slice(n.start, n.end)));
          break;
        }
        default:
          push(codeNode(src.slice(n.start, n.end)));
      }
    }
    return out;
  }
  function codeNode(code) { return { t: 'code', id: nid(), code }; }

  function interpNode(e) {
    const code = e.src.trim();
    let x = e, fb = null;
    if (x.k === 'default') { fb = x.d ? (x.d.k === 'str' && !x.d.raw && !x.d.v.includes('${') ? x.d.v : undefined) : ''; x = unparen(x.e); }
    if (fb === undefined) return { t: 'expr', id: nid(), code };
    x = unparen(x);
    if (isPathExpr(x)) return { t: 'field', id: nid(), path: pathOf(x), fb };
    // dato: P?date?string["fmt"] / P?string["fmt"]
    if (x.k === 'bi' && x.name === 'string' && x.args && x.args.length === 1 && unparen(x.args[0]).k === 'str') {
      let inner = unparen(x.e), kind = null;
      if (inner.k === 'bi' && ['date', 'datetime', 'time'].includes(inner.name) && !inner.args) { kind = inner.name; inner = unparen(inner.e); }
      if (isPathExpr(inner) && kind) return { t: 'field', id: nid(), path: pathOf(inner), fb, date: unparen(x.args[0]).v, dkind: kind };
      if (isPathExpr(inner) && !kind && /^[#0,.]+$/.test(unparen(x.args[0]).v)) return { t: 'field', id: nid(), path: pathOf(inner), fb, numfmt: unparen(x.args[0]).v };
    }
    // afkortning: P[0..*N]
    if (x.k === 'index' && x.idx.k === 'range' && x.idx.op === '..*' && x.idx.l.k === 'num' && x.idx.l.v === 0 && x.idx.r && x.idx.r.k === 'num' && isPathExpr(x.e)) {
      return { t: 'field', id: nid(), path: pathOf(x.e), fb, trunc: x.idx.r.v };
    }
    return { t: 'expr', id: nid(), code };
  }

  function trimLeading(nodes) {
    while (nodes.length && nodes[0].t === 'text') {
      const v = nodes[0].v.replace(/^\s+/, '');
      if (v) { nodes[0].v = v; break; }
      nodes.shift();
    }
  }

  // Emnet er første linje. Returnerer emne-noder og fjerner dem (inkl. linjeskift) fra body.
  function splitSubject(nodes) {
    const subj = [];
    while (nodes.length) {
      const n = nodes[0];
      if (n.t === 'text') {
        const i = n.v.indexOf('\n');
        if (i >= 0) {
          const head = n.v.slice(0, i).replace(/[ \t]+$/, '');
          if (head) subj.push({ t: 'text', v: head });
          n.v = n.v.slice(i + 1);
          if (!n.v) nodes.shift();
          return subj;
        }
        subj.push(nodes.shift());
      } else if (n.t === 'field' || n.t === 'expr' || n.t === 'plural') {
        subj.push(nodes.shift());
      } else if (n.t === 'comment') {
        nodes.shift();
      } else {
        // blok i emnelinjen kan ikke skilles ad – læg emnet tilbage
        nodes.unshift(...subj);
        return null;
      }
    }
    return subj;
  }

  function unframe(nodes) {
    if (!nodes.length) return null;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (first.t !== 'text' || last.t !== 'text' || !first.v.startsWith(FRAME_HEAD)) return null;
    const lastV = nodes.length === 1 ? first.v.slice(FRAME_HEAD.length) : last.v;
    if (!lastV.endsWith(FRAME_TAIL)) return null;
    const copy = nodes.map((n) => Object.assign({}, n));
    copy[0].v = copy[0].v.slice(FRAME_HEAD.length);
    const L = copy[copy.length - 1]; L.v = L.v.slice(0, -FRAME_TAIL.length);
    const un = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const walk = (arr) => arr.filter((n) => {
      if (n.t === 'text') { n.v = un(n.v); return n.v !== ''; }
      if (n.t === 'plural') { n.one = un(n.one); n.many = un(n.many); }
      if (n.body) n.body = walk(n.body);
      if (n.branches) n.branches.forEach((b) => { b.body = walk(b.body); });
      if (n.else) n.else = walk(n.else);
      return true;
    });
    return walk(copy);
  }

  // Generisk HTML: alt til og med første <p> er "hoved", alt fra sidste </p> er "hale".
  function splitFrame(nodes) {
    let hi = -1, hpos = -1, ti = -1, tpos = -1;
    for (let i = 0; i < nodes.length && hi < 0; i++) {
      if (nodes[i].t !== 'text') continue;
      const m = /<p(\s[^>]*)?>/i.exec(nodes[i].v);
      if (m) { hi = i; hpos = m.index + m[0].length; }
    }
    for (let i = nodes.length - 1; i >= 0 && ti < 0; i--) {
      if (nodes[i].t !== 'text') continue;
      const k = nodes[i].v.toLowerCase().lastIndexOf('</p>');
      if (k >= 0) { ti = i; tpos = k; }
    }
    if (hi < 0 || ti < 0 || ti < hi || (ti === hi && tpos < hpos)) return null;
    const head = nodes.slice(0, hi).concat([{ t: 'text', v: nodes[hi].v.slice(0, hpos) }]);
    let body, tail;
    if (hi === ti) {
      body = [{ t: 'text', v: nodes[hi].v.slice(hpos, tpos) }];
    } else {
      body = [{ t: 'text', v: nodes[hi].v.slice(hpos) }].concat(nodes.slice(hi + 1, ti), [{ t: 'text', v: nodes[ti].v.slice(0, tpos) }]);
    }
    tail = [{ t: 'text', v: nodes[ti].v.slice(tpos) }].concat(nodes.slice(ti + 1));
    // flyt afsluttende whitespace fra brødteksten til halen
    const last = body[body.length - 1];
    if (last && last.t === 'text') { const m = /\s+$/.exec(last.v); if (m) { last.v = last.v.slice(0, m.index); tail[0].v = m[0] + tail[0].v; } }
    return { head: head.filter((n) => n.t !== 'text' || n.v), body: body.filter((n) => n.t !== 'text' || n.v), tail: tail.filter((n) => n.t !== 'text' || n.v) };
  }

  // ---------- generering ----------
  const LOCALE_OF = { da: 'da_DK', en: 'en_US', sv: 'sv_SE', nb: 'nb_NO', de: 'de_DE', fo: 'fo_FO' };
  function walkNodes(nodes, fn) {
    for (const n of nodes || []) {
      fn(n);
      if (n.body) walkNodes(n.body, fn);
      if (n.branches) n.branches.forEach((b) => walkNodes(b.body, fn));
      if (n.else) walkNodes(n.else, fn);
    }
  }
  const usesNamedDates = (nodes) => { let r = false; walkNodes(nodes, (n) => { if (n.t === 'field' && n.date && /E|MMM/.test(n.date.replace(/'[^']*'/g, ''))) r = true; }); return r; };
  const hasLocaleSetting = (nodes) => (nodes || []).some((n) => n.t === 'code' && /<#setting\s+locale/.test(n.code));

  function generate(msg, type, opts) {
    opts = opts || {};
    const P = (type && type.paths) || {};
    const segs = [];
    const html = msg.format === 'html-frame';
    let escOn = true;
    const esc = (s) => html && escOn ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : s;
    const ftlText = (s) => s.replace(/\$\{/g, '${"$"}{').replace(/#\{/g, '${"#"}{').replace(/<(\/?)([#@])/g, '${"<"}$1$2').replace(/\[(\/?)#/g, '${"["}$1#');
    const lastIsLineStart = () => {
      for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i];
        if (s.k === 'sent') return true;
        if (s.k === 'txt') { if (s.s === '') continue; return s.s.endsWith('\n'); }
        return false;
      }
      return true;
    };
    const txt = (s) => { if (s) segs.push({ k: 'txt', s: ftlText(s) }); };
    const int = (s) => segs.push({ k: 'int', s });
    const tag = (s, block) => { const ls = block && lastIsLineStart(); segs.push({ k: 'tag', s }); if (ls) segs.push({ k: 'sent' }); };
    const rawCode = (s) => {
      const hasOut = /\$\{/.test(s) || /<#(switch|compress|attempt)/.test(s);
      const ls = lastIsLineStart();
      segs.push({ k: hasOut ? 'int' : 'tag', s });
      if (ls && !hasOut) segs.push({ k: 'sent' });
    };

    // flag-definitioner (lånergrupper)
    const groupFlags = [];
    const flagFor = (c) => {
      const key = [c.match, c.value, c.scope, c.listPath || P.groups].join('\u0001');
      let f = groupFlags.find((g) => g.key === key);
      if (!f) {
        let name = c.flag && /^[A-Za-z_]\w*$/.test(c.flag) ? c.flag : 'gruppe' + (groupFlags.length + 1);
        while (groupFlags.some((g) => g.name === name)) name += '_';
        f = { key, name, c }; groupFlags.push(f);
      }
      return f.name;
    };
    const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$\{/g, '\\${') + '"';
    const pexpr = (p) => p; // stier skrives direkte

    function condCode(c, top) {
      let s;
      switch (c.k) {
        case 'has': s = '(' + pexpr(c.path) + ')?has_content'; break;
        case 'exists': s = '(' + pexpr(c.path) + ')??'; break;
        case 'true': s = c.strict ? pexpr(c.path) : '(' + pexpr(c.path) + ')!false'; break;
        case 'count': s = pexpr(c.path) + '?size' + ({ one: ' == 1', none: ' == 0', many: ' > 1', some: ' > 0' }[c.op] || ' == 1'); break;
        case 'lang': s = '((' + (P.lang || 'data.loaner.preferredLanguage') + ')!"") == ' + q(c.code); break;
        case 'group': s = flagFor(c); break;
        case 'underage': s = '(' + (P.underage || 'data.underageLoaner.isUnderage') + ')!false'; break;
        case 'age': {
          const dob = P.dob || 'data.loaner.dateOfBirth';
          s = '((' + dob + ')?? && (' + dob + ')?date?string("yyyyMMdd")?number + ' + (c.years | 0) + '0000 ' + (c.op === 'under' ? '>' : '<=') + ' .now?date?string("yyyyMMdd")?number)';
          break;
        }
        case 'not': { const inner = condCode(c.c, true); s = /^[\w.]+$/.test(inner) ? '!' + inner : '!(' + inner + ')'; break; }
        case 'all': case 'any': {
          const items = (c.items || []).map((x) => condCode(x, false));
          if (!items.length) { s = c.k === 'all' ? 'true' : 'false'; break; }
          s = items.join(c.k === 'all' ? ' && ' : ' || ');
          if (!top && items.length > 1) s = '(' + s + ')';
          break;
        }
        case 'raw': s = c.code || 'true'; if (!top && /\s(&&|\|\|)\s/.test(s)) s = '(' + s + ')'; break;
        default: s = 'true';
      }
      return s;
    }

    function fieldCode(n) {
      let inner;
      if (n.date) inner = n.path + '?' + (n.dkind || 'date') + '?string[' + q(n.date) + ']';
      else if (n.trunc) inner = n.path + '[0..*' + (n.trunc | 0) + ']';
      else if (n.numfmt) inner = n.path + '?string[' + q(n.numfmt) + ']';
      else inner = n.path;
      if (n.fb == null) return '${' + inner + '}';
      return '${(' + inner + ')!' + q(n.fb) + '}';
    }

    function emit(nodes) {
      for (const n of nodes) {
        switch (n.t) {
          case 'text': txt(esc(n.v)); break;
          case 'field': int(fieldCode(n)); break;
          case 'expr': int('${' + n.code + '}'); break;
          case 'plural':
            tag('<#if ' + n.path + '?size == 1>', false); txt(esc(n.one || '')); tag('<#else>', false); txt(esc(n.many || '')); tag('</#if>', false);
            break;
          case 'comment': tag('<#-- ' + n.text.replace(/--+>/g, '- ->') + ' -->', true); break;
          case 'code': rawCode(n.code); break;
          case 'list':
            tag('<#list ' + n.path + ' as ' + (n.as || 'x') + '>', true); emit(n.body || []); tag('</#list>', true); break;
          case 'if': {
            const br = n.branches || [];
            if (!br.length) { emit(n.else || []); break; }
            br.forEach((b, i) => { tag((i ? '<#elseif ' : '<#if ') + condCode(b.cond, true) + '>', true); emit(b.body || []); });
            if (n.else) { tag('<#else>', true); emit(n.else); }
            tag('</#if>', true);
            break;
          }
        }
      }
    }

    const allNodes = [].concat(msg.prelude || [], ...(msg.variants || []).map((v) => [].concat(v.subject || [], v.head || [], v.body || [], v.tail || [])));
    const namedDates = usesNamedDates(allNodes);
    function variantContent(v, i) {
      if (opts.probe) { txt('\u00a7' + i + '\u00a7'); return; }
      const subj = msg.protocol !== 'SMS' && v.subject;
      if (subj && subj.length) { escOn = false; emit(subj); escOn = true; txt('\n'); }
      if (namedDates && v.cond && v.cond.k === 'lang' && LOCALE_OF[v.cond.code] && !hasLocaleSetting(v.body) && !hasLocaleSetting(v.head)) {
        tag('<#setting locale="' + LOCALE_OF[v.cond.code] + '">', true);
      }
      if (html) { txt(FRAME_HEAD); emit(v.body); txt(FRAME_TAIL); }
      else { emit(v.head || []); emit(v.body); emit(v.tail || []); }
    }

    // header
    if (msg.ftlType) tag('<#-- @ftlvariable name="data" type="' + (msg.ftlTypeFull || FTL_PKG + msg.ftlType) + '" -->', true);
    const headerAt = segs.length;
    emit(msg.prelude || []);
    if (msg.prelude && msg.prelude.length && !lastIsLineStart()) txt('\n');
    const vs = msg.variants || [];
    const conds = vs.filter((v) => v.cond);
    if (!conds.length) {
      vs.slice(0, 1).forEach((v) => variantContent(v, 0));
    } else {
      vs.forEach((v, i) => {
        if (i && !lastIsLineStart()) txt('\n');
        if (v.cond) tag((i ? '<#elseif ' : '<#if ') + condCode(v.cond, true) + '>', true);
        else tag('<#else>', true);
        variantContent(v, i);
      });
      if (!lastIsLineStart()) txt('\n');
      tag('</#if>', true);
    }
    // indsæt flag-definitioner (og evt. dansk sprogindstilling) efter header
    const fsegs = [];
    const autoLocale = namedDates && !hasLocaleSetting(msg.prelude);
    if (groupFlags.length || autoLocale) {
      for (const f of groupFlags) {
        const field = { name: 'loanerGroupName', path: 'loanerGroupNameWithHierarchyPath', root: 'loanerGroupNameWithRoot' }[f.c.scope] || 'loanerGroupName';
        const test = f.c.match === 'equals' ? 'g.' + field + ' == ' + q(f.c.value) : 'g.' + field + '?' + ({ starts: 'starts_with', contains: 'contains', ends: 'ends_with' }[f.c.match] || 'starts_with') + '(' + q(f.c.value) + ')';
        const lp = f.c.listPath || P.groups || 'data.loaner.loanerGroups';
        fsegs.push({ k: 'tag', s: '<#assign ' + f.name + ' = false />' }, { k: 'sent' },
          { k: 'tag', s: '<#list (' + lp + ')![] as g><#if ' + test + '><#assign ' + f.name + ' = true /></#if></#list>' }, { k: 'sent' });
      }
      if (autoLocale) fsegs.push({ k: 'tag', s: '<#setting locale="da_DK">' }, { k: 'sent' });
      segs.splice(headerAt, 0, ...fsegs);
    }
    return finish(segs);
  }

  // Sørg for at FreeMarkers whitespace-stripping giver præcis det ønskede output.
  function finish(segs) {
    const isTagLike = (k) => k === 'tag';
    for (let guard = 0; guard < 50; guard++) {
      let changed = false;
      // del i linjer
      const lines = [];
      let cur = { parts: [], term: null };
      segs.forEach((s, i) => {
        if (s.k === 'sent') { cur.term = { k: 'sent', i }; lines.push(cur); cur = { parts: [], term: null }; return; }
        if (s.k === 'txt') {
          let off = 0;
          const pieces = s.s.split('\n');
          pieces.forEach((p, j) => {
            if (p) cur.parts.push({ k: 'txt', s: p, i });
            if (j < pieces.length - 1) { cur.term = { k: 'nl', i }; lines.push(cur); cur = { parts: [], term: null }; }
          });
          return;
        }
        cur.parts.push({ k: s.k, i });
      });
      lines.push(cur);
      const guards = [], removeSent = [];
      for (const L of lines) {
        const hasTag = L.parts.some((p) => isTagLike(p.k));
        const hasInt = L.parts.some((p) => p.k === 'int');
        const txtWsOnly = L.parts.every((p) => p.k !== 'txt' || !/\S/.test(p.s));
        const strippable = hasTag && !hasInt && txtWsOnly;
        const hasRealWs = L.parts.some((p) => p.k === 'txt' && p.s.length) || (L.term && L.term.k === 'nl');
        if (strippable && hasRealWs) {
          const firstIdx = L.parts.length ? L.parts[0].i : (L.term ? L.term.i : 0);
          guards.push(firstIdx);
        }
        if (!strippable && L.term && L.term.k === 'sent') removeSent.push(L.term.i);
      }
      if (removeSent.length) {
        const set = new Set(removeSent);
        segs = segs.filter((s, i) => !set.has(i));
        changed = true;
      } else if (guards.length) {
        // indsæt ${""} før første del af linjen
        const set = [...new Set(guards)].sort((a, b) => b - a);
        for (const i of set) {
          // hvis linjen starter midt i en txt-segment efter et linjeskift, deles segmentet
          const s = segs[i];
          if (s.k === 'txt' && s.s.includes('\n')) {
            const cut = s.s.lastIndexOf('\n') + 1;
            segs.splice(i, 1, { k: 'txt', s: s.s.slice(0, cut) }, { k: 'int', s: '${""}' }, { k: 'txt', s: s.s.slice(cut) });
          } else segs.splice(i, 0, { k: 'int', s: '${""}' });
        }
        changed = true;
      }
      if (!changed) break;
    }
    return segs.map((s) => s.k === 'sent' ? '\n' : s.s).join('');
  }

  // ---------- nye beskeder ----------
  function newMessage(type, protocol) {
    const p = protocol || 'EMAIL';
    const nameP = (type && type.paths && type.paths.name) || 'data.loaner.name';
    const agency = type && type.byPath && type.byPath['data.agency.name'] ? 'data.agency.name' : null;
    const hasName = type && type.paths && type.paths.name;
    const body = hasName || !type ? [{ t: 'text', v: 'Kære ' }, { t: 'field', id: nid(), path: nameP, fb: /loaner/i.test(nameP) ? 'låner' : '' }, { t: 'text', v: '\n\n\n\nMed venlig hilsen\n' }]
      : [{ t: 'text', v: 'Hej\n\n\n\nMed venlig hilsen\n' }];
    if (agency) body.push({ t: 'field', id: nid(), path: agency, fb: '' });
    return {
      v: 1, typeId: type ? type.id : null, ftlType: null, protocol: p,
      format: p === 'DIGITAL_POST' || p === 'PHYSICAL_LETTER' ? 'html-frame' : 'text',
      prelude: [], notes: [],
      variants: [{ id: nid(), cond: null, subject: [{ t: 'text', v: type ? type.title : '' }], body: p === 'SMS' ? [{ t: 'text', v: '' }] : body }]
    };
  }

  const api = { importFtl, generate, newMessage, condFromExpr, nid, walkNodes, FRAME_HEAD, FRAME_TAIL, LOCALE_OF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MODEL = api;
})(typeof window !== 'undefined' ? window : globalThis);
