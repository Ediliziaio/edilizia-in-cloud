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
export interface ContractExtractAltroCosto {
  descrizione: string;
  importo_eur: number;
}
export interface ContractExtract {
  cliente: ContractExtractClient;
  descrizione_lavori: string;
  indirizzo_cantiere: string | null;
  importo_totale_eur: number | null;
  iva_pct: number | null;
  importo_totale_ivato_eur: number | null;
  voci: ContractExtractItem[];
  /** Sconto % applicato al totale merce (es. sconto rivenditore 15%). */
  sconto_globale_pct: number | null;
  /** Costi non-merce: imballaggio, trasporto, oneri. */
  altri_costi: ContractExtractAltroCosto[];
  /** Offerta di un produttore verso il rivenditore ≠ contratto col cliente finale. */
  natura_documento: "contratto_cliente" | "offerta_fornitore" | "copia_commissione" | null;
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
    sconto_globale_pct: toNum(r.sconto_globale_pct),
    altri_costi: (Array.isArray(r.altri_costi) ? r.altri_costi : [])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({ descrizione: toStr(a.descrizione) ?? "Altro costo", importo_eur: toNum(a.importo_eur) ?? 0 }))
      .filter((a) => a.importo_eur > 0),
    natura_documento: (() => {
      const n = toStr(r.natura_documento);
      return n === "contratto_cliente" || n === "offerta_fornitore" || n === "copia_commissione" ? n : null;
    })(),
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
  // Anche con IVA 0 lo scorporo vale (imponibile = ivato): il "Totale
  // Pagamento" e' il numero piu' affidabile del documento, mentre il campo
  // imponibile del modello a volte e' un subtotale (visto sul campo).
  const scorporo =
    extract.importo_totale_ivato_eur != null && iva != null && iva >= 0
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
/** Totale merce atteso: somma voci − sconto globale + altri costi (imballo/trasporto). */
export function contractTotaleAtteso(extract: ContractExtract): number | null {
  const sommaVoci = contractSommaVoci(extract);
  if (sommaVoci <= 0) return null;
  const sconto = extract.sconto_globale_pct != null ? sommaVoci * (extract.sconto_globale_pct / 100) : 0;
  const altri = extract.altri_costi.reduce((s, a) => s + a.importo_eur, 0);
  return round2(sommaVoci - sconto + altri);
}

/**
 * Riconciliazione deterministica dei prezzi voce (caso reale Termoplast):
 * su righe con quantita in ml/pezzi il modello tende a mettere il TOTALE
 * riga come prezzo unitario → una voce "13 ml × 294,19" vale 13 volte tanto.
 *
 * Strategia greedy a prova di conti: per ogni voce con quantita > 1, se
 * interpretare il prezzo come totale riga (unit = prezzo/quantita) AVVICINA
 * il totale atteso all'imponibile del documento, si corregge — altrimenti
 * si lascia stare (le voci giuste peggiorerebbero e non vengono toccate).
 * Ogni correzione produce un warning esplicito.
 */
export function reconcileContractExtract(extract: ContractExtract): ContractExtract {
  // Bersaglio = l'imponibile più affidabile (scorporo dall'ivato prima di
  // tutto): inseguire un subtotale parziale fa sovracorreggere il greedy.
  const imp = contractImponibile(extract) ?? extract.importo_totale_eur;
  if (imp == null || imp <= 0 || extract.voci.length === 0) return extract;

  const attesoCon = (voci: ContractExtractItem[]) => {
    const somma = round2(voci.reduce((s, v) => s + (v.quantita || 1) * (v.prezzo_unitario_eur || 0), 0));
    const sconto = extract.sconto_globale_pct != null ? somma * (extract.sconto_globale_pct / 100) : 0;
    const altri = extract.altri_costi.reduce((s, a) => s + a.importo_eur, 0);
    return round2(somma - sconto + altri);
  };

  const voci = extract.voci.map((v) => ({ ...v }));
  const corrette: string[] = [];
  let delta = Math.abs(attesoCon(voci) - imp);
  if (delta <= Math.max(1, imp * 0.02)) return extract; // già coerente

  // Voci candidate: quantita > 1, ordinate per impatto decrescente.
  const candidate = voci
    .map((v, i) => ({ i, impatto: (v.quantita - 1) * v.prezzo_unitario_eur }))
    .filter((c) => voci[c.i].quantita > 1 && voci[c.i].prezzo_unitario_eur > 0)
    .sort((a, b) => b.impatto - a.impatto);

  for (const c of candidate) {
    const v = voci[c.i];
    const unitario = round2(v.prezzo_unitario_eur / v.quantita);
    const prova = voci.map((x, idx) => (idx === c.i ? { ...x, prezzo_unitario_eur: unitario } : x));
    const nuovoDelta = Math.abs(attesoCon(prova) - imp);
    if (nuovoDelta < delta) {
      v.prezzo_unitario_eur = unitario;
      delta = nuovoDelta;
      corrette.push(v.descrizione.slice(0, 40));
    }
  }

  if (corrette.length === 0) return extract;
  return {
    ...extract,
    voci,
    warnings: [
      ...extract.warnings,
      `Riconciliati i prezzi di ${corrette.length} voci (il prezzo letto era il TOTALE riga, non l'unitario): ${corrette.join("; ")}. Controlla che i conti tornino.`,
    ],
  };
}

export function contractCoherenceWarnings(extract: ContractExtract): string[] {
  const out: string[] = [];
  const imp = contractImponibile(extract);
  const atteso = contractTotaleAtteso(extract);
  if (imp != null && atteso != null) {
    const delta = Math.abs(atteso - imp);
    if (delta > Math.max(1, imp * 0.02)) {
      const dettaglio = extract.sconto_globale_pct != null || extract.altri_costi.length > 0
        ? ` (voci − sconto${extract.sconto_globale_pct != null ? ` ${extract.sconto_globale_pct}%` : ""} + altri costi)`
        : "";
      out.push(
        `La somma delle voci${dettaglio} fa ${atteso.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € ma l'imponibile è ${imp.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €: possibile voce mancante o prezzo errato.`,
      );
    }
  }
  if (extract.natura_documento === "offerta_fornitore") {
    out.push(
      "Sembra l'offerta di un PRODUTTORE/fornitore, non un contratto col cliente finale: valuta se caricarla come Ordine d'Acquisto o RDO invece che come commessa.",
    );
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
