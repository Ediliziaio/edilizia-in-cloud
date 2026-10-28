/**
 * Motore del flusso di lavoro — uno solo, per commesse e ticket.
 *
 * Un flusso è una sequenza di passi (righe di `order_task_template`). Applicarlo
 * crea attività REALI nella tabella `tasks`, agganciate alla commessa o al
 * ticket, e le attività si passano il testimone da sole:
 *
 *   • passi SENZA dipendenza → nascono subito "Da fare", scadenza = data di
 *     partenza + giorni_offset;
 *   • passi CON dipendenza   → nascono "In attesa", senza scadenza: si sbloccano
 *     quando si chiude il passo da cui dipendono (trigger DB
 *     `sblocca_task_a_catena`), prendendo scadenza = giorno dello sblocco +
 *     giorni_dopo_sblocco, e chi li riceve viene avvisato.
 *
 * Commesse e ticket condividono tutto tranne due dettagli (a cosa si aggancia
 * l'attività e in che categoria nasce): da qui una funzione sola. Due copie
 * avrebbero significato che la seconda resta indietro alla prima modifica.
 */

import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";

/** A cosa si applica un flusso. Corrisponde a `order_task_template.ambito`. */
export type AmbitoFlusso = "commessa" | "ticket";

/**
 * Fatti che chiudono un passo da soli, senza che nessuno spunti niente.
 * Chiudere un passo è già il modo in cui parte il successivo, quindi qui non
 * serve nessun secondo meccanismo di sblocco.
 */
export type EventoChiusura = "incasso_registrato";

export const EVENTI_CHIUSURA: ReadonlyArray<{
  value: EventoChiusura;
  label: string;
  spiegazione: string;
}> = [
  {
    value: "incasso_registrato",
    label: "quando l'incasso è registrato",
    spiegazione:
      "Si chiude da sola appena una rata risulta incassata, arriva un pagamento su una fattura della commessa o il ticket viene segnato pagato.",
  },
];

export interface PassoFlusso {
  /** Presente solo sui passi che arrivano da `order_task_template`. */
  id?: string;
  titolo: string;
  descrizione?: string;
  /** Giorni dalla data di partenza (commessa o ticket) per la scadenza. */
  giorni_offset: number;
  priorita: "bassa" | "normale" | "alta" | "urgente";
  /** Chi riceve il passo; null = responsabile dell'entità. */
  assegna_a_utente?: string | null;
  /** Ufficio che riceve il passo; se valorizzato vince sulla persona. */
  assegna_a_ufficio_id?: string | null;
  /** Passo che deve chiudersi prima (id di `order_task_template`). */
  dipende_da_id?: string | null;
  /** Giorni concessi a partire dallo sblocco. */
  giorni_dopo_sblocco?: number;
  /** Fatto che chiude il passo da solo; null = si chiude a mano. */
  chiudi_su_evento?: EventoChiusura | null;
  /**
   * Fase (`order_statuses`) in cui passa la commessa quando questo passo si
   * chiude; null = la fase non cambia. Solo commesse: il trigger DB
   * `avanza_fase_da_passo_chiuso` la applica, e solo in avanti.
   */
  fase_raggiunta_id?: string | null;
  /** «ufficio» = fase d'ufficio della commessa (vista Cantiere → Ufficio). */
  activity_scope?: "generale" | "ufficio" | "cantiere";
  /** Nome della fase del cantiere da aspettare (es. «Rilievo misure»): finché non è chiusa il passo attende. */
  dopo_fase_lavorazione?: string | null;
  /** Posizione nel flusso (ordine delle fasi d'ufficio). */
  sort_order?: number | null;
  office_stage?: string | null;
}

interface RigaTemplate {
  office_stage: string | null;
  id: string;
  titolo: string;
  descrizione: string | null;
  giorni_offset: number;
  priorita: string;
  assegna_a_utente: string | null;
  assegna_a_ufficio_id: string | null;
  dipende_da_id: string | null;
  giorni_dopo_sblocco: number;
  chiudi_su_evento: string | null;
  fase_raggiunta_id: string | null;
  activity_scope: string | null;
  dopo_fase_lavorazione: string | null;
  sort_order: number | null;
}

const CAMPI_TEMPLATE =
  "id, titolo, descrizione, giorni_offset, priorita, assegna_a_utente, assegna_a_ufficio_id, dipende_da_id, giorni_dopo_sblocco, chiudi_su_evento, fase_raggiunta_id, activity_scope, dopo_fase_lavorazione, sort_order, office_stage";

/**
 * Legge il flusso configurato dall'azienda per questo ambito e questo vertical
 * (mestiere per le commesse, categoria per i ticket). Lista vuota = l'azienda
 * non l'ha configurato e si userà quello predefinito.
 */
export async function leggiFlussoAzienda(params: {
  companyId: string;
  ambito: AmbitoFlusso;
  vertical?: string | null;
}): Promise<PassoFlusso[]> {
  const { companyId, ambito, vertical } = params;
  let q = supabase
    .from("order_task_template")
    .select(CAMPI_TEMPLATE)
    .eq("company_id", companyId)
    .eq("ambito", ambito)
    .eq("attivo", true)
    .order("sort_order", { ascending: true });
  q = vertical ? q.eq("vertical", vertical) : q.is("vertical", null);
  const { data, error } = await q;
  if (error) throw error;

  return ((data ?? []) as unknown as RigaTemplate[]).map((t) => ({
    id: t.id,
    office_stage: t.office_stage,
    titolo: t.titolo,
    descrizione: t.descrizione ?? undefined,
    giorni_offset: Number(t.giorni_offset) || 0,
    priorita: (t.priorita as PassoFlusso["priorita"]) ?? "normale",
    assegna_a_utente: t.assegna_a_utente ?? null,
    assegna_a_ufficio_id: t.assegna_a_ufficio_id ?? null,
    dipende_da_id: t.dipende_da_id ?? null,
    giorni_dopo_sblocco: Number(t.giorni_dopo_sblocco) || 0,
    chiudi_su_evento: (t.chiudi_su_evento as EventoChiusura | null) ?? null,
    fase_raggiunta_id: t.fase_raggiunta_id ?? null,
    activity_scope:
      t.activity_scope === "ufficio" || t.activity_scope === "cantiere"
        ? t.activity_scope
        : "generale",
    dopo_fase_lavorazione: t.dopo_fase_lavorazione ?? null,
    sort_order: t.sort_order ?? null,
  }));
}

export interface ApplicaFlussoParams {
  companyId: string;
  ambito: AmbitoFlusso;
  /** Id della commessa o del ticket a cui agganciare le attività. */
  entitaId: string;
  /** Mestiere (commesse) o categoria (ticket); NULL = flusso generale. */
  vertical?: string | null;
  /** Da qui si contano i `giorni_offset` dei passi che partono subito. */
  baseDate: Date;
  /** Chi prende i passi senza assegnatario proprio (responsabile commessa / tecnico del ticket). */
  assignedTo?: string | null;
  /** Passi da usare se l'azienda non ha configurato il flusso. */
  passiPredefiniti: PassoFlusso[];
  /** Categoria delle attività create (`tasks.category`). */
  categoriaTask: string;
}

/**
 * Applica un flusso a una commessa o a un ticket.
 *
 * Idempotente: salta i titoli già presenti sull'entità. Se un passo dipende da
 * un titolo già esistente, si aggancia a quella attività invece di duplicarla.
 */
export async function applicaFlusso(
  params: ApplicaFlussoParams,
): Promise<{ created: number }> {
  const {
    companyId,
    ambito,
    entitaId,
    vertical,
    baseDate,
    assignedTo,
    passiPredefiniti,
    categoriaTask,
  } = params;

  // created_by è NOT NULL su tasks: serve l'utente corrente.
  const { data: auth } = await supabase.auth.getUser();
  const createdBy = auth?.user?.id;
  if (!createdBy)
    throw new Error(
      "Sessione scaduta: accedi di nuovo per applicare il flusso di lavoro.",
    );

  const configurati = await leggiFlussoAzienda({ companyId, ambito, vertical });
  const steps: PassoFlusso[] =
    configurati.length > 0 ? configurati : passiPredefiniti;
  if (steps.length === 0) return { created: 0 };

  // Un passo di ufficio nasce in carico al RESPONSABILE dell'ufficio: senza
  // assegnatario resterebbe di nessuno (in produzione le task orfane erano il
  // grosso delle scadute). Gli altri membri la vedono comunque e possono
  // prenderla: le policy "Membri ufficio …" su tasks servono a questo.
  const responsabilePerUfficio = new Map<string, string | null>();
  const idUffici = Array.from(
    new Set(
      steps.map((s) => s.assegna_a_ufficio_id).filter((v): v is string => !!v),
    ),
  );
  if (idUffici.length > 0) {
    const { data: uffici, error } = await supabase
      .from("company_uffici")
      .select("id, responsabile_id")
      .in("id", idUffici);
    if (error) throw error;
    (
      (uffici ?? []) as unknown as Array<{
        id: string;
        responsabile_id: string | null;
      }>
    ).forEach((u) => responsabilePerUfficio.set(u.id, u.responsabile_id));
  }

  const colonnaEntita = ambito === "ticket" ? "ticket_id" : "order_id";

  // Fasi del cantiere della commessa ancora aperte: un passo può aspettarne una per nome.
  const faseApertaPerNome = new Map<string, string>();
  if (ambito === "commessa" && steps.some((s) => s.dopo_fase_lavorazione)) {
    const { data: fasi, error } = await supabase
      .from("order_work_phases")
      .select("id, name, status, position")
      .eq("order_id", entitaId)
      .order("position", { ascending: true });
    if (error) throw error;
    (
      (fasi ?? []) as unknown as Array<{
        id: string;
        name: string;
        status: string;
      }>
    )
      .filter((f) => f.status !== "completata")
      .forEach((f) => {
        const k = f.name.trim().toLowerCase();
        if (!faseApertaPerNome.has(k)) faseApertaPerNome.set(k, f.id);
      });
  }
  const faseAttesa = (s: PassoFlusso): string | null =>
    s.dopo_fase_lavorazione
      ? (faseApertaPerNome.get(s.dopo_fase_lavorazione.trim().toLowerCase()) ??
        null)
      : null;

  // Titoli già presenti: non si duplicano, ma servono come ancora per i passi
  // che dipendono da un pezzo di flusso creato in un giro precedente.
  const { data: esistenti, error: existingError } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("company_id", companyId)
    .eq(colonnaEntita, entitaId);
  if (existingError) throw existingError;
  const completed = new Set(
    (esistenti ?? []).filter((t) => t.status === "completata").map((t) => t.id),
  );
  const norm = (t: string) => t.trim().toLowerCase();
  const taskIdPerTitolo = new Map<string, string>();
  (
    (esistenti ?? []) as unknown as Array<{ id: string; title: string }>
  ).forEach((t) => {
    taskIdPerTitolo.set(norm(t.title ?? ""), t.id);
  });

  const daCreare = steps.filter((s) => !taskIdPerTitolo.has(norm(s.titolo)));
  if (daCreare.length === 0) return { created: 0 };

  // Le dipendenze del template sono fra righe di template; le attività vivono
  // per titolo: serve il ponte fra i due mondi.
  const titoloPerStepId = new Map<string, string>();
  steps.forEach((s) => {
    if (s.id) titoloPerStepId.set(s.id, s.titolo);
  });
  // Validate the graph before the first insert: invalid dependencies must not
  // silently become parallel tasks or create a partially applied invalid flow.
  const byId = new Map(steps.filter((s) => s.id).map((s) => [s.id!, s]));
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const sortedSteps: PassoFlusso[] = [];
  const visit = (id: string) => {
    if (visiting.has(id))
      throw Error("Il modello contiene una dipendenza circolare.");
    if (visited.has(id)) return;
    const step = byId.get(id);
    if (!step) throw Error("Una dipendenza del modello non è disponibile.");
    visiting.add(id);
    if (step.dipende_da_id) visit(step.dipende_da_id);
    visiting.delete(id);
    visited.add(id);
    sortedSteps.push(step);
  };
  for (const step of steps) if (step.id) visit(step.id);
  if (ambito === "commessa") {
    // One database transaction: an invalid assignee or a failed dependency
    // rolls back every task, including earlier parallel roots.
    const ordered = [...sortedSteps, ...steps.filter((s) => !s.id)];
    const payload = ordered.map((s, i) => ({
      title: s.titolo,
      notes: s.descrizione ?? null,
      days: s.giorni_offset,
      release_days: s.giorni_dopo_sblocco ?? 0,
      activity_scope:
        s.activity_scope ?? (s.assegna_a_ufficio_id ? "ufficio" : "generale"),
      office_stage: s.office_stage ?? null,
      priority: s.priorita,
      sort_order: s.sort_order ?? i,
      ufficio_id: s.assegna_a_ufficio_id ?? null,
      assigned_to: s.assegna_a_ufficio_id
        ? (responsabilePerUfficio.get(s.assegna_a_ufficio_id) ?? null)
        : (s.assegna_a_utente ?? assignedTo ?? createdBy),
      predecessor_title: s.dipende_da_id
        ? (titoloPerStepId.get(s.dipende_da_id) ?? null)
        : null,
      phase_name: s.dopo_fase_lavorazione ?? null,
      close_event: s.chiudi_su_evento ?? null,
      reached_status_id: s.fase_raggiunta_id ?? null,
    }));
    const { data, error } = await supabase.rpc(
      "applica_attivita_commessa_atomico" as never,
      {
        p_company_id: companyId,
        p_order_id: entitaId,
        p_rows: payload,
        p_base_date: format(baseDate, "yyyy-MM-dd"),
      } as never,
    );
    if (error) throw error;
    return { created: Number(data) || 0 };
  }

  /** id dell'attività che deve chiudersi prima, se già nota. */
  const predecessore = (s: PassoFlusso): string | null => {
    if (!s.dipende_da_id) return null;
    const titolo = titoloPerStepId.get(s.dipende_da_id);
    if (!titolo) return null;
    return taskIdPerTitolo.get(norm(titolo)) ?? null;
  };
  /** true se il passo aspetta qualcuno che non è ancora stato creato. */
  const attendePredecessore = (s: PassoFlusso) =>
    !!s.dipende_da_id &&
    titoloPerStepId.has(s.dipende_da_id) &&
    predecessore(s) === null;

  const scadenzaIniziale = (s: PassoFlusso) =>
    format(addDays(baseDate, s.giorni_offset), "yyyy-MM-dd");

  const rigaPerStep = (s: PassoFlusso, posizione: number) => {
    const prior = predecessore(s);
    const bloccataDa = prior && !completed.has(prior) ? prior : null;
    // Aspetta una fase del cantiere solo se non aspetta già un'altra attività.
    const fase = bloccataDa ? null : faseAttesa(s);
    const attende = !!bloccataDa || !!fase;
    return {
      company_id: companyId,
      office_stage: s.office_stage ?? null,
      [colonnaEntita]: entitaId,
      title: s.titolo,
      notes: s.descrizione ?? null,
      // In attesa = il passo esiste ma tocca a qualcun altro prima. Niente
      // scadenza finché è lì: altrimenti nascerebbe già arretrato.
      status: attende ? "in_attesa" : "da_fare",
      due_date: attende ? null : scadenzaIniziale(s),
      bloccata_da_task_id: bloccataDa,
      attende_fase_id: fase,
      sblocco_giorni: attende ? (s.giorni_dopo_sblocco ?? 0) : null,
      activity_scope: "generale",
      sort_order: s.sort_order ?? posizione,
      priority: s.priorita,
      category: categoriaTask,
      // Il DB ci pensa da solo: i trigger sugli incassi chiudono l'attività e
      // la catena riparte (chiudi_passi_su_evento).
      chiudi_su_evento: s.chiudi_su_evento ?? null,
      ufficio_id: s.assegna_a_ufficio_id ?? null,
      // Prima nascevano senza assegnatario: in produzione erano il grosso delle
      // attività scadute che nessuno vedeva come proprie.
      assigned_to: s.assegna_a_ufficio_id
        ? (responsabilePerUfficio.get(s.assegna_a_ufficio_id) ?? null)
        : (s.assegna_a_utente ?? assignedTo ?? createdBy),
      created_by: createdBy,
      // La fase la avanza il DB alla chiusura (trigger avanza_fase_da_passo_chiuso).
      fase_al_completamento_id: null as string | null,
    };
  };

  // Validated graph: create predecessor ids first, then the waiting tasks.
  let rimasti = daCreare;
  let creati = 0;
  for (let giro = 0; giro < steps.length + 1 && rimasti.length > 0; giro++) {
    const ondata = rimasti.filter((s) => !attendePredecessore(s));

    if (!ondata.length)
      throw Error(
        "Non posso applicare il modello: dipendenze non risolvibili.",
      );
    const daInserire = ondata;

    const { data: inserite, error } = await supabase
      .from("tasks")
      .insert(daInserire.map((s) => rigaPerStep(s, steps.indexOf(s))) as never)
      .select("id, title");
    if (error) throw error;

    (
      (inserite ?? []) as unknown as Array<{ id: string; title: string }>
    ).forEach((t) => {
      taskIdPerTitolo.set(norm(t.title ?? ""), t.id);
    });
    creati += daInserire.length;

    const fatti = new Set(daInserire.map((s) => norm(s.titolo)));
    rimasti = rimasti.filter((s) => !fatti.has(norm(s.titolo)));
  }

  return { created: creati };
}
