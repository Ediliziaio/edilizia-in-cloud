// src/lib/orders/generali/simulatore.ts
// Il simulatore prima dell'acquisto: «se compro a X, faccio N unità per Y m², spendo Z,
// vendo a W €/m² in T mesi, con questo mutuo e questi mezzi propri: conviene?».
// Solo conti, senza React né database. I conti NON sono rifatti qui: l'ipotesi diventa le
// voci del piano economico (VocePiano) e le fonti (Fonte), poi lavorano `calcolaPianoEconomico`
// (pianoConti.ts) e `calcolaInvestitori` (investitoriConti.ts), gli stessi della generale.
// Così l'operazione creata dall'ipotesi parte con gli stessi numeri che si sono visti qui.
//
// Le regole dei tempi (mesi contati dal mese dell'acquisto):
//   acquisto e imposte   mese 0
//   tecnici              dal mese 0 per permessi + lavori
//   oneri e permessi     al mese in cui partono i lavori
//   costruzione          dalla fine dei permessi, per la durata dei lavori (imprevisti uguali)
//   vendite              dalla fine dei lavori (+/− lo scarto scritto), per la durata delle vendite
//                        (commercializzazione negli stessi mesi: si paga quando si vende)
// Gli interessi non sono una voce del piano: li conta il modulo Fonti (come nella generale,
// dove senza voce «Oneri finanziari» il costo del debito si toglie dall'utile).
import { aggiungiMesi, CATEGORIE_CANTIERE, type CategoriaPiano, type TipoVoce } from "@/lib/orders/generali/pianoCategorie";
import {
  arrotonda, calcolaPianoEconomico, indicatori, numeriPerInvestitori,
  type Indicatori, type Mese, type PianoCalcolato, type VocePiano,
} from "@/lib/orders/generali/pianoConti";
import {
  calcolaInvestitori, numeriDalPiano, PIANI_RIMBORSO,
  type ContiInvestitori, type Fonte, type PianoRimborso, type ScenarioDebito,
} from "@/lib/orders/generali/investitoriConti";

export const MODELLI_SIMULATI = ["sviluppo", "compravendita"] as const;
export type ModelloSimulato = typeof MODELLI_SIMULATI[number];
export const isModelloSimulato = (v: unknown): v is ModelloSimulato => v === "sviluppo" || v === "compravendita";

/** Un tipo di unità da vendere: «6 appartamenti da 95 m² a 3.200 €/m²», «2 box da 15 m²». */
export interface Tipologia {
  id: string;
  nome: string;
  quante: number;
  /** m² commerciali di una unità. */
  mq: number;
  prezzoMq: number;
  /** Costo di costruzione al m² di questa tipologia; null = quello generale. */
  costoMq: number | null;
}

export interface InvestitoreIpotesi {
  id: string;
  nome: string;
  tipo: "capitale" | "prestito";
  importo: number;
  /** Solo a prestito. */
  tassoPct: number | null;
  /** Solo a capitale: quota fissa dell'utile; null = pro quota. */
  quotaUtilePct: number | null;
}

export interface MutuoIpotesi {
  importo: number;
  tassoPct: number;
  /** Istruttoria, perizia, notaio del mutuo. */
  speseIniziali: number;
  rimborso: PianoRimborso;
}

/** Una correzione a mano di una voce calcolata (dal dettaglio voce per voce). */
export interface Ritocco {
  importo?: number;
  dopoMesi?: number;
  durataMesi?: number;
}

/** Una voce in più scritta a mano nel dettaglio. */
export interface VoceAggiunta {
  id: string;
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  descrizione: string;
  importo: number;
  dopoMesi: number;
  durataMesi: number;
}

export interface Ipotesi {
  versione: 1;
  modello: ModelloSimulato;
  /** Il mese dell'acquisto, «2027-01». */
  inizio: Mese;
  acquisto: number;
  /** Imposte d'acquisto e notaio, in % del prezzo. */
  impostePct: number;
  tipologie: Tipologia[];
  /** Costo di costruzione o ristrutturazione al m². */
  costoMq: number;
  /** Oneri di urbanizzazione, permessi e pratiche, in euro. */
  oneri: number;
  /** Progettazione e direzione lavori, in % del costo di costruzione. */
  tecniciPct: number;
  /** Agenzia e pubblicità, in % dei ricavi. */
  commercializzazionePct: number;
  /** In % del costo di costruzione. */
  imprevistiPct: number;
  /** Mesi dall'acquisto all'inizio dei lavori (progetto e permessi). */
  mesiPermessi: number;
  mesiLavori: number;
  /** Quando iniziano i rogiti rispetto alla fine dei lavori: −3 = tre mesi prima. */
  venditeDopoLavori: number;
  mesiVendite: number;
  mezziPropri: number;
  mutuo: MutuoIpotesi;
  investitori: InvestitoreIpotesi[];
  ritocchi: Record<string, Ritocco>;
  aggiunte: VoceAggiunta[];
}

const nuovoId = () => Math.random().toString(36).slice(2, 10);

/** L'ipotesi di partenza di ogni modello: numeri plausibili da correggere. */
export function ipotesiDiPartenza(modello: ModelloSimulato, inizio: Mese): Ipotesi {
  if (modello === "compravendita") {
    return {
      versione: 1, modello, inizio,
      acquisto: 200_000, impostePct: 10,
      tipologie: [{ id: nuovoId(), nome: "Appartamenti", quante: 2, mq: 60, prezzoMq: 3_300, costoMq: null }],
      costoMq: 800, oneri: 5_000, tecniciPct: 10, commercializzazionePct: 3, imprevistiPct: 10,
      mesiPermessi: 2, mesiLavori: 5, venditeDopoLavori: 0, mesiVendite: 4,
      mezziPropri: 120_000,
      mutuo: { importo: 200_000, tassoPct: 5, speseIniziali: 2_000, rimborso: "vendite" },
      investitori: [], ritocchi: {}, aggiunte: [],
    };
  }
  return {
    versione: 1, modello, inizio,
    acquisto: 400_000, impostePct: 11,
    tipologie: [{ id: nuovoId(), nome: "Appartamenti", quante: 6, mq: 100, prezzoMq: 3_200, costoMq: null }],
    costoMq: 1_500, oneri: 60_000, tecniciPct: 8, commercializzazionePct: 3, imprevistiPct: 5,
    mesiPermessi: 6, mesiLavori: 18, venditeDopoLavori: 0, mesiVendite: 8,
    mezziPropri: 300_000,
    mutuo: { importo: 900_000, tassoPct: 5.5, speseIniziali: 9_000, rimborso: "vendite" },
    investitori: [], ritocchi: {}, aggiunte: [],
  };
}

export const nuovaTipologia = (nome = "Box"): Tipologia => ({ id: nuovoId(), nome, quante: 1, mq: 15, prezzoMq: 1_500, costoMq: 600 });
export const nuovoInvestitore = (): InvestitoreIpotesi => ({ id: nuovoId(), nome: "Investitore", tipo: "capitale", importo: 100_000, tassoPct: null, quotaUtilePct: null });
export const nuovaVoce = (): VoceAggiunta => ({ id: nuovoId(), tipo: "costo", categoria: "altri_costi", descrizione: "", importo: 0, dopoMesi: 0, durataMesi: 1 });

// ── Lettura dal database ───────────────────────────────────────────────────

const num = (v: unknown, ripiego: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : ripiego;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown, ripiego: string) => (typeof v === "string" ? v : ripiego);
const mese = (v: unknown, ripiego: Mese) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : ripiego);

/**
 * L'ipotesi salvata (generale_ipotesi.dati), senza fidarsi della forma: ogni campo che
 * manca o è scritto male prende il valore di partenza del modello.
 */
export function leggiIpotesi(dati: unknown, modello: ModelloSimulato, oggi: Mese): Ipotesi {
  const d = (dati && typeof dati === "object" ? dati : {}) as Record<string, unknown>;
  const p = ipotesiDiPartenza(modello, mese(d.inizio, oggi));
  const m = (d.mutuo ?? {}) as Record<string, unknown>;
  const tipologie = Array.isArray(d.tipologie)
    ? (d.tipologie as Record<string, unknown>[]).filter((t) => t && typeof t === "object").map((t) => ({
      id: str(t.id, nuovoId()),
      nome: str(t.nome, "Unità"),
      quante: Math.max(0, Math.round(num(t.quante, 0))),
      mq: Math.max(0, num(t.mq, 0)),
      prezzoMq: Math.max(0, num(t.prezzoMq, 0)),
      costoMq: numONull(t.costoMq),
    }))
    : p.tipologie;
  const ritocchi: Record<string, Ritocco> = {};
  if (d.ritocchi && typeof d.ritocchi === "object") {
    for (const [k, r] of Object.entries(d.ritocchi as Record<string, Record<string, unknown>>)) {
      if (!r || typeof r !== "object") continue;
      const x: Ritocco = {};
      if (numONull(r.importo) !== null) x.importo = Math.max(0, Number(r.importo));
      if (numONull(r.dopoMesi) !== null) x.dopoMesi = Math.max(0, Math.round(Number(r.dopoMesi)));
      if (numONull(r.durataMesi) !== null) x.durataMesi = Math.max(1, Math.round(Number(r.durataMesi)));
      if (Object.keys(x).length) ritocchi[k] = x;
    }
  }
  return {
    versione: 1,
    modello,
    inizio: p.inizio,
    acquisto: Math.max(0, num(d.acquisto, p.acquisto)),
    impostePct: Math.max(0, num(d.impostePct, p.impostePct)),
    tipologie,
    costoMq: Math.max(0, num(d.costoMq, p.costoMq)),
    oneri: Math.max(0, num(d.oneri, p.oneri)),
    tecniciPct: Math.max(0, num(d.tecniciPct, p.tecniciPct)),
    commercializzazionePct: Math.max(0, num(d.commercializzazionePct, p.commercializzazionePct)),
    imprevistiPct: Math.max(0, num(d.imprevistiPct, p.imprevistiPct)),
    mesiPermessi: Math.max(0, Math.round(num(d.mesiPermessi, p.mesiPermessi))),
    mesiLavori: Math.max(0, Math.round(num(d.mesiLavori, p.mesiLavori))),
    venditeDopoLavori: Math.round(num(d.venditeDopoLavori, p.venditeDopoLavori)),
    mesiVendite: Math.max(1, Math.round(num(d.mesiVendite, p.mesiVendite))),
    mezziPropri: Math.max(0, num(d.mezziPropri, p.mezziPropri)),
    mutuo: {
      importo: Math.max(0, num(m.importo, p.mutuo.importo)),
      tassoPct: Math.max(0, num(m.tassoPct, p.mutuo.tassoPct)),
      speseIniziali: Math.max(0, num(m.speseIniziali, p.mutuo.speseIniziali)),
      rimborso: (PIANI_RIMBORSO as readonly string[]).includes(m.rimborso as string) ? (m.rimborso as PianoRimborso) : p.mutuo.rimborso,
    },
    investitori: Array.isArray(d.investitori)
      ? (d.investitori as Record<string, unknown>[]).filter((i) => i && typeof i === "object").map((i) => {
        const tipo = i.tipo === "prestito" ? "prestito" : "capitale";
        return {
          id: str(i.id, nuovoId()),
          nome: str(i.nome, "Investitore"),
          tipo,
          importo: Math.max(0, num(i.importo, 0)),
          tassoPct: tipo === "prestito" ? numONull(i.tassoPct) : null,
          quotaUtilePct: tipo === "capitale" ? numONull(i.quotaUtilePct) : null,
        } satisfies InvestitoreIpotesi;
      })
      : [],
    ritocchi,
    aggiunte: Array.isArray(d.aggiunte)
      ? (d.aggiunte as Record<string, unknown>[]).filter((a) => a && typeof a === "object").map((a) => {
        const tipo: TipoVoce = a.tipo === "ricavo" ? "ricavo" : "costo";
        return {
          id: str(a.id, nuovoId()),
          tipo,
          categoria: (typeof a.categoria === "string" ? a.categoria : tipo === "ricavo" ? "altri_ricavi" : "altri_costi") as CategoriaPiano,
          descrizione: str(a.descrizione, ""),
          importo: Math.max(0, num(a.importo, 0)),
          dopoMesi: Math.max(0, Math.round(num(a.dopoMesi, 0))),
          durataMesi: Math.max(1, Math.round(num(a.durataMesi, 1))),
        };
      })
      : [],
  };
}

// ── Dall'ipotesi alle voci ─────────────────────────────────────────────────

/** Le leve della sensibilità: applicate dopo i ritocchi, su tutta l'ipotesi. */
export interface Leve {
  /** Moltiplica i ricavi: 0,9 = prezzi più bassi del 10%. */
  prezzo?: number;
  /** Moltiplica i costi, tranne acquisto e imposte (che si conoscono già): 1,1 = +10%. */
  costi?: number;
  /** Vendite (e commercializzazione) più tardi di n mesi. */
  ritardoVendite?: number;
  /** Punti di tasso in più su tutto ciò che è a prestito. */
  tassoPunti?: number;
}

/** Una voce del piano come la calcola il simulatore, con la regola detta a chi legge. */
export interface VoceSimulata {
  chiave: string;
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  descrizione: string;
  importo: number;
  dopoMesi: number;
  durataMesi: number;
  /** Il valore che dà la regola, prima del ritocco a mano. */
  calcolato: { importo: number; dopoMesi: number; durataMesi: number };
  ritoccata: boolean;
  /** Aggiunta a mano nel dettaglio. */
  aggiunta: boolean;
  regola: string;
}

const MAX_DURATA = 120;
const durata = (n: number) => Math.min(MAX_DURATA, Math.max(1, Math.round(n)));
const dopo = (n: number) => Math.min(240, Math.max(0, Math.round(n)));
const pct = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
const eur = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;

export const mqTotali = (ip: Pick<Ipotesi, "tipologie">) => arrotonda(ip.tipologie.reduce((t, x) => t + x.quante * x.mq, 0));
export const unitaTotali = (ip: Pick<Ipotesi, "tipologie">) => ip.tipologie.reduce((t, x) => t + x.quante, 0);

/** Mese in cui iniziano i lavori e quello in cui iniziano le vendite (contati dall'acquisto). */
export function tempi(ip: Ipotesi, ritardo = 0) {
  const lavori = dopo(ip.mesiPermessi);
  const vendite = dopo(ip.mesiPermessi + ip.mesiLavori + ip.venditeDopoLavori + ritardo);
  return { lavori, vendite, fineLavori: lavori + Math.max(1, ip.mesiLavori) - 1, fineVendite: vendite + durata(ip.mesiVendite) - 1 };
}

/**
 * Le voci del piano che l'ipotesi descrive, con i ritocchi a mano e le voci aggiunte.
 * I costi in percentuale seguono le voci da cui dipendono già ritoccate: se correggi la
 * costruzione, tecnici e imprevisti si ricalcolano.
 */
export function vociIpotesi(ip: Ipotesi, leve: Leve = {}): VoceSimulata[] {
  const t = tempi(ip, leve.ritardoVendite ?? 0);
  const fPrezzo = leve.prezzo ?? 1;
  const fCosti = leve.costi ?? 1;
  const voci: VoceSimulata[] = [];
  const metti = (v: Omit<VoceSimulata, "calcolato" | "ritoccata" | "aggiunta" | "importo" | "dopoMesi" | "durataMesi"> & { importo: number; dopoMesi: number; durataMesi: number }, fattore: number, spostaRitardo = 0) => {
    const r = ip.ritocchi[v.chiave];
    const calcolato = { importo: arrotonda(Math.max(0, v.importo)), dopoMesi: dopo(v.dopoMesi), durataMesi: durata(v.durataMesi) };
    const s: VoceSimulata = {
      ...v,
      calcolato,
      importo: arrotonda(Math.max(0, r?.importo ?? calcolato.importo) * fattore),
      dopoMesi: dopo((r?.dopoMesi ?? calcolato.dopoMesi) + spostaRitardo),
      durataMesi: durata(r?.durataMesi ?? calcolato.durataMesi),
      ritoccata: !!r && (r.importo !== undefined || r.dopoMesi !== undefined || r.durataMesi !== undefined),
      aggiunta: false,
    };
    voci.push(s);
    return s;
  };
  // Il ritardo sposta solo le voci calcolate dai tempi; un mese ritoccato a mano si sposta anch'esso.
  const ritardo = leve.ritardoVendite ?? 0;
  const ritardoSuRitocco = (chiave: string) => (ip.ritocchi[chiave]?.dopoMesi !== undefined ? ritardo : 0);

  // Ricavi: una voce per tipologia.
  const ricavi = ip.tipologie.map((tp) => metti({
    chiave: `vendite:${tp.id}`,
    tipo: "ricavo",
    categoria: "vendite",
    descrizione: `Vendita ${tp.nome.trim().toLowerCase() || "unità"}`,
    importo: tp.quante * tp.mq * tp.prezzoMq,
    dopoMesi: t.vendite,
    durataMesi: ip.mesiVendite,
    regola: `${tp.quante} × ${tp.mq.toLocaleString("it-IT")} m² × ${eur(tp.prezzoMq)}/m²`,
  }, fPrezzo, ritardoSuRitocco(`vendite:${tp.id}`)));
  const totRicavi = ricavi.reduce((s, v) => s + v.importo, 0);

  metti({
    chiave: "acquisto", tipo: "costo", categoria: "terreno",
    descrizione: ip.modello === "sviluppo" ? "Acquisto del terreno" : "Acquisto dell'immobile",
    importo: ip.acquisto, dopoMesi: 0, durataMesi: 1, regola: "Il prezzo d'acquisto, al rogito.",
  }, 1);
  metti({
    chiave: "imposte", tipo: "costo", categoria: "terreno", descrizione: "Imposte d'acquisto e notaio",
    importo: (ip.acquisto * ip.impostePct) / 100, dopoMesi: 0, durataMesi: 1, regola: `${pct(ip.impostePct)} del prezzo d'acquisto.`,
  }, 1);
  const costruzione = metti({
    chiave: "costruzione", tipo: "costo", categoria: "costruzione",
    descrizione: ip.modello === "sviluppo" ? "Costruzione" : "Ristrutturazione",
    importo: ip.tipologie.reduce((s, tp) => s + tp.quante * tp.mq * (tp.costoMq ?? ip.costoMq), 0),
    dopoMesi: t.lavori, durataMesi: Math.max(1, ip.mesiLavori),
    regola: ip.tipologie.some((tp) => tp.costoMq !== null)
      ? "I m² di ogni tipologia per il suo costo al m²."
      : `${mqTotali(ip).toLocaleString("it-IT")} m² × ${eur(ip.costoMq)}/m²`,
  }, fCosti);
  // Le percentuali si calcolano sulla costruzione prima della leva, poi la leva si applica una volta.
  const baseCostruzione = costruzione.importo / fCosti;
  metti({
    chiave: "oneri", tipo: "costo", categoria: "oneri",
    descrizione: ip.modello === "sviluppo" ? "Oneri di urbanizzazione e permessi" : "Pratiche e permessi",
    importo: ip.oneri, dopoMesi: t.lavori, durataMesi: 1, regola: "Al rilascio del permesso, quando partono i lavori.",
  }, fCosti);
  metti({
    chiave: "tecnici", tipo: "costo", categoria: "progettazione", descrizione: "Progettazione e direzione lavori",
    importo: (baseCostruzione * ip.tecniciPct) / 100, dopoMesi: 0, durataMesi: Math.max(1, ip.mesiPermessi + ip.mesiLavori),
    regola: `${pct(ip.tecniciPct)} della costruzione, dal progetto alla fine dei lavori.`,
  }, fCosti);
  metti({
    chiave: "imprevisti", tipo: "costo", categoria: "imprevisti", descrizione: "Imprevisti",
    importo: (baseCostruzione * ip.imprevistiPct) / 100, dopoMesi: t.lavori, durataMesi: Math.max(1, ip.mesiLavori),
    regola: `${pct(ip.imprevistiPct)} della costruzione, durante i lavori.`,
  }, fCosti);
  metti({
    chiave: "commercializzazione", tipo: "costo", categoria: "commercializzazione", descrizione: "Agenzia e pubblicità",
    importo: (totRicavi * ip.commercializzazionePct) / 100, dopoMesi: t.vendite, durataMesi: ip.mesiVendite,
    regola: `${pct(ip.commercializzazionePct)} dei ricavi, mentre si vende.`,
  }, fCosti, ritardoSuRitocco("commercializzazione"));

  for (const a of ip.aggiunte) {
    const vendita = a.tipo === "ricavo";
    voci.push({
      chiave: `aggiunta:${a.id}`,
      tipo: a.tipo,
      categoria: a.categoria,
      descrizione: a.descrizione,
      importo: arrotonda(Math.max(0, a.importo) * (vendita ? fPrezzo : fCosti)),
      dopoMesi: dopo(a.dopoMesi + (vendita ? ritardo : 0)),
      durataMesi: durata(a.durataMesi),
      calcolato: { importo: a.importo, dopoMesi: a.dopoMesi, durataMesi: a.durataMesi },
      ritoccata: false,
      aggiunta: true,
      regola: "Scritta a mano.",
    });
  }
  return voci;
}

/** Le voci simulate come voci del piano economico (le stesse strutture della generale). */
export function vociPiano(ip: Ipotesi, leve: Leve = {}): VocePiano[] {
  return vociIpotesi(ip, leve)
    .filter((v) => v.importo > 0)
    .map((v, i): VocePiano => ({
      id: v.chiave,
      tipo: v.tipo,
      categoria: v.categoria,
      descrizione: v.descrizione,
      importo: v.importo,
      mese: aggiungiMesi(ip.inizio, v.dopoMesi),
      durataMesi: v.durataMesi,
      figliaId: null,
      categorieCosto: [],
      aFinire: null,
      nota: null,
      ordine: i + 1,
      origineId: null,
    }));
}

/** Le fonti dell'ipotesi come fonti della generale: mezzi propri, mutuo (a SAL), investitori. */
export function fontiIpotesi(ip: Ipotesi): Fonte[] {
  const inizio = `${ip.inizio}-01`;
  const base: Pick<Fonte, "soggetto" | "clienteId" | "email" | "scadenza" | "nota" | "dataInizio"> = {
    soggetto: "societa", clienteId: null, email: null, scadenza: null, nota: null, dataInizio: inizio,
  };
  const fonti: Fonte[] = [];
  if (ip.mezziPropri > 0) {
    fonti.push({ ...base, id: "propri", tipo: "propri", nome: "Mezzi propri", impegno: ip.mezziPropri, quotaUtilePct: null, tassoPct: null, ordine: 1 });
  }
  ip.investitori.filter((i) => i.importo > 0).forEach((i, k) => fonti.push({
    ...base,
    id: `investitore:${i.id}`,
    tipo: i.tipo,
    nome: i.nome.trim() || `Investitore ${k + 1}`,
    soggetto: "persona",
    impegno: i.importo,
    quotaUtilePct: i.tipo === "capitale" ? i.quotaUtilePct : null,
    tassoPct: i.tipo === "prestito" ? i.tassoPct ?? 0 : null,
    ordine: 10 + k,
  }));
  if (ip.mutuo.importo > 0) {
    fonti.push({
      ...base,
      id: "mutuo",
      tipo: "banca",
      nome: "Mutuo",
      impegno: ip.mutuo.importo,
      quotaUtilePct: null,
      tassoPct: ip.mutuo.tassoPct,
      forma: "mutuo_fondiario",
      speseIniziali: ip.mutuo.speseIniziali,
      rimborso: ip.mutuo.rimborso,
      ammortamentoDal: null,
      ordine: 50,
    });
  }
  return fonti;
}

// ── I numeri ───────────────────────────────────────────────────────────────

export interface NumeriIpotesi {
  ricavi: number;
  costi: number;
  /** Prima del costo del debito. */
  margine: number;
  marginePct: number | null;
  /** Interessi e spese di mutuo e investitori a prestito. */
  oneriFinanziari: number;
  /** Margine meno il costo del debito: quello che resta a chi sta a capitale. */
  utileNetto: number;
  utileNettoPct: number | null;
  capitaleMassimo: number;
  meseCapitaleMassimo: Mese | null;
  /** Margine sui costi, come nel piano economico. */
  roi: number | null;
  tirProgetto: number | null;
  /** Utile dei mezzi propri sul capitale che mettono. */
  roe: number | null;
  tirPropri: number | null;
  /** ROE meno rendimento del progetto sul capitale massimo, in punti (0,05 = 5 punti). */
  leva: number | null;
  mq: number;
  unita: number;
  prezzoMq: number | null;
  costoMq: number | null;
  /** Il prezzo medio al m² che paga tutti i costi, debito compreso. */
  pareggioMq: number | null;
  durataMesi: number | null;
  inizio: Mese | null;
  fine: Mese | null;
  /** Quanto manca alle fonti per coprire il picco di capitale. */
  scoperto: number;
}

export interface RisultatoIpotesi {
  voci: VoceSimulata[];
  piano: PianoCalcolato;
  indicatori: Indicatori;
  conti: ContiInvestitori;
  numeri: NumeriIpotesi;
  avvisi: string[];
}

/** Tutti i numeri di un'ipotesi: piano economico e fonti, con le leve della sensibilità. */
export function calcolaIpotesi(ip: Ipotesi, leve: Leve = {}): RisultatoIpotesi {
  const simulate = vociIpotesi(ip, leve);
  const voci = vociPiano(ip, leve);
  const piano = calcolaPianoEconomico({ oggi: ip.inizio, generaleId: "simulazione", voci, righe: [], incassi: [], figlie: [] });
  const t = piano.confronto.totali;
  const mq = mqTotali(ip);
  const cantiere = arrotonda(piano.confronto.costi.filter((r) => CATEGORIE_CANTIERE.has(r.categoria)).reduce((s, r) => s + r.previsto, 0));
  const ind = indicatori({ ricavi: t.ricavi.previsto, costi: t.costi.previsto, costiCantiere: cantiere }, piano.cassa.previsto, mq > 0 ? mq : null);

  const scenario: ScenarioDebito | null = leve.tassoPunti ? { tassoPunti: leve.tassoPunti, debitoPct: 0 } : null;
  const numeriOp = numeriDalPiano(numeriPerInvestitori(piano), piano.confronto.costi);
  const conti = calcolaInvestitori({ fonti: fontiIpotesi(ip), movimenti: [], numeri: numeriOp, oggi: `${ip.inizio}-01`, scenario });

  const oneriFinanziari = conti.costoDebito.totale;
  const utileNetto = conti.utile.stima;
  const r = conti.rendimenti;
  const numeri: NumeriIpotesi = {
    ricavi: ind.ricavi,
    costi: ind.costi,
    margine: ind.margine,
    marginePct: ind.marginePct,
    oneriFinanziari,
    utileNetto,
    utileNettoPct: ind.ricavi > 0 ? utileNetto / ind.ricavi : null,
    capitaleMassimo: ind.capitaleMassimo,
    meseCapitaleMassimo: ind.meseCapitaleMassimo,
    roi: ind.roi,
    tirProgetto: ind.tir,
    roe: r.mezziPropri?.roe ?? null,
    tirPropri: r.mezziPropri?.tir ?? null,
    leva: r.leva,
    mq,
    unita: unitaTotali(ip),
    prezzoMq: ind.prezzoMq,
    costoMq: ind.costoMq,
    pareggioMq: mq > 0 ? arrotonda((ind.costi + oneriFinanziari) / mq) : null,
    durataMesi: ind.durataMesi,
    inizio: ind.inizio,
    fine: ind.fine,
    scoperto: conti.scoperto,
  };

  const avvisi: string[] = [];
  if (mq <= 0) avvisi.push("Scrivi quante unità vendi e i loro m²: senza, mancano ricavi e indicatori al m².");
  if (numeri.ricavi > 0 && numeri.utileNetto < 0) avvisi.push(`Con questi numeri l'operazione perde ${eur(-numeri.utileNetto)}, interessi compresi.`);
  if (ip.mezziPropri <= 0) avvisi.push("Senza mezzi propri non si calcolano ROE e leva.");
  // Gli avvisi delle fonti (scoperto, tassi mancanti, scadenze) parlano già la lingua dell'operazione.
  avvisi.push(...conti.avvisi.filter((a) => !a.startsWith("A oggi")));
  return { voci: simulate, piano, indicatori: ind, conti, numeri, avvisi };
}

// ── Sensibilità ────────────────────────────────────────────────────────────

export interface CasoSensibilita {
  chiave: string;
  nome: string;
  leve: Leve;
}

export const CASI_SENSIBILITA: CasoSensibilita[] = [
  { chiave: "prezzo-10", nome: "Prezzi −10%", leve: { prezzo: 0.9 } },
  { chiave: "prezzo+10", nome: "Prezzi +10%", leve: { prezzo: 1.1 } },
  { chiave: "costi+10", nome: "Costi +10%", leve: { costi: 1.1 } },
  { chiave: "costi-10", nome: "Costi −10%", leve: { costi: 0.9 } },
  { chiave: "ritardo6", nome: "Vendite 6 mesi più tardi", leve: { ritardoVendite: 6 } },
  { chiave: "tasso+1", nome: "Tasso +1%", leve: { tassoPunti: 1 } },
];

export interface RigaSensibilita {
  caso: CasoSensibilita;
  numeri: NumeriIpotesi;
  /** Differenza dell'utile netto rispetto all'ipotesi così com'è. */
  differenzaUtile: number;
  differenzaCapitale: number;
}

export function sensibilita(ip: Ipotesi, base: NumeriIpotesi = calcolaIpotesi(ip).numeri): RigaSensibilita[] {
  return CASI_SENSIBILITA.map((caso) => {
    const n = calcolaIpotesi(ip, caso.leve).numeri;
    return { caso, numeri: n, differenzaUtile: arrotonda(n.utileNetto - base.utileNetto), differenzaCapitale: arrotonda(n.capitaleMassimo - base.capitaleMassimo) };
  });
}

// ── Confronto di ipotesi ───────────────────────────────────────────────────

export type FormatoMetrica = "euro" | "percento" | "punti" | "mesi" | "euroMq" | "numero";

export interface Metrica {
  chiave: keyof NumeriIpotesi;
  nome: string;
  formato: FormatoMetrica;
  /** Quale valore è il migliore; null = nessuno (è un fatto, non un merito). */
  meglio: "alto" | "basso" | null;
}

export const METRICHE: Metrica[] = [
  { chiave: "ricavi", nome: "Ricavi", formato: "euro", meglio: "alto" },
  { chiave: "costi", nome: "Costi", formato: "euro", meglio: "basso" },
  { chiave: "margine", nome: "Margine prima degli interessi", formato: "euro", meglio: "alto" },
  { chiave: "marginePct", nome: "Margine sui ricavi", formato: "percento", meglio: "alto" },
  { chiave: "oneriFinanziari", nome: "Interessi e spese del debito", formato: "euro", meglio: "basso" },
  { chiave: "utileNetto", nome: "Utile dopo gli interessi", formato: "euro", meglio: "alto" },
  { chiave: "capitaleMassimo", nome: "Capitale massimo impegnato", formato: "euro", meglio: "basso" },
  { chiave: "roi", nome: "ROI (margine sui costi)", formato: "percento", meglio: "alto" },
  { chiave: "tirProgetto", nome: "TIR del progetto", formato: "percento", meglio: "alto" },
  { chiave: "roe", nome: "ROE dei mezzi propri", formato: "percento", meglio: "alto" },
  { chiave: "tirPropri", nome: "TIR dei mezzi propri", formato: "percento", meglio: "alto" },
  { chiave: "leva", nome: "Effetto leva", formato: "punti", meglio: "alto" },
  { chiave: "unita", nome: "Unità", formato: "numero", meglio: null },
  { chiave: "mq", nome: "m² vendibili", formato: "numero", meglio: null },
  { chiave: "pareggioMq", nome: "Prezzo di pareggio al m²", formato: "euroMq", meglio: "basso" },
  { chiave: "durataMesi", nome: "Durata", formato: "mesi", meglio: "basso" },
];

export interface RigaConfrontoIpotesi {
  metrica: Metrica;
  valori: (number | null)[];
  /** Differenza di ogni ipotesi dalla prima (la prima è 0). */
  differenze: (number | null)[];
  /** Indice dell'ipotesi migliore su questa riga; null se pari o non si giudica. */
  migliore: number | null;
  /** I valori non sono tutti uguali. */
  diversa: boolean;
}

const valore = (n: NumeriIpotesi, k: keyof NumeriIpotesi): number | null => {
  const v = n[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** 2-3 ipotesi affiancate: ogni metrica, la differenza dalla prima e la migliore. */
export function confrontaIpotesi(numeri: NumeriIpotesi[]): RigaConfrontoIpotesi[] {
  return METRICHE.map((metrica) => {
    const valori = numeri.map((n) => valore(n, metrica.chiave));
    const primo = valori[0];
    const differenze = valori.map((v) => (v === null || primo === null ? null : metrica.formato === "euro" || metrica.formato === "euroMq" ? arrotonda(v - primo) : v - primo));
    const presenti = valori.filter((v): v is number => v !== null);
    const tolleranza = metrica.formato === "percento" || metrica.formato === "punti" ? 0.0005 : 0.5;
    const diversa = presenti.length > 1 && Math.max(...presenti) - Math.min(...presenti) > tolleranza;
    let migliore: number | null = null;
    if (diversa && metrica.meglio) {
      const obiettivo = metrica.meglio === "alto" ? Math.max(...presenti) : Math.min(...presenti);
      const vincenti = valori.map((v, i) => (v !== null && Math.abs(v - obiettivo) <= tolleranza ? i : -1)).filter((i) => i >= 0);
      migliore = vincenti.length === 1 ? vincenti[0] : null;
    }
    return { metrica, valori, differenze, migliore, diversa };
  });
}
