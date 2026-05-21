export type Modality = 'run' | 'strength' | 'swim' | 'yoga' | 'other';

export interface SessionForDay {
  status:   'planned' | 'completed' | 'dropped' | 'moved' | string;
  modality: Modality | string;
}

export type DayState =
  | { kind: 'rest' }
  | { kind: 'planned',         modality: Modality }
  | { kind: 'planned_multi',   a: Modality, b: Modality }
  | { kind: 'completed',       modality: Modality }
  | { kind: 'completed_multi', a: Modality, b: Modality }
  | { kind: 'missed' }
  | { kind: 'mixed',           completed: Modality };

const PRIORITY: Modality[] = ['run', 'strength', 'swim', 'yoga', 'other'];

function priorityOf(m: string): number {
  const i = PRIORITY.indexOf(m as Modality);
  return i === -1 ? PRIORITY.length : i;
}

function asModality(m: string): Modality {
  return (PRIORITY as readonly string[]).includes(m) ? (m as Modality) : 'other';
}

function sortedByPriority(list: SessionForDay[]): SessionForDay[] {
  return [...list].sort((x, y) => priorityOf(x.modality) - priorityOf(y.modality));
}

export function deriveDayState(sessions: SessionForDay[], isPast: boolean): DayState {
  const total = sessions.length;
  if (total === 0) return { kind: 'rest' };

  const sorted     = sortedByPriority(sessions);
  const doneList   = sessions.filter((s) => s.status === 'completed');
  const done       = doneList.length;

  // All completed
  if (done === total) {
    if (total === 1) return { kind: 'completed', modality: asModality(sorted[0].modality) };
    return {
      kind: 'completed_multi',
      a: asModality(sorted[0].modality),
      b: asModality(sorted[1].modality),
    };
  }

  // None completed
  if (done === 0) {
    if (isPast) return { kind: 'missed' };
    if (total === 1) return { kind: 'planned', modality: asModality(sorted[0].modality) };
    return {
      kind: 'planned_multi',
      a: asModality(sorted[0].modality),
      b: asModality(sorted[1].modality),
    };
  }

  // Partial: 0 < done < total
  const topCompleted = sortedByPriority(doneList)[0];
  return { kind: 'mixed', completed: asModality(topCompleted.modality) };
}
