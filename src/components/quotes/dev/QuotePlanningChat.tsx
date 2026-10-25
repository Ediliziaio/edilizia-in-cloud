import { useEffect, useRef, useState } from 'react';
import { applyPlanningChatCommand } from '@/lib/preventivi/quotePlanningChat';
import { defaultPlanningScenario, readPlanningScenario, type PlanningScenario } from '@/lib/preventivi/quotePlanningScenario';
import { planningStorageKey, readLocalPlanningRecord, writeLocalPlanningRecord, type LocalPlanningRecord } from '@/lib/preventivi/localPlanningScenario';
import { quoteCostScope, type QuoteProject } from '@/lib/preventivi/quoteProject';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import QuotePlanningScenarioPanel from './QuotePlanningScenarioPanel';

type Props = {
  ownerId: string; companyId: string; sessionId: string; scope: string;
  document: ChatDocument; project: QuoteProject; disabled?: boolean;
  request: { id: number; text: string } | null;
  onReply: (text: string) => void; onClose: () => void;
};
function initialState(key: string, scope: string): { record: LocalPlanningRecord; serialized: string | null; issue: string } {
  const draft = defaultPlanningScenario();
  // Real project drafts do not inherit the arithmetic fixture's dates.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  draft.startDate = `${part('year')}-${part('month')}-${part('day')}`;
  draft.deadlineDate = null;
  const fallback: LocalPlanningRecord = { version: 1, scope, scenario: draft };
  try {
    const serialized = localStorage.getItem(key);
    return { record: readLocalPlanningRecord(serialized) ?? fallback, serialized, issue: '' };
  } catch { return { record: fallback, serialized: null, issue: 'Non posso leggere la copia locale dello scenario. Non la sovrascrivo; preventivo e cronoprogramma restano invariati.' }; }
}
export default function QuotePlanningChat({ ownerId, companyId, sessionId, scope, document, project, request, disabled, onReply, onClose }: Props) {
  const key = planningStorageKey(ownerId, companyId, sessionId);
  const [state, setState] = useState(() => initialState(key, scope));
  const stateRef = useRef(state); stateRef.current = state;
  const reply = useRef(onReply); reply.current = onReply;
  const processed = useRef<number | null>(null);
  const stale = state.record.scope !== scope;
  const commit = (scenario: PlanningScenario, nextScope = stateRef.current.record.scope) => {
    if (disabled || stateRef.current.issue) return false;
    try {
      const record: LocalPlanningRecord = { version: 1, scope: nextScope, scenario: readPlanningScenario(scenario)! };
      const serialized = writeLocalPlanningRecord(localStorage, key, record, stateRef.current.serialized);
      const next = { record, serialized, issue: '' }; stateRef.current = next; setState(next); return true;
    } catch (error) {
      setState(previous => ({ ...previous, issue: error instanceof Error ? error.message : 'Scenario non salvato. La copia precedente resta conservata.' }));
      return false;
    }
  };
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== stateRef.current.serialized) setState(previous => ({ ...previous, issue: 'Scenario cambiato in un’altra scheda. Rileggi la copia locale per continuare.' }));
    };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, [key]);
  useEffect(() => {
    if (!request || processed.current === request.id) return;
    processed.current = request.id;
    if (stateRef.current.issue) { reply.current('Scenario non modificabile finché non viene risolto il problema della copia locale. Il preventivo è conservato.'); return; }
    if (stateRef.current.record.scope !== scope) { reply.current('Le lavorazioni o le ore sono cambiate: rivedi l’ambito dello scenario prima di confrontare le date. Nessuna modifica al preventivo.'); return; }
    const result = applyPlanningChatCommand(stateRef.current.record.scenario, request.text);
    if (result.changed && !commit(result.scenario)) { reply.current('Modifica dello scenario non salvata. Controlla l’avviso nella scheda; il preventivo è invariato.'); return; }
    reply.current(result.reply);
    // Each request is processed once, including StrictMode. Unrelated renders do not reapply commands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);
  const importWork = () => {
    const lines = document.lines.filter(line => line.included && !line.supersededBy?.length);
    if (!lines.length || lines.length > 64) { reply.current('Importa da 1 a 64 lavorazioni incluse. Nessuna quantità o ora viene ricavata dal prezzo.'); return; }
    const next = structuredClone(stateRef.current.record.scenario);
    next.source = 'manual'; next.label = 'Fasi dalla bozza — competenze e sequenza da verificare';
    next.tasks = lines.map((line, index): PlanningScenario['tasks'][number] => {
      const cost = project.costs.find(cost => cost.id === line.id && cost.scope === quoteCostScope(line));
      return { id: `quote-phase-${index + 1}`, kind: 'work' as const, label: line.title.slice(0, 200) || `Fase ${index + 1}`, personHours: cost?.hours ?? null,
        skill: 'general', minCrew: 1, maxCrew: 32, dependsOn: index ? [`quote-phase-${index}`] : [], supplyIds: [] };
    });
    next.assumptions = ['Voci incluse copiate solo come bozza di fasi; sequenza iniziale seriale, competenze da definire. Nessuna assegnazione creata.', 'Le ore provengono dai costi locali pertinenti se presenti, altrimenti restano mancanti; non sono derivate dai prezzi. Attese tecniche e forniture da aggiungere.'];
    if (commit(next, scope)) reply.current('Ho copiato le voci incluse in uno scenario separato, con sequenza iniziale seriale da rivedere. Completa ore, competenze, attese e consegne. Nessun prezzo, quantità, totale o cronoprogramma modificato.');
  };
  return <div className="my-3" data-testid="planning-chat-local">
    {state.issue && <div role="alert" className="mb-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm"><p>{state.issue}</p><button type="button" className="mt-2 text-blue-700 underline" onClick={() => setState(initialState(key, scope))}>Rileggi scenario locale</button></div>}
    <QuotePlanningScenarioPanel value={state.record.scenario} onChange={next => { commit(next); }} disabled={disabled || !!state.issue} stale={stale}
      onClose={onClose} onRebase={() => { if (commit(state.record.scenario, scope)) reply.current('Ambito riletto. Ore, fasi e disponibilità restano ipotesi da controllare; nessuna correzione automatica delle quantità.'); }}
      onImport={importWork} importable={document.lines.some(line => line.included && !line.supersededBy?.length)} />
  </div>;
}
