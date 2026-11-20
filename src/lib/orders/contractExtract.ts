/**
 * Parsing difensivo dell'output AI di "contratto/copia commissione" → dati commessa.
 * L'AI può sbagliare o omettere campi: qui normalizziamo tutto a tipi sicuri.
 */
import { eNatura, naturaVoce, siCompra, type NaturaVoce } from "./naturaVoce";
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
  riferimento?: string;
  origine?: "documento" | "proposta_operativa";
  lavorazioni?: import("./pianoOperativoContratto").LavorazioneContratto[];
  nome: string;
  /** Durata della lavorazione in giorni di lavoro, solo se il documento la dice. */
  giorni: number | null;
  sottofasi: string[];
}
export interface ContractExtractNota {
  testo: string;
  pagina: number | null;
  riferimento: string | null;
  /** Cosa dello stampato la nota cambia; null se aggiunge e basta. */
  contraddice: string | null;
}
export interface ContractExtractPosizione {
  codice: string;
  quantita: number;
  dimensioni: string | null;
  descrizione: string | null;
  pagina: number | null;
}
export interface ContractExtractFirma {
  presente: boolean;
  firmatario: string | null;
  data: string | null;
  pagine: number[];
}
export interface ContractExtractItem {
  quantita_da_confermare?: boolean;
  codice?: string | null;
  unita?: string | null;
  /** Fornitura del cliente: resta nel documento, ma non diventa un acquisto dell'impresa. */
  a_carico_committente?: boolean;
  descrizione: string;
  quantita: number;
  prezzo_unitario_eur: number;
  /** Importo riga stampato: si conserva anche quando quantità × prezzo non quadra. */
  importo_eur?: number | null;
  /** Il capitolo sotto cui la voce è elencata nel documento (17/11/2026): diventa la fase. */
  capitolo?: string | null;
  /** Cos'è (17/11/2026): solo «fornitura» e «fornitura_e_posa» diventano articoli da ordinare. */
  natura?: NaturaVoce;
}
export interface ContractExtractAltroCosto {
  descrizione: string;
  importo_eur: number;
}
export interface ContractExtract {
  riferimento_piano?: string;
  lavorazioni_escluse?: boolean;
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
  /** Le scritte a mano sul documento firmato (17/11/2026): cambiano spesso lo stampato. */
  note_a_mano?: ContractExtractNota[];
  /** Le posizioni dell'allegato tecnico quando il prezzo è a corpo (17/11/2026). */
  posizioni_allegato?: ContractExtractPosizione[];
  /** La firma del cliente: c'è, chi, quando (17/11/2026). */
  firma?: ContractExtractFirma | null;
  /**
   * «computo» se il documento è un computo letto senza AI (PDF di PriMus, XPWE, Excel), 17/11/2026: alla creazione
   * della commessa diventa il suo computo, con fasi, lavorazioni e importi, e i materiali si generano da lì.
   */
  origine_lettura?: "computo" | null;
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
const normaNome = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Le tappe di pagamento non sono fasi di lavoro (17/11/2026): su un preventivo vero l'AI ha restituito
 * come fasi «INIZIO CANTIERE, INIZIO DEMOLIZIONI, INIZIO IMPIANTI…», cioè le tappe degli acconti. Una fase
 * che si chiama come una rata si toglie.
 */
export function senzaTappeDiPagamento(fasi: ContractExtractWorkPhase[], rate: string[]): ContractExtractWorkPhase[] {
  const tappe = new Set(rate.map(normaNome).filter(Boolean));
  if (!rate.length) return fasi;
  // Anche quando l'AI chiama le rate «SAL» e lascia i nomi delle tappe solo nelle fasi: una «fase» senza
  // lavorazioni che comincia con «inizio» o «saldo», in un documento con le rate, è una tappa di pagamento.
  const tappaDaNome = (f: ContractExtractWorkPhase) => f.sottofasi.length === 0 && /^(inizio|saldo|fine lavori|a fine|termine)\b/.test(normaNome(f.nome));
  return fasi.filter((f) => !tappe.has(normaNome(f.nome)) && !tappaDaNome(f));
}

/**
 * Le fasi dai capitoli degli articoli (17/11/2026): un preventivo o un computo è diviso in capitoli
 * (allestimenti, demolizioni, impianti…) e dentro ci sono le lavorazioni. Nell'ordine del documento.
 */
/** Le voci che si comprano: materiali, con o senza posa. Lavori, servizi e sconti restano nelle fasi. */
export function vociDaComprare<T extends Pick<ContractExtractItem, "natura" | "a_carico_committente">>(voci: readonly T[]): T[] {
  return voci.filter((v) => v.a_carico_committente !== true && siCompra(v.natura ?? "fornitura_e_posa"));
}

/** Una riga a corpo che rimanda all'allegato («come da disegno e scheda tecnica allegati»): è il prezzo, non la merce. */
const RIMANDA_ALLEGATO = /allegat|come da disegno|scheda tecnica|come da (precedente )?preventivo|vedi allegato/i;

export interface ArticoloDaPosizione {
  riferimento: string;
  nome: string;
  quantita: number;
  larghezza_mm: number | null;
  altezza_mm: number | null;
}

/**
 * Gli articoli da ordinare di un contratto (17/11/2026). Con l'allegato tecnico a posizioni (serramenti:
 * «Finestra 001 2100×2200 ×1», «Porta 003 ×2», zanzariere) gli articoli sono le POSIZIONI, con quantità e
 * misure, prezzo compreso nel totale a corpo; la riga a corpo che rimanda all'allegato resta il prezzo di
 * vendita della commessa, non un articolo. Senza allegato, le voci che si comprano.
 */
export function articoliDalContratto(ex: Pick<ContractExtract, "voci" | "posizioni_allegato">): {
  posizioni: ArticoloDaPosizione[];
  voci: ContractExtractItem[];
} {
  const pos = (ex.posizioni_allegato ?? []).filter((p) => p.codice?.trim() && p.quantita > 0);
  const voci = vociDaComprare(ex.voci).filter((v) => !/^\s*(sub)?total[ei]?\b/i.test(v.descrizione ?? ""));
  if (!pos.length) return { posizioni: [], voci };
  return {
    posizioni: pos.map((p) => {
      const m = /(\d{2,5})\s*[x×*]\s*(\d{2,5})/i.exec(p.dimensioni ?? "");
      return {
        riferimento: p.codice.trim().slice(0, 60),
        nome: [p.codice.trim(), p.descrizione?.trim(), p.dimensioni?.trim()].filter(Boolean).join(" · ").slice(0, 300),
        quantita: p.quantita,
        larghezza_mm: m ? Number(m[1]) : null,
        altezza_mm: m ? Number(m[2]) : null,
      };
    }),
    voci: voci.filter((v) => !RIMANDA_ALLEGATO.test(v.descrizione ?? "")),
  };
}

export function fasiDaCapitoli(voci: ContractExtractItem[], limite = MAX_FASI_CONTRATTO, limiteSottofasi = 30): ContractExtractWorkPhase[] {
  const perCapitolo = new Map<string, string[]>();
  for (const v of voci) {
    const c = v.capitolo?.trim();
    if (!c) continue;
    const nome = c.length > 3 && c === c.toUpperCase() ? c.charAt(0) + c.slice(1).toLowerCase() : c;
    const breve = v.descrizione.replace(/\s+/g, " ").split(/(?<=\S)\s*(?:[.;:(]|,\s|\s-\s)/)[0].slice(0, 70).trim();
    const lista = perCapitolo.get(nome) ?? [];
    if (breve && !lista.includes(breve)) lista.push(breve);
    perCapitolo.set(nome, lista);
  }
  return [...perCapitolo.entries()].slice(0, limite).map(([nome, sottofasi]): ContractExtractWorkPhase => ({ nome: nome.slice(0, 80), giorni: null, sottofasi: sottofasi.slice(0, limiteSottofasi) }));
}

export function fasiLavoroDalTesto(raw: unknown, limite = MAX_FASI_CONTRATTO, limiteSottofasi = MAX_SOTTOFASI_CONTRATTO): ContractExtractWorkPhase[] {
  if (!Array.isArray(raw)) return [];
  const viste = new Set<string>();
  const out: ContractExtractWorkPhase[] = [];
  for (const f of raw) {
    if (out.length >= limite) break;
    const o = (f && typeof f === "object" ? f : { nome: f }) as Record<string, unknown>;
    const nome = (toStr(o.nome) ?? "").replace(/\s+/g, " ").slice(0, 80).trim();
    const chiave = nome.toLowerCase();
    if (!nome || NOME_DI_RATA.test(nome) || viste.has(chiave)) continue;
    viste.add(chiave);
    const g = toNum(o.giorni);
    const sottofasi = (Array.isArray(o.sottofasi) ? o.sottofasi : [])
      .map((x) => (toStr(x) ?? "").replace(/\s+/g, " ").slice(0, 160).trim())
      .filter((x, i, a) => x && a.indexOf(x) === i)
      .slice(0, limiteSottofasi);
    const lavorazioni = Array.isArray(o.lavorazioni) ? oggetti(o.lavorazioni).slice(0, 1000).flatMap(l => {
      const riferimento = toStr(l.riferimento), descrizione = toStr(l.descrizione), q = toNum(l.quantita);
      return riferimento && descrizione ? [{ riferimento, descrizione: descrizione.slice(0, 160), quantita: q != null && q > 0 ? q : null, unita: toStr(l.unita), articolo_riferimenti: Array.isArray(l.articolo_riferimenti) ? l.articolo_riferimenti.filter((v): v is string => typeof v === "string").slice(0, 1000) : [] }] : [];
    }) : null;
    out.push({ nome, giorni: g != null && g > 0 && g <= 365 ? Math.round(g) : null, sottofasi,
      ...(toStr(o.riferimento) ? { riferimento: toStr(o.riferimento)! } : {}), ...(o.origine === "proposta_operativa" || o.origine === "documento" ? { origine: o.origine } : {}), ...(lavorazioni ? { lavorazioni } : {}) });
  }
  return out;
}

const oggetti = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
const pagina = (v: unknown): number | null => { const n = toNum(v); return n != null && n >= 1 && n <= 2000 ? Math.round(n) : null; };

function noteDalTesto(v: unknown): ContractExtractNota[] {
  return oggetti(v)
    .map((n) => ({ testo: (toStr(n.testo) ?? "").slice(0, 300), pagina: pagina(n.pagina), riferimento: toStr(n.riferimento)?.slice(0, 80) ?? null, contraddice: toStr(n.contraddice)?.slice(0, 200) ?? null }))
    .filter((n) => n.testo.length > 0)
    .slice(0, 40);
}

function posizioniDalTesto(v: unknown): ContractExtractPosizione[] {
  return oggetti(v)
    .map((p) => ({ codice: (toStr(p.codice) ?? "").slice(0, 60), quantita: toNum(p.quantita) ?? 1, dimensioni: toStr(p.dimensioni)?.slice(0, 40) ?? null, descrizione: toStr(p.descrizione)?.slice(0, 120) ?? null, pagina: pagina(p.pagina) }))
    .filter((p) => p.codice.length > 0 && p.quantita > 0)
    .slice(0, 200);
}

function firmaDalTesto(v: unknown): ContractExtractFirma | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  const data = toStr(f.data);
  return {
    presente: f.presente === true,
    firmatario: toStr(f.firmatario)?.slice(0, 120) ?? null,
    data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
    pagine: (Array.isArray(f.pagine) ? f.pagine : []).map(pagina).filter((n): n is number => n != null).slice(0, 50),
  };
}

export function parseContractExtract(raw: unknown): ContractExtract {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (r.cliente && typeof r.cliente === "object" ? r.cliente : {}) as Record<string, unknown>;
  const voci = Array.isArray(r.voci) ? r.voci : [];
  const fasi = Array.isArray(r.fasi_pagamento) ? r.fasi_pagamento : [];
  const a = (r.appalto_pubblico && typeof r.appalto_pubblico === "object" ? r.appalto_pubblico : {}) as Record<string, unknown>;
  const d = (r.dati_appalto && typeof r.dati_appalto === "object" ? r.dati_appalto : {}) as Record<string, unknown>;
  return {
    ...(r.lavorazioni_escluse === true ? { lavorazioni_escluse: true } : {}),
    ...(typeof r.riferimento_piano === "string" && /^contratto:[a-f0-9]{16}$/.test(r.riferimento_piano) ? { riferimento_piano: r.riferimento_piano } : {}),
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
        ...((toNum(v.quantita) == null || v.quantita_da_confermare === true) ? { quantita_da_confermare: true } : {}),
        ...(toStr(v.codice) ? { codice: toStr(v.codice)!.slice(0, 80) } : {}),
        ...(toStr(v.unita ?? v.unita_misura) ? { unita: toStr(v.unita ?? v.unita_misura)!.slice(0, 30) } : {}),
        ...(v.a_carico_committente === true ? { a_carico_committente: true } : {}),
        descrizione: toStr(v.descrizione) ?? "",
        quantita: toNum(v.quantita) ?? 1,
        prezzo_unitario_eur: toNum(v.prezzo_unitario_eur) ?? 0,
        ...(toNum(v.importo_eur) != null ? { importo_eur: toNum(v.importo_eur) } : {}),
        capitolo: toStr(v.capitolo)?.replace(/\s+/g, " ").slice(0, 80) ?? null,
        // Dichiarata da chi legge (il computo, l'AI col campo «tipo»), altrimenti dalle parole della voce.
        natura: eNatura(v.natura) ? v.natura : eNatura(v.tipo) ? v.tipo
          : naturaVoce(toStr(v.descrizione), { capitolo: toStr(v.capitolo), detrazione: (toNum(v.prezzo_unitario_eur) ?? 0) < 0 }),
      }))
      .filter((v) => v.descrizione),
    origine_lettura: r.origine_lettura === "computo" ? "computo" : null,
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
    fasi_lavoro: senzaTappeDiPagamento(fasiLavoroDalTesto(r.fasi_lavoro,
      r.origine_lettura === "computo" || oggetti(r.fasi_lavoro).some(f => Array.isArray(f.lavorazioni)) ? 80 : MAX_FASI_CONTRATTO,
      r.origine_lettura === "computo" || oggetti(r.fasi_lavoro).some(f => Array.isArray(f.lavorazioni)) ? 1000 : MAX_SOTTOFASI_CONTRATTO), fasi.map((f) => (f && typeof f === "object" ? toStr((f as Record<string, unknown>).descrizione) : null) ?? "")),
    note_a_mano: noteDalTesto(r.note_a_mano),
    posizioni_allegato: posizioniDalTesto(r.posizioni_allegato),
    firma: firmaDalTesto(r.firma),
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
  // Il lettore tabellare ha già conservato numeri e importi del PDF: nessuna correzione per farli quadrare.
  if (estratto.origine_lettura === "computo") return estratto;
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
  const cambiano = (extract.note_a_mano ?? []).filter((n) => n.contraddice);
  if (cambiano.length) {
    out.push(`${cambiano.length === 1 ? "Una nota scritta a mano cambia" : `${cambiano.length} note scritte a mano cambiano`} lo stampato: ${cambiano.map((n) => `«${n.testo.slice(0, 50)}» (stampato: ${n.contraddice!.slice(0, 50)})`).join("; ")}. Decidi quale vale prima di ordinare.`);
  }
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
    out.push(extract.importo_totale_eur != null || extract.importo_totale_ivato_eur != null
      ? "Nessuna lavorazione o fornitura elencata: verifica gli allegati prima di generare fasi e acquisti."
      : "Il documento non quantifica lavorazioni o forniture: collega il preventivo o il capitolato compilato.");
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
