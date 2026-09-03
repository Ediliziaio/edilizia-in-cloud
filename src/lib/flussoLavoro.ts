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

export const EVENTI_CHIUSURA: ReadonlyArray<{ value: EventoChiusura; label: string; spiegazione: string }> = [
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
}

interface RigaTemplate {
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
}

const CAMPI_TEMPLATE =
  "id, titolo, descrizione, giorni_offset, priorita, assegna_a_utente, assegna_a_ufficio_id, dipende_da_id, giorni_dopo_sblocco, chiudi_su_evento";

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
  const { data } = await q;

  return ((data ?? []) as unknown as RigaTemplate[]).map((t) => ({
    id: t.id,
    titolo: t.titolo,
    descrizione: t.descrizione ?? undefined,
    giorni_offset: Number(t.giorni_offset) || 0,
    priorita: (t.priorita as PassoFlusso["priorita"]) ?? "normale",
    assegna_a_utente: t.assegna_a_utente ?? null,
    assegna_a_ufficio_id: t.assegna_a_ufficio_id ?? null,
    dipende_da_id: t.dipende_da_id ?? null,
    giorni_dopo_sblocco: Number(t.giorni_dopo_sblocco) || 0,
    chiudi_su_evento: (t.chiudi_su_evento as EventoChiusura | null) ?? null,
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
export async function applicaFlusso(params: ApplicaFlussoParams): Promise<{ created: number }> {
  const {
    companyId, ambito, entitaId, vertical, baseDate, assignedTo,
    passiPredefiniti, categoriaTask,
  } = params;

  // created_by è NOT NULL su tasks: serve l'utente corrente.
  const { data: auth } = await supabase.auth.getUser();
  const createdBy = auth?.user?.id;
  if (!createdBy) throw new Error("Sessione scaduta: accedi di nuovo per applicare il flusso di lavoro.");

  const configurati = await leggiFlussoAzienda({ companyId, ambito, vertical });
  const steps: PassoFlusso[] = configurati.length > 0 ? configurati : passiPredefiniti;
  if (steps.length === 0) return { created: 0 };

  // Un passo di ufficio nasce in carico al RESPONSABILE dell'ufficio: senza
  // assegnatario resterebbe di nessuno (in produzione le task orfane erano il
  // grosso delle scadute). Gli altri membri la vedono comunque e possono
  // prenderla: le policy "Membri ufficio …" su tasks servono a questo.
  const responsabilePerUfficio = new Map<string, string | null>();
  const idUffici = Array.from(new Set(
    steps.map((s) => s.assegna_a_ufficio_id).filter((v): v is string => !!v),
  ));
  if (idUffici.length > 0) {
    const { data: uffici } = await supabase
      .from("company_uffici")
      .select("id, responsabile_id")
      .in("id", idUffici);
    ((uffici ?? []) as unknown as Array<{ id: string; responsabile_id: string | null }>)
      .forEach((u) => responsabilePerUfficio.set(u.id, u.responsabile_id));
  }

  const colonnaEntita = ambito === "ticket" ? "ticket_id" : "order_id";

  // Titoli già presenti: non si duplicano, ma servono come ancora per i passi
  // che dipendono da un pezzo di flusso creato in un giro precedente.
  const { data: esistenti } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("company_id", companyId)
    .eq(colonnaEntita, entitaId);
  const norm = (t: string) => t.trim().toLowerCase();
  const taskIdPerTitolo = new Map<string, string>();
  ((esistenti ?? []) as unknown as Array<{ id: string; title: string }>).forEach((t) => {
    taskIdPerTitolo.set(norm(t.title ?? ""), t.id);
  });

  const daCreare = steps.filter((s) => !taskIdPerTitolo.has(norm(s.titolo)));
  if (daCreare.length === 0) return { created: 0 };

  // Le dipendenze del template sono fra righe di template; le attività vivono
  // per titolo: serve il ponte fra i due mondi.
  const titoloPerStepId = new Map<string, string>();
  steps.forEach((s) => { if (s.id) titoloPerStepId.set(s.id, s.titolo); });

  /** id dell'attività che deve chiudersi prima, se già nota. */
  const predecessore = (s: PassoFlusso): string | null => {
    if (!s.dipende_da_id) return null;
    const titolo = titoloPerStepId.get(s.dipende_da_id);
    if (!titolo) return null;
    return taskIdPerTitolo.get(norm(titolo)) ?? null;
  };
  /** true se il passo aspetta qualcuno che non è ancora stato creato. */
  const attendePredecessore = (s: PassoFlusso) =>
    !!s.dipende_da_id && titoloPerStepId.has(s.dipende_da_id) && predecessore(s) === null;

  const scadenzaIniziale = (s: PassoFlusso) =>
    format(addDays(baseDate, s.giorni_offset), "yyyy-MM-dd");

  const rigaPerStep = (s: PassoFlusso) => {
    const bloccataDa = predecessore(s);
    return {
      company_id: companyId,
      [colonnaEntita]: entitaId,
      title: s.titolo,
      notes: s.descrizione ?? null,
      // In attesa = il passo esiste ma tocca a qualcun altro prima. Niente
      // scadenza finché è lì: altrimenti nascerebbe già arretrato.
      status: bloccataDa ? "in_attesa" : "da_fare",
      due_date: bloccataDa ? null : scadenzaIniziale(s),
      bloccata_da_task_id: bloccataDa,
      sblocco_giorni: bloccataDa ? s.giorni_dopo_sblocco ?? 0 : null,
      priority: s.priorita,
      category: categoriaTask,
      // Il DB ci pensa da solo: i trigger sugli incassi chiudono l'attività e
      // la catena riparte (chiudi_passi_su_evento).
      chiudi_su_evento: s.chiudi_su_evento ?? null,
      ufficio_id: s.assegna_a_ufficio_id ?? null,
      // Prima nascevano senza assegnatario: in produzione erano il grosso delle
      // attività scadute che nessuno vedeva come proprie.
      assigned_to: s.assegna_a_ufficio_id
        ? responsabilePerUfficio.get(s.assegna_a_ufficio_id) ?? null
        : s.assegna_a_utente ?? assignedTo ?? createdBy,
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
      .insert(daInserire.map((s) => (forzaRoot
        ? {
            ...rigaPerStep(s),
            status: "da_fare",
            bloccata_da_task_id: null,
            sblocco_giorni: null,
            due_date: scadenzaIniziale(s),
          }
        : rigaPerStep(s))) as never)
      .select("id, title");
    if (error) throw error;

    ((inserite ?? []) as unknown as Array<{ id: string; title: string }>).forEach((t) => {
      taskIdPerTitolo.set(norm(t.title ?? ""), t.id);
    });
    creati += daInserire.length;

    const fatti = new Set(daInserire.map((s) => norm(s.titolo)));
    rimasti = rimasti.filter((s) => !fatti.has(norm(s.titolo)));
  }

  return { created: creati };
}
