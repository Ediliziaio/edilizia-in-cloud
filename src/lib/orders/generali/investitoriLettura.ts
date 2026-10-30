// src/lib/orders/generali/investitoriLettura.ts
// Le righe di generale_fonti, generale_fonti_movimenti, generale_rendiconti e
// unita_immobiliari lette senza fidarsi della forma: numeri come stringhe, campi vuoti.
import {
  FORME_DEBITO, PIANI_RIMBORSO, TIPI_FONTE, TIPI_MOVIMENTO,
  type FormaDebito, type Fonte, type Movimento, type PianoRimborso, type TipoFonte, type TipoMovimento,
} from "@/lib/orders/generali/investitoriConti";

type Riga = Record<string, unknown>;
const righe = (data: unknown): Riga[] => (Array.isArray(data) ? (data.filter((r) => r && typeof r === "object") as Riga[]) : []);
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const giorno = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export const COLONNE_FONTE =
  "id, tipo, nome, soggetto, cliente_id, email, impegno, quota_utile_pct, tasso_pct, data_inizio, scadenza, nota, ordine, forma, spese_iniziali, rimborso, ammortamento_dal";
export const COLONNE_MOVIMENTO = "id, fonte_id, tipo, data, importo, nota, unita_id";
export const COLONNE_RENDICONTO =
  "id, fonte_id, fonte_nome, destinatario, oggetto, stato, errore, pdf_path, created_at, inviato_at";

export function leggiFonti(data: unknown): Fonte[] {
  return righe(data)
    .filter((r) => typeof r.id === "string" && (TIPI_FONTE as readonly unknown[]).includes(r.tipo))
    .map((r) => ({
      id: r.id as string,
      tipo: r.tipo as TipoFonte,
      nome: testo(r.nome) ?? "Fonte senza nome",
      soggetto: r.soggetto === "societa" ? "societa" : "persona",
      clienteId: testo(r.cliente_id),
      email: testo(r.email),
      impegno: Math.max(0, numero(r.impegno) ?? 0),
      quotaUtilePct: numero(r.quota_utile_pct),
      tassoPct: numero(r.tasso_pct),
      dataInizio: giorno(r.data_inizio),
      scadenza: giorno(r.scadenza),
      nota: testo(r.nota),
      ordine: numero(r.ordine) ?? 0,
      forma: (FORME_DEBITO as readonly unknown[]).includes(r.forma) ? (r.forma as FormaDebito) : null,
      speseIniziali: Math.max(0, numero(r.spese_iniziali) ?? 0),
      rimborso: (PIANI_RIMBORSO as readonly unknown[]).includes(r.rimborso) ? (r.rimborso as PianoRimborso) : "scadenza",
      ammortamentoDal: giorno(r.ammortamento_dal),
    }));
}

export function leggiMovimenti(data: unknown): Movimento[] {
  return righe(data)
    .filter((r) => typeof r.id === "string" && typeof r.fonte_id === "string" && (TIPI_MOVIMENTO as readonly unknown[]).includes(r.tipo) && giorno(r.data))
    .map((r) => ({
      id: r.id as string,
      fonteId: r.fonte_id as string,
      tipo: r.tipo as TipoMovimento,
      data: giorno(r.data)!,
      importo: Math.max(0, numero(r.importo) ?? 0),
      nota: testo(r.nota),
      unitaId: testo(r.unita_id),
    }));
}

export interface RendicontoInviato {
  id: string;
  fonteId: string | null;
  fonteNome: string;
  destinatario: string;
  oggetto: string;
  stato: "in_invio" | "inviato" | "fallito";
  errore: string | null;
  pdfPath: string | null;
  creatoIl: string;
  inviatoIl: string | null;
}

export function leggiRendiconti(data: unknown): RendicontoInviato[] {
  return righe(data)
    .filter((r) => typeof r.id === "string")
    .map((r) => ({
      id: r.id as string,
      fonteId: testo(r.fonte_id),
      fonteNome: testo(r.fonte_nome) ?? "—",
      destinatario: testo(r.destinatario) ?? "—",
      oggetto: testo(r.oggetto) ?? "",
      stato: r.stato === "inviato" || r.stato === "fallito" ? r.stato : "in_invio",
      errore: testo(r.errore),
      pdfPath: testo(r.pdf_path),
      creatoIl: testo(r.created_at) ?? "",
      inviatoIl: testo(r.inviato_at),
    }));
}

export type StatoVendita = "libera" | "prenotata" | "compromesso" | "rogitata";
export interface VenditeUnita { totale: number; perStato: Record<StatoVendita, number> }

/**
 * Le unità per stato di vendita (modulo Unità e vendite). Le unità divise non contano
 * più (contano le loro parti). null = niente unità leggibili.
 */
export function contaVendite(data: unknown, figlieIds: string[]): VenditeUnita | null {
  const ids = new Set(figlieIds);
  const vive = righe(data).filter((r) => typeof r.order_id === "string" && ids.has(r.order_id) && !r.divisa_il);
  if (vive.length === 0) return null;
  const perStato: Record<StatoVendita, number> = { libera: 0, prenotata: 0, compromesso: 0, rogitata: 0 };
  for (const r of vive) {
    const s = r.stato_vendita;
    perStato[s === "prenotata" || s === "compromesso" || s === "rogitata" ? s : "libera"] += 1;
  }
  return { totale: vive.length, perStato };
}

/** Il nome di un cliente o contatto, come lo mostra il resto dell'app. */
export const nomeContatto = (c: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Contatto senza nome";
