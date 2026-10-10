/* FreeMarker-delmængde til forhåndsvisning af Cicero-skabeloner.
   Lexer -> whitespace-stripping -> parser -> evaluator.
   Fejl kastes som FtlError med dansk besked og linjenummer. */
(function (root) {
  'use strict';

  class FtlError extends Error {
    constructor(msg, pos, src) {
      super(msg);
      this.pos = pos;
      this.line = (pos != null && src) ? src.slice(0, pos).split('\n').length : null;
    }
  }

  // ---------- Lexer ----------
  function scanExprEnd(src, i, closer) {
    // finder slutningen af et udtryk inde i et tag/interpolation; respekterer strenge og parenteser
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'") {
        const q = c; i++;
        while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        i++; continue;
      }
      if (c === 'r' && (src[i + 1] === '"' || src[i + 1] === "'") && !/[\w$]/.test(src[i - 1] || '')) {
        const q = src[i + 1]; i += 2;
        while (i < src.length && src[i] !== q) i++;
        i++; continue;
      }
      if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
      if (c === ')' || c === ']') { depth--; i++; continue; }
      if (c === '}') {
        if (depth === 0 && closer === '}') return i;
        depth--; i++; continue;
      }
      if (closer === '>' && depth <= 0) {
        if (c === '/' && src[i + 1] === '>') return i;
        if (c === '>') return i;
      }
      i++;
    }
    return -1;
  }

  function lex(src) {
    const toks = [];
    let i = 0, textStart = 0;
    const flushText = (end) => { if (end > textStart) toks.push({ type: 'text', start: textStart, end, raw: src.slice(textStart, end) }); };
    while (i < src.length) {
      if (src.startsWith('<#--', i) || src.startsWith('[#--', i)) {
        flushText(i);
        const close = src.indexOf(src[i] === '<' ? '-->' : '--]', i + 4);
        const end = close < 0 ? src.length : close + 3;
        toks.push({ type: 'comment', start: i, end, text: src.slice(i + 4, close < 0 ? src.length : close) });
        i = textStart = end; continue;
      }
      let m;
      if (src[i] === '<' && (m = /^<(#|@)([\p{L}_][\p{L}\p{N}_]*)/u.exec(src.slice(i, i + 60)))) {
        flushText(i);
        const name = m[2];
        const pStart = i + m[0].length;
        const endIdx = scanExprEnd(src, pStart, '>');
        if (endIdx < 0) throw new FtlError('Tag <' + m[1] + name + ' er ikke lukket med >', i, src);
        const selfClose = src[endIdx] === '/';
        const end = endIdx + (selfClose ? 2 : 1);
        toks.push({ type: m[1] === '#' ? 'dir' : 'macro', name, params: src.slice(pStart, endIdx).trim(), selfClose, start: i, end });
        i = textStart = end; continue;
      }
      if (src[i] === '<' && (m = /^<\/(#|@)([\p{L}_][\p{L}\p{N}_.]*)?\s*>/u.exec(src.slice(i, i + 60)))) {
        flushText(i);
        toks.push({ type: m[1] === '#' ? 'end' : 'macroend', name: m[2] || '', start: i, end: i + m[0].length });
        i = textStart = i + m[0].length; continue;
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        flushText(i);
        const endIdx = scanExprEnd(src, i + 2, '}');
        if (endIdx < 0) throw new FtlError('${ er ikke lukket med }', i, src);
        toks.push({ type: 'interp', expr: src.slice(i + 2, endIdx), exprStart: i + 2, start: i, end: endIdx + 1 });
        i = textStart = endIdx + 1; continue;
      }
      i++;
    }
    flushText(src.length);
    return toks;
  }

  // FreeMarker fjerner indrykning og linjeskift på linjer, der kun indeholder FTL-tags/kommentarer.
  function stripWhitespace(src, toks) {
    const strip = new Uint8Array(src.length);
    const lineStarts = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
    let ti = 0;
    for (let li = 0; li < lineStarts.length; li++) {
      const ls = lineStarts[li];
      const nl = li + 1 < lineStarts.length ? lineStarts[li + 1] - 1 : src.length; // index of '\n' or end
      const le = Math.min(nl + 1, src.length); // exclusive, includes newline
      while (ti > 0 && toks[ti - 1].end > ls) ti--;
      while (ti < toks.length && toks[ti].end <= ls) ti++;
      let hasTag = false, hasOther = false;
      for (let k = ti; k < toks.length && toks[k].start < le; k++) {
        const t = toks[k];
        if (t.type === 'text') {
          const a = Math.max(t.start, ls), b = Math.min(t.end, le);
          if (/\S/.test(src.slice(a, b))) hasOther = true;
        } else if (t.type === 'interp' || t.type === 'macro' || t.type === 'macroend') {
          hasOther = true;
        } else hasTag = true;
      }
      if (hasTag && !hasOther) for (let k = ls; k < le; k++) strip[k] = 1;
    }
    for (const t of toks) {
      if (t.type !== 'text') continue;
      let v = '';
      for (let k = t.start; k < t.end; k++) if (!strip[k]) v += src[k];
      t.value = v;
    }
    return toks;
  }

  // ---------- Udtryk ----------
  const OPS = ['..<', '..!', '..*', '->', '??', '==', '!=', '<=', '>=', '&&', '||', '..', '+=', '-=', '++', '--',
    '!', '=', '<', '>', '+', '-', '*', '/', '%', '(', ')', '[', ']', '{', '}', ',', ':', '.', '?', ';'];

  function lexExpr(s, base) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const st = i;
      if (c === '"' || c === "'" || (c === 'r' && (s[i + 1] === '"' || s[i + 1] === "'"))) {
        const raw = c === 'r';
        if (raw) i++;
        const q = s[i]; i++;
        let v = '';
        while (i < s.length && s[i] !== q) {
          if (!raw && s[i] === '\\') {
            const e = s[i + 1];
            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", $: '$', '{': '{', l: '<', g: '>', a: '&', f: '\f', b: '\b' };
            if (e === 'x') {
              const hm = /^[0-9a-fA-F]{1,4}/.exec(s.slice(i + 2));
              v += String.fromCharCode(parseInt(hm[0], 16)); i += 2 + hm[0].length; continue;
            }
            v += map[e] != null ? (e === '$' || e === '{' ? '\\' + e : map[e]) : e; i += 2; continue;
          }
          v += s[i]; i++;
        }
        if (i >= s.length) throw new FtlError('Tekststreng er ikke afsluttet', base + st);
        i++;
        out.push({ t: 'str', v, raw, pos: base + st, end: base + i });
        continue;
      }
      let m;
      if ((m = /^\d+(\.\d+)?/.exec(s.slice(i))) && !(s[i - 1] === '.' && s[i - 2] === '.' && false)) {
        // undgå at "1..5" bliver 1. og .5
        let num = m[0];
        if (m[1] && s[i + num.length - m[1].length] === '.' && s[i + num.length - m[1].length + 1] === '.') num = m[0].replace(m[1], '');
        if (/^\d+\.$/.test(num)) num = num.slice(0, -1);
        if (s.slice(i).startsWith(num + '..')) { /* ok */ }
        out.push({ t: 'num', v: parseFloat(num), pos: base + st, end: base + st + num.length });
        i += num.length; continue;
      }
      if ((m = /^[\p{L}_$@][\p{L}\p{N}_$@]*/u.exec(s.slice(i)))) {
        out.push({ t: 'id', v: m[0], pos: base + st, end: base + st + m[0].length });
        i += m[0].length; continue;
      }
      if (c === '\\' && (m = /^\\(lte|lt|gte|gt)\b/.exec(s.slice(i)))) {
        out.push({ t: 'id', v: m[1], pos: base + st, end: base + st + m[0].length });
        i += m[0].length; continue;
      }
      let op = null;
      for (const o of OPS) if (s.startsWith(o, i)) { op = o; break; }
      if (!op) throw new FtlError('Ukendt tegn i udtryk: ' + c, base + i);
      out.push({ t: 'op', v: op, pos: base + st, end: base + st + op.length });
      i += op.length;
    }
    out.push({ t: 'eof', pos: base + s.length, end: base + s.length });
    return out;
  }

  function parseExpr(s, base, opts) {
    base = base || 0;
    const toks = lexExpr(s, base);
    let p = 0;
    const peek = (k) => toks[p + (k || 0)];
    const isOp = (v, k) => { const t = peek(k); return t.t === 'op' && t.v === v; };
    const isId = (v, k) => { const t = peek(k); return t.t === 'id' && t.v === v; };
    const eat = (v) => { if (!isOp(v)) throw new FtlError('Forventede "' + v + '" i udtrykket', peek().pos); return toks[p++]; };
    const srcOf = (a, b) => s.slice(a - base, b - base);
    const mk = (node, a) => { node.pos = a; node.end = toks[p - 1].end; node.src = srcOf(a, node.end); return node; };

    function parseOr() {
      const a = peek().pos; let l = parseAnd();
      while (isOp('||') || isId('or')) { p++; const r = parseAnd(); l = mk({ k: 'or', l, r }, a); }
      return l;
    }
    function parseAnd() {
      const a = peek().pos; let l = parseEq();
      while (isOp('&&') || isId('and')) { p++; const r = parseEq(); l = mk({ k: 'and', l, r }, a); }
      return l;
    }
    function parseEq() {
      const a = peek().pos; let l = parseRel();
      while (isOp('==') || isOp('!=') || (isOp('=') && !(opts && opts.assign))) {
        const op = toks[p++].v; const r = parseRel(); l = mk({ k: 'cmp', op: op === '=' ? '==' : op, l, r }, a);
      }
      return l;
    }
    function parseRel() {
      const a = peek().pos; let l = parseRange();
      for (;;) {
        let op = null;
        if (isOp('<') || isOp('<=') || isOp('>=') || isOp('>')) op = peek().v;
        else if (isId('lt')) op = '<'; else if (isId('lte')) op = '<='; else if (isId('gt')) op = '>'; else if (isId('gte')) op = '>=';
        if (!op) break;
        p++; const r = parseRange(); l = mk({ k: 'cmp', op, l, r }, a);
      }
      return l;
    }
    function parseRange() {
      const a = peek().pos; const l = parseAdd();
      if (isOp('..') || isOp('..<') || isOp('..!') || isOp('..*')) {
        const op = toks[p++].v;
        let r = null;
        const t = peek();
        if (!(t.t === 'eof' || (t.t === 'op' && (t.v === ']' || t.v === ')' || t.v === ',')))) r = parseAdd();
        return mk({ k: 'range', op, l, r }, a);
      }
      return l;
    }
    function parseAdd() {
      const a = peek().pos; let l = parseMul();
      while (isOp('+') || isOp('-')) { const op = toks[p++].v; const r = parseMul(); l = mk({ k: 'arith', op, l, r }, a); }
      return l;
    }
    function parseMul() {
      const a = peek().pos; let l = parseUnary();
      while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[p++].v; const r = parseUnary(); l = mk({ k: 'arith', op, l, r }, a); }
      return l;
    }
    function parseUnary() {
      const a = peek().pos;
      if (isOp('!')) { p++; const e = parseUnary(); return mk({ k: 'not', e }, a); }
      if (isOp('-')) { p++; const e = parseUnary(); return mk({ k: 'neg', e }, a); }
      if (isOp('+')) { p++; return parseUnary(); }
      return parsePostfix();
    }
    function canStartPrimary(t) {
      if (t.t === 'str' || t.t === 'num') return true;
      if (t.t === 'id') return !['as', 'gt', 'gte', 'lt', 'lte', 'using', 'and', 'or'].includes(t.v);
      if (t.t === 'op') return t.v === '(' || t.v === '[' || t.v === '{' || t.v === '.';
      return false;
    }
    function parsePostfix() {
      const a = peek().pos;
      let e = parsePrimary();
      for (;;) {
        if (isOp('.') && peek(1).t === 'id') { p++; const name = toks[p++].v; e = mk({ k: 'dot', e, name }, a); continue; }
        if (isOp('[')) { p++; const idx = parseOr(); eat(']'); e = mk({ k: 'index', e, idx }, a); continue; }
        if (isOp('?') && peek(1).t === 'id') {
          p++; const name = toks[p++].v; let args = null;
          if (isOp('(')) { p++; args = []; if (!isOp(')')) { args.push(parseOr()); while (isOp(',')) { p++; args.push(parseOr()); } } eat(')'); }
          else if (name === 'string' && isOp('[')) { p++; args = [parseOr()]; eat(']'); }
          e = mk({ k: 'bi', e, name, args }, a); continue;
        }
        if (isOp('??')) { p++; e = mk({ k: 'exists', e }, a); continue; }
        if (isOp('(') && (e.k === 'var' || e.k === 'dot')) {
          p++; const args = []; if (!isOp(')')) { args.push(parseOr()); while (isOp(',')) { p++; args.push(parseOr()); } } eat(')');
          e = mk({ k: 'call', e, args }, a); continue;
        }
        if (isOp('!') && !isOp('=', 1)) {
          p++;
          let d = null;
          if (canStartPrimary(peek())) d = parsePostfixNoDefault();
          e = mk({ k: 'default', e, d }, a); continue;
        }
        break;
      }
      return e;
    }
    function parsePostfixNoDefault() {
      const a = peek().pos;
      let e = parsePrimary();
      for (;;) {
        if (isOp('.') && peek(1).t === 'id') { p++; const name = toks[p++].v; e = mk({ k: 'dot', e, name }, a); continue; }
        if (isOp('[')) { p++; const idx = parseOr(); eat(']'); e = mk({ k: 'index', e, idx }, a); continue; }
        if (isOp('?') && peek(1).t === 'id') {
          p++; const name = toks[p++].v; let args = null;
          if (isOp('(')) { p++; args = []; if (!isOp(')')) { args.push(parseOr()); while (isOp(',')) { p++; args.push(parseOr()); } } eat(')'); }
          else if (name === 'string' && isOp('[')) { p++; args = [parseOr()]; eat(']'); }
          e = mk({ k: 'bi', e, name, args }, a); continue;
        }
        break;
      }
      return e;
    }
    function parsePrimary() {
      const t = peek(); const a = t.pos;
      if (t.t === 'str') { p++; return mk({ k: 'str', v: t.v, raw: t.raw }, a); }
      if (t.t === 'num') { p++; return mk({ k: 'num', v: t.v }, a); }
      if (t.t === 'id') {
        p++;
        if (t.v === 'true') return mk({ k: 'bool', v: true }, a);
        if (t.v === 'false') return mk({ k: 'bool', v: false }, a);
        if (isOp('->')) { p++; const body = parseOr(); return mk({ k: 'lambda', params: [t.v], body }, a); }
        return mk({ k: 'var', name: t.v }, a);
      }
      if (t.t === 'op' && t.v === '.' && peek(1).t === 'id') { p += 2; return mk({ k: 'special', name: toks[p - 1].v }, a); }
      if (t.t === 'op' && t.v === '(') { p++; const e = parseOr(); eat(')'); return mk({ k: 'paren', e }, a); }
      if (t.t === 'op' && t.v === '[') {
        p++; const items = [];
        if (!isOp(']')) { items.push(parseOr()); while (isOp(',')) { p++; items.push(parseOr()); } }
        eat(']'); return mk({ k: 'seq', items }, a);
      }
      if (t.t === 'op' && t.v === '{') {
        p++; const pairs = [];
        if (!isOp('}')) {
          do { if (isOp(',')) p++; const key = parseOr(); eat(':'); const val = parseOr(); pairs.push([key, val]); } while (isOp(','));
        }
        eat('}'); return mk({ k: 'hash', pairs }, a);
      }
      throw new FtlError('Uventet "' + (t.v != null ? t.v : 'slut') + '" i udtrykket', t.pos);
    }
    const api = { parseOr, peek, isOp, isId, eat, toks, get p() { return p; }, set p(v) { p = v; } };
    if (opts && opts.custom) return opts.custom(api);
    const e = parseOr();
    if (peek().t !== 'eof') throw new FtlError('Uventet "' + peek().v + '" i udtrykket', peek().pos);
    return e;
  }

  // ---------- Parser (skabelon) ----------
  const BLOCK_DIRS = new Set(['if', 'list', 'switch', 'compress', 'attempt', 'macro', 'function', 'noparse', 'items', 'escape', 'noescape', 'autoesc', 'noautoesc', 'outputformat']);

  function parse(src) {
    const toks = stripWhitespace(src, lex(src));
    const rootNode = { type: 'root', body: [], start: 0, end: src.length };
    const stack = [{ node: rootNode, cur: rootNode.body }];
    const top = () => stack[stack.length - 1];
    for (const t of toks) {
      const cur = top().cur;
      if (t.type === 'text') { if (t.value) cur.push({ type: 'text', v: t.value, start: t.start, end: t.end }); continue; }
      if (t.type === 'comment') { cur.push({ type: 'comment', text: t.text, start: t.start, end: t.end }); continue; }
      if (t.type === 'interp') {
        cur.push({ type: 'interp', expr: parseExpr(t.expr, t.exprStart), start: t.start, end: t.end });
        continue;
      }
      if (t.type === 'macro' || t.type === 'macroend') { cur.push({ type: 'unknown', name: '@' + t.name, start: t.start, end: t.end }); continue; }
      const pBase = t.type === 'dir' ? src.indexOf(t.params, t.start + t.name.length + 2) : 0;
      if (t.type === 'dir') {
        const n = t.name;
        if (n === 'if') {
          const node = { type: 'if', branches: [{ cond: parseExpr(t.params, pBase, { inTag: true }), body: [], tagStart: t.start, tagEnd: t.end }], elseBody: null, start: t.start, end: null };
          cur.push(node); stack.push({ node, cur: node.branches[0].body, kind: 'if' });
        } else if (n === 'elseif') {
          const fr = top(); if (fr.kind !== 'if') throw new FtlError('<#elseif> uden <#if>', t.start, src);
          const br = { cond: parseExpr(t.params, pBase, { inTag: true }), body: [], tagStart: t.start, tagEnd: t.end };
          fr.node.branches.push(br); fr.cur = br.body;
        } else if (n === 'else') {
          const fr = top();
          if (fr.kind === 'if') { fr.node.elseBody = []; fr.node.elseTag = [t.start, t.end]; fr.cur = fr.node.elseBody; }
          else if (fr.kind === 'list') { fr.node.elseBody = []; fr.cur = fr.node.elseBody; }
          else throw new FtlError('<#else> uden <#if> eller <#list>', t.start, src);
        } else if (n === 'list') {
          const m = /^([\s\S]+?)\s+as\s+([\p{L}_$][\p{L}\p{N}_$]*)(?:\s*,\s*([\p{L}_$][\p{L}\p{N}_$]*))?\s*$/u.exec(t.params);
          if (!m) throw new FtlError('<#list> skal have formen <#list noget as navn>', t.start, src);
          const node = { type: 'list', seq: parseExpr(m[1], pBase), v: m[2], v2: m[3] || null, body: [], elseBody: null, start: t.start, end: null, tagStart: t.start, tagEnd: t.end };
          cur.push(node); stack.push({ node, cur: node.body, kind: 'list' });
        } else if (n === 'sep') {
          const node = { type: 'sep', start: t.start, end: t.end }; cur.push(node);
        } else if (n === 'assign' || n === 'global' || n === 'local') {
          const p = t.params;
          const cm = /^([\p{L}_$][\p{L}\p{N}_$]*)\s*$/u.exec(p);
          if (cm && !t.selfClose) {
            const node = { type: 'capture', name: cm[1], body: [], start: t.start, end: null };
            cur.push(node); stack.push({ node, cur: node.body, kind: 'capture', dirName: n });
          } else {
            const assigns = parseAssigns(p, pBase, t.start, src);
            cur.push({ type: 'assign', assigns, scope: n, start: t.start, end: t.end });
          }
        } else if (n === 'setting') {
          const m = /^([\p{L}_]+)\s*=\s*([\s\S]+)$/u.exec(t.params);
          if (!m) throw new FtlError('<#setting> skal have formen <#setting navn=værdi>', t.start, src);
          cur.push({ type: 'setting', name: m[1], expr: parseExpr(m[2], pBase + t.params.indexOf(m[2])), start: t.start, end: t.end });
        } else if (n === 'switch') {
          const node = { type: 'switch', expr: parseExpr(t.params, pBase), cases: [], start: t.start, end: null };
          cur.push(node); stack.push({ node, cur: [], kind: 'switch' });
        } else if (n === 'case' || n === 'default') {
          const fr = top(); if (fr.kind !== 'switch') throw new FtlError('<#' + n + '> uden <#switch>', t.start, src);
          const c = { def: n === 'default', expr: n === 'case' ? parseExpr(t.params, pBase) : null, body: [] };
          fr.node.cases.push(c); fr.cur = c.body;
        } else if (n === 'break') {
          cur.push({ type: 'break', start: t.start, end: t.end });
        } else if (n === 'compress') {
          const node = { type: 'compress', body: [], start: t.start, end: null }; cur.push(node); stack.push({ node, cur: node.body, kind: 'compress' });
        } else if (n === 'attempt') {
          const node = { type: 'attempt', body: [], recover: [], start: t.start, end: null }; cur.push(node); stack.push({ node, cur: node.body, kind: 'attempt' });
        } else if (n === 'recover') {
          const fr = top(); if (fr.kind !== 'attempt') throw new FtlError('<#recover> uden <#attempt>', t.start, src);
          fr.cur = fr.node.recover;
        } else if (n === 'ftl' || n === 't' || n === 'lt' || n === 'rt' || n === 'nt' || n === 'flush') {
          cur.push({ type: 'noop', name: n, start: t.start, end: t.end });
        } else if (BLOCK_DIRS.has(n) && !t.selfClose) {
          const node = { type: 'unknown', name: '#' + n, body: [], start: t.start, end: null, block: true };
          cur.push(node); stack.push({ node, cur: node.body, kind: 'unknown:' + n });
        } else {
          cur.push({ type: 'unknown', name: '#' + n, start: t.start, end: t.end });
        }
        continue;
      }
      if (t.type === 'end') {
        const fr = top();
        const expect = { if: 'if', list: 'list', capture: fr.dirName, switch: 'switch', compress: 'compress', attempt: 'attempt' }[fr.kind] || (fr.kind && fr.kind.startsWith('unknown:') ? fr.kind.slice(8) : null);
        if (!expect || expect !== t.name) throw new FtlError('</#' + t.name + '> passer ikke' + (expect ? ' – forventede </#' + expect + '>' : ''), t.start, src);
        fr.node.end = t.end; fr.node.endTag = [t.start, t.end];
        stack.pop();
      }
    }
    if (stack.length > 1) {
      const fr = top();
      throw new FtlError('<#' + (fr.kind || '').replace('unknown:', '').replace('capture', 'assign') + '> mangler sit slutmærke', fr.node.start, src);
    }
    return rootNode;
  }

  function parseAssigns(p, pBase, at, src) {
    return parseExpr(p, pBase, {
      custom(api) {
        const list = [];
        while (api.peek().t !== 'eof') {
          const t = api.peek();
          if (t.t !== 'id' && t.t !== 'str') throw new FtlError('Forventede et variabelnavn i <#assign>', t.pos, src);
          api.p = api.p + 1;
          const name = t.v;
          if (api.isOp('=')) { api.p = api.p + 1; list.push({ name, expr: api.parseOr() }); }
          else if (api.isOp('+=') || api.isOp('-=')) { const op = api.peek().v[0]; api.p = api.p + 1; list.push({ name, op, expr: api.parseOr() }); }
          else if (api.isOp('++') || api.isOp('--')) { const op = api.peek().v[0]; api.p = api.p + 1; list.push({ name, op, expr: { k: 'num', v: 1, src: '1' } }); }
          else throw new FtlError('Forventede = i <#assign>', api.peek().pos, src);
          if (api.isOp(',') || api.isOp(';')) api.p = api.p + 1;
        }
        return list;
      }
    });
  }

  // ---------- Evaluering ----------
  const MISSING = { missing: true, toString() { return '[mangler]'; } };
  class FtlDate { constructor(d, kind) { this.d = d; this.kind = kind; } }

  const LOCALES = {
    da: { months: ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'], days: ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'], tag: 'da-DK' },
    en: { months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], tag: 'en-US' },
    sv: { months: ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'], days: ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'], tag: 'sv-SE' },
    nb: { months: ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], days: ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'], tag: 'nb-NO' },
    de: { months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'], days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'], tag: 'de-DE' },
    fo: { months: ['januar', 'februar', 'mars', 'apríl', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'], days: ['sunnudagur', 'mánadagur', 'týsdagur', 'mikudagur', 'hósdagur', 'fríggjadagur', 'leygardagur'], tag: 'fo-FO' }
  };
  function locInfo(loc) {
    const l = String(loc || 'da').toLowerCase().split(/[_-]/)[0];
    return LOCALES[l === 'no' || l === 'nn' ? 'nb' : l] || LOCALES.en;
  }
  const pad = (n, w) => String(n).padStart(w, '0');
  function formatDate(d, pattern, loc) {
    const L = locInfo(loc);
    let out = '', i = 0;
    while (i < pattern.length) {
      const c = pattern[i];
      if (c === "'") {
        if (pattern[i + 1] === "'") { out += "'"; i += 2; continue; }
        const j = pattern.indexOf("'", i + 1);
        out += pattern.slice(i + 1, j < 0 ? pattern.length : j); i = j < 0 ? pattern.length : j + 1; continue;
      }
      if (/[a-zA-Z]/.test(c)) {
        let j = i; while (pattern[j] === c) j++;
        const n = j - i;
        switch (c) {
          case 'd': out += pad(d.getDate(), n); break;
          case 'M': out += n >= 4 ? L.months[d.getMonth()] : n === 3 ? L.months[d.getMonth()].slice(0, 3) : pad(d.getMonth() + 1, n); break;
          case 'L': out += n >= 4 ? L.months[d.getMonth()] : n === 3 ? L.months[d.getMonth()].slice(0, 3) : pad(d.getMonth() + 1, n); break;
          case 'y': out += n === 2 ? pad(d.getFullYear() % 100, 2) : pad(d.getFullYear(), n); break;
          case 'E': out += n >= 4 ? L.days[d.getDay()] : L.days[d.getDay()].slice(0, 3); break;
          case 'H': out += pad(d.getHours(), n); break;
          case 'h': out += pad(d.getHours() % 12 || 12, n); break;
          case 'm': out += pad(d.getMinutes(), n); break;
          case 's': out += pad(d.getSeconds(), n); break;
          case 'S': out += pad(d.getMilliseconds(), n); break;
          case 'a': out += d.getHours() < 12 ? 'AM' : 'PM'; break;
          case 'u': out += (d.getDay() || 7); break;
          case 'D': { const s0 = new Date(d.getFullYear(), 0, 1); out += pad(Math.floor((d - s0) / 864e5) + 1, n); break; }
          case 'w': { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); const w1 = new Date(t.getFullYear(), 0, 4); out += pad(1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7), n); break; }
          case 'z': case 'Z': case 'X': out += '+0200'; break;
          default: out += pattern.slice(i, j);
        }
        i = j; continue;
      }
      out += c; i++;
    }
    return out;
  }
  function namedDateFormat(d, name, kind, loc) {
    const tag = locInfo(loc).tag;
    const style = { short: 'short', medium: 'medium', long: 'long', full: 'full' }[name] || 'medium';
    const o = {};
    if (kind !== 'time') o.dateStyle = style;
    if (kind !== 'date') o.timeStyle = style;
    try { return new Intl.DateTimeFormat(tag, o).format(d); } catch (e) { return d.toISOString(); }
  }
  function formatNumber(n, fmt, loc) {
    const tag = locInfo(loc).tag;
    if (fmt === 'computer' || fmt === 'c') return cNum(n);
    if (!fmt || fmt === 'number') return new Intl.NumberFormat(tag, { maximumFractionDigits: 3 }).format(n);
    if (fmt === 'currency') return new Intl.NumberFormat(tag, { style: 'currency', currency: 'DKK' }).format(n);
    if (fmt === 'percent') return new Intl.NumberFormat(tag, { style: 'percent' }).format(n);
    const pat = fmt.split(';')[0];
    const m = /^([^0#,.]*)([#,0]*)(?:\.([0#]*))?(.*)$/.exec(pat);
    if (!m) return String(n);
    const frac = m[3] || '';
    const o = { minimumFractionDigits: (frac.match(/0/g) || []).length, maximumFractionDigits: frac.length, useGrouping: m[2].includes(',') };
    const intMin = (m[2].replace(/,/g, '').match(/0/g) || []).length;
    if (intMin > 1) o.minimumIntegerDigits = intMin;
    return m[1] + new Intl.NumberFormat(tag, o).format(n) + m[4];
  }
  const cNum = (n) => Number.isInteger(n) ? String(n) : String(+n.toFixed(16));

  function typeName(v) {
    if (v === MISSING || v == null) return 'mangler';
    if (typeof v === 'string') return 'tekst';
    if (typeof v === 'number') return 'tal';
    if (typeof v === 'boolean') return 'ja/nej';
    if (v instanceof Date || v instanceof FtlDate) return 'dato';
    if (Array.isArray(v)) return 'liste';
    if (typeof v === 'function' || (v && v.__lambda)) return 'funktion';
    return 'objekt';
  }
  const isDate = (v) => v instanceof Date || v instanceof FtlDate;
  const rawDate = (v) => v instanceof FtlDate ? v.d : v;

  function render(src, data, options) {
    options = options || {};
    const tree = typeof src === 'string' ? parse(src) : src;
    const text = typeof src === 'string' ? src : options.src;
    const ctx = {
      vars: Object.assign({}, options.globals || {}, { data }),
      locale: options.locale || 'da_DK',
      numberFormat: options.numberFormat || 'number',
      dateFormat: '', datetimeFormat: '', timeFormat: '', booleanFormat: null,
      loops: {},
      now: options.now || new Date(),
      out: [], steps: 0, src: text
    };
    const err = (msg, node) => new FtlError(msg, node && node.pos != null ? node.pos : (node && node.start), text);
    const describe = (e) => e && e.src ? e.src.trim() : 'udtryk';

    function get(obj, key, node, tolerant) {
      if (obj === MISSING || obj == null) {
        if (tolerant) return MISSING;
        throw err('"' + describe(node.e) + '" findes ikke, så ".' + key + '" kan ikke slås op. Brug evt. (' + describe(node.e) + '.' + key + ')!""', node);
      }
      if (Array.isArray(obj) || typeof obj !== 'object' || isDate(obj)) {
        if (tolerant) return MISSING;
        throw err('Kan ikke slå ".' + key + '" op i en værdi af typen ' + typeName(obj) + ' ("' + describe(node.e) + '")', node);
      }
      const v = Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
      return v === undefined || v === null ? MISSING : v;
    }

    function truthy(v, node) {
      if (typeof v === 'boolean') return v;
      if (v === MISSING) throw err('"' + describe(node) + '" findes ikke. Brug evt. ' + describe(node) + '?? eller (' + describe(node) + ')!false', node);
      throw err('Forventede ja/nej, men "' + describe(node) + '" er ' + typeName(v), node);
    }

    function toStr(v, node, forOutput) {
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return formatNumber(v, ctx.numberFormat, ctx.locale);
      if (v === MISSING) throw err('"' + describe(node) + '" findes ikke eller er tom. Brug evt. ${(' + describe(node) + ')!""}', node);
      if (typeof v === 'boolean') {
        if (ctx.booleanFormat) { const [a, b] = ctx.booleanFormat.split(','); return v ? a : b; }
        throw err('"' + describe(node) + '" er ja/nej og kan ikke skrives direkte. Brug ?string("Ja","Nej")', node);
      }
      if (v instanceof FtlDate) {
        const f = v.kind === 'date' ? ctx.dateFormat : v.kind === 'time' ? ctx.timeFormat : ctx.datetimeFormat;
        if (!f || ['short', 'medium', 'long', 'full'].includes(f)) return namedDateFormat(v.d, f || 'medium', v.kind, ctx.locale);
        return formatDate(v.d, f, ctx.locale);
      }
      if (v instanceof Date) throw err('"' + describe(node) + '" er en dato, og FreeMarker ved ikke, om den skal vises som dato eller tid. Brug ?date?string["d.M.yyyy"]', node);
      throw err('"' + describe(node) + '" er en ' + typeName(v) + ' og kan ikke skrives direkte' + (Array.isArray(v) ? ' – brug <#list>' : ''), node);
    }

    function interpString(s, node) {
      if (s.indexOf('${') < 0) return s.replace(/\\(\$|\{)/g, '$1');
      const sub = parse(s);
      const saved = ctx.out; ctx.out = [];
      try { execBody(sub.body, true); return ctx.out.join(''); } finally { ctx.out = saved; }
    }

    function ev(n, tolerant) {
      if (++ctx.steps > 2e6) throw err('Skabelonen kører for længe (uendelig løkke?)', n);
      switch (n.k) {
        case 'str': return n.raw ? n.v : interpString(n.v, n);
        case 'num': return n.v;
        case 'bool': return n.v;
        case 'var': {
          if (Object.prototype.hasOwnProperty.call(ctx.vars, n.name)) { const v = ctx.vars[n.name]; return v == null ? MISSING : v; }
          return MISSING;
        }
        case 'special': {
          if (n.name === 'now') return new FtlDate(ctx.now, 'datetime');
          if (n.name === 'locale') return ctx.locale;
          if (n.name === 'lang') return String(ctx.locale).split('_')[0];
          if (n.name === 'vars' || n.name === 'globals' || n.name === 'data_model') return ctx.vars;
          if (n.name === 'version') return '2.3.31';
          return MISSING;
        }
        case 'paren': return ev(n.e, tolerant);
        case 'dot': return get(ev(n.e, tolerant), n.name, n, tolerant);
        case 'index': {
          const base = ev(n.e, tolerant);
          if (n.idx.k === 'range') {
            if (base === MISSING) { if (tolerant) return MISSING; throw err('"' + describe(n.e) + '" findes ikke', n); }
            const a = ev(n.idx.l, tolerant);
            const len = (typeof base === 'string' || Array.isArray(base)) ? base.length : 0;
            let b;
            if (n.idx.r == null) b = len;
            else {
              const r = ev(n.idx.r, tolerant);
              if (n.idx.op === '..') b = r + 1; else if (n.idx.op === '..*') b = Math.min(a + r, len); else b = r;
            }
            if (typeof base === 'string' || Array.isArray(base)) {
              if (n.idx.op !== '..*' && (b > len || a > len)) throw err('Udsnit [' + n.idx.src + '] går ud over længden ' + len + ' af "' + describe(n.e) + '"', n);
              return base.slice(a, Math.max(a, b));
            }
            throw err('Kan ikke tage udsnit af ' + typeName(base), n);
          }
          const i = ev(n.idx, tolerant);
          if (base === MISSING) { if (tolerant) return MISSING; throw err('"' + describe(n.e) + '" findes ikke', n); }
          if (typeof i === 'number') {
            if (!Array.isArray(base) && typeof base !== 'string') { if (tolerant) return MISSING; throw err('"' + describe(n.e) + '" er ikke en liste', n); }
            const v = base[i];
            return v === undefined || v === null ? MISSING : v;
          }
          return get(base, toStr(i, n.idx), { e: n.e, pos: n.pos }, tolerant);
        }
        case 'default': {
          const v = ev(n.e, true);
          if (v !== MISSING) return v;
          return n.d ? ev(n.d, tolerant) : '';
        }
        case 'exists': {
          const v = ev(n.e, true);
          return v !== MISSING;
        }
        case 'not': return !truthy(ev(n.e, tolerant), n.e);
        case 'neg': { const v = ev(n.e, tolerant); if (typeof v !== 'number') throw err('Minus kræver et tal', n); return -v; }
        case 'and': return truthy(ev(n.l, tolerant), n.l) && truthy(ev(n.r, tolerant), n.r);
        case 'or': return truthy(ev(n.l, tolerant), n.l) || truthy(ev(n.r, tolerant), n.r);
        case 'cmp': {
          const a = ev(n.l, tolerant), b = ev(n.r, tolerant);
          if (a === MISSING) throw err('"' + describe(n.l) + '" findes ikke, så den kan ikke sammenlignes', n.l);
          if (b === MISSING) throw err('"' + describe(n.r) + '" findes ikke, så den kan ikke sammenlignes', n.r);
          let x = a, y = b;
          if (isDate(x) && isDate(y)) { x = rawDate(x).getTime(); y = rawDate(y).getTime(); }
          if (typeof x !== typeof y) throw err('Kan ikke sammenligne ' + typeName(a) + ' med ' + typeName(b) + ' ("' + n.src + '")', n);
          if ((n.op === '==' || n.op === '!=') ) return n.op === '==' ? x === y : x !== y;
          if (typeof x === 'boolean') throw err('Ja/nej-værdier kan kun sammenlignes med == og !=', n);
          switch (n.op) { case '<': return x < y; case '<=': return x <= y; case '>': return x > y; case '>=': return x >= y; }
          return false;
        }
        case 'arith': {
          const a = ev(n.l, tolerant), b = ev(n.r, tolerant);
          if (tolerant && (a === MISSING || b === MISSING)) return MISSING;
          if (n.op === '+') {
            if (typeof a === 'number' && typeof b === 'number') return a + b;
            if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
            if (a && b && typeof a === 'object' && typeof b === 'object' && !isDate(a) && !isDate(b) && !Array.isArray(a)) return Object.assign({}, a, b);
            return toStr(a, n.l) + toStr(b, n.r);
          }
          if (typeof a !== 'number' || typeof b !== 'number') throw err('Regneudtryk "' + n.src + '" kræver tal', n);
          switch (n.op) { case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b; }
          return 0;
        }
        case 'range': {
          const a = ev(n.l), b = n.r ? ev(n.r) : a;
          const end = n.op === '..' ? b : n.op === '..*' ? a + b - 1 : b - 1;
          const out = []; for (let i = a; i <= end; i++) out.push(i); return out;
        }
        case 'seq': return n.items.map((x) => ev(x, tolerant));
        case 'hash': { const o = {}; for (const [k, v] of n.pairs) o[toStr(ev(k), k)] = ev(v, tolerant); return o; }
        case 'bi': return builtin(n, tolerant);
        case 'call': {
          const f = ev(n.e, tolerant);
          if (f && f.__lambda) return f.call(n.args.map((a) => ev(a, tolerant)));
          throw err('"' + describe(n.e) + '" er ikke en funktion (egne funktioner via <#function> understøttes ikke i forhåndsvisningen)', n);
        }
        case 'lambda': return { __lambda: true, call: (args) => { const saved = ctx.vars[n.params[0]]; ctx.vars[n.params[0]] = args[0]; try { return ev(n.body); } finally { ctx.vars[n.params[0]] = saved; } } };
      }
      throw err('Ukendt udtryk', n);
    }

    function lambdaOf(argNode, tolerant) {
      const f = ev(argNode, tolerant);
      if (f && f.__lambda) return (x) => f.call([x]);
      throw err('Forventede en funktion som "x -> ..."', argNode);
    }

    function builtin(n, tolerant) {
      const name = n.name;
      // løkkevariabel-built-ins
      if (n.e.k === 'var' && ctx.loops[n.e.name]) {
        const L = ctx.loops[n.e.name];
        switch (name) {
          case 'index': return L.i; case 'counter': return L.i + 1;
          case 'has_next': return L.i < L.n - 1; case 'is_first': return L.i === 0; case 'is_last': return L.i === L.n - 1;
          case 'is_even_item': return L.i % 2 === 1; case 'is_odd_item': return L.i % 2 === 0;
          case 'item_parity': return L.i % 2 === 0 ? 'odd' : 'even'; case 'item_parity_cap': return L.i % 2 === 0 ? 'Odd' : 'Even';
          case 'item_cycle': return ev(n.args[L.i % n.args.length]);
        }
      }
      const v = ev(n.e, tolerant);
      const A = (i) => n.args && n.args[i] ? ev(n.args[i], tolerant) : undefined;
      const argc = n.args ? n.args.length : 0;
      if (name === 'has_content') {
        if (v === MISSING) return false;
        if (typeof v === 'string' || Array.isArray(v)) return v.length > 0;
        if (v && typeof v === 'object' && !isDate(v)) return Object.keys(v).length > 0;
        return true;
      }
      if (name === 'exists' || name === 'if_exists') return name === 'exists' ? v !== MISSING : (v === MISSING ? '' : v);
      if (name === 'default') return v === MISSING ? A(0) : v;
      if (name.startsWith('is_')) {
        const t = name.slice(3);
        const map = { string: typeof v === 'string', number: typeof v === 'number', boolean: typeof v === 'boolean', date: isDate(v), date_like: isDate(v), sequence: Array.isArray(v), collection: Array.isArray(v), enumerable: Array.isArray(v), hash: v && typeof v === 'object' && !Array.isArray(v) && !isDate(v), hash_ex: v && typeof v === 'object' && !Array.isArray(v) && !isDate(v), method: false, macro: false, directive: false, node: false, transform: false, indexable: Array.isArray(v), unknown_date_like: v instanceof Date };
        if (t in map) return !!map[t];
      }
      if (v === MISSING) {
        if (tolerant) return MISSING;
        throw err('"' + describe(n.e) + '" findes ikke, så ?' + name + ' kan ikke bruges. Brug evt. (' + n.src + ')!""', n);
      }
      const need = (pred, what) => { if (!pred) throw err('?' + name + ' kræver ' + what + ', men "' + describe(n.e) + '" er ' + typeName(v), n); };
      switch (name) {
        // tekst
        case 'length': need(typeof v === 'string', 'tekst'); return v.length;
        case 'upper_case': need(typeof v === 'string', 'tekst'); return v.toLocaleUpperCase();
        case 'lower_case': need(typeof v === 'string', 'tekst'); return v.toLocaleLowerCase();
        case 'cap_first': need(typeof v === 'string', 'tekst'); return v.replace(/^(\s*)(\S)/, (m, a, b) => a + b.toLocaleUpperCase());
        case 'uncap_first': need(typeof v === 'string', 'tekst'); return v.replace(/^(\s*)(\S)/, (m, a, b) => a + b.toLocaleLowerCase());
        case 'capitalize': need(typeof v === 'string', 'tekst'); return v.replace(/(^|\s)(\S)(\S*)/g, (m, a, b, c) => a + b.toLocaleUpperCase() + c.toLocaleLowerCase());
        case 'trim': need(typeof v === 'string', 'tekst'); return v.trim();
        case 'chop_linebreak': need(typeof v === 'string', 'tekst'); return v.replace(/\r?\n$/, '');
        case 'starts_with': need(typeof v === 'string', 'tekst'); return v.startsWith(toStr(A(0), n.args[0]));
        case 'ends_with': need(typeof v === 'string', 'tekst'); return v.endsWith(toStr(A(0), n.args[0]));
        case 'contains': need(typeof v === 'string', 'tekst'); return v.includes(toStr(A(0), n.args[0]));
        case 'index_of': need(typeof v === 'string', 'tekst'); return v.indexOf(A(0), A(1) || 0);
        case 'last_index_of': need(typeof v === 'string', 'tekst'); return v.lastIndexOf(A(0));
        case 'keep_before': need(typeof v === 'string', 'tekst'); { const i = v.indexOf(A(0)); return i < 0 ? v : v.slice(0, i); }
        case 'keep_after': need(typeof v === 'string', 'tekst'); { const i = v.indexOf(A(0)); return i < 0 ? '' : v.slice(i + A(0).length); }
        case 'keep_before_last': need(typeof v === 'string', 'tekst'); { const i = v.lastIndexOf(A(0)); return i < 0 ? v : v.slice(0, i); }
        case 'keep_after_last': need(typeof v === 'string', 'tekst'); { const i = v.lastIndexOf(A(0)); return i < 0 ? '' : v.slice(i + A(0).length); }
        case 'remove_beginning': need(typeof v === 'string', 'tekst'); return v.startsWith(A(0)) ? v.slice(A(0).length) : v;
        case 'remove_ending': need(typeof v === 'string', 'tekst'); return v.endsWith(A(0)) ? v.slice(0, -A(0).length) : v;
        case 'ensure_starts_with': need(typeof v === 'string', 'tekst'); return v.startsWith(A(0)) ? v : A(0) + v;
        case 'ensure_ends_with': need(typeof v === 'string', 'tekst'); return v.endsWith(A(0)) ? v : v + A(0);
        case 'replace': {
          need(typeof v === 'string', 'tekst');
          const flags = A(2) || '';
          if (flags.includes('r')) return v.replace(new RegExp(A(0), 'g' + (flags.includes('i') ? 'i' : '')), A(1).replace(/\$(\d)/g, '$$$1'));
          if (flags.includes('f')) return v.replace(A(0), A(1));
          return v.split(A(0)).join(A(1));
        }
        case 'matches': {
          need(typeof v === 'string', 'tekst');
          let re; try { re = new RegExp('^(?:' + javaRegex(A(0)) + ')$', (A(1) || '').includes('i') ? 'i' : ''); } catch (e) { throw err('Ugyldigt regulært udtryk i ?matches: ' + A(0), n); }
          return re.test(v);
        }
        case 'split': need(typeof v === 'string', 'tekst'); return (A(1) || '').includes('r') ? v.split(new RegExp(A(0))) : v.split(A(0));
        case 'word_list': need(typeof v === 'string', 'tekst'); return v.trim().split(/\s+/).filter(Boolean);
        case 'left_pad': need(typeof v === 'string' || typeof v === 'number', 'tekst'); return String(v).padStart(A(0), A(1) == null ? ' ' : A(1));
        case 'right_pad': need(typeof v === 'string' || typeof v === 'number', 'tekst'); return String(v).padEnd(A(0), A(1) == null ? ' ' : A(1));
        case 'truncate': case 'truncate_w': case 'truncate_c': {
          need(typeof v === 'string', 'tekst'); const max = A(0); const term = A(1) != null ? A(1) : '[...]';
          if (v.length <= max) return v;
          let cut = v.slice(0, Math.max(0, max - term.length));
          if (name !== 'truncate_c') { const sp = cut.search(/\s\S*$/); if (sp > max / 2) cut = cut.slice(0, sp); }
          return cut.replace(/\s+$/, '') + term;
        }
        case 'html': need(typeof v === 'string', 'tekst'); return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        case 'xhtml': case 'xml': need(typeof v === 'string', 'tekst'); return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        case 'url': case 'url_path': need(typeof v === 'string', 'tekst'); return name === 'url' ? encodeURIComponent(v) : encodeURI(v);
        case 'j_string': case 'js_string': case 'json_string': need(typeof v === 'string', 'tekst'); return JSON.stringify(v).slice(1, -1);
        case 'no_esc': case 'esc': return v;
        case 'number': {
          if (typeof v === 'number') return v;
          need(typeof v === 'string', 'tekst'); const x = parseFloat(v.replace(',', '.'));
          if (isNaN(x)) throw err('"' + v + '" kan ikke laves om til et tal (?number)', n); return x;
        }
        case 'boolean': need(typeof v === 'string', 'tekst'); if (v === 'true') return true; if (v === 'false') return false; throw err('"' + v + '" er ikke true/false', n);
        case 'eval': need(typeof v === 'string', 'tekst'); return ev(parseExpr(v, 0), tolerant);
        case 'eval_json': need(typeof v === 'string', 'tekst'); return JSON.parse(v);
        // tal
        case 'c': case 'cn':
          if (typeof v === 'number') return cNum(v);
          if (typeof v === 'boolean') return v ? 'true' : 'false';
          if (typeof v === 'string') return name === 'cn' ? JSON.stringify(v) : v;
          need(false, 'tal eller ja/nej'); break;
        case 'round': need(typeof v === 'number', 'tal'); return Math.round(v);
        case 'floor': need(typeof v === 'number', 'tal'); return Math.floor(v);
        case 'ceiling': need(typeof v === 'number', 'tal'); return Math.ceil(v);
        case 'int': need(typeof v === 'number', 'tal'); return Math.trunc(v);
        case 'abs': need(typeof v === 'number', 'tal'); return Math.abs(v);
        case 'is_infinite': return v === Infinity || v === -Infinity;
        case 'is_nan': return Number.isNaN(v);
        case 'lower_abc': need(typeof v === 'number', 'tal'); return String.fromCharCode(96 + v);
        case 'upper_abc': need(typeof v === 'number', 'tal'); return String.fromCharCode(64 + v);
        // dato
        case 'date': case 'datetime': case 'time': {
          if (isDate(v)) return new FtlDate(rawDate(v), name);
          if (typeof v === 'string' && argc) return parseDateStr(v, A(0), name, n);
          need(false, 'en dato'); break;
        }
        case 'date_if_unknown': case 'datetime_if_unknown': case 'time_if_unknown':
          need(isDate(v), 'en dato'); return v instanceof FtlDate ? v : new FtlDate(v, name.split('_')[0]);
        case 'long': need(isDate(v), 'en dato'); return rawDate(v).getTime();
        case 'number_to_date': case 'number_to_datetime': case 'number_to_time': need(typeof v === 'number', 'tal'); return new FtlDate(new Date(v), name.slice(10));
        case 'iso': case 'iso_local': case 'iso_utc': need(isDate(v), 'en dato'); return rawDate(v).toISOString();
        case 'string': {
          if (typeof v === 'boolean') {
            if (argc >= 2) return v ? toStr(A(0), n.args[0]) : toStr(A(1), n.args[1]);
            return v ? 'true' : 'false';
          }
          if (typeof v === 'string') return v;
          if (typeof v === 'number') return formatNumber(v, argc ? A(0) : ctx.numberFormat, ctx.locale);
          if (isDate(v)) {
            if (v instanceof Date && !argc) throw err('"' + describe(n.e) + '" er en dato uden kendt type. Brug ?date eller ?datetime før ?string', n);
            const kind = v instanceof FtlDate ? v.kind : 'datetime';
            const f = argc ? A(0) : (kind === 'date' ? ctx.dateFormat : kind === 'time' ? ctx.timeFormat : ctx.datetimeFormat);
            if (!f || ['short', 'medium', 'long', 'full'].includes(f)) return namedDateFormat(rawDate(v), f || 'medium', kind, ctx.locale);
            if (/^(short|medium|long|full)_(short|medium|long|full)$/.test(f)) return namedDateFormat(rawDate(v), f.split('_')[0], kind, ctx.locale);
            return formatDate(rawDate(v), f, ctx.locale);
          }
          need(false, 'tekst, tal, dato eller ja/nej'); break;
        }
        case 'then': if (typeof v !== 'boolean') need(false, 'ja/nej'); return v ? A(0) : A(1);
        // lister
        case 'size': need(Array.isArray(v) || (v && typeof v === 'object' && !isDate(v)), 'en liste'); return Array.isArray(v) ? v.length : Object.keys(v).length;
        case 'first': need(Array.isArray(v), 'en liste'); return v.length ? v[0] : MISSING;
        case 'last': need(Array.isArray(v), 'en liste'); return v.length ? v[v.length - 1] : MISSING;
        case 'reverse': need(Array.isArray(v), 'en liste'); return v.slice().reverse();
        case 'join': need(Array.isArray(v), 'en liste'); { const sep = toStr(A(0), n.args[0]); if (!v.length && argc > 1) return A(1); return v.map((x) => toStr(x, n.e)).join(sep) + (v.length && argc > 2 ? A(2) : ''); }
        case 'seq_contains': need(Array.isArray(v), 'en liste'); return v.some((x) => x === A(0));
        case 'seq_index_of': need(Array.isArray(v), 'en liste'); return v.indexOf(A(0));
        case 'seq_last_index_of': need(Array.isArray(v), 'en liste'); return v.lastIndexOf(A(0));
        case 'sort': need(Array.isArray(v), 'en liste'); return v.slice().sort(cmpAny);
        case 'sort_by': need(Array.isArray(v), 'en liste'); { const keys = [].concat(A(0)); const g = (x) => keys.reduce((o, k) => (o && o[k] != null ? o[k] : null), x); return v.slice().sort((a, b) => cmpAny(g(a), g(b))); }
        case 'chunk': need(Array.isArray(v), 'en liste'); { const out = []; for (let i = 0; i < v.length; i += A(0)) out.push(v.slice(i, i + A(0))); return out; }
        case 'filter': need(Array.isArray(v), 'en liste'); { const f = lambdaOf(n.args[0]); return v.filter((x) => f(x)); }
        case 'map': need(Array.isArray(v), 'en liste'); { const f = lambdaOf(n.args[0]); return v.map((x) => f(x)); }
        case 'take_while': need(Array.isArray(v), 'en liste'); { const f = lambdaOf(n.args[0]); const out = []; for (const x of v) { if (!f(x)) break; out.push(x); } return out; }
        case 'drop_while': need(Array.isArray(v), 'en liste'); { const f = lambdaOf(n.args[0]); let i = 0; while (i < v.length && f(v[i])) i++; return v.slice(i); }
        case 'min': case 'max': need(Array.isArray(v), 'en liste'); { const s = v.filter((x) => x != null); if (!s.length) return MISSING; return s.reduce((a, b) => (cmpAny(a, b) <= 0) === (name === 'min') ? a : b); }
        // hashes
        case 'keys': need(v && typeof v === 'object' && !Array.isArray(v), 'et objekt'); return Object.keys(v);
        case 'values': need(v && typeof v === 'object' && !Array.isArray(v), 'et objekt'); return Object.values(v);
      }
      throw err('?' + name + ' understøttes ikke i forhåndsvisningen', n);
    }

    function cmpAny(a, b) {
      a = rawDate(a); b = rawDate(b);
      if (a instanceof Date) a = a.getTime(); if (b instanceof Date) b = b.getTime();
      if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, locInfo(ctx.locale).tag);
      return a < b ? -1 : a > b ? 1 : 0;
    }

    function parseDateStr(s, fmt, kind, n) {
      // simpel fortolkning af "dd-MM-yyyy" m.fl.
      const parts = {}; let re = '';
      const order = [];
      fmt.replace(/(d+|M+|y+|H+|m+|s+|[^dMyHms]+)/g, (tok) => {
        const c = tok[0];
        if ('dMyHms'.includes(c)) { order.push(c); re += c === 'y' ? '(\\d{2,4})' : '(\\d{1,2})'; }
        else re += tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return tok;
      });
      const m = new RegExp('^' + re + '$').exec(s.trim());
      if (!m) throw err('"' + s + '" passer ikke til datoformatet "' + fmt + '"', n);
      order.forEach((c, i) => { parts[c] = parseInt(m[i + 1], 10); });
      return new FtlDate(new Date(parts.y || 1970, (parts.M || 1) - 1, parts.d || 1, parts.H || 0, parts.m || 0, parts.s || 0), kind);
    }

    class Break { }

    function execBody(body, inner) {
      for (let i = 0; i < body.length; i++) exec(body[i], body, i);
    }

    function exec(node, body, idx) {
      switch (node.type) {
        case 'text': ctx.out.push(node.v); return;
        case 'comment': case 'noop': return;
        case 'interp': ctx.out.push(toStr(ev(node.expr), node.expr, true)); return;
        case 'if': {
          for (const br of node.branches) {
            if (truthy(ev(br.cond), br.cond)) { execBody(br.body); return; }
          }
          if (node.elseBody) execBody(node.elseBody);
          return;
        }
        case 'list': {
          let seq = ev(node.seq);
          if (seq === MISSING) throw err('"' + describe(node.seq) + '" findes ikke, så der er intet at gennemløbe. Brug evt. <#list (' + describe(node.seq) + ')![] as ' + node.v + '>', node.seq);
          let entries;
          if (Array.isArray(seq)) entries = seq.map((x) => [x]);
          else if (seq && typeof seq === 'object' && !isDate(seq)) entries = node.v2 ? Object.keys(seq).map((k) => [k, seq[k]]) : Object.keys(seq).map((k) => [k]);
          else throw err('"' + describe(node.seq) + '" er ' + typeName(seq) + ', ikke en liste', node.seq);
          if (!entries.length) { if (node.elseBody) execBody(node.elseBody); return; }
          const savedV = ctx.vars[node.v], savedV2 = node.v2 ? ctx.vars[node.v2] : undefined, savedL = ctx.loops[node.v];
          try {
            for (let i = 0; i < entries.length; i++) {
              ctx.vars[node.v] = entries[i][0] == null ? MISSING : entries[i][0];
              if (node.v2) ctx.vars[node.v2] = entries[i][1] == null ? MISSING : entries[i][1];
              ctx.loops[node.v] = { i, n: entries.length };
              try {
                for (let j = 0; j < node.body.length; j++) {
                  const b = node.body[j];
                  if (b.type === 'sep') { if (i === entries.length - 1) break; continue; }
                  exec(b, node.body, j);
                }
              } catch (e) { if (e instanceof Break) break; throw e; }
            }
          } finally {
            ctx.vars[node.v] = savedV; if (node.v2) ctx.vars[node.v2] = savedV2; ctx.loops[node.v] = savedL;
          }
          return;
        }
        case 'sep': return;
        case 'assign': {
          for (const a of node.assigns) {
            let val = ev(a.expr);
            if (a.op) {
              const old = ctx.vars[a.name];
              if (old === undefined) throw err('"' + a.name + '" findes ikke, så ' + a.op + '= kan ikke bruges', node);
              val = a.op === '+' ? (typeof old === 'number' && typeof val === 'number' ? old + val : toStr(old, a.expr) + toStr(val, a.expr)) : old - val;
            }
            ctx.vars[a.name] = val;
          }
          return;
        }
        case 'capture': {
          const saved = ctx.out; ctx.out = [];
          try { execBody(node.body); ctx.vars[node.name] = ctx.out.join(''); } finally { ctx.out = saved; }
          return;
        }
        case 'setting': {
          const v = ev(node.expr);
          const map = { locale: 'locale', number_format: 'numberFormat', date_format: 'dateFormat', datetime_format: 'datetimeFormat', time_format: 'timeFormat', boolean_format: 'booleanFormat' };
          if (map[node.name]) ctx[map[node.name]] = v;
          return;
        }
        case 'switch': {
          const v = ev(node.expr);
          let matched = false;
          try {
            for (const c of node.cases) {
              if (!matched) {
                if (c.def) matched = true;
                else { const cv = ev(c.expr); if (cv === v) matched = true; }
              }
              if (matched) execBody(c.body);
            }
          } catch (e) { if (!(e instanceof Break)) throw e; }
          return;
        }
        case 'break': throw new Break();
        case 'compress': {
          const saved = ctx.out; ctx.out = [];
          try { execBody(node.body); } finally { const s = ctx.out.join(''); ctx.out = saved; ctx.out.push(s.replace(/[ \t]*\n[\s]*/g, '\n').replace(/[ \t]+/g, ' ').trim()); }
          return;
        }
        case 'attempt': {
          const saved = ctx.out; ctx.out = [];
          try { execBody(node.body); const s = ctx.out.join(''); ctx.out = saved; ctx.out.push(s); }
          catch (e) { if (e instanceof Break) throw e; ctx.out = saved; execBody(node.recover); }
          return;
        }
        case 'unknown': throw err('<' + node.name + '> understøttes ikke i forhåndsvisningen', node);
      }
    }

    execBody(tree.body);
    return ctx.out.join('');
  }

  function javaRegex(s) {
    // de fleste Java-regex'er virker direkte i JS
    return String(s).replace(/\(\?<([a-zA-Z]\w*)>/g, '(?<$1>').replace(/\\p\{Alpha\}/g, '[A-Za-z]').replace(/\\p\{Digit\}/g, '\\d');
  }

  const api = { lex, stripWhitespace, parse, parseExpr, render, FtlError, MISSING, FtlDate, formatDate, formatNumber };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FTL = api;
})(typeof window !== 'undefined' ? window : globalThis);
