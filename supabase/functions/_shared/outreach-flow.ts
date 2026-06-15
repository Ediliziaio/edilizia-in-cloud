/**
 * outreach-flow — logica PURA della traversata a GRAFO delle sequenze cold.
 *
 * Estende la cadenza lineare (outreach-sequence.ts) con nodi tipizzati e rami
 * condizionali, SENZA romperla: una sequenza è "a grafo" solo se almeno uno step
 * ha next_default/next_alt valorizzati. Altrimenti il dispatcher resta sul
 * percorso step_order classico (zero regressioni).
 *
 * Niente Deno/Supabase qui: solo funzioni deterministiche testabili in vitest.
 * Il dispatcher (outreach-dispatch) le usa per decidere il prossimo nodo; gli
 * effetti collaterali (invio email, scrittura coda, update enrollment) restano
 * nel dispatcher.
 *
 * Modello nodo (outreach_sequence_steps esteso):
 *   • node_type:      'email' | 'wait' | 'condition' | 'end'
 *   • condition_type: 'opened' | 'not_opened' | 'replied' | 'not_replied'  (solo se node_type='condition')
 *   • next_default:   successore (email/wait) oppure ramo "SÌ" (condition)
 *   • next_alt:       ramo "NO" (solo condition)
 *
 * NB open-tracking: la condizione 'opened'/'not_opened' guarda open_count
 * dell'ULTIMA email inviata dell'enrollment. Se la sequenza non ha track_opens
 * attivo l'apertura non viene MAI registrata → l'assenza di dato è trattata come
 * "non aperto" (ramo NO per 'opened', ramo SÌ per 'not_opened').
 */

export type NodeType = "email" | "wait" | "condition" | "end";
export type ConditionType = "opened" | "not_opened" | "replied" | "not_replied";

/** Nodo del grafo = riga outreach_sequence_steps con i campi flusso. */
export interface FlowNode {
  id: string;
  step_order: number;
  channel?: string | null;
  node_type?: NodeType | null;
  condition_type?: ConditionType | null;
  next_default?: string | null;
  next_alt?: string | null;
  delay_days?: number | null;
  delay_hours?: number | null;
  subject?: string | null;
  body?: string | null;
}

/**
 * Segnali del destinatario/enrollment usati per valutare le condizioni.
 *   • lastEmailOpened: l'ULTIMA email inviata di questo enrollment è stata aperta
 *     (open_count > 0 sull'ultima riga sent di outreach_send_queue). false anche
 *     quando il tracking è spento (nessun dato = non aperto).
 *   • hasReply: il contatto/enrollment ha una risposta (riga outreach_replies)
 *     oppure l'enrollment è già 'replied'.
 */
export interface FlowActivity {
  lastEmailOpened: boolean;
  hasReply: boolean;
}

/** node_type effettivo, con fallback 'email' (sequenze legacy: colonna a default 'email'). */
export function nodeType(node: FlowNode): NodeType {
  return node.node_type ?? "email";
}

/**
 * True se la sequenza è "a grafo": almeno uno step ha next_default o next_alt
 * valorizzato, oppure un nodo non-email (wait/condition/end) è presente. In tal
 * caso il dispatcher traversa il grafo; altrimenti resta sul percorso step_order.
 */
export function isGraphSequence(nodes: FlowNode[]): boolean {
  return nodes.some(
    (n) =>
      (n.next_default != null && n.next_default !== "") ||
      (n.next_alt != null && n.next_alt !== "") ||
      nodeType(n) !== "email",
  );
}

/**
 * Nodo "entry" del grafo: lo step con step_order minimo che NON è puntato da
 * nessun next_default/next_alt di altri nodi. Se tutti i nodi sono referenziati
 * (grafo ciclico o malformato) ripiega sullo step_order minimo. Null se vuoto.
 */
export function entryNode(nodes: FlowNode[]): FlowNode | null {
  if (nodes.length === 0) return null;
  const pointed = new Set<string>();
  for (const n of nodes) {
    if (n.next_default) pointed.add(n.next_default);
    if (n.next_alt) pointed.add(n.next_alt);
  }
  const roots = nodes
    .filter((n) => !pointed.has(n.id))
    .sort((a, b) => a.step_order - b.step_order);
  if (roots.length > 0) return roots[0];
  // fallback: nessuna radice (ciclo) → step_order minimo
  return [...nodes].sort((a, b) => a.step_order - b.step_order)[0];
}

/** Lookup nodo per id (null se assente). */
export function nodeById(nodes: FlowNode[], id: string | null | undefined): FlowNode | null {
  if (!id) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

/**
 * Valuta una condizione sui segnali del destinatario.
 *   opened       → ha aperto l'ultima email (richiede track_opens)
 *   not_opened   → NON ha aperto l'ultima email
 *   replied      → ha risposto
 *   not_replied  → NON ha risposto
 * condition_type sconosciuto/null → false (ramo NO: instradamento conservativo).
 */
export function evalCondition(condition: ConditionType | null | undefined, activity: FlowActivity): boolean {
  switch (condition) {
    case "opened":
      return activity.lastEmailOpened === true;
    case "not_opened":
      return activity.lastEmailOpened !== true;
    case "replied":
      return activity.hasReply === true;
    case "not_replied":
      return activity.hasReply !== true;
    default:
      return false;
  }
}

/** Esito della scelta del prossimo nodo da parte del grafo. */
export interface NextDecision {
  /** id del nodo successivo, o null se la traversata termina (→ enrollment 'completed'). */
  nextId: string | null;
  /** ramo seguito (per i nodi condition): true=SÌ (next_default), false=NO (next_alt). */
  branch?: boolean;
}

/**
 * Sceglie il prossimo nodo a partire da `node`, dati i segnali `activity`.
 *   • email/wait → next_default  (null = fine cadenza)
 *   • condition  → next_default se la condizione è vera, altrimenti next_alt
 *   • end        → null (fine)
 * NON esegue effetti: ritorna solo l'id (e il ramo, per le condizioni). Il
 * dispatcher decide se inviare (email), schedulare (wait) o instradare subito
 * (condition/end).
 */
export function nextNode(node: FlowNode, activity: FlowActivity): NextDecision {
  switch (nodeType(node)) {
    case "end":
      return { nextId: null };
    case "condition": {
      const yes = evalCondition(node.condition_type, activity);
      return { nextId: yes ? (node.next_default ?? null) : (node.next_alt ?? null), branch: yes };
    }
    case "email":
    case "wait":
    default:
      return { nextId: node.next_default ?? null };
  }
}

/** Guardia anti-loop: massimi salti consecutivi tra nodi condition in un singolo ciclo. */
export const MAX_CONDITION_HOPS = 25;

/** Azione che il dispatcher deve compiere dopo aver risolto il grafo da un nodo. */
export interface PlannedAction {
  /** 'send' = accoda un'email da spedire; 'advance' = accoda un instradamento differito (wait); 'complete' = fine. */
  kind: "send" | "advance" | "complete";
  /** nodo su cui agire (email per 'send', wait per 'advance'); null per 'complete'. */
  node: FlowNode | null;
  /** giorni di delay da applicare alla schedulazione (dal nodo destinazione). */
  delayDays: number;
  /** ore di delay da applicare alla schedulazione (dal nodo destinazione). */
  delayHours: number;
  /** guardia anti-loop scattata: trattato come 'complete' (sicuro). */
  aborted: boolean;
}

/**
 * A partire dal nodo successore `startId` (es. next_default del nodo appena
 * inviato, oppure il target di una riga 'advance'), risolve la catena
 * condition/end IMMEDIATA e ritorna l'azione del dispatcher:
 *   • prossimo nodo 'email'  → { kind:'send',     node, delay del nodo email }
 *   • prossimo nodo 'wait'   → { kind:'advance',  node, delay del wait }     (differito)
 *   • catena finita / 'end'  → { kind:'complete', node:null }
 *   • loop di condizioni     → { kind:'complete', aborted:true }             (sicuro)
 *
 * Le condizioni NON inviano: vengono attraversate subito seguendo il ramo
 * (next_default se vera, next_alt se falsa). I 'wait' NON vengono attraversati:
 * sono il punto in cui il dispatcher si ferma e DIFFERISCE (riga 'advance') così
 * le condizioni che li seguono saranno valutate più tardi, con open/reply
 * aggiornati. `startId` null → 'complete'.
 */
export function planNextAction(
  nodes: FlowNode[],
  startId: string | null,
  activity: FlowActivity,
): PlannedAction {
  const start = nodeById(nodes, startId);
  const { node, aborted } = resolveActionable(nodes, start, activity);
  if (aborted) return { kind: "complete", node: null, delayDays: 0, delayHours: 0, aborted: true };
  if (!node) return { kind: "complete", node: null, delayDays: 0, delayHours: 0, aborted: false };
  const delayDays = Math.max(0, Math.trunc(node.delay_days ?? 0));
  const delayHours = Math.max(0, Math.trunc(node.delay_hours ?? 0));
  const t = nodeType(node);
  return {
    kind: t === "wait" ? "advance" : "send",
    node,
    delayDays,
    delayHours,
    aborted: false,
  };
}

/**
 * Risolve l'instradamento immediato dei nodi NON-invianti (condition) ed
 * eventuali 'end' incontrati lungo la catena, partendo da `start`. Si ferma al
 * primo nodo "azionabile" (email da inviare o wait da schedulare) oppure quando
 * la catena finisce (null → enrollment 'completed').
 *
 * Ritorna il nodo su cui il dispatcher deve agire (email/wait) o null se la
 * sequenza è terminata. `hops` espone quanti salti condizione sono stati fatti
 * (per logging/diagnostica). Guardia anti-loop: oltre MAX_CONDITION_HOPS salti
 * consecutivi interrompe e ritorna come se la catena fosse finita (sicuro:
 * l'enrollment viene completato invece di ciclare all'infinito).
 *
 * I nodi 'email'/'wait' NON vengono attraversati qui: sono il punto in cui il
 * dispatcher si ferma per fare l'effetto (invio o schedulazione del delay).
 */
export function resolveActionable(
  nodes: FlowNode[],
  start: FlowNode | null,
  activity: FlowActivity,
): { node: FlowNode | null; hops: number; aborted: boolean } {
  let current = start;
  let hops = 0;
  const seen = new Set<string>();
  while (current) {
    const t = nodeType(current);
    if (t === "email" || t === "wait") {
      return { node: current, hops, aborted: false };
    }
    if (t === "end") {
      return { node: null, hops, aborted: false };
    }
    // condition: instradamento immediato verso il ramo scelto
    hops++;
    if (hops > MAX_CONDITION_HOPS || seen.has(current.id)) {
      return { node: null, hops, aborted: true };
    }
    seen.add(current.id);
    const { nextId } = nextNode(current, activity);
    current = nodeById(nodes, nextId);
  }
  return { node: null, hops, aborted: false };
}
