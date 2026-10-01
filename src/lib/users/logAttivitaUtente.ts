/**
 * Log attività di un utente: tutto quello che ha fatto, giorno per giorno.
 *
 * Il log mostrava solo gli eventi di sicurezza (login, ruoli, permessi). Chi
 * gestisce la squadra vuole vedere anche il lavoro: note scritte, fasi cambiate,
 * contatti creati o modificati, chiamate, email, appuntamenti, preventivi.
 * Qui la parte senza database: categorie, etichette, intervalli di date e
 * raggruppamento per giorno.
 */

export type CategoriaLog =
  | "sicurezza" | "note" | "pipeline" | "contatti" | "chiamate"
  | "email" | "appuntamenti" | "preventivi" | "attivita" | "documenti" | "altro"
  | "commesse" | "calendario" | "magazzino" | "acquisti" | "finanza" | "personale";

export const CATEGORIE_LOG: { chiave: CategoriaLog; etichetta: string }[] = [
  { chiave: "note", etichetta: "Note" },
  { chiave: "pipeline", etichetta: "Pipeline e opportunità" },
  { chiave: "contatti", etichetta: "Contatti" },
  { chiave: "chiamate", etichetta: "Chiamate" },
  { chiave: "email", etichetta: "Email" },
  { chiave: "appuntamenti", etichetta: "Appuntamenti" },
  { chiave: "calendario", etichetta: "Calendario" },
  { chiave: "commesse", etichetta: "Commesse e cantieri" },
  { chiave: "magazzino", etichetta: "Magazzino" },
  { chiave: "acquisti", etichetta: "Acquisti e fornitori" },
  { chiave: "preventivi", etichetta: "Preventivi" },
  { chiave: "finanza", etichetta: "Fatture e finanza" },
  { chiave: "personale", etichetta: "Personale e mezzi" },
  { chiave: "attivita", etichetta: "Attività e task" },
  { chiave: "documenti", etichetta: "Documenti" },
  { chiave: "sicurezza", etichetta: "Accessi e sicurezza" },
  { chiave: "altro", etichetta: "Altro" },
];

export interface VoceLog {
  id: string;
  quando: string; // ISO
  categoria: CategoriaLog;
  titolo: string;
  dettaglio?: string | null;
  contactId?: string | null;
  /** Dalla scheda «Accessi e sicurezza»: azione fatta tramite impersonazione. */
  impersonata?: boolean;
  /** Valore grezzo dell'azione (per il filtro per azione di sicurezza). */
  azione?: string | null;
}

/** Tipi di attività del registro contatti → categoria e nome italiano. */
const ATTIVITA_REGISTRO: Record<string, { categoria: CategoriaLog; titolo: string }> = {
  contact_created: { categoria: "contatti", titolo: "Contatto creato" },
  created: { categoria: "contatti", titolo: "Contatto creato" },
  updated: { categoria: "contatti", titolo: "Contatto aggiornato" },
  imported: { categoria: "contatti", titolo: "Contatto importato" },
  converted: { categoria: "contatti", titolo: "Convertito in cliente" },
  contact_assigned: { categoria: "contatti", titolo: "Contatto assegnato" },
  assigned: { categoria: "contatti", titolo: "Contatto assegnato" },
  tag_added: { categoria: "contatti", titolo: "Etichetta aggiunta" },
  tag_removed: { categoria: "contatti", titolo: "Etichetta rimossa" },
  opportunity_created: { categoria: "pipeline", titolo: "Opportunità creata" },
  opportunity_assigned: { categoria: "pipeline", titolo: "Opportunità assegnata" },
  opportunity_deleted: { categoria: "pipeline", titolo: "Opportunità eliminata" },
  opportunity_restored: { categoria: "pipeline", titolo: "Opportunità ripristinata" },
  stage_changed: { categoria: "pipeline", titolo: "Fase cambiata" },
  stage_change: { categoria: "pipeline", titolo: "Fase cambiata" },
  status_changed: { categoria: "pipeline", titolo: "Stato cambiato" },
  status_change: { categoria: "pipeline", titolo: "Stato cambiato" },
  document_uploaded: { categoria: "documenti", titolo: "Documento caricato" },
  quote_sent: { categoria: "preventivi", titolo: "Preventivo inviato" },
  quote_accepted: { categoria: "preventivi", titolo: "Preventivo accettato" },
  email_sent: { categoria: "email", titolo: "Email inviata" },
  message_sent: { categoria: "contatti", titolo: "Messaggio inviato" },
};

export function vocedaAttivitaRegistro(tipo: string | null | undefined): { categoria: CategoriaLog; titolo: string } {
  const t = (tipo ?? "").trim();
  if (ATTIVITA_REGISTRO[t]) return ATTIVITA_REGISTRO[t];
  const leggibile = t.replace(/[_.-]+/g, " ");
  return { categoria: "altro", titolo: leggibile ? leggibile.charAt(0).toUpperCase() + leggibile.slice(1) : "Attività" };
}

/** Azioni del log aziendale (company_activity_log): «contact.updated», «task_created»… */
export function vocedaLogAzienda(azione: string | null | undefined): { categoria: CategoriaLog; titolo: string } {
  const a = (azione ?? "").trim();
  const [oggetto, verbo] = a.includes(".") ? a.split(".") : [a.split("_")[0], a.split("_").slice(1).join("_")];
  const VERBI: Record<string, string> = {
    created: "creato", updated: "modificato", deleted: "eliminato", status_updated: "stato cambiato",
    hired: "assunto", completed: "completato", status_changed: "stato cambiato",
  };
  const OGGETTI: Record<string, { categoria: CategoriaLog; nome: string }> = {
    contact: { categoria: "contatti", nome: "Contatto" },
    customer: { categoria: "contatti", nome: "Cliente" },
    quote: { categoria: "preventivi", nome: "Preventivo" },
    order: { categoria: "altro", nome: "Ordine" },
    task: { categoria: "attivita", nome: "Task" },
    employee: { categoria: "altro", nome: "Dipendente" },
  };
  const o = OGGETTI[oggetto];
  if (o) {
    const v = VERBI[verbo] ?? verbo.replace(/_/g, " ");
    return { categoria: o.categoria, titolo: `${o.nome} ${v}`.trim() };
  }
  const leggibile = a.replace(/[_.-]+/g, " ");
  return { categoria: "altro", titolo: leggibile ? leggibile.charAt(0).toUpperCase() + leggibile.slice(1) : "Azione" };
}

// ── Date ────────────────────────────────────────────────────────────────────

export type PresetPeriodo = "oggi" | "ieri" | "7" | "30" | "tutto" | "personalizzato";

export interface Intervallo {
  /** yyyy-MM-dd, incluso; null = senza limite */
  da: string | null;
  a: string | null;
}

function giornoLocale(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function intervalloPreset(preset: PresetPeriodo, adesso: Date = new Date()): Intervallo {
  const oggi = giornoLocale(adesso);
  const meno = (giorni: number) => {
    const d = new Date(adesso);
    d.setDate(d.getDate() - giorni);
    return giornoLocale(d);
  };
  switch (preset) {
    case "oggi": return { da: oggi, a: oggi };
    case "ieri": return { da: meno(1), a: meno(1) };
    case "7": return { da: meno(6), a: oggi };
    case "30": return { da: meno(29), a: oggi };
    default: return { da: null, a: null };
  }
}

/** Estremi ISO per le query: dal primo istante di «da» all'ultimo di «a», in ora locale. */
export function estremiIso(i: Intervallo): { da: string | null; a: string | null } {
  const inizio = i.da ? new Date(`${i.da}T00:00:00`) : null;
  const fine = i.a ? new Date(`${i.a}T23:59:59.999`) : null;
  return {
    da: inizio && !Number.isNaN(inizio.getTime()) ? inizio.toISOString() : null,
    a: fine && !Number.isNaN(fine.getTime()) ? fine.toISOString() : null,
  };
}

export function chiaveGiorno(iso: string): string {
  return giornoLocale(new Date(iso));
}

export function etichettaGiorno(chiave: string, adesso: Date = new Date()): string {
  const [y, m, d] = chiave.split("-").map(Number);
  const data = new Date(y, m - 1, d);
  const diff = Math.round((new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate()).getTime() - data.getTime()) / 86_400_000);
  const lungo = data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (diff === 0) return `Oggi · ${lungo}`;
  if (diff === 1) return `Ieri · ${lungo}`;
  return lungo.charAt(0).toUpperCase() + lungo.slice(1);
}

/** Più recenti prima, poi raggruppate per giorno (ordine preservato). */
export function raggruppaPerGiorno(voci: VoceLog[]): { giorno: string; voci: VoceLog[] }[] {
  const ordinate = [...voci].sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
  const gruppi: { giorno: string; voci: VoceLog[] }[] = [];
  for (const v of ordinate) {
    const g = chiaveGiorno(v.quando);
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.giorno === g) ultimo.voci.push(v);
    else gruppi.push({ giorno: g, voci: [v] });
  }
  return gruppi;
}

export function contaPerCategoria(voci: VoceLog[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of voci) out[v.categoria] = (out[v.categoria] ?? 0) + 1;
  return out;
}

// ── Registro azioni su tutta l'app (user_action_log) ────────────────────────

interface InfoTabella { categoria: CategoriaLog; nome: string; femminile?: boolean }

/** Tabella → modulo e nome dell'oggetto, per scrivere «Commessa modificata». */
export const TABELLE_LOG: Record<string, InfoTabella> = {
  orders: { categoria: "commesse", nome: "Commessa", femminile: true },
  order_work_phases: { categoria: "commesse", nome: "Fase di lavoro", femminile: true },
  order_campo_assignments: { categoria: "commesse", nome: "Assegnazione di cantiere", femminile: true },
  order_phase_assignments: { categoria: "commesse", nome: "Assegnazione di fase", femminile: true },
  order_document_folders: { categoria: "commesse", nome: "Cartella documenti", femminile: true },
  order_variable_compensations: { categoria: "commesse", nome: "Compenso variabile" },
  order_bonus_lines: { categoria: "commesse", nome: "Riga bonus", femminile: true },
  ordini_variazione: { categoria: "commesse", nome: "Variazione d'ordine", femminile: true },
  giornale_lavori: { categoria: "commesse", nome: "Giornale lavori" },
  campo_rapportini: { categoria: "commesse", nome: "Rapportino" },
  campo_timbrature: { categoria: "commesse", nome: "Timbratura di cantiere", femminile: true },
  note_cantiere: { categoria: "commesse", nome: "Nota di cantiere", femminile: true },
  foto_cantiere: { categoria: "commesse", nome: "Foto di cantiere", femminile: true },
  squadre_commesse: { categoria: "commesse", nome: "Squadra della commessa", femminile: true },
  squadre_componenti: { categoria: "commesse", nome: "Componente di squadra" },
  sal_records: { categoria: "commesse", nome: "SAL" },
  prelievi_campo: { categoria: "commesse", nome: "Prelievo di cantiere" },
  site_deliveries: { categoria: "commesse", nome: "Consegna in cantiere", femminile: true },
  shipments_to_site: { categoria: "commesse", nome: "Spedizione in cantiere", femminile: true },
  appointments: { categoria: "calendario", nome: "Appuntamento" },
  marketing_calendars: { categoria: "calendario", nome: "Calendario" },
  marketing_calendar_availability: { categoria: "calendario", nome: "Disponibilità del calendario", femminile: true },
  user_availability: { categoria: "calendario", nome: "Disponibilità", femminile: true },
  warehouses: { categoria: "magazzino", nome: "Magazzino" },
  warehouse_sections: { categoria: "magazzino", nome: "Zona del magazzino", femminile: true },
  warehouse_stock: { categoria: "magazzino", nome: "Giacenza", femminile: true },
  warehouse_movements: { categoria: "magazzino", nome: "Movimento di magazzino" },
  warehouse_transfers: { categoria: "magazzino", nome: "Trasferimento", },
  warehouse_uscite: { categoria: "magazzino", nome: "Uscita di magazzino", femminile: true },
  warehouse_lotti: { categoria: "magazzino", nome: "Lotto" },
  stock_lotti: { categoria: "magazzino", nome: "Lotto" },
  stock_units: { categoria: "magazzino", nome: "Unità di magazzino", femminile: true },
  goods_receipts: { categoria: "magazzino", nome: "Ricezione merce", femminile: true },
  ddt_ricezione: { categoria: "magazzino", nome: "DDT ricevuto" },
  scorte_furgone: { categoria: "magazzino", nome: "Scorta del furgone", femminile: true },
  purchase_orders: { categoria: "acquisti", nome: "Ordine d'acquisto" },
  purchase_order_items: { categoria: "acquisti", nome: "Riga ordine d'acquisto", femminile: true },
  suppliers: { categoria: "acquisti", nome: "Fornitore" },
  subappaltatori: { categoria: "acquisti", nome: "Subappaltatore" },
  contratti_subappalto: { categoria: "acquisti", nome: "Contratto di subappalto" },
  articoli_native: { categoria: "acquisti", nome: "Articolo" },
  anagrafiche_native: { categoria: "acquisti", nome: "Anagrafica", femminile: true },
  listini_fornitore: { categoria: "acquisti", nome: "Listino fornitore" },
  listino_prezzi: { categoria: "acquisti", nome: "Listino prezzi" },
  quotes: { categoria: "preventivi", nome: "Preventivo" },
  quote_items: { categoria: "preventivi", nome: "Riga preventivo", femminile: true },
  quote_versions: { categoria: "preventivi", nome: "Versione del preventivo", femminile: true },
  signature_requests: { categoria: "preventivi", nome: "Richiesta di firma", femminile: true },
  sr_progetti: { categoria: "preventivi", nome: "Progetto serramenti" },
  fv_progetti: { categoria: "preventivi", nome: "Progetto fotovoltaico" },
  rst_progetti: { categoria: "preventivi", nome: "Progetto ristrutturazione" },
  bgn_progetti: { categoria: "preventivi", nome: "Progetto bagno" },
  clm_progetti: { categoria: "preventivi", nome: "Progetto climatizzazione" },
  ele_progetti: { categoria: "preventivi", nome: "Progetto impianto elettrico" },
  idr_progetti: { categoria: "preventivi", nome: "Progetto idraulico" },
  pav_progetti: { categoria: "preventivi", nome: "Progetto pavimenti" },
  pis_progetti: { categoria: "preventivi", nome: "Progetto piscina" },
  tet_progetti: { categoria: "preventivi", nome: "Progetto tetto" },
  invoices: { categoria: "finanza", nome: "Fattura", femminile: true },
  invoice_payments: { categoria: "finanza", nome: "Incasso" },
  documenti_fiscali: { categoria: "finanza", nome: "Documento fiscale" },
  fatture_ricevute: { categoria: "finanza", nome: "Fattura ricevuta", femminile: true },
  prima_nota_entries: { categoria: "finanza", nome: "Movimento di prima nota" },
  scadenze: { categoria: "finanza", nome: "Scadenza", femminile: true },
  company_costs: { categoria: "finanza", nome: "Costo" },
  expense_reports: { categoria: "finanza", nome: "Nota spese", femminile: true },
  cespiti: { categoria: "finanza", nome: "Cespite" },
  employees: { categoria: "personale", nome: "Dipendente" },
  hr_richieste: { categoria: "personale", nome: "Richiesta HR", femminile: true },
  hr_assenze: { categoria: "personale", nome: "Assenza", femminile: true },
  hr_candidati: { categoria: "personale", nome: "Candidato" },
  hr_cedolini: { categoria: "personale", nome: "Cedolino" },
  hr_documenti: { categoria: "personale", nome: "Documento HR" },
  leave_requests: { categoria: "personale", nome: "Richiesta di permesso", femminile: true },
  mezzi: { categoria: "personale", nome: "Mezzo" },
  mezzi_assegnazioni: { categoria: "personale", nome: "Assegnazione del mezzo", femminile: true },
  mezzi_manutenzioni: { categoria: "personale", nome: "Manutenzione del mezzo", femminile: true },
  marketing_contacts: { categoria: "contatti", nome: "Contatto" },
  marketing_opportunities: { categoria: "pipeline", nome: "Opportunità", femminile: true },
  marketing_pipelines: { categoria: "pipeline", nome: "Pipeline", femminile: true },
  marketing_pipeline_stages: { categoria: "pipeline", nome: "Fase della pipeline", femminile: true },
  marketing_tags: { categoria: "contatti", nome: "Etichetta", femminile: true },
  marketing_documents: { categoria: "documenti", nome: "Documento" },
  tasks: { categoria: "attivita", nome: "Attività", femminile: true },
  tickets: { categoria: "attivita", nome: "Ticket" },
  customer_documents: { categoria: "documenti", nome: "Documento del cliente" },
  contratti_manutenzione: { categoria: "commesse", nome: "Contratto di manutenzione" },
  social_posts: { categoria: "altro", nome: "Post social" },
  email_templates: { categoria: "email", nome: "Modello email" },
  automation_flows: { categoria: "altro", nome: "Automazione", femminile: true },
  lead_forms: { categoria: "altro", nome: "Modulo lead" },
};

export interface RigaAzione {
  id: number | string;
  created_at: string;
  azione: string;
  tabella: string;
  record_id?: string | null;
  etichetta?: string | null;
  campi_modificati?: string[] | null;
  volte?: number | null;
}

/** Una riga di user_action_log come voce del log: «Commessa modificata — Rossi (stato, note)». */
export function voceDaAzione(r: RigaAzione): VoceLog {
  const info = TABELLE_LOG[r.tabella];
  const nome = info?.nome ?? r.tabella.replace(/_/g, " ");
  const f = !!info?.femminile;
  const verbo = r.azione === "insert" ? (f ? "creata" : "creato")
    : r.azione === "delete" ? (f ? "eliminata" : "eliminato")
      : (f ? "modificata" : "modificato");
  const campi = (r.campi_modificati ?? []).map((c) => c.replace(/_/g, " "));
  const salvataggi = Number(r.volte ?? 1) > 1 ? ` · ${r.volte} salvataggi` : "";
  const dettaglio = [
    r.etichetta,
    r.azione === "update" && campi.length ? `Campi: ${campi.slice(0, 8).join(", ")}${campi.length > 8 ? `… (+${campi.length - 8})` : ""}${salvataggi}` : null,
  ].filter(Boolean).join(" — ");
  return {
    id: `azione_${r.id}`,
    quando: r.created_at,
    categoria: info?.categoria ?? "altro",
    titolo: `${nome} ${verbo}`,
    dettaglio: dettaglio || null,
  };
}

/** Campi dell'opportunità che il registro attività racconta già (fase, stato, assegnazione). */
const CAMPI_OPPORTUNITA_GIA_RACCONTATI = new Set([
  "stage_id", "status", "assigned_to", "call_center_id", "closed_at", "lost_reason", "lost_reason_id", "position",
]);

/**
 * Le modifiche di fase/stato/assegnazione di un'opportunità sono già nel registro
 * attività, con il nome della fase: la riga generica sarebbe un doppione.
 */
export function azioneRidondante(r: RigaAzione): boolean {
  if (r.tabella !== "marketing_opportunities" || r.azione !== "update") return false;
  const campi = r.campi_modificati ?? [];
  return campi.length > 0 && campi.every((c) => CAMPI_OPPORTUNITA_GIA_RACCONTATI.has(c));
}
