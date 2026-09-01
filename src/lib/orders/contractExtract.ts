/**
 * Parsing difensivo dell'output AI di "contratto/copia commissione" → dati commessa.
 * L'AI può sbagliare o omettere campi: qui normalizziamo tutto a tipi sicuri.
 */
import type { Installment } from "@/lib/orderUtils";

export interface ContractExtractClient {
  nome_completo: string;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  codice_fiscale: string | null;
  partita_iva: string | null;
}
export interface ContractExtractPhase {
  descrizione: string;
  percentuale: number | null;
  importo_eur: number | null;
}
export interface ContractExtractItem {
  descrizione: string;
  quantita: number;
  prezzo_unitario_eur: number;
}
export interface ContractExtract {
  cliente: ContractExtractClient;
  descrizione_lavori: string;
  indirizzo_cantiere: string | null;
  importo_totale_eur: number | null;
  iva_pct: number | null;
  importo_totale_ivato_eur: number | null;
  voci: ContractExtractItem[];
  modalita_pagamento: string | null;
  fasi_pagamento: ContractExtractPhase[];
  data_inizio_lavori: string | null;
  data_fine_lavori: string | null;
  summary: string;
  confidence: number;
  warnings: string[];
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // "1.234,56" (IT) o "1234.56" → 1234.56
  const s = String(v).trim().replace(/[€\s]/g, "");
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
};
const toStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" ? s : null;
};

export function parseContractExtract(raw: unknown): ContractExtract {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (r.cliente && typeof r.cliente === "object" ? r.cliente : {}) as Record<string, unknown>;
  const voci = Array.isArray(r.voci) ? r.voci : [];
  const fasi = Array.isArray(r.fasi_pagamento) ? r.fasi_pagamento : [];
  return {
    cliente: {
      nome_completo: toStr(c.nome_completo) ?? "",
      email: toStr(c.email),
      telefono: toStr(c.telefono),
      indirizzo: toStr(c.indirizzo),
      codice_fiscale: toStr(c.codice_fiscale),
      partita_iva: toStr(c.partita_iva),
    },
    descrizione_lavori: toStr(r.descrizione_lavori) ?? "",
    indirizzo_cantiere: toStr(r.indirizzo_cantiere),
    importo_totale_eur: toNum(r.importo_totale_eur),
    iva_pct: toNum(r.iva_pct),
    importo_totale_ivato_eur: toNum(r.importo_totale_ivato_eur),
    voci: voci
      .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
      .map((v) => ({
        descrizione: toStr(v.descrizione) ?? "",
        quantita: toNum(v.quantita) ?? 1,
        prezzo_unitario_eur: toNum(v.prezzo_unitario_eur) ?? 0,
      }))
      .filter((v) => v.descrizione),
    modalita_pagamento: toStr(r.modalita_pagamento),
    fasi_pagamento: fasi
      .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
      .map((f) => ({
        descrizione: toStr(f.descrizione) ?? "Rata",
        percentuale: toNum(f.percentuale),
        importo_eur: toNum(f.importo_eur),
      })),
    data_inizio_lavori: toStr(r.data_inizio_lavori),
    data_fine_lavori: toStr(r.data_fine_lavori),
    summary: toStr(r.summary) ?? "",
    confidence: toNum(r.confidence) ?? 0,
    warnings: Array.isArray(r.warnings) ? r.warnings.map((w) => String(w)) : [],
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Somma quantita×prezzo delle voci (0 se non ci sono voci prezzate). */
export function contractSommaVoci(extract: ContractExtract): number {
  return round2(extract.voci.reduce((s, v) => s + (v.quantita || 1) * (v.prezzo_unitario_eur || 0), 0));
}

/**
 * Aliquota IVA: se il documento non la dichiara ma ci sono ENTRAMBI i totali,
 * si DEDUCE dall'aritmetica (ivato/imponibile) e si aggancia alle aliquote
 * italiane reali (4/5/10/22). L'AI su questo sbagliava; la divisione no.
 */
export function deriveIvaPct(extract: ContractExtract): number | null {
  if (extract.iva_pct != null && extract.iva_pct >= 0) return extract.iva_pct;
  const imp = extract.importo_totale_eur;
  const ivato = extract.importo_totale_ivato_eur;
  if (imp != null && imp > 0 && ivato != null && ivato > imp) {
    const raw = (ivato / imp - 1) * 100;
    const aliquote = [4, 5, 10, 22];
    const best = aliquote.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    if (Math.abs(best - raw) <= 1.5) return best;
  }
  return null;
}

/**
 * Imponibile per il campo total_amount della commessa (IVA esclusa).
 *
 * Ordine di fiducia (irrobustito dopo il collaudo: l'AI aveva prodotto un
 * imponibile che non tornava con NESSUNA aritmetica):
 *   1. scorporo DETERMINISTICO ivato/(1+iva) quando abbiamo entrambi;
 *   2. somma delle voci, se prezzate e coerente;
 *   3. l'imponibile dichiarato dal modello;
 *   4. il solo totale ivato (meglio di niente).
 */
export function contractImponibile(extract: ContractExtract): number | null {
  const iva = deriveIvaPct(extract);
  const scorporo =
    extract.importo_totale_ivato_eur != null && iva != null && iva > 0
      ? round2(extract.importo_totale_ivato_eur / (1 + iva / 100))
      : null;
  if (scorporo != null) return scorporo;
  const sommaVoci = contractSommaVoci(extract);
  if (sommaVoci > 0 && extract.importo_totale_eur == null) return sommaVoci;
  if (extract.importo_totale_eur != null) return extract.importo_totale_eur;
  return extract.importo_totale_ivato_eur;
}

/**
 * Controlli di coerenza da mostrare PRIMA di applicare: su un contratto lungo
 * l'AI puo' perdere voci o sbagliare i conti, e l'errore non deve passare in
 * silenzio. Ritorna avvisi in italiano (vuoto = tutto torna).
 */
export function contractCoherenceWarnings(extract: ContractExtract): string[] {
  const out: string[] = [];
  const imp = contractImponibile(extract);
  const sommaVoci = contractSommaVoci(extract);
  if (imp != null && sommaVoci > 0) {
    const delta = Math.abs(sommaVoci - imp);
    if (delta > Math.max(1, imp * 0.02)) {
      out.push(
        `La somma delle voci (${sommaVoci.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €) non coincide con l'imponibile (${imp.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €): possibile voce mancante o prezzo errato.`,
      );
    }
  }
  const totaleRiferimento = extract.importo_totale_ivato_eur ?? imp;
  const sommaFasi = round2(extract.fasi_pagamento.reduce((s, f) => s + (f.importo_eur ?? 0), 0));
  if (totaleRiferimento != null && sommaFasi > 0) {
    const delta = Math.abs(sommaFasi - totaleRiferimento);
    if (delta > Math.max(1, totaleRiferimento * 0.02)) {
      out.push(
        `Le fasi di pagamento sommano ${sommaFasi.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € ma il totale documento è ${totaleRiferimento.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €: verifica acconti e saldo.`,
      );
    }
  }
  if (extract.voci.length === 0) {
    out.push("Nessuna voce estratta: su un ordine con articoli è quasi certamente un'estrazione incompleta.");
  }
  if (extract.iva_pct == null && deriveIvaPct(extract) == null) {
    out.push("Aliquota IVA non dichiarata e non deducibile dai totali: verifica prima di salvare.");
  }
  return out;
}

/** Fasi del contratto → rate della commessa (Installment). Tipo inferito dal testo. */
export function contractToInstallments(extract: ContractExtract, total: number): Installment[] {
  const phases = extract.fasi_pagamento;
  if (phases.length === 0) return [];
  return phases.map((p, idx) => {
    const low = p.descrizione.toLowerCase();
    const type: Installment["type"] =
      /saldo|a fine|balance/.test(low) ? "balance"
      : /finanz/.test(low) ? "financing"
      : idx === phases.length - 1 ? "balance" : "deposit";
    const amount =
      p.importo_eur != null ? round2(p.importo_eur)
      : p.percentuale != null && total > 0 ? round2((total * p.percentuale) / 100)
      : 0;
    return { position: idx, label: p.descrizione, type, amount, is_paid: false };
  });
}
