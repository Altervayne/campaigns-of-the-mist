// Guards the offline PWA's precache. Every asset that should precache must appear in the
// service worker's manifest, and no precached chunk may exceed the budget.
//
// Workbox drops any file over `maximumFileSizeToCacheInBytes` (vite.config.ts) from the
// precache manifest silently - no error, no warning. The route that needs that chunk then
// fails offline with nothing to explain why. This check fails the build first: it diffs the
// emitted precache candidates against the manifest, and holds every chunk under a budget set
// well below the Workbox cap so a runaway is caught with runway, before it hits the cliff.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';

const DIST = 'dist';
const SW = join(DIST, 'sw.js');

// Mirrors the workbox `globPatterns` in vite.config.ts.
const PRECACHE_EXTS = new Set(['.js', '.css', '.html', '.ico', '.png', '.svg', '.webmanifest', '.woff2']);
// The service worker and its runtime are never listed in their own manifest.
const RUNTIME = /^(sw\.js|workbox-[-\w]+\.js|registerSW\.js)$/;
// Per-file budget, held below Workbox's cap (5 MiB in vite.config.ts) so the build fails with
// headroom rather than at the point offline actually breaks. Growth past this = split the chunk.
const BUDGET_BYTES = 2 * 1024 * 1024;

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const toPosix = (p) => p.split(sep).join('/');

function walk(dir) {
   const out = [];
   for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else out.push(full);
   }
   return out;
}

let sw;
try {
   sw = readFileSync(SW, 'utf8');
} catch {
   console.error(`precache check: ${SW} not found - run \`vite build\` first.`);
   process.exit(1);
}

const manifest = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));

const candidates = walk(DIST)
   .map((p) => toPosix(relative(DIST, p)))
   .filter((p) => PRECACHE_EXTS.has(extname(p)))
   .filter((p) => !RUNTIME.test(p));

const missing = candidates.filter((p) => !manifest.has(p));

const sized = candidates
   .filter((p) => manifest.has(p))
   .map((p) => ({ p, bytes: statSync(join(DIST, p)).size }))
   .sort((a, b) => b.bytes - a.bytes);

const overBudget = sized.filter((f) => f.bytes > BUDGET_BYTES);

console.log(`precache check: ${manifest.size} manifest entries, ${candidates.length} emitted candidates`);
console.log('largest precached chunks:');
for (const f of sized.slice(0, 5)) console.log(`  ${mib(f.bytes).padStart(9)}  ${f.p}`);

let failed = false;

if (missing.length) {
   failed = true;
   console.error(`\n${missing.length} asset(s) emitted but NOT precached - offline will break for these:`);
   for (const p of missing) {
      let size = '';
      try {
         size = ` (${mib(statSync(join(DIST, p)).size)})`;
      } catch {
         // File vanished between walk and stat; report the path alone.
      }
      console.error(`    ${p}${size}`);
   }
   console.error("  Likely over Workbox's maximumFileSizeToCacheInBytes. Split the chunk (build.rollupOptions.manualChunks).");
}

if (overBudget.length) {
   failed = true;
   console.error(`\n${overBudget.length} precached chunk(s) over the ${mib(BUDGET_BYTES)} budget:`);
   for (const f of overBudget) console.error(`    ${mib(f.bytes)}  ${f.p}`);
   console.error('  Still under the Workbox cap for now, but split it before it hits the cliff and drops.');
}

if (failed) process.exit(1);

console.log(`\nprecache OK: every candidate is precached, all chunks under ${mib(BUDGET_BYTES)}.`);
