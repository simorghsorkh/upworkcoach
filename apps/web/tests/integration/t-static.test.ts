import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * T-STATIC (security.md section 6, ADR-0004 section 3, followup F-03): the Biome rule
 * `noRestrictedImports` really fires for student routes. The repository's biome.json is
 * copied into a throwaway tree with probe files (nothing is written under src/), Biome lints
 * it, and the diagnostics are checked: the health module and staff timeline functions are
 * refused in `app/(student)` and `app/api/v1/me`, allowed elsewhere.
 */

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const biomeBin = path.join(repoRoot, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-t-static-'));

const PROBE = `import { recomputeHealthSafe } from '@/modules/health/recompute';
import type { HealthDetailDTO } from '../../../modules/health/contracts';
import { listNotes, listSharedNotesForStudent } from '@/modules/timeline/repo';
import { listOwnSharedNotes, listStudentNotes } from '@/modules/timeline/service';

export type X = HealthDetailDTO;
export const x = [recomputeHealthSafe, listNotes, listSharedNotesForStudent, listOwnSharedNotes, listStudentNotes];
`;

const PROBES = {
  student: 'apps/web/src/app/(student)/home/probe.ts',
  me: 'apps/web/src/app/api/v1/me/probe/route.ts',
  staff: 'apps/web/src/app/(staff)/probe.ts',
} as const;

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function lintProbes(): string {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'biome.json'), 'utf8'));
  config.vcs = { enabled: false };
  fs.writeFileSync(path.join(tmp, 'biome.json'), JSON.stringify(config));
  fs.mkdirSync(path.join(tmp, 'packages', 'config'), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, 'packages', 'config', 'biome.base.json'),
    path.join(tmp, 'packages', 'config', 'biome.base.json'),
  );
  for (const file of Object.values(PROBES)) {
    fs.mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true });
    fs.writeFileSync(path.join(tmp, file), PROBE);
  }
  try {
    execFileSync(
      process.execPath,
      [biomeBin, 'lint', '--only=style/noRestrictedImports', '--max-diagnostics=100', '.'],
      { cwd: tmp, encoding: 'utf8', stdio: 'pipe' },
    );
    return '';
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

describe('T-STATIC: noRestrictedImports for student routes (F-03)', () => {
  const output = lintProbes().replaceAll(path.win32.sep, '/');
  const hits = (file: string) =>
    output
      .split('\n')
      .filter((line) => line.startsWith(file) && line.includes('noRestrictedImports'))
      .map((line) => line.slice(file.length + 1).split(' ')[0]);

  it('student pages and /api/v1/me refuse health and staff timeline imports', () => {
    for (const file of [PROBES.student, PROBES.me]) {
      // line:column of: health (value), health (type), listNotes, listStudentNotes.
      expect(hits(file)).toEqual(['1:37', '2:38', '3:10', '4:30']);
    }
  });

  it('staff pages are not restricted', () => {
    expect(hits(PROBES.staff)).toEqual([]);
  });
});
