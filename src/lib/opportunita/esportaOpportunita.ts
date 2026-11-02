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

export type StatoOpportunita = "open" | "won" | "lost";
export const NOMI_STATO: Record<string, string> = { open: "Aperta", won: "Vinta", lost: "Persa" };

export interface ColonnaEsportazione { key: string; label: string }

/** Le colonne fisse, nell'ordine del file; poi i campi personalizzati. */
export const COLONNE_OPPORTUNITA: ColonnaEsportazione[] = [
  { key: "name", label: "Nome opportunità" },
  { key: "contact", label: "Contatto" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefono" },
  { key: "city", label: "Città" },
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
  { key: "expected_close_date", label: "Chiusura prevista" },
  { key: "closed_at", label: "Data vinta o persa" },
  { key: "stage_changed_at", label: "In questa fase dal" },
  { key: "created_at", label: "Data creazione" },
  { key: "updated_at", label: "Ultimo aggiornamento" },
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
  marketing_contacts?: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; city?: string | null } | null;
}

export interface ContestoEsportazione {
  fasi: Record<string, string>;
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
    name: o.name || "",
    contact: [c.first_name, c.last_name].filter(Boolean).join(" "),
    email: c.email || "",
    phone: c.phone || "",
    city: c.city || "",
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
    expected_close_date: data(o.expected_close_date),
    closed_at: data(o.status === "won" ? o.won_at : persa ? o.lost_at : null),
    stage_changed_at: data(o.stage_changed_at),
    created_at: data(o.created_at),
    updated_at: data(o.updated_at),
  };
  for (const cf of ctx.campi) riga[`cf_${cf.id}`] = ctx.valoriCampi[o.id]?.[cf.id] ?? "";
  return riga;
}

export interface SceltaEsportazione {
  /** Fasi da esportare (id); vuoto o null = tutte. */
  fasi?: ReadonlySet<string> | null;
  /** Stati da esportare; vuoto o null = tutti. */
  stati?: ReadonlySet<string> | null;
}

export function scegliOpportunita<T extends OpportunitaDaEsportare>(opp: T[], s: SceltaEsportazione): T[] {
  return opp.filter((o) =>
    (!s.fasi?.size || (!!o.stage_id && s.fasi.has(o.stage_id)))
    && (!s.stati?.size || s.stati.has(o.status ?? "")));
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

/**
 * Excel: il primo foglio con tutte le opportunità scelte, poi un foglio per fase (nell'ordine
 * della pipeline, solo le fasi con almeno una riga), e un foglio «Motivi di perdita» con il
 * conteggio quando ci sono perse.
 */
export async function excelOpportunita(
  righe: Array<{ faseId: string | null; riga: Record<string, string> }>,
  colonne: ColonnaEsportazione[],
  fasiInOrdine: Array<{ id: string; nome: string }>,
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const usati = new Set<string>();
  const foglio = (nome: string, elenco: Array<Record<string, string>>) => {
    const ws = wb.addWorksheet(nomeFoglio(nome, usati), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = colonne.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(12, c.label.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    for (const r of elenco) {
      ws.addRow(Object.fromEntries(colonne.map((c) => {
        const v = r[c.key] ?? "";
        // valori e probabilità come numeri: in Excel si sommano
        if ((c.key === "value" || c.key === "weighted_value" || c.key === "probability") && v !== "" && Number.isFinite(Number(v))) return [c.key, Number(v)];
        return [c.key, neutralizeXlsxCell(v)];
      })));
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonne.length } };
  };
  foglio("Tutte", righe.map((r) => r.riga));
  for (const f of fasiInOrdine) {
    const della = righe.filter((r) => r.faseId === f.id).map((r) => r.riga);
    if (della.length) foglio(f.nome, della);
  }
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
