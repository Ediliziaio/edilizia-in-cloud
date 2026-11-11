import { planPipelineTransition, type PipelineDocument, type PipelineKind } from "./pipelineTransitions";

export const BULK_PHASES: Record<PipelineKind, { target: string; label: string }[]> = {
  oda: [{ target: "ordinato", label: "Segna come già inviati" }],
  rfq: [{ target: "in_valutazione", label: "Porta in valutazione" }, { target: "chiusa", label: "Chiudi senza aggiudicare" }],
  ddt: [{ target: "verificato", label: "Conferma verifica merce" }, { target: "ricevuto", label: "Riapri controllo" }],
  survey: [{ target: "in_corso", label: "Porta in corso" }, { target: "completato", label: "Completa rilievi" }],
};

/** Reuse the same workflow rules as the board; signatures, receipts and awards stay in their detail flows. */
export function reviewBulkPhase(kind: PipelineKind, documents: PipelineDocument[], target: string) {
  if (!BULK_PHASES[kind].some(a => a.target === target)) throw new Error("Azione non disponibile");
  return documents.map(document => {
    const plan = planPipelineTransition(kind, document, target);
    return {
      document,
      plan: plan?.action === "save" ? plan : null,
      reason: !plan ? "Già nella fase richiesta" : plan.description,
    };
  });
}

/** No hidden retries: each document reports its own outcome; successful rows are never re-submitted. */
export async function executeBulkPhase<T extends { document: { id: string; label: string } }>(
  plans: T[], save: (plan: T) => Promise<void>, isCurrent: () => boolean,
) {
  const outcomes: { id: string; label: string; ok: boolean; error?: string }[] = [];
  for (const plan of plans) {
    if (!isCurrent()) {
      outcomes.push({ ...plan.document, ok: false, error: "Operazione interrotta: pagina, azienda o permessi sono cambiati" });
      continue;
    }
    try {
      await save(plan);
      outcomes.push({ ...plan.document, ok: true });
    } catch (error) {
      outcomes.push({ ...plan.document, ok: false, error: error instanceof Error ? error.message : "Salvataggio non riuscito" });
    }
  }
  return outcomes;
}
