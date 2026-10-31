/**
 * Le clausole di una fattura da commessa, divise per chi la riceve.
 *
 * Una fattura a un privato, a un'impresa, a un ente pubblico dopo una gara o a
 * un condominio non dice le stesse cose: al privato l'IVA agevolata e la
 * garanzia, all'impresa l'inversione contabile e gli interessi di mora, alla PA
 * la scissione dei pagamenti, la tracciabilità e il CIG, al condominio la
 * ritenuta del 4%. Qui c'è il catalogo e il calcolo; la scelta la fa l'utente
 * nel dialog «Crea fattura da commessa» (CreaFatturaDialog).
 *
 * Alcune clausole non sono solo testo: cambiano l'XML. La scissione dei
 * pagamenti mette EsigibilitaIVA = S, l'inversione contabile la natura N6.3 a
 * IVA zero, la ritenuta del condominio un DatiRitenuta con causale W. Il testo
 * finisce nella Causale (XML) e nel riquadro «Clausole» del PDF.
 */
import { calcolaRiga, calcolaTotaliDocumento, type TotaliDocumento } from "@/lib/fatturazione/calcoli";
import type { RigaDocumento } from "@/types/fatturazione";

export type ProfiloFattura = "privato" | "impresa" | "pa" | "condominio";

export const PROFILI_FATTURA: Array<{ id: ProfiloFattura; label: string; aiuto: string }> = [
  { id: "privato", label: "Privato", aiuto: "Famiglie e persone fisiche: IVA agevolata, detrazioni, garanzia." },
  { id: "impresa", label: "Impresa / PMI", aiuto: "Aziende e general contractor: inversione contabile, interessi di mora." },
  { id: "pa", label: "Ente pubblico / gara", aiuto: "Appalti pubblici: scissione dei pagamenti, CIG e CUP, tracciabilità." },
  { id: "condominio", label: "Condominio", aiuto: "Lavori in condominio: ritenuta d'acconto del 4%." },
];

export type EffettoClausola = "split_payment" | "reverse_charge" | "ritenuta_condominio" | "trattenuta";

export interface ClausolaFattura {
  id: string;
  titolo: string;
  /** Il testo che va in fattura. Vuoto per le clausole che sono solo un effetto
   *  fiscale e la cui dicitura la scrivono già XML e PDF (la scissione). */
  testo: string;
  profili: ProfiloFattura[];
  /** Spuntata da sola quando si sceglie uno di questi profili. */
  predefinitaPer?: ProfiloFattura[];
  effetto?: EffettoClausola;
  /** Inversione contabile: la natura IVA delle righe. */
  natura?: "N6_3" | "N6_7";
  /** Trattenuta: la percentuale proposta (si cambia nel dialog). */
  percentuale?: number;
  /** Una riga di spiegazione sotto il titolo. */
  aiuto?: string;
}

export const CLAUSOLE_FATTURA: ClausolaFattura[] = [
  // ── Privato ──
  {
    id: "iva_10_recupero",
    titolo: "IVA agevolata 10% (manutenzione)",
    testo: "Aliquota IVA del 10% ai sensi dell'art. 7, comma 1, lett. b), L. 488/1999: intervento di manutenzione ordinaria o straordinaria su immobile a prevalente destinazione abitativa privata.",
    profili: ["privato", "condominio"],
    aiuto: "Si spunta da sola se la commessa è al 10%.",
  },
  {
    id: "iva_4_prima_casa",
    titolo: "IVA 4% prima casa",
    testo: "Aliquota IVA del 4% ai sensi del n. 39, Tabella A, Parte II, DPR 633/72 (costruzione di abitazione non di lusso «prima casa»), come da dichiarazione del committente agli atti.",
    profili: ["privato"],
    aiuto: "Si spunta da sola se la commessa è al 4%.",
  },
  {
    id: "garanzia_opera",
    titolo: "Garanzia dell'opera",
    testo: "L'opera è coperta dalla garanzia per difformità e vizi ai sensi degli artt. 1667 e 1668 c.c.",
    profili: ["privato", "condominio", "impresa"],
    predefinitaPer: ["privato"],
  },
  {
    id: "riserva_proprieta",
    titolo: "Riserva di proprietà",
    testo: "I beni forniti restano di proprietà dell'impresa fino al pagamento completo del prezzo (art. 1523 c.c.).",
    profili: ["privato", "impresa"],
    aiuto: "Solo per forniture senza posa: una volta posati, i beni diventano parte dell'immobile (art. 934 c.c.) e la riserva non vale più.",
  },
  {
    id: "trattenuta_garanzia",
    titolo: "Trattenuta a garanzia",
    testo: "",
    profili: ["privato", "impresa", "condominio"],
    effetto: "trattenuta",
    percentuale: 5,
    aiuto: "Toglie la trattenuta dall'importo: negli appalti si fattura quello che si incassa (art. 6, c. 3, DPR 633/72) e la trattenuta si fattura quando viene svincolata.",
  },
  // ── Impresa ──
  {
    id: "reverse_charge_edile",
    titolo: "Inversione contabile — subappalto edile",
    testo: "Operazione soggetta a inversione contabile ai sensi dell'art. 17, comma 6, lett. a), DPR 633/72: l'IVA è assolta dal committente.",
    profili: ["impresa"],
    effetto: "reverse_charge",
    natura: "N6_3",
    aiuto: "Solo se lavori in subappalto per un'altra impresa edile. Righe a IVA zero (N6.3): il cliente paga l'imponibile.",
  },
  {
    id: "reverse_charge_completamento",
    titolo: "Inversione contabile — impianti, demolizioni, completamento",
    testo: "Operazione soggetta a inversione contabile ai sensi dell'art. 17, comma 6, lett. a-ter), DPR 633/72: l'IVA è assolta dal committente.",
    profili: ["impresa"],
    effetto: "reverse_charge",
    natura: "N6_7",
    aiuto: "Pulizia, demolizione, installazione di impianti e completamento di edifici fatti per un'impresa. Righe a IVA zero (N6.7).",
  },
  {
    id: "interessi_mora",
    titolo: "Interessi di mora",
    testo: "In caso di ritardato pagamento decorrono, senza bisogno di messa in mora, gli interessi ai sensi del D.Lgs. 231/2002.",
    profili: ["impresa", "pa"],
    predefinitaPer: ["impresa"],
  },
  // ── Ente pubblico / gara ──
  {
    id: "split_payment",
    titolo: "Scissione dei pagamenti (split payment)",
    testo: "",
    profili: ["pa"],
    predefinitaPer: ["pa"],
    effetto: "split_payment",
    aiuto: "L'IVA la versa l'ente all'Erario: incassi solo l'imponibile. La dicitura la scrive la fattura da sola.",
  },
  {
    id: "tracciabilita",
    titolo: "Tracciabilità dei flussi",
    testo: "Pagamento sul conto corrente dedicato ai sensi dell'art. 3 della L. 136/2010 (tracciabilità dei flussi finanziari).",
    profili: ["pa"],
    predefinitaPer: ["pa"],
  },
  {
    id: "ritenuta_garanzia_pa",
    titolo: "Ritenuta 0,50% a garanzia (lavori pubblici)",
    testo: "",
    profili: ["pa"],
    effetto: "trattenuta",
    percentuale: 0.5,
    aiuto: "Art. 11, c. 6, D.Lgs. 36/2023. Spuntala se l'importo è il lordo dei lavori; se è già il netto del certificato di pagamento, lasciala spenta.",
  },
  {
    id: "rif_sal_certificato",
    titolo: "Riferimento SAL e certificato",
    testo: "Stato di avanzamento lavori n. __ a tutto il __/__/____ — certificato di pagamento n. __ del __/__/____.",
    profili: ["pa", "impresa"],
    aiuto: "Completa i numeri e le date.",
  },
  // ── Condominio ──
  {
    id: "ritenuta_condominio",
    titolo: "Ritenuta del 4% (condominio)",
    testo: "Corrispettivo soggetto alla ritenuta d'acconto del 4% operata dal condominio ai sensi dell'art. 25-ter DPR 600/73.",
    profili: ["condominio"],
    predefinitaPer: ["condominio"],
    effetto: "ritenuta_condominio",
    aiuto: "Il condominio trattiene il 4% dell'imponibile e lo versa all'Erario.",
  },
];

export function clausola(id: string): ClausolaFattura | undefined {
  return CLAUSOLE_FATTURA.find((c) => c.id === id);
}

export function clausolePerProfilo(profilo: ProfiloFattura): ClausolaFattura[] {
  return CLAUSOLE_FATTURA.filter((c) => c.profili.includes(profilo));
}

/** Il profilo che si propone dall'anagrafica: il tipo cliente, e «condominio»
 *  quando il nome lo dice (in anagrafica un condominio è un B2C con codice fiscale). */
export function profiloDaCliente(tipoCliente: string | null | undefined, nome: string | null | undefined): ProfiloFattura {
  if (/\bcondominio\b|\bcond\.\s/i.test(nome ?? "")) return "condominio";
  if (tipoCliente === "PA") return "pa";
  if (tipoCliente === "B2C") return "privato";
  if (tipoCliente === "B2B" || tipoCliente === "Estero") return "impresa";
  return "privato";
}

/** Le clausole spuntate in partenza per un profilo; l'IVA agevolata segue
 *  l'aliquota della commessa. */
export function clausolePredefinite(profilo: ProfiloFattura, aliquota: number): string[] {
  const ids = clausolePerProfilo(profilo)
    .filter((c) => c.predefinitaPer?.includes(profilo))
    .map((c) => c.id);
  if (aliquota === 10 && (profilo === "privato" || profilo === "condominio")) ids.push("iva_10_recupero");
  if (aliquota === 4 && profilo === "privato") ids.push("iva_4_prima_casa");
  return ids;
}

/** Ritenuta del condominio: RT01 se chi fattura è una persona fisica, RT02 se è una società. */
export function tipoRitenutaPerForma(formaGiuridica: string | null | undefined): "RT01" | "RT02" {
  return /ditta individuale|libero professionista/i.test(formaGiuridica ?? "") ? "RT01" : "RT02";
}

export interface EffettiFiscali {
  esigibilita_iva: "I" | "S";
  ritenuta_acconto: boolean;
  ritenuta_aliquota?: number;
  ritenuta_causale?: string;
  ritenuta_tipo?: "RT01" | "RT02";
}

export interface TrattenutaCalcolata {
  id: string;
  percentuale: number;
  /** Imponibile trattenuto (positivo). */
  importo: number;
}

export interface FatturaComposta {
  righe: RigaDocumento[];
  effetti: EffettiFiscali;
  totali: TotaliDocumento;
  trattenute: TrattenutaCalcolata[];
}

const euro = (n: number) =>
  `${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }).format(n)} €`;
const pct = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Il testo di una trattenuta, con percentuale e importo veri. */
export function testoTrattenuta(t: TrattenutaCalcolata): string {
  if (t.id === "ritenuta_garanzia_pa") {
    return `Importo al netto della ritenuta dello ${pct(t.percentuale)}% a garanzia (imponibile ${euro(t.importo)}) ai sensi dell'art. 11, comma 6, D.Lgs. 36/2023: sarà fatturata allo svincolo, dopo il collaudo.`;
  }
  return `Importo al netto della trattenuta a garanzia del ${pct(t.percentuale)}% prevista dal contratto (imponibile ${euro(t.importo)}), che sarà fatturata allo svincolo.`;
}

/**
 * Applica alle righe gli effetti delle clausole spuntate e calcola i totali come
 * li calcola l'editor (calcolaTotaliDocumento): quello che si vede nel dialog è
 * quello che si ritrova aprendo la bozza.
 *
 * Una trattenuta diventa una riga in negativo per ogni aliquota, così imponibile,
 * IVA e importo da pagare sono quelli che il cliente versa davvero.
 */
export function componiFattura(
  righe: RigaDocumento[],
  clausoleAttive: string[],
  opts: { formaGiuridica?: string | null; percentuali?: Record<string, number> } = {},
): FatturaComposta {
  const attive = clausoleAttive.map((id) => clausola(id)).filter((c): c is ClausolaFattura => !!c);
  const reverse = attive.find((c) => c.effetto === "reverse_charge");
  const split = attive.some((c) => c.effetto === "split_payment") && !reverse;
  const condominio = attive.some((c) => c.effetto === "ritenuta_condominio");

  const base = righe.map((r) =>
    calcolaRiga({
      ...r,
      ...(reverse ? { aliquota_iva: "0", natura_iva: reverse.natura ?? "N6_3" } : {}),
    }),
  );

  // Imponibile per aliquota e natura: la base delle trattenute.
  const gruppi = new Map<string, { aliquota: string; natura?: RigaDocumento["natura_iva"]; imponibile: number }>();
  for (const r of base) {
    const k = `${r.aliquota_iva}|${r.natura_iva ?? ""}`;
    const g = gruppi.get(k) ?? { aliquota: r.aliquota_iva, natura: r.natura_iva, imponibile: 0 };
    g.imponibile += r.imponibile;
    gruppi.set(k, g);
  }

  const trattenute: TrattenutaCalcolata[] = [];
  const righeTrattenute: RigaDocumento[] = [];
  for (const c of attive.filter((x) => x.effetto === "trattenuta")) {
    const p = Math.min(100, Math.max(0, opts.percentuali?.[c.id] ?? c.percentuale ?? 0));
    if (p <= 0) continue;
    let totale = 0;
    for (const g of gruppi.values()) {
      if (g.imponibile <= 0) continue;
      const importo = round2((g.imponibile * p) / 100);
      if (importo <= 0) continue;
      totale += importo;
      righeTrattenute.push(calcolaRiga({
        id: `trattenuta-${c.id}-${g.aliquota}-${g.natura ?? ""}`,
        numero_linea: 0,
        descrizione: c.id === "ritenuta_garanzia_pa"
          ? `Ritenuta dello ${pct(p)}% a garanzia (art. 11, c. 6, D.Lgs. 36/2023) — sarà fatturata allo svincolo`
          : `Trattenuta a garanzia del ${pct(p)}% — sarà fatturata allo svincolo`,
        quantita: 1,
        unita_misura: "a corpo",
        prezzo_unitario: -importo,
        aliquota_iva: g.aliquota,
        ...(g.natura ? { natura_iva: g.natura } : {}),
        imponibile: 0,
        imposta: 0,
        totale_riga: 0,
      }));
    }
    trattenute.push({ id: c.id, percentuale: p, importo: round2(totale) });
  }

  const righeFinali = [...base, ...righeTrattenute].map((r, i) => ({ ...r, numero_linea: i + 1 }));

  const totali = calcolaTotaliDocumento(righeFinali, {
    splitPayment: split,
    esigibilitaDefault: split ? "S" : "I",
    ritenutaAcconto: condominio,
    ritenutaAliquota: condominio ? 4 : undefined,
  });

  return {
    righe: righeFinali,
    effetti: {
      esigibilita_iva: split ? "S" : "I",
      ritenuta_acconto: condominio,
      ...(condominio && {
        ritenuta_aliquota: 4,
        ritenuta_causale: "W",
        ritenuta_tipo: tipoRitenutaPerForma(opts.formaGiuridica),
      }),
    },
    totali,
    trattenute,
  };
}

/** Le clausole che si contraddicono. */
export function avvisiClausole(clausoleAttive: string[]): string[] {
  const avvisi: string[] = [];
  const has = (id: string) => clausoleAttive.includes(id);
  const reverse = clausoleAttive.filter((id) => clausola(id)?.effetto === "reverse_charge");
  if (reverse.length > 0 && has("split_payment")) {
    avvisi.push("Inversione contabile e scissione dei pagamenti non vanno insieme: vale l'inversione contabile.");
  }
  if (reverse.length > 1) {
    avvisi.push("Hai spuntato due inversioni contabili: tienine una (vale la prima).");
  }
  if (reverse.length > 0 && (has("iva_10_recupero") || has("iva_4_prima_casa"))) {
    avvisi.push("Con l'inversione contabile l'IVA non si applica: togli la clausola dell'IVA agevolata.");
  }
  if (has("iva_10_recupero") && has("iva_4_prima_casa")) {
    avvisi.push("Hai spuntato sia l'IVA al 10% sia quella al 4%: tienine una.");
  }
  if (has("trattenuta_garanzia") && has("ritenuta_garanzia_pa")) {
    avvisi.push("Due trattenute a garanzia sulla stessa fattura: di solito ne vale una.");
  }
  return avvisi;
}
