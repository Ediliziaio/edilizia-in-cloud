/**
 * Il sopralluogo in agenda: stesse regole degli altri appuntamenti.
 *
 * Prima il wizard del sopralluogo chiedeva data e ora in due campi liberi e
 * scriveva solo `surveys.scheduled_at`. Quindi:
 *  - gli orari del calendario del tecnico (fasce di lavoro, passo, margini,
 *    preavviso minimo, tetto al giorno) non contavano niente: si poteva fissare
 *    un rilievo alle 03:00 di domenica;
 *  - il rilievo non occupava nessuno slot, quindi il prossimo appuntamento
 *    poteva essere fissato alla stessa ora senza che nessuno lo sapesse;
 *  - non compariva nel calendario CRM, perché nessuna riga di `appointments`
 *    veniva creata — anche se il database aspettava il legame da sempre:
 *    `surveys.appointment_id` esiste, e il trigger `survey_segue_appuntamento`
 *    sposta il sopralluogo quando si sposta il suo appuntamento.
 *
 * Qui c'è la parte decidibile senza rete: quale calendario vale, perché un'ora
 * scelta a mano non va bene, e la riga che fissa il sopralluogo in agenda.
 * Il calcolo degli orari liberi è quello di tutti: `calcolaSlotLiberi`.
 */
import { addMinutesToTimeStr } from "@/lib/marketingCalendarConstants";
import type { EsitoSlot } from "@/lib/opportunita/slotCalendario";

export interface CalendarioAgenda {
  id: string;
  name: string;
  owner_id: string | null;
  duration_minutes: number | null;
  slot_interval_min: number | null;
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  min_notice_minutes: number | null;
  max_per_day: number | null;
}

/** La durata di un sopralluogo quando il calendario non la dice. */
export const DURATA_SOPRALLUOGO_MIN = 60;

/**
 * Il calendario su cui fissare il rilievo: quello del tecnico incaricato.
 *
 * Un tecnico puo' averne piu' di uno (per anno, per tipo di lavoro): vale il
 * primo in ordine di nome, e gli impegni sugli altri suoi calendari li toglie
 * comunque il calcolo degli slot, che guarda tutti i calendari dello stesso
 * titolare. Senza tecnico, o senza un suo calendario, non ci sono impostazioni
 * da rispettare e l'ora resta libera.
 */
export function calendarioDelTecnico<T extends CalendarioAgenda>(
  calendari: T[] | null | undefined,
  technicianId: string | null | undefined,
): T | null {
  if (!technicianId) return null;
  const suoi = (calendari ?? []).filter((c) => c.owner_id === technicianId);
  if (suoi.length === 0) return null;
  return [...suoi].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it"))[0];
}

/** Quanto dura il sopralluogo secondo il calendario. */
export function durataSopralluogo(calendario: CalendarioAgenda | null | undefined): number {
  const d = Number(calendario?.duration_minutes ?? 0);
  return d > 0 ? d : DURATA_SOPRALLUOGO_MIN;
}

export interface ParametriAvviso {
  /** L'ora scritta a mano, HH:mm. */
  ora: string;
  calendario: CalendarioAgenda | null;
  /** L'esito di `calcolaSlotLiberi`, assente se non si è potuto calcolare. */
  esito: EsitoSlot | null;
  /** Se il calendario ha almeno una regola di disponibilità per quel giorno. */
  haRegole: boolean;
}

/**
 * Perché l'ora scelta non va bene, se non va bene.
 *
 * Non blocca il salvataggio: il titolare resta libero di fissare un rilievo
 * fuori orario (un cliente che riceve solo di sabato esiste). Ma lo deve sapere
 * prima, non scoprirlo quando il tecnico non si presenta.
 *
 * Un calendario SENZA regole di disponibilità non è «chiuso»: è un calendario
 * che nessuno ha ancora configurato. Lì non si avvisa di niente.
 */
export function avvisoOrario(p: ParametriAvviso): string | null {
  const { ora, calendario, esito, haRegole } = p;
  if (!calendario || !esito || !ora) return null;
  if (!haRegole) return null;
  const nome = calendario.name;
  if (esito.motivoVuoto === "chiuso")
    return `Quel giorno il calendario «${nome}» è chiuso: nessuna fascia di lavoro.`;
  if (esito.motivoVuoto === "tetto")
    return `Quel giorno è già al massimo di appuntamenti previsto dal calendario «${nome}» (${calendario.max_per_day}).`;
  if (esito.motivoVuoto === "pieno")
    return `Quel giorno il calendario «${nome}» non ha più orari liberi.`;
  if (esito.slot.length > 0 && !esito.slot.includes(ora.slice(0, 5)))
    return `Alle ${ora.slice(0, 5)} il calendario «${nome}» non è libero: gli orari disponibili sono qui sopra.`;
  return null;
}

export interface DatiAppuntamentoSopralluogo {
  companyId: string;
  calendario: CalendarioAgenda;
  technicianId: string;
  /** yyyy-MM-dd */
  giorno: string;
  /** HH:mm */
  ora: string;
  titolo: string;
  contactId?: string | null;
  orderId?: string | null;
  opportunityId?: string | null;
  indirizzo?: {
    address_line?: string | null;
    address_city?: string | null;
    address_postal_code?: string | null;
    address_province?: string | null;
    formatted_address?: string | null;
    lat?: number | null;
    lng?: number | null;
    place_id?: string | null;
  } | null;
  note?: string | null;
}

/**
 * La riga di `appointments` che fissa il sopralluogo in agenda.
 *
 * `appointment_type` è 'sopralluogo_tecnico', valore già in uso nel database.
 * Il titolo lo ricompone comunque il trigger `componi_titolo_appuntamento`:
 * quello passato qui è il ripiego se il trigger non trova di meglio.
 */
export function appuntamentoDelSopralluogo(p: DatiAppuntamentoSopralluogo) {
  const durata = durataSopralluogo(p.calendario);
  const ora = p.ora.slice(0, 5);
  return {
    company_id: p.companyId,
    calendar_id: p.calendario.id,
    assigned_to: p.technicianId,
    appointment_date: p.giorno,
    appointment_time: `${ora}:00`,
    appointment_end_time: `${addMinutesToTimeStr(ora, durata)}:00`,
    appointment_type: "sopralluogo_tecnico",
    title: p.titolo,
    status: "confermato",
    contact_id: p.contactId ?? null,
    order_id: p.orderId ?? null,
    opportunity_id: p.opportunityId ?? null,
    address_line: p.indirizzo?.address_line || null,
    address_city: p.indirizzo?.address_city || null,
    address_postal_code: p.indirizzo?.address_postal_code || null,
    address_province: p.indirizzo?.address_province || null,
    formatted_address: p.indirizzo?.formatted_address || null,
    lat: p.indirizzo?.lat ?? null,
    lng: p.indirizzo?.lng ?? null,
    place_id: p.indirizzo?.place_id || null,
    internal_notes: p.note || null,
  };
}
