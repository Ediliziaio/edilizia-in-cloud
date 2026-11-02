/**
 * Registro di una commessa: chi ha fatto cosa e quando, per capire da dove viene un
 * errore. Mette insieme le azioni registrate dal database (registro_commessa), gli
 * eventi storici, documenti/foto/rapportini/firme e i messaggi già inviati, senza
 * contare due volte la stessa azione. Niente React qui.
 */
import { format, parseISO } from "date-fns";

export type TipoVoce = "creato" | "modificato" | "eliminato" | "evento" | "messaggio";

export interface AzioneRegistro {
  id: number | string;
  quando: string;
  user_id: string | null;
  chi: string | null;
  azione: string;
  tabella: string;
  record_id: string | null;
  etichetta: string | null;
  campi: string[] | null;
  valori: Record<string, { da?: unknown; a?: unknown }> | null;
  volte: number | null;
}

export interface VoceRegistro {
  id: string;
  quando: string;
  chi: string;
  /** Nessuna persona dietro: automatismo, o azione registrata prima del registro. */
  senzaPersona: boolean;
  tipo: TipoVoce;
  area: string;
  titolo: string;
  oggetto: string | null;
  dettagli: string[];
  volte: number;
}

export const AREE = [
  "Commessa", "Articoli", "Fasi e programma", "Economia e pagamenti", "Fatture", "Acquisti e fornitori", "Subappalti",
  "Personale e mezzi", "Cantiere", "Documenti e foto", "Attività e appuntamenti", "Assistenza", "Sicurezza", "Firme", "Comunicazioni",
] as const;

const TABELLE: Record<string, { area: string; nome: string }> = {
  orders: { area: "Commessa", nome: "la commessa" },
  order_items: { area: "Articoli", nome: "un articolo" },
  order_bonus_lines: { area: "Economia e pagamenti", nome: "un bonus" },
  ordini_variazione: { area: "Commessa", nome: "una variante" },
  varianti_cliente: { area: "Commessa", nome: "una variante cliente" },
  order_work_phases: { area: "Fasi e programma", nome: "una fase" },
  order_work_subphases: { area: "Fasi e programma", nome: "una sottofase" },
  order_phase_assignments: { area: "Fasi e programma", nome: "un'assegnazione di fase" },
  order_installments: { area: "Economia e pagamenti", nome: "una rata" },
  order_salespeople: { area: "Economia e pagamenti", nome: "una provvigione" },
  order_variable_compensations: { area: "Economia e pagamenti", nome: "un compenso variabile" },
  company_costs: { area: "Economia e pagamenti", nome: "un costo" },
  prima_nota_entries: { area: "Economia e pagamenti", nome: "un movimento di prima nota" },
  scadenze: { area: "Economia e pagamenti", nome: "una scadenza" },
  order_errors: { area: "Economia e pagamenti", nome: "un errore" },
  sal_records: { area: "Economia e pagamenti", nome: "un SAL" },
  sal_voci: { area: "Economia e pagamenti", nome: "una voce di SAL" },
  invoices: { area: "Fatture", nome: "una fattura" },
  documenti_fiscali: { area: "Fatture", nome: "un documento fiscale" },
  purchase_orders: { area: "Acquisti e fornitori", nome: "un ordine di acquisto" },
  purchase_order_items: { area: "Acquisti e fornitori", nome: "una riga di ordine" },
  ddt_ricezione: { area: "Acquisti e fornitori", nome: "una bolla" },
  site_deliveries: { area: "Acquisti e fornitori", nome: "una consegna" },
  shipments_to_site: { area: "Acquisti e fornitori", nome: "una spedizione in cantiere" },
  warehouse_movements: { area: "Acquisti e fornitori", nome: "un movimento di magazzino" },
  warehouse_uscite: { area: "Acquisti e fornitori", nome: "un'uscita di magazzino" },
  prelievi_campo: { area: "Acquisti e fornitori", nome: "un prelievo" },
  contratti_subappalto: { area: "Subappalti", nome: "un contratto di subappalto" },
  sal_subappaltatori: { area: "Subappalti", nome: "un SAL del subappaltatore" },
  order_external_teams: { area: "Subappalti", nome: "una ditta" },
  order_employees: { area: "Personale e mezzi", nome: "un dipendente" },
  order_campo_assignments: { area: "Personale e mezzi", nome: "una persona in cantiere" },
  squadre_commesse: { area: "Personale e mezzi", nome: "una squadra" },
  mezzi_allocazioni: { area: "Personale e mezzi", nome: "un mezzo" },
  mezzi_assegnazioni: { area: "Personale e mezzi", nome: "un mezzo" },
  campo_rapportini: { area: "Cantiere", nome: "un rapportino" },
  campo_timbrature: { area: "Cantiere", nome: "una timbratura" },
  giornale_lavori: { area: "Cantiere", nome: "il giornale lavori" },
  note_cantiere: { area: "Cantiere", nome: "una nota di cantiere" },
  surveys: { area: "Cantiere", nome: "un sopralluogo" },
  order_attachments: { area: "Documenti e foto", nome: "un documento" },
  foto_cantiere: { area: "Documenti e foto", nome: "una foto" },
  tasks: { area: "Attività e appuntamenti", nome: "un'attività" },
  appointments: { area: "Attività e appuntamenti", nome: "un appuntamento" },
  tickets: { area: "Assistenza", nome: "una richiesta di assistenza" },
  signature_requests: { area: "Firme", nome: "una richiesta di firma" },
};

const CAMPI: Record<string, string> = {
  current_status_id: "Stato", status: "Stato", stato: "Stato", description: "Descrizione", descrizione: "Descrizione", name: "Nome", title: "Titolo",
  total_amount: "Importo totale", vat_rate: "IVA %", amount: "Importo", importo: "Importo", total: "Totale", quantity: "Quantità", quantita: "Quantità",
  unit_price: "Prezzo unitario", purchase_price: "Costo", discount_percent: "Sconto %", percentuale: "Avanzamento %", percentuale_avanzamento: "Avanzamento %",
  start_date: "Inizio", end_date: "Fine", data_inizio: "Inizio", data_fine: "Fine", due_date: "Scadenza", expected_date: "Data prevista", paid_date: "Data pagamento",
  is_paid: "Pagato", assigned_to: "Assegnato a", notes: "Note", note: "Note", internal_notes: "Note interne", supplier_id: "Fornitore", phase_id: "Fase",
  work_start_date: "Inizio lavori", work_end_date: "Fine lavori", expected_date_order: "Data prevista", indirizzo_lavori: "Indirizzo cantiere", work_address: "Indirizzo cantiere",
  customer_id: "Cliente", client_name: "Cliente", payment_type: "Pagamento", deleted_at: "Cestino", fatta: "Fatta", hours_worked: "Ore", hourly_rate: "Costo orario",
  total_cost: "Costo totale", importo_totale: "Importo totale", visible_to_customer: "Visibile al cliente", appointment_date: "Data", appointment_time: "Ora", ore_lavorate: "Ore",
  approvato: "Approvato", importo_venduto: "Venduto", data_emissione: "Data emissione", paid_amount: "Incassato", importo_pagato: "Pagato", file_name: "File",
};

/** Campi che cambiano da soli o non dicono niente a chi legge. */
const CAMPI_TECNICI = /^(version|updated_|last_|work_lat|work_lng|work_geocoded|distanza_sede|embedding|ai_|sync|external_|search_|reminder_|google_|meta_|fbc|fbp|gclid|legacy_|pdf_)/;
const CAMPI_SOLDI = /(amount|importo|total|price|prezzo|cost|deposit|balance|imponibile)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const etichettaCampo = (campo: string) => {
  if (CAMPI[campo]) return CAMPI[campo];
  const t = campo.replace(/_id$/, "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const parolaLeggibile = (t: string) => {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function valoreLeggibile(campo: string, valore: unknown, stati: Record<string, string> = {}): string {
  if (valore === null || valore === undefined || valore === "") return "vuoto";
  if (typeof valore === "boolean") return valore ? "sì" : "no";
  if (typeof valore === "number") {
    return CAMPI_SOLDI.test(campo)
      ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(valore)
      : String(valore);
  }
  const t = String(valore);
  if (UUID.test(t)) return stati[t] ?? "altro collegamento";
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return format(parseISO(t), "dd/MM/yyyy HH:mm");
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return format(parseISO(t), "dd/MM/yyyy");
  if (/^[a-z]+(_[a-z]+)*$/.test(t)) return parolaLeggibile(t);
  return t;
}

/** Le modifiche scritte per esteso: «Stato: In corso → Completata». */
export function dettagliModifica(a: Pick<AzioneRegistro, "campi" | "valori">, stati: Record<string, string> = {}): string[] {
  const campi = (a.campi ?? []).filter((c) => !CAMPI_TECNICI.test(c));
  return campi.map((c) => {
    const v = a.valori?.[c];
    if (!v) return etichettaCampo(c);
    return `${etichettaCampo(c)}: ${valoreLeggibile(c, v.da, stati)} → ${valoreLeggibile(c, v.a, stati)}`;
  });
}

const VERBI: Record<string, { tipo: TipoVoce; verbo: string }> = {
  insert: { tipo: "creato", verbo: "ha creato" },
  update: { tipo: "modificato", verbo: "ha modificato" },
  delete: { tipo: "eliminato", verbo: "ha eliminato" },
};

export function voceDaAzione(a: AzioneRegistro, stati: Record<string, string> = {}): VoceRegistro | null {
  const dettagli = a.azione === "update" ? dettagliModifica(a, stati) : [];
  // Solo campi tecnici: non è un'azione di qualcuno.
  if (a.azione === "update" && dettagli.length === 0) return null;
  const tabella = TABELLE[a.tabella] ?? { area: "Commessa", nome: `un dato (${a.tabella.replace(/_/g, " ")})` };
  const verbo = VERBI[a.azione] ?? { tipo: "modificato" as const, verbo: a.azione };
  return {
    id: `azione-${a.id}`,
    quando: a.quando,
    chi: a.chi || "Persona non indicata",
    senzaPersona: !a.chi,
    tipo: verbo.tipo,
    area: tabella.area,
    titolo: `${verbo.verbo} ${tabella.nome}`,
    oggetto: a.tabella === "orders" ? null : a.etichetta,
    dettagli,
    volte: a.volte ?? 1,
  };
}

/** Evento storico → tabella del registro che ormai registra la stessa azione. */
const EVENTI_COPERTI: Record<string, string> = {
  ordine_creato: "orders", ordine_aggiornato: "orders", stato_cambiato: "orders",
  articolo_aggiunto: "order_items", articolo_aggiornato: "order_items", articolo_stato_cambiato: "order_items", articolo_eliminato: "order_items",
  acconto_ricevuto: "order_installments", acconto_2_ricevuto: "order_installments", saldo_ricevuto: "order_installments",
  giornale_lavori_inserito: "giornale_lavori", appuntamento_creato: "appointments", ordine_fornitore_creato: "purchase_orders",
};
/** Eventi che ripetono sempre una voce di documenti, foto, rapportini o firme. */
const EVENTI_RIPETUTI = new Set(["allegato_caricato", "foto_rilievo_caricata", "reportino_cantiere", "contratto_firmato"]);
const PREFISSI_AUDIT: Record<string, string> = {
  attachment: "order_attachments", photo: "foto_cantiere", rapportino: "campo_rapportini", signature: "signature_requests", ticket: "tickets",
};
const AREA_AUDIT: Record<string, string> = {
  documento: "Documenti e foto", foto: "Documenti e foto", rapportino: "Cantiere", firma: "Firme", assistenza: "Assistenza",
};

export interface FontiRegistro {
  azioni: AzioneRegistro[];
  eventi: Array<{ id: string; event_type: string; actor_name: string | null; created_at: string; descrizione: string; etichetta: string; tabellaArea?: string }>;
  audit: Array<{ id: string; audit_type: string; title: string; description: string; actor_name: string | null; created_at: string }>;
  messaggi: Array<{ id: string; channel: string; direction: "in" | "out"; subject?: string; body: string; to_name?: string; status: string; sent_by_name?: string; failed_reason?: string; created_at: string }>;
  stati?: Record<string, string>;
  /** Chi ha creato la commessa: l'evento storico non lo dice. */
  creatoDa?: string | null;
}

const TITOLI_AUDIT: Record<string, string> = {
  "Documento caricato": "ha caricato un documento",
  "Foto cantiere caricata": "ha caricato una foto",
  "Firma richiesta": "ha richiesto una firma",
  "Assistenza aperta": "ha aperto una richiesta di assistenza",
};
const titoloAudit = (titolo: string, conPersona: boolean) =>
  TITOLI_AUDIT[titolo] && conPersona ? TITOLI_AUDIT[titolo] : conPersona ? `ha registrato: ${titolo.toLowerCase()}` : titolo;

const CANALI: Record<string, string> = { email: "un'email", sms: "un SMS", whatsapp: "un WhatsApp", nota_interna: "una nota interna" };
const SENZA_PERSONA = "Automatico o non registrato";

export function componiRegistro(f: FontiRegistro): VoceRegistro[] {
  const voci: VoceRegistro[] = [];
  const auditVisti = new Set(f.audit.map((a) => {
    const [prefisso, ...resto] = a.id.split("-");
    return `${PREFISSI_AUDIT[prefisso] ?? prefisso}:${resto.join("-")}`;
  }));
  const tempiPerTabella = new Map<string, number[]>();

  for (const a of f.azioni) {
    const t = tempiPerTabella.get(a.tabella) ?? [];
    t.push(parseISO(a.quando).getTime());
    tempiPerTabella.set(a.tabella, t);
    // Documenti, foto, rapportini… hanno già una voce più parlante.
    if (a.azione === "insert" && auditVisti.has(`${a.tabella}:${a.record_id}`)) continue;
    const v = voceDaAzione(a, f.stati);
    if (v) voci.push(v);
  }

  for (const e of f.eventi) {
    if (EVENTI_RIPETUTI.has(e.event_type)) continue;
    const coperta = EVENTI_COPERTI[e.event_type];
    const quando = parseISO(e.created_at).getTime();
    if (coperta && (tempiPerTabella.get(coperta) ?? []).some((t) => Math.abs(t - quando) < 120_000)) continue;
    const chi = e.actor_name || (e.event_type === "ordine_creato" ? f.creatoDa : null) || null;
    voci.push({
      id: `evento-${e.id}`, quando: e.created_at, chi: chi ?? SENZA_PERSONA, senzaPersona: !chi, tipo: "evento",
      area: e.tabellaArea ?? (coperta && TABELLE[coperta]?.area) ?? "Commessa", titolo: chi ? `ha registrato: ${e.etichetta.toLowerCase()}` : e.etichetta, oggetto: e.descrizione || null, dettagli: [], volte: 1,
    });
  }

  for (const a of f.audit) {
    voci.push({
      id: `audit-${a.id}`, quando: a.created_at, chi: a.actor_name ?? SENZA_PERSONA, senzaPersona: !a.actor_name, tipo: "evento",
      area: AREA_AUDIT[a.audit_type] ?? "Commessa", titolo: titoloAudit(a.title, !!a.actor_name), oggetto: a.description || null, dettagli: [], volte: 1,
    });
  }

  for (const m of f.messaggi) {
    const canale = CANALI[m.channel] ?? "un messaggio";
    const entrante = m.direction === "in";
    const nota = m.channel === "nota_interna";
    const destinatario = !nota && !entrante && m.to_name ? ` a ${m.to_name}` : "";
    const chi = entrante ? m.to_name || "Cliente" : m.sent_by_name || null;
    voci.push({
      id: `messaggio-${m.id}`, quando: m.created_at, chi: chi ?? SENZA_PERSONA, senzaPersona: !chi, tipo: "messaggio", area: "Comunicazioni",
      titolo: entrante ? `ha risposto con ${canale}` : nota ? `ha scritto ${canale}` : `ha inviato ${canale}${destinatario}`,
      oggetto: [m.subject, (m.body ?? "").slice(0, 200)].filter(Boolean).join(" — ") || null,
      dettagli: m.status === "failed" ? [`Non consegnato${m.failed_reason ? `: ${m.failed_reason}` : ""}`] : [],
      volte: 1,
    });
  }

  return voci.sort((a, b) => b.quando.localeCompare(a.quando));
}

export interface FiltriRegistro { persona?: string | null; area?: string | null; tipo?: TipoVoce | null; dal?: string | null; al?: string | null; testo?: string | null }

/** Giorno locale della voce: un'azione delle 00:30 appartiene a quel giorno, non al precedente UTC. */
export const giornoVoce = (quando: string) => format(parseISO(quando), "yyyy-MM-dd");

export function filtraRegistro(voci: VoceRegistro[], f: FiltriRegistro): VoceRegistro[] {
  const testo = f.testo?.trim().toLowerCase();
  return voci.filter((v) => {
    if (f.persona && v.chi !== f.persona) return false;
    if (f.area && v.area !== f.area) return false;
    if (f.tipo && v.tipo !== f.tipo) return false;
    const giorno = giornoVoce(v.quando);
    if (f.dal && giorno < f.dal) return false;
    if (f.al && giorno > f.al) return false;
    if (testo && ![v.chi, v.titolo, v.oggetto ?? "", v.area, ...v.dettagli].join(" ").toLowerCase().includes(testo)) return false;
    return true;
  });
}

/** Quante azioni per persona, dalla più attiva. */
export function personeRegistro(voci: VoceRegistro[]): Array<{ nome: string; azioni: number; ultima: string; senzaPersona: boolean }> {
  const per = new Map<string, { azioni: number; ultima: string; senzaPersona: boolean }>();
  for (const v of voci) {
    const p = per.get(v.chi) ?? { azioni: 0, ultima: v.quando, senzaPersona: v.senzaPersona };
    p.azioni += 1;
    if (v.quando > p.ultima) p.ultima = v.quando;
    per.set(v.chi, p);
  }
  return [...per.entries()].map(([nome, p]) => ({ nome, ...p }))
    .sort((a, b) => Number(a.senzaPersona) - Number(b.senzaPersona) || b.azioni - a.azioni);
}

/** Voci per giorno, dal più recente. */
export function perGiorno(voci: VoceRegistro[]): Array<{ giorno: string; voci: VoceRegistro[] }> {
  const gruppi = new Map<string, VoceRegistro[]>();
  for (const v of voci) {
    const g = giornoVoce(v.quando);
    gruppi.set(g, [...(gruppi.get(g) ?? []), v]);
  }
  return [...gruppi.entries()].map(([giorno, lista]) => ({ giorno, voci: lista }));
}

export function righeEsportazione(voci: VoceRegistro[]): Array<Record<string, string>> {
  return voci.map((v) => ({
    quando: format(parseISO(v.quando), "dd/MM/yyyy HH:mm"),
    chi: v.chi,
    azione: v.titolo,
    oggetto: v.oggetto ?? "",
    dettagli: v.dettagli.join("; "),
    area: v.area,
  }));
}
