// Guards i18n source completeness at build time. Every STATIC translation key in the app (a
// string literal passed to t() or a `t: tX` alias, or an i18nKey prop) must exist in the
// source locale (messages/en.json). A key absent from en falls through i18next's fallback and
// renders as its raw path to the user (e.g. "HeroCard.relationshipCompanionNoName"), silently.
//
// This catches the STATIC class with zero false positives: it only flags key-shaped literals
// whose root is a real en.json namespace, so a failing build always means a genuinely-missing
// key, never a stray string. DYNAMICALLY-built keys (t(`${ns}.suffix`)) cannot be resolved
// statically; the dev-mode missingKeyHandler in src/i18n/config.ts covers those at render time.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const EN = 'messages/en.json';
const SRC = 'src';

const en = JSON.parse(readFileSync(EN, 'utf8'));

// Every node path (object + leaf) in en.json, for existence checks.
const paths = new Set();
(function walk(obj, prefix) {
   for (const k of Object.keys(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      paths.add(p);
      if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) walk(obj[k], p);
   }
})(en, '');
const topLevels = new Set(Object.keys(en));

// i18next plural/context variants: a base key resolves if any suffix variant is present.
const PLURAL = ['_one', '_other', '_zero', '_two', '_few', '_many'];
const existsKey = (k) => paths.has(k) || PLURAL.some((s) => paths.has(k + s));

// Source files, skipping tests (their keys are often intentional fakes behind mocked t()).
function walkFiles(dir) {
   const out = [];
   for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walkFiles(full));
      else if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
   }
   return out;
}

const files = walkFiles(SRC);
const allText = files.map((f) => readFileSync(f, 'utf8')).join('\n');

// Translation-call names: t, plus `t: tX` renames from useTranslation destructures (aliases are
// conventionally tCapital..., which also excludes `t: ReturnType`/`t: TFunction` type annotations).
const aliases = new Set(['t']);
for (const m of allText.matchAll(/\bt:\s*(t[A-Z]\w*)/g)) aliases.add(m[1]);
const fnGroup = [...aliases].sort((a, b) => b.length - a.length).join('|');

const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/;
const callRe = new RegExp(`(?<![\\w.])(?:${fnGroup})\\(\\s*['"]([^'"]+)['"]`, 'g');
const i18nKeyRe = /i18nKey\s*=\s*\{?\s*['"]([^'"]+)['"]/g;

const missing = new Map(); // key -> Set(loc)
for (const f of files) {
   const rel = f.split(sep).join('/');
   readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const re of [callRe, i18nKeyRe]) {
         re.lastIndex = 0;
         let m;
         while ((m = re.exec(line))) {
            const key = m[1];
            if (KEY_SHAPE.test(key) && topLevels.has(key.split('.')[0]) && !existsKey(key)) {
               if (!missing.has(key)) missing.set(key, new Set());
               missing.get(key).add(`${rel}:${i + 1}`);
            }
         }
      }
   });
}

if (missing.size) {
   console.error(`\ni18n check: ${missing.size} static key(s) referenced in code but MISSING from ${EN}:`);
   for (const [key, locs] of [...missing].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.error(`    ${key}`);
      for (const loc of locs) console.error(`        ${loc}`);
   }
   console.error(`\n  These render as their raw key to users. Add them to ${EN} (fr.json gets "[TO COMPLETE]"; leave de/es to the community).`);
   process.exit(1);
}

console.log(`i18n OK: every static translation key resolves in ${EN}.`);
