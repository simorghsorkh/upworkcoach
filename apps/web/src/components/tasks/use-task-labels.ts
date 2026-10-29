import { useLocale } from 'next-intl';
import { type TaskLabels, taskLabels } from './labels';

/** Task, status and note labels in the user's language (ADR-0013). */
export function useTaskLabels(): TaskLabels {
  return taskLabels(useLocale());
}
