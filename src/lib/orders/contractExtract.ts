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
/**
 * Una lavorazione del cantiere letta dal contratto (15/11/2026): i capitoli del computo o del capitolato,
 * nell'ordine in cui si eseguono. Diventa una fase proposta della commessa, da confermare.
 */
export interface ContractExtractWorkPhase {
  nome: string;
  /** Durata della lavorazione in giorni di lavoro, solo se il documento la dice. */
  giorni: number | null;
  sottofasi: string[];
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
  dati_appalto?: {
    valorizzazione: "a_corpo" | "a_misura" | null;
    stima_eur: number | null; tetto_eur: number | null;
    riferimento: string | null; importo_base_eur: number | null;
    ribasso_pct: number | null; oneri_sicurezza_eur: number | null;
    anticipazione_pct: number | null; ritenuta_pct: number | null;
    penale_giornaliera_eur: number | null; penale_massima_pct: number | null;
    cup: string | null; split_payment: boolean | null; reverse_charge: boolean | null;
  };
  appalto_pubblico?: {
    presente: boolean;
    ruolo_azienda_importatrice: string | null;
    quota_azienda_eur: number | null;
    importo_totale_appalto_eur: number | null;
    durata_giorni: number | null;
    contratto_applicativo: string | null;
    cig: string | null;
    cig_derivato: string | null;
    sil: string | null;
    informazioni_da_confermare: string[];
  };
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
  /** Codice ISO della valuta del documento (EUR, CHF, RON…); null se non indicata. */
  valuta: string | null;
  /** Chi EMETTE il documento (per un'offerta fornitore: il produttore). */
  fornitore_emittente: string | null;
  /** Data di emissione stampata sul documento (YYYY-MM-DD). */
  data_documento: string | null;
  /** Tempi di consegna dichiarati, in giorni. */
  consegna_giorni: number | null;
  /** Per quanti giorni l'offerta resta valida (dalla data documento). */
  validita_offerta_giorni: number | null;
  modalita_pagamento: string | null;
  fasi_pagamento: ContractExtractPhase[];
  data_inizio_lavori: string | null;
  data_fine_lavori: string | null;
  /** Facoltativo: i contratti letti prima del 15/11/2026 non lo hanno. */
  fasi_lavoro?: ContractExtractWorkPhase[];
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

/** Le rate non sono lavorazioni: l'AI a volte le ripete tra le fasi. */
const NOME_DI_RATA = /^(acconto|anticipo|saldo|rata|sal\b|stato avanzamento|caparra|pagamento)/i;
const MAX_FASI_CONTRATTO = 15;
const MAX_SOTTOFASI_CONTRATTO = 10;

/** Parsing difensivo delle lavorazioni: nomi corti, niente doppioni, niente rate, tetti al numero. */
export function fasiLavoroDalTesto(raw: unknown): ContractExtractWorkPhase[] {
  if (!Array.isArray(raw)) return [];
  const viste = new Set<string>();
  const out: ContractExtractWorkPhase[] = [];
  for (const f of raw) {
    if (out.length >= MAX_FASI_CONTRATTO) break;
    const o = (f && typeof f === "object" ? f : { nome: f }) as Record<string, unknown>;
    const nome = (toStr(o.nome) ?? "").replace(/\s+/g, " ").slice(0, 80).trim();
    const chiave = nome.toLowerCase();
    if (!nome || NOME_DI_RATA.test(nome) || viste.has(chiave)) continue;
    viste.add(chiave);
    const g = toNum(o.giorni);
    const sottofasi = (Array.isArray(o.sottofasi) ? o.sottofasi : [])
      .map((x) => (toStr(x) ?? "").replace(/\s+/g, " ").slice(0, 160).trim())
      .filter((x, i, a) => x && a.indexOf(x) === i)
      .slice(0, MAX_SOTTOFASI_CONTRATTO);
    out.push({ nome, giorni: g != null && g > 0 && g <= 365 ? Math.round(g) : null, sottofasi });
  }
  return out;
}

export function parseContractExtract(raw: unknown): ContractExtract {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (r.cliente && typeof r.cliente === "object" ? r.cliente : {}) as Record<string, unknown>;
  const voci = Array.isArray(r.voci) ? r.voci : [];
  const fasi = Array.isArray(r.fasi_pagamento) ? r.fasi_pagamento : [];
  const a = (r.appalto_pubblico && typeof r.appalto_pubblico === "object" ? r.appalto_pubblico : {}) as Record<string, unknown>;
  const d = (r.dati_appalto && typeof r.dati_appalto === "object" ? r.dati_appalto : {}) as Record<string, unknown>;
  return {
    dati_appalto: {
      valorizzazione: d.valorizzazione === "a_corpo" || d.valorizzazione === "a_misura" ? d.valorizzazione : null,
      stima_eur: toNum(d.stima_eur), tetto_eur: toNum(d.tetto_eur), riferimento: toStr(d.riferimento),
      importo_base_eur: toNum(d.importo_base_eur), ribasso_pct: toNum(d.ribasso_pct), oneri_sicurezza_eur: toNum(d.oneri_sicurezza_eur),
      anticipazione_pct: toNum(d.anticipazione_pct), ritenuta_pct: toNum(d.ritenuta_pct), penale_giornaliera_eur: toNum(d.penale_giornaliera_eur), penale_massima_pct: toNum(d.penale_massima_pct),
      cup: toStr(d.cup), split_payment: typeof d.split_payment === "boolean" ? d.split_payment : null, reverse_charge: typeof d.reverse_charge === "boolean" ? d.reverse_charge : null,
    },
    appalto_pubblico: {
      presente: a.presente === true,
      ruolo_azienda_importatrice: (() => {
        const ruolo = toStr(a.ruolo_azienda_importatrice)?.toLowerCase();
        if (!ruolo) return null;
        if (/\bmandante\b/.test(ruolo) && !/\bnon\s+mandante\b/.test(ruolo)) return "mandante";
        if (/\bmandataria\b/.test(ruolo) && !/\bnon\s+mandataria\b/.test(ruolo)) return "mandataria";
        return ruolo === "esecutrice_singola" ? ruolo : null;
      })(),
      quota_azienda_eur: toNum(a.quota_azienda_eur),
      importo_totale_appalto_eur: toNum(a.importo_totale_appalto_eur),
      durata_giorni: toNum(a.durata_giorni),
      contratto_applicativo: toStr(a.contratto_applicativo),
      cig: toStr(a.cig), cig_derivato: toStr(a.cig_derivato), sil: toStr(a.sil),
      informazioni_da_confermare: Array.isArray(a.informazioni_da_confermare) ? a.informazioni_da_confermare.filter((v): v is string => typeof v === "string") : typeof a.informazioni_da_confermare === "string" && a.informazioni_da_confermare.trim() ? [a.informazioni_da_confermare.trim()] : [],
    },
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
    valuta: (() => {
      const v = toStr(r.valuta)?.toUpperCase() ?? null;
      return v && /^[A-Z]{3}$/.test(v) ? v : null;
    })(),
    fornitore_emittente: toStr(r.fornitore_emittente),
    data_documento: (() => {
      const d = toStr(r.data_documento);
      return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    })(),
    consegna_giorni: (() => {
      const n = toNum(r.consegna_giorni);
      return n != null && n > 0 && n <= 365 ? Math.round(n) : null;
    })(),
    validita_offerta_giorni: (() => {
      const n = toNum(r.validita_offerta_giorni);
      return n != null && n > 0 && n <= 365 ? Math.round(n) : null;
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
    fasi_lavoro: fasiLavoroDalTesto(r.fasi_lavoro),
    summary: toStr(r.summary) ?? "",
    confidence: toNum(r.confidence) ?? 0,
    warnings: Array.isArray(r.warnings) ? r.warnings.map((w) => String(w)) : [],
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** L'importo dell'RTI non è automaticamente il ricavo dell'azienda. */
export function contractNeedsAllocation(extract: ContractExtract): boolean {
  const a = extract.appalto_pubblico;
  return a?.ruolo_azienda_importatrice === "mandante" || (a?.presente === true && a.ruolo_azienda_importatrice !== "esecutrice_singola");
}

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
 * Il solo totale ivato senza aliquota non identifica un imponibile.
 */
export function contractImponibile(extract: ContractExtract): number | null {
  if (contractNeedsAllocation(extract)) return null;
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
  return null;
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
/**
 * La riga riassuntiva (17/11/2026): i preventivi «a corpo» hanno in testa una riga sola col totale
 * («Ristrutturazione sita in via… · 1 a corpo · 34.504,00») e sotto il computo voce per voce. L'AI le
 * legge tutte, e la somma raddoppia. Se una riga vale da sola il totale e le altre già lo fanno,
 * quella riga è il riepilogo: si toglie, dicendolo. Prova del 17/11 su 4 preventivi veri: senza, il
 * riconciliatore «correggeva» 29 prezzi giusti su 59.
 */
export function togliRigaRiassuntiva(extract: ContractExtract, imp: number | null): ContractExtract {
  if (imp == null || imp <= 0 || extract.voci.length < 3) return extract;
  const tot = (v: ContractExtractItem) => (v.quantita || 1) * (v.prezzo_unitario_eur || 0);
  const somma = extract.voci.reduce((s, v) => s + tot(v), 0);
  const i = extract.voci.findIndex((v) => Math.abs(tot(v) - imp) <= Math.max(1, imp * 0.005)
    && Math.abs(somma - tot(v) - imp) <= Math.max(1, imp * 0.02));
  if (i < 0) return extract;
  return {
    ...extract,
    voci: extract.voci.filter((_, k) => k !== i),
    warnings: [...extract.warnings, `Tolta la riga riassuntiva «${extract.voci[i].descrizione.slice(0, 60)}»: vale il totale, e le voci sotto lo fanno già.`],
  };
}

export function reconcileContractExtract(estratto: ContractExtract): ContractExtract {
  // Bersaglio = l'imponibile più affidabile (scorporo dall'ivato prima di
  // tutto): inseguire un subtotale parziale fa sovracorreggere il greedy.
  const imp = contractImponibile(estratto) ?? estratto.importo_totale_eur;
  const extract = togliRigaRiassuntiva(estratto, imp);
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

  // Le correzioni valgono solo se alla fine i conti tornano: un greedy che insegue un totale che non
  // torna per altri motivi (una riga in più, un prezzo inventato) rovina prezzi giusti (17/11/2026).
  if (corrette.length === 0 || delta > Math.max(1, imp * 0.02)) return extract;
  return {
    ...extract,
    voci,
    warnings: [
      ...extract.warnings,
      `Riconciliati i prezzi di ${corrette.length} voci (il prezzo letto era il TOTALE riga, non l'unitario): ${corrette.join("; ")}. Controlla che i conti tornino.`,
    ],
  };
}

/**
 * Importi «da esempio» (17/11/2026): l'AI ha scritto 1.234,56 € su un serramento che costava 564,03 €,
 * copiando l'esempio delle sue istruzioni («"1.234,56" → 1234.56»). Un valore così, in un documento
 * vero, è quasi sempre inventato: si dice.
 */
const IMPORTI_DA_ESEMPIO = [1234.56, 123.45, 12345.67, 123456.78, 1234.5];
export function importiDaEsempio(extract: ContractExtract): string[] {
  const sospetto = (n: number | null | undefined) => n != null && IMPORTI_DA_ESEMPIO.some((x) => Math.abs(n - x) < 0.005);
  const dove: string[] = [];
  extract.voci.forEach((v) => { if (sospetto(v.prezzo_unitario_eur) || sospetto(v.prezzo_unitario_eur * (v.quantita || 1))) dove.push(v.descrizione.slice(0, 50) || "voce"); });
  extract.fasi_pagamento.forEach((f) => { if (sospetto(f.importo_eur)) dove.push(f.descrizione.slice(0, 50) || "rata"); });
  if (sospetto(extract.importo_totale_eur)) dove.push("importo totale");
  if (sospetto(extract.importo_totale_ivato_eur)) dove.push("totale con IVA");
  return dove;
}

export function contractCoherenceWarnings(extract: ContractExtract): string[] {
  const out: string[] = [];
  const esempio = importiDaEsempio(extract);
  if (esempio.length) {
    out.push(`Importo sospetto (1.234,56 € è un numero d'esempio, non letto dal documento): ${esempio.join("; ")}. Controllalo sul documento.`);
  }
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
  if (extract.valuta && extract.valuta !== "EUR") {
    out.push(
      `Il documento è in ${extract.valuta}, non in euro: gli importi NON vanno caricati così come sono — converti prima di salvare.`,
    );
  }
  const totaleRiferimento = extract.importo_totale_ivato_eur ?? imp;
  const sommaFasi = round2(extract.fasi_pagamento.reduce((s, f) => s + (f.importo_eur ?? 0), 0));
  if (totaleRiferimento != null && sommaFasi > 0) {
    const delta = Math.abs(sommaFasi - totaleRiferimento);
    // Gli acconti calcolati sull'imponibile (IVA a parte, fattura per fattura) sono un piano giusto:
    // 4 preventivi veri su 4 il 17/11/2026. Si avvisa solo se non tornano né col totale né con l'imponibile.
    const imponibile = contractImponibile(extract);
    const tornaImponibile = imponibile != null && Math.abs(sommaFasi - imponibile) <= Math.max(1, imponibile * 0.02);
    if (delta > Math.max(1, totaleRiferimento * 0.02) && !tornaImponibile) {
      out.push(
        `Le fasi di pagamento sommano ${sommaFasi.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € ma il totale documento è ${totaleRiferimento.toLocaleString("it-IT", { minimumFractionDigits: 2 })} €: verifica acconti e saldo.`,
      );
    }
  }
  if (extract.voci.length === 0 && !extract.appalto_pubblico?.presente) {
    out.push("Nessuna voce estratta: su un ordine con articoli è quasi certamente un'estrazione incompleta.");
  }
  if (extract.iva_pct == null && deriveIvaPct(extract) == null) {
    out.push("Aliquota IVA non dichiarata e non deducibile dai totali: verifica prima di salvare.");
  }
  return out;
}

/** Fasi del contratto → rate con IVA della commessa. `total` è l'imponibile. */
export function contractToInstallments(extract: ContractExtract, total: number): Installment[] {
  if (contractNeedsAllocation(extract)) return [];
  const phases = extract.fasi_pagamento;
  if (phases.length === 0) return [];
  const iva = deriveIvaPct(extract);
  const lordo = iva != null && total > 0 ? round2(total * (1 + iva / 100)) : null;
  const rate: Installment[] = phases.filter(p => (p.importo_eur != null && p.importo_eur > 0) || (p.percentuale != null && p.percentuale > 0 && lordo != null)).map((p, idx, dichiarate) => {
    const low = p.descrizione.toLowerCase();
    const type: Installment["type"] =
      /saldo|a fine|balance/.test(low) ? "balance"
      : /finanz/.test(low) ? "financing"
      : idx === dichiarate.length - 1 && /saldo/.test(low) ? "balance" : "deposit";
    const amount =
      p.importo_eur != null ? round2(p.importo_eur)
      : p.percentuale != null && lordo != null ? round2((lordo * p.percentuale) / 100)
      : 0;
    return { position: idx, label: p.descrizione, type, amount, is_paid: false, amount_from_contract: true };
  });
  // «30% alla firma, saldo a fine lavori»: il saldo è dichiarato ma senza cifra, perché è il resto. Prima
  // spariva e chi importava doveva scriverlo a mano. Solo se è l'ULTIMA fase, senza importo né percentuale,
  // dopo almeno una rata con la cifra e nessun saldo già letto: altrimenti il piano resta da correggere.
  const ultima = phases[phases.length - 1];
  const saldoSenzaCifra = !!ultima && ultima.importo_eur == null && ultima.percentuale == null && /\bsaldo\b|a fine lavori/i.test(ultima.descrizione);
  if (saldoSenzaCifra && lordo != null && rate.length > 0 && !rate.some(r => r.type === "balance")) {
    const resto = round2(lordo - rate.reduce((somma, r) => somma + r.amount, 0));
    // Il resto lo ricalcola il modulo (amount_from_contract: false), come ogni saldo finale.
    if (resto > 0) rate.push({ position: rate.length, label: ultima.descrizione, type: "balance", amount: resto, is_paid: false, amount_from_contract: false });
  }
  return rate;
}

/** Una lettura parziale delle rate richiede correzione, non un saldo inventato. */
export function contractInstallmentWarning(rate: readonly Pick<Installment, "amount">[], totaleLordo: number): string | null {
  if (!rate.length || !Number.isFinite(totaleLordo) || totaleLordo <= 0) return null;
  if (rate.some(r => !Number.isFinite(r.amount) || r.amount < 0)) return "Controlla gli importi delle rate del contratto.";
  const totaleRate = rate.reduce((somma, r) => somma + Math.round(r.amount * 100), 0);
  if (totaleRate === Math.round(totaleLordo * 100)) return null;
  const euro = (n: number) => n.toLocaleString("it-IT", {style:"currency",currency:"EUR"});
  return `Le rate sommano ${euro(totaleRate / 100)}; il totale con IVA è ${euro(totaleLordo)}. Completa o correggi il piano dei pagamenti prima di salvare.`;
}
