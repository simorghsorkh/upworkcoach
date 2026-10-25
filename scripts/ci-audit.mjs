#!/usr/bin/env node
// CI dependency audit gate (F-19, SEC-D2).
//
//   node scripts/ci-audit.mjs --level high --prod   # runtime deps, high+
//   node scripts/ci-audit.mjs --level critical      # all deps incl. dev, critical
//
// Runs `pnpm audit --json` and fails if any advisory at or above --level is
// not covered by an active exception in .github/audit-exceptions.txt.
//
// Why not `pnpm audit --audit-level/--ignore`: pnpm 12 persists `--ignore`
// into pnpm-workspace.yaml (auditConfig.ignoreGhsas), and has no expiry. Here
// every exception carries a review-by date and expired ones fail the build.
//
// Fails closed: if pnpm or the registry errors and no JSON comes back, exit 1.
// Override the pnpm command locally with PNPM_CMD (e.g. "npx -y pnpm@12.14.0").

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXCEPTIONS_FILE = join(ROOT, '.github', 'audit-exceptions.txt');
const MAX_EXCEPTION_DAYS = 90;
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function parseArgs(argv) {
  const args = { level: 'high', prod: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--prod') args.prod = true;
    else if (argv[i] === '--level') args.level = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!(args.level in RANK)) throw new Error(`invalid --level: ${args.level}`);
  return args;
}

function todayUtc() {
  return new Date(new Date().toISOString().slice(0, 10));
}

// Format, one per line:  GHSA-xxxx-xxxx-xxxx  YYYY-MM-DD  reason (who, why, link)
// The date is the review-by date (Gregorian), at most 90 days ahead.
function loadExceptions() {
  const errors = [];
  const active = new Map();
  const today = todayUtc();
  const lines = readFileSync(EXCEPTIONS_FILE, 'utf8').split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(
      /^(GHSA(?:-[23456789cfghjmpqrvwx]{4}){3})\s+(\d{4}-\d{2}-\d{2})\s+(\S.*)$/,
    );
    const where = `${EXCEPTIONS_FILE}:${idx + 1}`;
    if (!m) {
      errors.push(`${where}: expected "GHSA-xxxx-xxxx-xxxx YYYY-MM-DD reason"`);
      return;
    }
    const [, ghsa, date, reason] = m;
    const until = new Date(date);
    if (Number.isNaN(until.getTime())) {
      errors.push(`${where}: invalid date ${date}`);
      return;
    }
    const days = (until - today) / 86_400_000;
    if (days < 0) {
      errors.push(`${where}: exception for ${ghsa} expired on ${date}; re-review it`);
      return;
    }
    if (days > MAX_EXCEPTION_DAYS) {
      errors.push(`${where}: review-by date ${date} is more than ${MAX_EXCEPTION_DAYS} days ahead`);
      return;
    }
    active.set(ghsa, { date, reason });
  });
  return { active, errors };
}

function runAudit(prod) {
  const pnpm = process.env.PNPM_CMD || 'pnpm';
  const cmd = `${pnpm} audit --json${prod ? ' --prod' : ''}`;
  const res = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // pnpm exits 1 whenever any advisory exists; the JSON body is what counts.
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    err(`[ci-audit] "${cmd}" did not return JSON (exit ${res.status}). Failing closed.`);
    if (res.stderr) err(res.stderr.slice(0, 4000));
    if (res.stdout) err(res.stdout.slice(0, 4000));
    process.exit(1);
  }
  if (!report || typeof report.advisories !== 'object') {
    err('[ci-audit] unexpected audit JSON shape (no "advisories"). Failing closed.');
    process.exit(1);
  }
  return report;
}

const args = parseArgs(process.argv.slice(2));
const { active, errors } = loadExceptions();
const report = runAudit(args.prod);
const scope = args.prod ? 'prod deps' : 'all deps';

const blocking = [];
const excepted = [];
const seen = new Set();
for (const adv of Object.values(report.advisories)) {
  const ghsa = adv.github_advisory_id;
  seen.add(ghsa);
  if ((RANK[adv.severity] ?? RANK.critical) < RANK[args.level]) continue;
  if (ghsa && active.has(ghsa)) excepted.push(adv);
  else blocking.push(adv);
}

const counts = report.metadata?.vulnerabilities ?? {};
out(`[ci-audit] ${scope}, fail level >= ${args.level}. Totals: ${JSON.stringify(counts)}`);
for (const adv of excepted) {
  const e = active.get(adv.github_advisory_id);
  out(
    `[ci-audit] EXCEPTED ${adv.severity} ${adv.module_name} ${adv.github_advisory_id} (until ${e.date}: ${e.reason})`,
  );
}
for (const [ghsa] of active) {
  if (!seen.has(ghsa))
    out(`[ci-audit] note: exception ${ghsa} no longer matches any advisory; remove it`);
}
for (const adv of blocking) {
  const paths = (adv.findings ?? [])
    .flatMap((f) => f.paths ?? [])
    .slice(0, 3)
    .join(' | ');
  err(
    `[ci-audit] BLOCKING ${adv.severity} ${adv.module_name} ${adv.vulnerable_versions} -> ${adv.patched_versions} ${adv.github_advisory_id ?? adv.id} ${adv.url ?? ''}\n           paths: ${paths}`,
  );
}
for (const e of errors) err(`[ci-audit] EXCEPTIONS FILE: ${e}`);

if (blocking.length || errors.length) process.exit(1);
out('[ci-audit] OK');
