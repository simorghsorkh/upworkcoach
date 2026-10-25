/**
 * Small helpers shared by the staff pages. Lists, counters and tags now come straight from
 * the services (`listStudents(...).counts`, `listStudentTags`, `listStaffTasks`), so the
 * sprint-2/3 workarounds that paged through every student are gone.
 */

/** Position of each stage in the ordered path (0-based), for the path bar. */
export function stagePositions(stages: ReadonlyArray<{ id: string }>): Map<string, number> {
  return new Map(stages.map((s, i) => [s.id, i]));
}

/** `searchParams` value → single trimmed string ('' when absent). */
export function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}
