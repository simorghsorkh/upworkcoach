import type { TransitionKind } from './schema';

/**
 * path — stage-change rules (data-model.md 2-4, progress-tracking.md 3-1). Pure.
 *
 * Assumption (sprint-2 notes): the kind must match the direction —
 * `regress` only to an earlier stage; `advance`, `skip_by_assessment` and
 * `advance_with_exception` only to a later one (skipping stages is allowed; "one click" in
 * the UI is `advance` to the next stage). The same stage is never a transition.
 */
export type ChangeKind = Exclude<TransitionKind, 'initial'>;

export type TransitionCheck = 'ok' | 'same_stage' | 'wrong_direction' | 'note_required';

export function checkTransition(input: {
  kind: ChangeKind;
  fromSortOrder: number;
  toSortOrder: number;
  sameStage: boolean;
  note: string | null | undefined;
}): TransitionCheck {
  if (input.sameStage) return 'same_stage';
  const forward = input.toSortOrder > input.fromSortOrder;
  const backward = input.toSortOrder < input.fromSortOrder;
  if (input.kind === 'regress' ? !backward : !forward) return 'wrong_direction';
  if (
    (input.kind === 'regress' || input.kind === 'advance_with_exception') &&
    (input.note ?? '').trim() === ''
  ) {
    return 'note_required';
  }
  return 'ok';
}

/** "My path" state of each stage for the student (api.md 5: passed | current | locked). */
export function pathState(
  stage: { id: string; sortOrder: number },
  current: { id: string; sortOrder: number },
): 'passed' | 'current' | 'locked' {
  if (stage.id === current.id) return 'current';
  return stage.sortOrder < current.sortOrder ? 'passed' : 'locked';
}
