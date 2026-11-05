/**
 * Esportazione delle opportunità (CRM → Opportunità → Esporta).
 *
 * Ener Italia (novembre 2026): «non si riesce a estrapolare solo la fase, o fase e motivo
 * della perdita»; «se estrapolo solo i persi nel file non appare il motivo della perdita»;
 * «ho bisogno di fare le estrazioni per fase». Il file di prima aveva lo stato in inglese
 * (won/lost/open) e nessuna colonna sulla perdita.
 *
 * Qui: le righe del file (stato in italiano, fase, causa e dettaglio della perdita,
 * concorrente, note, date di chiusura e del cambio fase), la scelta di fasi e stati, e
 * l'Excel con un foglio per ogni fase più il foglio con tutte.
 */
import { neutralizeXlsxCell } from "@/lib/csvExport";
import { etichettaMotivo, testoMotivoPerdita, type MotivoPerdita } from "@/lib/opportunita/motiviPerdita";

export type StatoOpportunita = "open" | "won" | "lost" | "abandoned";
export const NOMI_STATO: Record<string, string> = { open: "Aperta", won: "Vinta", lost: "Persa", abandoned: "Abbandonata" };

export interface ColonnaEsportazione { key: string; label: string }

/** Le colonne fisse, nell'ordine del file; poi i campi personalizzati. */
export const COLONNE_OPPORTUNITA: ColonnaEsportazione[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "name", label: "Nome opportunità" },
  { key: "contact", label: "Contatto" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefono" },
  { key: "address", label: "Indirizzo" },
  { key: "city", label: "Città" },
  { key: "province", label: "Provincia" },
  { key: "postal_code", label: "CAP" },
  { key: "contact_company", label: "Azienda del contatto" },
  { key: "stage", label: "Fase" },
  { key: "status", label: "Stato" },
  { key: "lost_cause", label: "Motivo della perdita" },
  { key: "lost_detail", label: "Dettaglio della perdita" },
  { key: "competitor", label: "Concorrente che ha vinto" },
  { key: "loss_notes", label: "Note sulla perdita" },
  { key: "value", label: "Valore" },
  { key: "probability", label: "Probabilità" },
  { key: "weighted_value", label: "Valore ponderato" },
  { key: "assigned_to", label: "Venditore" },
  { key: "source", label: "Fonte" },
  { key: "tags", label: "Tag" },
  { key: "next_action", label: "Prossima azione" },
  { key: "next_action_date", label: "Data prossima azione" },
  { key: "expected_close_date", label: "Chiusura prevista" },
  { key: "closed_at", label: "Data vinta o persa" },
  { key: "stage_changed_at", label: "In questa fase dal" },
  { key: "created_at", label: "Data creazione" },
  { key: "last_activity_at", label: "Ultima attività" },
  { key: "updated_at", label: "Ultimo aggiornamento" },
];

/** Le colonne delle note e degli appuntamenti: si leggono e compaiono solo se richieste. */
export const COLONNE_NOTE: ColonnaEsportazione[] = [
  { key: "note_numero", label: "Numero di note" },
  { key: "note_ultima", label: "Ultima nota" },
  { key: "note_testo", label: "Note" },
];
export const COLONNE_APPUNTAMENTI: ColonnaEsportazione[] = [
  { key: "app_numero", label: "Numero di appuntamenti" },
  { key: "app_prossimo", label: "Prossimo appuntamento" },
  { key: "app_ultimo", label: "Ultimo appuntamento" },
  { key: "app_elenco", label: "Appuntamenti" },
];

export interface OpportunitaDaEsportare {
  id: string;
  name?: string | null;
  status?: string | null;
  stage_id?: string | null;
  value?: number | string | null;
  probability?: number | null;
  assigned_to?: string | null;
  source?: string | null;
  tags?: string[] | null;
  expected_close_date?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  last_activity_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  stage_changed_at?: string | null;
  lost_reason_category?: string | null;
  lost_reason?: string | null;
  loss_reason?: string | null;
  loss_notes?: string | null;
  competitor_won?: string | null;
  marketing_contacts?: {
    first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; city?: string | null;
    address?: string | null; province?: string | null; postal_code?: string | null; company_name?: string | null;
  } | null;
}

export interface ContestoEsportazione {
  fasi: Record<string, string>;
  /** Pipeline di ogni fase (per esportarne più d'una insieme). */
  pipelineDellaFase?: Record<string, string>;
  venditori: Record<string, string>;
  motivi: MotivoPerdita[];
  campi: Array<{ id: string; name: string }>;
  valoriCampi: Record<string, Record<string, string>>;
}

const data = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("it-IT") : "");
/** Un dettaglio fatto solo di punteggiatura («.», «-») non è un dettaglio. */
const testoVero = (v: string | null | undefined) => (v && /[\p{L}\p{N}]/u.test(v) ? v.trim() : "");

export function rigaOpportunita(o: OpportunitaDaEsportare, ctx: ContestoEsportazione): Record<string, string> {
  const c = o.marketing_contacts || {};
  // Ponderato come la dashboard: la probabilità pesa solo le aperte; vinte piene, perse zero.
  const valore = Number(o.value || 0);
  const prob = Math.max(0, Math.min(100, Number(o.probability ?? 50)));
  const ponderato = o.status === "won" ? valore : o.status === "open" ? valore * (prob / 100) : 0;
  const persa = o.status === "lost";
  const riga: Record<string, string> = {
    pipeline: (o.stage_id && ctx.pipelineDellaFase?.[o.stage_id]) || "",
    name: o.name || "",
    contact: [c.first_name, c.last_name].filter(Boolean).join(" "),
    email: c.email || "",
    phone: c.phone || "",
    address: c.address || "",
    city: c.city || "",
    province: c.province || "",
    postal_code: c.postal_code || "",
    contact_company: c.company_name || "",
    stage: (o.stage_id && ctx.fasi[o.stage_id]) || "",
    status: NOMI_STATO[o.status ?? ""] ?? (o.status || ""),
    // la causa scelta dall'elenco dei motivi; se manca (perdite vecchie), il testo libero
    lost_cause: persa ? (etichettaMotivo(o.lost_reason_category, ctx.motivi) || testoMotivoPerdita(o, ctx.motivi)) : "",
    lost_detail: persa && o.lost_reason_category ? testoVero(o.lost_reason || o.loss_reason) : "",
    competitor: persa ? testoVero(o.competitor_won) : "",
    loss_notes: persa ? testoVero(o.loss_notes) : "",
    value: String(o.value || 0),
    probability: String(o.probability ?? ""),
    weighted_value: String(Math.round(ponderato * 100) / 100),
    assigned_to: (o.assigned_to && ctx.venditori[o.assigned_to]) || "",
    source: o.source || "",
    tags: (o.tags || []).join(", "),
    next_action: o.next_action || "",
    next_action_date: data(o.next_action_date),
    expected_close_date: data(o.expected_close_date),
    closed_at: data(o.status === "won" ? o.won_at : persa ? o.lost_at : null),
    stage_changed_at: data(o.stage_changed_at),
    created_at: data(o.created_at),
    last_activity_at: data(o.last_activity_at),
    updated_at: data(o.updated_at),
  };
  for (const cf of ctx.campi) riga[`cf_${cf.id}`] = ctx.valoriCampi[o.id]?.[cf.id] ?? "";
  return riga;
}

/** Su quale data si conta il periodo: chiusura (vinta o persa), creazione, ingresso nella fase. */
export type DataPeriodo = "chiusura" | "creazione" | "fase";
export const NOMI_DATA_PERIODO: Record<DataPeriodo, string> = { chiusura: "data vinta o persa", creazione: "data di creazione", fase: "data di ingresso nella fase" };

export interface SceltaEsportazione {
  /** Fasi da esportare (id); vuoto o null = tutte. */
  fasi?: ReadonlySet<string> | null;
  /** Stati da esportare; vuoto o null = tutti. */
  stati?: ReadonlySet<string> | null;
  /** Periodo (AAAA-MM-GG, estremi compresi) e la data su cui si conta. */
  periodo?: { da?: string | null; a?: string | null; data: DataPeriodo } | null;
}

function dataDi(o: OpportunitaDaEsportare, d: DataPeriodo): string | null {
  if (d === "creazione") return o.created_at ?? null;
  if (d === "fase") return o.stage_changed_at ?? o.created_at ?? null;
  return o.status === "won" ? o.won_at ?? null : o.status === "lost" ? o.lost_at ?? null : null;
}

/** Il giorno (AAAA-MM-GG) in ora italiana: una perdita alle 23:30 del 31 è del 31, non del 1°. */
export function giornoItaliano(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date(iso));
}

export function scegliOpportunita<T extends OpportunitaDaEsportare>(opp: T[], s: SceltaEsportazione): T[] {
  const p = s.periodo && (s.periodo.da || s.periodo.a) ? s.periodo : null;
  return opp.filter((o) => {
    if (s.fasi?.size && !(o.stage_id && s.fasi.has(o.stage_id))) return false;
    if (s.stati?.size && !s.stati.has(o.status ?? "")) return false;
    if (p) {
      const d = dataDi(o, p.data);
      if (!d) return false;
      const g = giornoItaliano(d);
      if (p.da && g < p.da) return false;
      if (p.a && g > p.a) return false;
    }
    return true;
  });
}

/** Le colonne scelte, nell'ordine del file (le chiavi sconosciute si ignorano); vuoto = tutte. */
export function soloColonne(colonne: ColonnaEsportazione[], scelte: ReadonlySet<string> | null | undefined): ColonnaEsportazione[] {
  if (!scelte?.size) return colonne;
  const out = colonne.filter((c) => scelte.has(c.key));
  return out.length ? out : colonne;
}

export function colonneConCampi(campi: Array<{ id: string; name: string }>): ColonnaEsportazione[] {
  return [...COLONNE_OPPORTUNITA, ...campi.map((cf) => ({ key: `cf_${cf.id}`, label: cf.name }))];
}

/** Nome di foglio valido per Excel: niente : \ / ? * [ ], massimo 31 caratteri, unico. */
export function nomeFoglio(nome: string, usati: Set<string>): string {
  const base = (nome.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim() || "Fase").slice(0, 31);
  let n = base, k = 2;
  while (usati.has(n.toLowerCase())) { const suf = ` (${k++})`; n = base.slice(0, 31 - suf.length) + suf; }
  usati.add(n.toLowerCase());
  return n;
}

const COLONNE_NUMERO = new Set(["value", "weighted_value", "probability", "note_numero", "app_numero"]);
const COLONNE_DATA = new Set(["next_action_date", "expected_close_date", "closed_at", "stage_changed_at", "created_at", "last_activity_at", "updated_at", "data"]);
const COLONNE_DI_TESTO = new Set(["note_testo", "app_elenco", "testo", "note"]);
const COLONNE_FOGLIO_NOTE: ColonnaEsportazione[] = [
  { key: "opportunita", label: "Opportunità" }, { key: "contatto", label: "Contatto" }, { key: "telefono", label: "Telefono" },
  { key: "quando", label: "Data e ora" }, { key: "autore", label: "Autore" }, { key: "testo", label: "Nota" },
];
const COLONNE_FOGLIO_APPUNTAMENTI: ColonnaEsportazione[] = [
  { key: "opportunita", label: "Opportunità" }, { key: "contatto", label: "Contatto" }, { key: "telefono", label: "Telefono" },
  { key: "data", label: "Data" }, { key: "ora", label: "Ora" }, { key: "fine", label: "Fine" }, { key: "tipo", label: "Tipo" },
  { key: "titolo", label: "Titolo" }, { key: "stato", label: "Stato" }, { key: "assegnato", label: "Assegnato a" },
  { key: "luogo", label: "Luogo" }, { key: "note", label: "Note interne" },
];

/**
 * Excel: il primo foglio con tutte le opportunità scelte, poi un foglio per fase (nell'ordine
 * della pipeline, solo le fasi con almeno una riga), i fogli «Note» e «Appuntamenti» se chiesti
 * (una riga per ognuno), e un foglio «Motivi di perdita» con il conteggio quando ci sono perse.
 */
export async function excelOpportunita(
  righe: Array<{ faseId: string | null; riga: Record<string, string> }>,
  colonne: ColonnaEsportazione[],
  fasiInOrdine: Array<{ id: string; nome: string }>,
  dettagli?: { note?: Array<Record<string, string>>; appuntamenti?: Array<Record<string, string>> },
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const usati = new Set<string>();
  const foglio = (nome: string, elenco: Array<Record<string, string>>, intestazioni: ColonnaEsportazione[] = colonne) => {
    const ws = wb.addWorksheet(nomeFoglio(nome, usati), { views: [{ state: "frozen", ySplit: 1 }] });
    // larga quanto serve, ma i testi lunghi vanno a capo invece di allargare il foglio
    ws.columns = intestazioni.map((c) => {
      const piuLungo = elenco.reduce((m, r) => Math.max(m, ...(r[c.key] ?? "").split("\n").map((t) => t.length)), c.label.length);
      return { header: c.label, key: c.key, width: COLONNE_DI_TESTO.has(c.key) ? 60 : Math.min(40, Math.max(12, piuLungo + 2)) };
    });
    const testata = ws.getRow(1);
    testata.font = { bold: true, color: { argb: "FFFFFFFF" } };
    testata.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    for (const r of elenco) {
      const riga = ws.addRow(Object.fromEntries(intestazioni.map((c) => {
        const v = r[c.key] ?? "";
        // valori e probabilità come numeri: in Excel si sommano
        if (COLONNE_NUMERO.has(c.key) && v !== "" && Number.isFinite(Number(v))) return [c.key, Number(v)];
        // le date come date: in Excel si ordinano e si filtrano
        const giorno = COLONNE_DATA.has(c.key) ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v) : null;
        if (giorno) return [c.key, new Date(Date.UTC(Number(giorno[3]), Number(giorno[2]) - 1, Number(giorno[1])))];
        return [c.key, neutralizeXlsxCell(v)];
      })));
      for (const c of intestazioni) {
        if (COLONNE_DI_TESTO.has(c.key)) riga.getCell(c.key).alignment = { wrapText: true, vertical: "top" };
        if (COLONNE_DATA.has(c.key)) riga.getCell(c.key).numFmt = "dd/mm/yyyy";
      }
    }
    if (intestazioni.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: intestazioni.length } };
  };
  foglio("Tutte", righe.map((r) => r.riga));
  for (const f of fasiInOrdine) {
    const della = righe.filter((r) => r.faseId === f.id).map((r) => r.riga);
    if (della.length) foglio(f.nome, della);
  }
  if (dettagli?.note) foglio("Note", dettagli.note, COLONNE_FOGLIO_NOTE);
  if (dettagli?.appuntamenti) foglio("Appuntamenti", dettagli.appuntamenti, COLONNE_FOGLIO_APPUNTAMENTI);
  const perse = righe.filter((r) => r.riga.status === NOMI_STATO.lost);
  if (perse.length) {
    const conta = new Map<string, number>();
    for (const r of perse) { const k = r.riga.lost_cause || "Senza motivo"; conta.set(k, (conta.get(k) ?? 0) + 1); }
    const ws = wb.addWorksheet(nomeFoglio("Motivi di perdita", usati));
    ws.columns = [{ header: "Motivo della perdita", key: "m", width: 40 }, { header: "Opportunità perse", key: "n", width: 18 }, { header: "%", key: "p", width: 8 }];
    ws.getRow(1).font = { bold: true };
    for (const [m, n] of [...conta].sort((a, b) => b[1] - a[1])) ws.addRow({ m: neutralizeXlsxCell(m), n, p: Math.round((n / perse.length) * 1000) / 10 });
  }
  return new Blob([await wb.xlsx.writeBuffer() as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
