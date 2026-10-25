import { readPlanningScenario, type PlanningScenario } from './quotePlanningScenario';

export type LocalPlanningRecord = { version: 1; scope: string; scenario: PlanningScenario };
export const planningStorageKey = (owner: string, company: string, session: string) =>
  `eic:local-planning:v1:${encodeURIComponent(owner || 'anonymous')}:${encodeURIComponent(company)}:${encodeURIComponent(session)}`;

/** Separate from cloud-copy snapshots. No addresses, employees or routing calls. */
export function readLocalPlanningRecord(raw: string | null): LocalPlanningRecord | null {
  if (raw == null) return null;
  if (raw.length > 240_000) throw new Error('Scenario locale oltre il limite: copia conservata, non sovrascritta.');
  const record = JSON.parse(raw) as LocalPlanningRecord;
  if (!record || record.version !== 1 || typeof record.scope !== 'string' || record.scope.length > 160_000)
    throw new Error('Scenario locale non leggibile: copia conservata, non sovrascritta.');
  const scenario = readPlanningScenario(record.scenario);
  if (!scenario) throw new Error('Scenario locale mancante.');
  return { version: 1, scope: record.scope, scenario };
}

export function writeLocalPlanningRecord(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, record: LocalPlanningRecord, expected: string | null): string {
  if (storage.getItem(key) !== expected) throw new Error('Lo scenario è cambiato in un’altra scheda: rileggilo prima di modificarlo.');
  const serialized = JSON.stringify(record);
  readLocalPlanningRecord(serialized);
  storage.setItem(key, serialized);
  return serialized;
}
