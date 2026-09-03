/**
 * Playbook commessa — set standard di attività ricorrenti per mestiere.
 *
 * Standardizza il flusso operativo tipico: con un click si creano in blocco le
 * task della commessa (titolo + scadenza relativa alla data commessa + priorità),
 * invece di crearle a mano una per una. Le task sono REALI (tabella `tasks`):
 * compaiono nella card "Attività" e si assegnano alle persone.
 *
 * v1: playbook definiti qui (per vertical). La versione modificabile per azienda
 * richiede una tabella DB dedicata (step successivo).
 */

import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";

export interface PlaybookStep {
  /** Presente solo sui passi che arrivano da `order_task_template`. */
  id?: string;
  titolo: string;
  descrizione?: string;
  /** Giorni dalla data della commessa (created_at) per la scadenza. */
  giorni_offset: number;
  priorita: "bassa" | "normale" | "alta" | "urgente";
  /** Chi riceve il passo; null = responsabile della commessa. */
  assegna_a_utente?: string | null;
  /** Passo che deve chiudersi prima (id di `order_task_template`). */
  dipende_da_id?: string | null;
  /** Giorni concessi a partire dallo sblocco. */
  giorni_dopo_sblocco?: number;
}

interface TemplateRow {
  id: string;
  titolo: string;
  descrizione: string | null;
  giorni_offset: number;
  priorita: string;
  assegna_a_utente: string | null;
  dipende_da_id: string | null;
  giorni_dopo_sblocco: number;
}

const SERRAMENTISTA: PlaybookStep[] = [
  { titolo: "Sopralluogo e rilievo misure", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma misure e capitolato col cliente", giorni_offset: 4, priorita: "normale" },
  { titolo: "Ordine serramenti al fornitore", giorni_offset: 5, priorita: "alta" },
  { titolo: "Verifica arrivo merce in magazzino", giorni_offset: 25, priorita: "normale" },
  { titolo: "Programmazione posa con la squadra", giorni_offset: 28, priorita: "normale" },
  { titolo: "Posa in opera", giorni_offset: 35, priorita: "alta" },
  { titolo: "Collaudo e firma verbale fine lavori", giorni_offset: 40, priorita: "normale" },
  { titolo: "Richiesta saldo + dossier detrazioni", giorni_offset: 42, priorita: "normale" },
];

const FOTOVOLTAICO: PlaybookStep[] = [
  { titolo: "Sopralluogo tecnico e rilievo tetto", giorni_offset: 3, priorita: "alta" },
  { titolo: "Pratica connessione (TICA) + CILA in Comune", giorni_offset: 7, priorita: "alta" },
  { titolo: "Ordine moduli, inverter e accumulo", giorni_offset: 10, priorita: "alta" },
  { titolo: "Installazione impianto", giorni_offset: 25, priorita: "alta" },
  { titolo: "Allaccio rete + collaudo", giorni_offset: 35, priorita: "normale" },
  { titolo: "Pratica GSE (Scambio sul Posto)", giorni_offset: 40, priorita: "normale" },
  { titolo: "Consegna dossier detrazioni + saldo", giorni_offset: 45, priorita: "normale" },
];

const TETTI: PlaybookStep[] = [
  { titolo: "Sopralluogo copertura e rilievo", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma capitolato + documenti sicurezza (PSC/POS)", giorni_offset: 5, priorita: "alta" },
  { titolo: "Ordine materiali", giorni_offset: 7, priorita: "normale" },
  { titolo: "Allestimento cantiere e ponteggio", giorni_offset: 12, priorita: "normale" },
  { titolo: "Rifacimento / posa copertura", giorni_offset: 25, priorita: "alta" },
  { titolo: "Smontaggio ponteggio e pulizia cantiere", giorni_offset: 35, priorita: "normale" },
  { titolo: "Collaudo + saldo", giorni_offset: 40, priorita: "normale" },
];

const GENERICO: PlaybookStep[] = [
  { titolo: "Sopralluogo iniziale", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma preventivo e capitolato", giorni_offset: 4, priorita: "normale" },
  { titolo: "Ordine materiali ai fornitori", giorni_offset: 6, priorita: "alta" },
  { titolo: "Avvio lavori in cantiere", giorni_offset: 10, priorita: "normale" },
  { titolo: "Verifica avanzamento (SAL)", giorni_offset: 20, priorita: "normale" },
  { titolo: "Fine lavori e collaudo", giorni_offset: 35, priorita: "alta" },
  { titolo: "Saldo e chiusura commessa", giorni_offset: 40, priorita: "normale" },
];

const PLAYBOOKS: Record<string, PlaybookStep[]> = {
  serramentista: SERRAMENTISTA,
  fotovoltaico: FOTOVOLTAICO,
  tetti: TETTI,
  generico: GENERICO,
};

/** Etichetta umana del playbook scelto (per il messaggio di conferma). */
export const PLAYBOOK_LABELS: Record<string, string> = {
  serramentista: "Serramenti",
  fotovoltaico: "Fotovoltaico",
  tetti: "Tetti e coperture",
  generico: "Generico edile",
};

/** Restituisce il playbook per il vertical (fallback: generico). */
export function getOrderPlaybook(vertical?: string | null): { key: string; steps: PlaybookStep[] } {
  const key = vertical && PLAYBOOKS[vertical] ? vertical : "generico";
  return { key, steps: PLAYBOOKS[key] };
}

/**
 * Applica il flusso a una commessa.
 *
 * Due modi, a seconda di come l'azienda ha configurato il suo processo in
 * `order_task_template`:
 *
 *   • passi SENZA dipendenza  → nascono subito "Da fare", scadenza = data
 *     commessa + giorni_offset (comportamento storico, invariato);
 *   • passi CON dipendenza    → nascono "In attesa", senza scadenza: si
 *     sbloccano da soli quando si chiude il passo da cui dipendono (trigger DB
 *     `sblocca_task_a_catena`), prendendo scadenza = giorno dello sblocco +
 *     giorni_dopo_sblocco, e il loro assegnatario riceve la notifica.
 *
 * I playbook predefiniti qui sopra restano liste piatte: la catena è una scelta
 * dell'azienda, che se la costruisce da "Gestisci" (PlaybookEditorDialog).
 *
 * Idempotente: salta i titoli già presenti sulla commessa. Se un passo dipende
 * da un titolo già esistente, si aggancia a quella task invece di duplicarla.
 */
export async function applyPlaybookToOrder(params: {
  companyId: string;
  orderId: string;
  vertical?: string | null;
  baseDate: Date;
  /** Responsabile della commessa: i passi senza assegnatario proprio vanno a lui. */
  assignedTo?: string | null;
}): Promise<{ created: number; playbookKey: string }> {
  const { companyId, orderId, vertical, baseDate, assignedTo } = params;
  const { key } = getOrderPlaybook(vertical);

  // created_by è NOT NULL su tasks: serve l'utente corrente.
  const { data: auth } = await supabase.auth.getUser();
  const createdBy = auth?.user?.id;
  if (!createdBy) throw new Error("Sessione scaduta: accedi di nuovo per applicare il processo standard.");

  let tplQuery = supabase
    .from("order_task_template")
    .select("id, titolo, descrizione, giorni_offset, priorita, assegna_a_utente, dipende_da_id, giorni_dopo_sblocco")
    .eq("company_id", companyId)
    .eq("attivo", true)
    .order("sort_order", { ascending: true });
  tplQuery = vertical ? tplQuery.eq("vertical", vertical) : tplQuery.is("vertical", null);
  const { data: customTpl } = await tplQuery;

  const steps: PlaybookStep[] = customTpl && customTpl.length > 0
    ? (customTpl as unknown as TemplateRow[]).map((t) => ({
        id: t.id,
        titolo: t.titolo,
        descrizione: t.descrizione ?? undefined,
        giorni_offset: Number(t.giorni_offset) || 0,
        priorita: (t.priorita as PlaybookStep["priorita"]) ?? "normale",
        assegna_a_utente: t.assegna_a_utente ?? null,
        dipende_da_id: t.dipende_da_id ?? null,
        giorni_dopo_sblocco: Number(t.giorni_dopo_sblocco) || 0,
      }))
    : getOrderPlaybook(vertical).steps;

  // Titoli già sulla commessa: non si duplicano, ma servono come ancora per i
  // passi che dipendono da un pezzo di flusso creato in un giro precedente.
  const { data: existing } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("company_id", companyId)
    .eq("order_id", orderId);
  const norm = (t: string) => t.trim().toLowerCase();
  const taskIdPerTitolo = new Map<string, string>();
  (existing ?? []).forEach((t: { id: string; title: string }) => {
    taskIdPerTitolo.set(norm(t.title ?? ""), t.id);
  });

  const daCreare = steps.filter((s) => !taskIdPerTitolo.has(norm(s.titolo)));
  if (daCreare.length === 0) return { created: 0, playbookKey: key };

  // Titolo del passo da cui si dipende: serve per agganciare la task al task
  // giusto (le dipendenze del template sono fra righe di template, le task
  // vivono per titolo).
  const titoloPerStepId = new Map<string, string>();
  steps.forEach((s) => { if (s.id) titoloPerStepId.set(s.id, s.titolo); });

  /** id della task che deve chiudersi prima, se già nota. */
  const predecessore = (s: PlaybookStep): string | null => {
    if (!s.dipende_da_id) return null;
    const titolo = titoloPerStepId.get(s.dipende_da_id);
    if (!titolo) return null;
    return taskIdPerTitolo.get(norm(titolo)) ?? null;
  };
  /** true se il passo aspetta qualcuno che non è ancora stato creato. */
  const attendePredecessore = (s: PlaybookStep) =>
    !!s.dipende_da_id && titoloPerStepId.has(s.dipende_da_id) && predecessore(s) === null;

  const rigaPerStep = (s: PlaybookStep) => {
    const bloccataDa = predecessore(s);
    return {
      company_id: companyId,
      order_id: orderId,
      title: s.titolo,
      notes: s.descrizione ?? null,
      // In attesa = il passo esiste ma tocca a qualcun altro prima. Niente
      // scadenza finché è lì: altrimenti nascerebbe già arretrato.
      status: bloccataDa ? "in_attesa" : "da_fare",
      due_date: bloccataDa ? null : format(addDays(baseDate, s.giorni_offset), "yyyy-MM-dd"),
      bloccata_da_task_id: bloccataDa,
      sblocco_giorni: bloccataDa ? s.giorni_dopo_sblocco ?? 0 : null,
      priority: s.priorita,
      category: "ordini",
      // Prima nascevano senza assegnatario: in produzione erano il grosso delle
      // attività scadute che nessuno vedeva come proprie.
      assigned_to: s.assegna_a_utente ?? assignedTo ?? createdBy,
      created_by: createdBy,
    };
  };

  // Si crea a ondate: prima i passi che possono partire, poi quelli che
  // aspettavano loro. Il tetto sul numero di giri chiude il caso limite di una
  // dipendenza che punta a un passo disattivato (che a quel punto parte subito).
  let rimasti = daCreare;
  let creati = 0;
  for (let giro = 0; giro < steps.length + 1 && rimasti.length > 0; giro++) {
    const ondata = rimasti.filter((s) => !attendePredecessore(s));

    // Nessuno può partire (dipendenze non risolvibili): si sbloccano tutti,
    // meglio un flusso piatto che attività ferme per sempre.
    const daInserire = ondata.length > 0 ? ondata : rimasti;
    const forzaRoot = ondata.length === 0;

    const { data: inserite, error } = await supabase
      .from("tasks")
      .insert(daInserire.map((s) => (forzaRoot ? { ...rigaPerStep(s), status: "da_fare", bloccata_da_task_id: null, sblocco_giorni: null, due_date: format(addDays(baseDate, s.giorni_offset), "yyyy-MM-dd") } : rigaPerStep(s))) as never)
      .select("id, title");
    if (error) throw error;

    ((inserite ?? []) as unknown as Array<{ id: string; title: string }>).forEach((t) => {
      taskIdPerTitolo.set(norm(t.title ?? ""), t.id);
    });
    creati += daInserire.length;

    const fatti = new Set(daInserire.map((s) => norm(s.titolo)));
    rimasti = rimasti.filter((s) => !fatti.has(norm(s.titolo)));
  }

  return { created: creati, playbookKey: key };
}
