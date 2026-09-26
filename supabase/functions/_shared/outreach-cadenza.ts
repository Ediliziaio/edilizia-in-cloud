/**
 * Cadenza dei follow-up proposta dai generatori AI (outreach-ai-sequence e
 * outreach-ai-flow). Regola del founder del 25/09/2026: un follow-up ogni
 * 4 giorni, né prima né dopo. Il modello la riceve nel prompt, ma qui la si
 * impone comunque: i giorni non li decide il modello.
 *
 * Attenzione ai due significati del ritardo:
 * - sequenza LINEARE: delay_days è cumulativo dall'iscrizione (0, 4, 8…),
 *   vedi ritardoDalPrecedente in outreach-sequence.ts;
 * - flusso a GRAFO: delay_days di un nodo è l'attesa dal nodo precedente,
 *   vedi planNextAction in outreach-flow.ts.
 *
 * Modulo puro: niente I/O, testabile da vitest.
 */

export const GIORNI_TRA_FOLLOWUP = 4;

/** Giorno (dall'iscrizione) dell'email numero `indice` di una sequenza lineare: 0, 4, 8… */
export function giornoDelPassoLineare(indice: number): number {
  return Math.max(0, Math.trunc(indice)) * GIORNI_TRA_FOLLOWUP;
}

type TipoNodo = "email" | "whatsapp" | "sms" | "wait" | "condition" | "end";

interface NodoCadenza {
  key: string;
  type: TipoNodo;
  delay_days?: number | null;
  delay_hours?: number | null;
}
interface ArcoCadenza { from_key: string; to_key: string }

const INVIO = new Set<TipoNodo>(["email", "whatsapp", "sms"]);

/**
 * Riscrive le attese di un flusso a grafo perché fra un invio e il successivo
 * passino 4 giorni:
 * - la radice (il primo invio, senza archi entranti) parte subito;
 * - ogni attesa dura 4 giorni;
 * - un invio preceduto da un'attesa (anche passando per un bivio) parte subito
 *   dopo l'attesa; uno che segue direttamente un altro invio aspetta 4 giorni.
 * Restituisce nodi nuovi, non tocca quelli ricevuti.
 */
export function applicaCadenzaFlusso<N extends NodoCadenza>(nodi: N[], archi: ArcoCadenza[]): N[] {
  const tipo = new Map(nodi.map((n) => [n.key, n.type]));
  const entranti = new Map<string, string[]>();
  for (const a of archi) {
    const lista = entranti.get(a.to_key) ?? [];
    lista.push(a.from_key);
    entranti.set(a.to_key, lista);
  }

  // Risale gli archi saltando i bivi: c'è un'attesa fra questo nodo e l'invio precedente?
  const precedutoDaAttesa = (key: string): boolean => {
    const visti = new Set<string>([key]);
    let frontiera = entranti.get(key) ?? [];
    while (frontiera.length > 0) {
      const prossima: string[] = [];
      for (const k of frontiera) {
        if (visti.has(k)) continue;
        visti.add(k);
        const t = tipo.get(k);
        if (t === "wait") return true;
        if (t === "condition") prossima.push(...(entranti.get(k) ?? []));
      }
      frontiera = prossima;
    }
    return false;
  };

  return nodi.map((n) => {
    if (n.type === "wait") return { ...n, delay_days: GIORNI_TRA_FOLLOWUP, delay_hours: 0 };
    if (!INVIO.has(n.type)) return n;
    const radice = (entranti.get(n.key) ?? []).length === 0;
    const giorni = radice || precedutoDaAttesa(n.key) ? 0 : GIORNI_TRA_FOLLOWUP;
    return { ...n, delay_days: giorni, delay_hours: 0 };
  });
}
