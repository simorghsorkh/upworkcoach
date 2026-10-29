#!/usr/bin/env node
// CI guard (ADR-0013 section 6): interface text lives in apps/web/messages/*.json.
//
// 1. No new hard-coded Persian in apps/web/src: every file may keep at most the number of
//    Persian code lines recorded in scripts/i18n-baseline.json (screens not yet extracted).
//    A new file with Persian, or a file above its baseline, fails. Comments are ignored.
// 2. No new physical Tailwind direction classes (ml-, pr-, left-, text-right, …): RTL and LTR
//    need logical ones (ms-, pe-, start-, text-end). Same baseline rule.
//
// When a file goes below its baseline, lower it: `node scripts/ci-i18n-guard.mjs --update`
// (the baseline only ever shrinks in review).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'apps/web/src');
const baselineFile = path.join(root, 'scripts/i18n-baseline.json');

const out = (s) =>
  process.stdout.write(`${s}
`);
const err = (s) =>
  process.stderr.write(`${s}
`);

const PERSIAN = /[؀-ۿ]/;
const PHYSICAL =
  /(?<![\w-])-?(?:ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r|scroll-ml|scroll-mr)-[\w[]|(?<![\w-])text-(?:left|right)(?![\w-])/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) yield full;
  }
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function scan() {
  const result = { persian: {}, physical: {} };
  for (const file of walk(srcDir)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    // The i18n layer itself may name Persian (digit ranges, examples).
    if (rel.startsWith('apps/web/src/i18n/')) continue;
    let persian = 0;
    let physical = 0;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (isComment(line)) continue;
      if (PERSIAN.test(line)) persian++;
      if (PHYSICAL.test(line)) physical++;
    }
    if (persian) result.persian[rel] = persian;
    if (physical) result.physical[rel] = physical;
  }
  return result;
}

const current = scan();

if (process.argv.includes('--update')) {
  const sorted = (o) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify({ persian: sorted(current.persian), physical: sorted(current.physical) }, null, 2)}\n`,
  );
  out(`Baseline written: ${path.relative(root, baselineFile)}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const failures = [];
const shrunk = [];
for (const kind of ['persian', 'physical']) {
  for (const [file, count] of Object.entries(current[kind])) {
    const allowed = baseline[kind]?.[file] ?? 0;
    if (count > allowed) failures.push(`${kind}: ${file} has ${count} lines (baseline ${allowed})`);
  }
  for (const [file, allowed] of Object.entries(baseline[kind] ?? {})) {
    if ((current[kind][file] ?? 0) < allowed) shrunk.push(`${kind}: ${file}`);
  }
}

if (failures.length) {
  err('Hard-coded interface text or physical direction classes were added (ADR-0013):');
  for (const f of failures) err(`  ${f}`);
  err('Move the text to apps/web/messages/{fa,en}.json and use useTranslations/getTranslations;');
  err('use logical classes (ms-, pe-, start-, text-end) instead of physical ones.');
  process.exit(1);
}
const total = Object.values(current.persian).reduce((a, b) => a + b, 0);
out(`OK: no new hard-coded Persian or physical classes (${total} legacy lines left).`);
if (shrunk.length) {
  out('These files are below their baseline; run with --update to lower it:');
  for (const s of shrunk) out(`  ${s}`);
}
