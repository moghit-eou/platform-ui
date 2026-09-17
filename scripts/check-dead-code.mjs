#!/usr/bin/env node
/**
 * Dead-code check for fl-platform. Four questions, all answered statically:
 *
 *   1. dead exports      — a module-level `export` nothing outside its own file uses.
 *   2. orphan CSS        — a class selector no template can put on an element.
 *   3. orphan keyframes  — an `@keyframes` block no `animation` declaration names.
 *   4. orphan tokens     — a `:root` custom property nothing reads with `var()`.
 *
 *   Component stylesheets are checked against their OWN template, because Angular's
 *   default emulated encapsulation means that is the only markup they can match; a class
 *   another component uses is not evidence this copy is live. Two exceptions: `:host` /
 *   `:host-context` selectors (their classes come from ancestors) and sheets pulled in
 *   with `@import`, which ship inside the importer and match the importer's template.
 *   `@keyframes` get the same scoping, because Angular renames them per component.
 *
 *   Run: npm run check:dead-code   (exit 1 on findings)
 *
 *   A finding is a bug in the code or in the allowlist below, never a reason to delete a
 *   class Angular applies at runtime. Runtime classes are recognized by prefix; when one
 *   shows up that the prefix list misses, add the prefix here.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, dirname, extname, resolve } from 'node:path';

const ROOT = process.cwd();
const RUNTIME_CLASS_PREFIXES = ['ng-', 'cdk-', 'mat-', 'mdc-', 'ql-', 'wq-', 'ngx-', 'fa-', 'fa', 'swiper-'];

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const files = walk(join(ROOT, 'src'));
const textCache = new Map();
const read = (p) => {
  if (!textCache.has(p)) textCache.set(p, readFileSync(p, 'utf8'));
  return textCache.get(p);
};
const rel = (p) => relative(ROOT, p);
const ts = files.filter((p) => extname(p) === '.ts');
const html = files.filter((p) => extname(p) === '.html');
const css = files.filter((p) => extname(p) === '.css');
const appMarkup = [...ts, ...html].map(read);
const globalHay = appMarkup.join('\n');

const isWordChar = (value) => value !== undefined && /[A-Za-z0-9_$]/.test(value);
const countIn = (haystack, name) => {
  if (!name) return 0;
  let count = 0;
  let from = 0;
  while ((from = haystack.indexOf(name, from)) !== -1) {
    const before = haystack[from - 1];
    const after = haystack[from + name.length];
    if (!isWordChar(before) && !isWordChar(after)) count += 1;
    from += name.length;
  }
  return count;
};

/* 1 ─ dead exports ─────────────────────────────────────────────────────────── */
const DECL = /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/;
const deadExports = [];
const appSources = ts.filter((p) => !p.endsWith('.spec.ts'));
for (const p of appSources) {
  const text = read(p);
  for (const line of text.split('\n')) {
    const m = DECL.exec(line);
    if (!m) continue;
    const [, kind, name] = m;
    const used = appSources.some((q) => q !== p && countIn(read(q), name))
      || html.some((q) => countIn(read(q), name));
    const selfUses = countIn(text, name) - 1;
    if (!used && selfUses <= 0) deadExports.push(`${rel(p)}  ${kind} ${name} (no reference anywhere)`);
  }
}

/* 2 ─ orphan CSS ───────────────────────────────────────────────────────────── */
/**
 * Class names a sheet depends on, split by who can put them on an element: the component
 * itself (own template) or an ancestor (`:host` / `:host-context`, matched against the app).
 */
const classDecls = (sheet) => {
  const text = sheet
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/url\([^)]*\)/g, ' url() ')
    .replace(/"[^"]*"|'[^']*'/g, ' ');
  const own = new Set();
  const hostScoped = new Set();
  for (const m of text.matchAll(/([^{}]+)\{/g)) {
    const selector = m[1];
    const names = [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((x) => x[1]);
    const target = /:host\b/.test(selector) ? hostScoped : own;
    names.forEach((n) => target.add(n));
  }
  return { own, hostScoped };
};
const templateFor = (p) => {
  const t = join(dirname(p), basename(p, '.ts') + '.html');
  return files.includes(t) ? read(t) : '';
};
const globalSheets = css.filter((p) => !p.endsWith('.component.css'));

/** Markup one sheet can style on its own; a global sheet reaches everywhere, so `null`. */
const ownMarkup = (p) => p.endsWith('.component.css')
  ? [templateFor(p.replace('.component.css', '.component.ts')), ...walk(join(ROOT, dirname(rel(p)))).filter((q) => q.endsWith('.ts')).map(read)].join('\n')
  : null;

/** `@import` edges: an imported sheet also matches the importing component's markup. */
const importers = new Map();
for (const p of css) {
  for (const m of read(p).matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    const base = resolve(dirname(p), m[1]);
    const target = existsSync(base) ? base : existsSync(`${base}.css`) ? `${base}.css` : null;
    if (!target || target === p) continue;
    if (!importers.has(target)) importers.set(target, new Set());
    importers.get(target).add(p);
  }
}
/**
 * Markup a sheet can style: its own, plus the markup of everything that imports it, as far
 * up the chain as it goes — an imported sheet ships inside its importer, so it matches that
 * importer's template too. A global sheet anywhere on the way reaches the whole app, which
 * makes everything reachable, so the answer is `null` there as well.
 */
const reachableMarkup = (p, seen = new Set()) => {
  if (seen.has(p)) return [];
  seen.add(p);
  const own = ownMarkup(p);
  if (own === null) return null;
  const parts = [own];
  for (const importer of importers.get(p) ?? []) {
    const upstream = reachableMarkup(importer, seen);
    if (upstream === null) return null;
    parts.push(...upstream);
  }
  return parts;
};

const orphanCss = [];
for (const p of css) {
  const reach = reachableMarkup(p);
  const own = reach ? reach.join('\n') : null;
  const { own: ownClasses, hostScoped } = classDecls(read(p));
  const isDead = (c, hay) =>
    !RUNTIME_CLASS_PREFIXES.some((pre) => c.startsWith(pre)) && !hay.includes(c);
  const dead = [...ownClasses].filter((c) => isDead(c, own ?? globalHay))
    .concat([...hostScoped].filter((c) => isDead(c, globalHay)));
  if (dead.length) orphanCss.push(`${rel(p)}  ${dead.length} orphan class(es): ${dead.slice(0, 12).join(', ')}${dead.length > 12 ? ', …' : ''}`);
}

/* 3 ─ orphan keyframes ─────────────────────────────────────────────────────── */
/** Names an `animation` / `animation-name` declaration could refer to, per sheet. */
const ANIMATION_KEYWORDS = new Set(['none', 'infinite', 'alternate', 'alternate-reverse', 'reverse', 'normal',
  'backwards', 'forwards', 'both', 'running', 'paused', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear',
  'step-start', 'step-end', 'initial', 'inherit', 'unset', 'revert', 'auto']);
const animationRefs = (sheet) => {
  const names = new Set();
  let unverifiable = false;
  for (const m of sheet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const part of m[1].split(',')) {
      if (part.includes('var(')) unverifiable = true; // name comes from a custom property — cannot resolve statically
      part.split(/\s+/).forEach((tok) => {
        if (/^[A-Za-z_][\w-]*$/.test(tok) && !ANIMATION_KEYWORDS.has(tok)) names.add(tok);
      });
    }
  }
  return { names, unverifiable };
};
const orphanKeyframes = [];
for (const p of css) {
  const sheet = read(p);
  const { names, unverifiable } = animationRefs(sheet);
  if (unverifiable) continue;
  const own = ownMarkup(p) ?? globalHay;
  const defs = [...sheet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
  const dead = defs.filter((n) => !names.has(n) && !own.includes(n));
  if (dead.length) orphanKeyframes.push(`${rel(p)}  ${dead.length} unreferenced @keyframes: ${dead.join(', ')}`);
}

/* 4 ─ orphan design tokens ─────────────────────────────────────────────────── */
/**
 * Global `:root` custom properties, matched against every `var(…)` in the app. Skipped
 * entirely if any code composes a property name at runtime (`style.setProperty` / a
 * template literal inside `var(`), since then no static answer is honest.
 */
const rootBlock = (sheet) =>
  [...sheet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
const orphanTokens = [];
if (![...ts, ...html, ...css].some((p) => /setProperty\(|var\(\s*--[^)\n]*\$\{/.test(read(p)))) {
  const varSite = [...appMarkup, ...css.map(read)].join('\n');
  for (const p of globalSheets) {
    for (const block of rootBlock(read(p))) {
      for (const d of block.matchAll(/(^|[\s;{])(--[a-z][\w-]*)\s*:/g)) {
        const name = d[2];
        if (!new RegExp(`var\\(\\s*${name}(?![\\w-])`).test(varSite)) {
          orphanTokens.push(`${rel(p)}  ${name} declared in :root but never read with var()`);
        }
      }
    }
  }
}

/* report ───────────────────────────────────────────────────────────────────── */
const show = (title, rows) => {
  console.log(`\n${title}: ${rows.length}`);
  rows.forEach((r) => console.log('  ' + r));
};
show('dead exports', deadExports);
show('orphan CSS', orphanCss);
show('orphan keyframes', orphanKeyframes);
show('orphan design tokens', orphanTokens);
const total = deadExports.length + orphanCss.length + orphanKeyframes.length + orphanTokens.length;
console.log(`\n${total === 0 ? 'OK — no dead code found' : total + ' finding(s)'}`);
process.exit(total ? 1 : 0);
