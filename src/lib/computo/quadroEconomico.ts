/**
 * Quadro economico di un lavoro pubblico.
 *
 * Il computo che arriva dalla stazione appaltante spesso somma, oltre ai
 * lavori, anche le «somme a disposizione dell'amministrazione»: IVA, spese
 * tecniche (progettazione, direzione dei lavori, collaudo, Inarcassa/CNPAIA),
 * visto di conformità, imprevisti, allacciamenti. Queste NON sono lavori:
 * non vanno all'impresa, non subiscono il ribasso, non entrano in contabilità.
 *
 *   A) Lavori = a misura + a corpo, di cui oneri della sicurezza (non soggetti a ribasso)
 *      importo soggetto a ribasso = lavori − sicurezza
 *      importo contrattuale = (lavori − sicurezza) × (1 − ribasso) + sicurezza
 *   B) Somme a disposizione dell'amministrazione
 *   Totale dell'intervento = A (a base d'asta) + B
 *
 * Ogni voce ha una sezione: quella scelta a mano (colonna `quadro_voce`, per
 * voce o per capitolo) oppure, se manca, quella proposta qui per parole chiave.
 */
export interface QuadroEconomico {
  importo_lavori: number;
  oneri_sicurezza: number;
  soggetto_a_ribasso: number;
  ribasso_percentuale: number;
  ribasso_euro: number;
  importo_contrattuale: number;
}

export type SezioneQuadro = "lavori" | "somme_a_disposizione";

export const ETICHETTA_SEZIONE: Record<SezioneQuadro, string> = {
  lavori: "Lavori",
  somme_a_disposizione: "Somme a disposizione",
};

export const cent = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;

export function quadroEconomico(importoLavori: number, oneriSicurezza: number, ribassoPercentuale: number | null | undefined): QuadroEconomico {
  const lavori = cent(importoLavori || 0);
  const sicurezza = cent(oneriSicurezza || 0);
  const ribasso = Math.min(100, Math.max(0, Number(ribassoPercentuale) || 0));
  const soggetto = cent(lavori - sicurezza);
  const ribassoEuro = cent(soggetto * ribasso / 100);
  return {
    importo_lavori: lavori, oneri_sicurezza: sicurezza, soggetto_a_ribasso: soggetto,
    ribasso_percentuale: ribasso, ribasso_euro: ribassoEuro,
    importo_contrattuale: cent(soggetto - ribassoEuro + sicurezza),
  };
}

/** Quanto serve di una voce per classificarla e sommarla. */
export interface VoceQuadro {
  id?: string;
  descrizione_breve?: string | null;
  descrizione_estesa?: string | null;
  super_categoria?: string | null;
  categoria?: string | null;
  sotto_categoria?: string | null;
  importo_computo: number | null;
  is_sicurezza: boolean;
  a_corpo: boolean;
  quadro_voce?: SezioneQuadro | null;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Parole che indicano una somma a disposizione dell'amministrazione, non un lavoro.
 * Attenzione agli «oneri della sicurezza»: sono lavori (e le voci di sicurezza
 * restano sempre lavori); le spese per il coordinatore della sicurezza no.
 *
 * FORTI: valgono nel nome del capitolo e nell'inizio della descrizione.
 * DEBOLI («collaudo», «allacciamento», «progettazione»…) compaiono anche dentro
 * voci di lavoro («compresi prove e collaudo»): valgono nel nome del capitolo o
 * solo se la descrizione della voce comincia così.
 */
const FORTI: Array<[RegExp, string]> = [
  [/somme a disposizione/, "somme a disposizione"],
  [/(^|[\s(])(i\.v\.a\.?|iva)\b(?!\s*(esclus|inclus|compres))/, "IVA"],
  [/imposta sul valore aggiunto/, "IVA"],
  [/inarcassa/, "Inarcassa"],
  [/cnpaia|c\.n\.p\.a\.i\.a/, "CNPAIA"],
  [/cassa (nazionale )?(di )?previdenza/, "cassa previdenziale"],
  [/contributo integrativo/, "contributo previdenziale"],
  [/parcell/, "parcella"],
  [/onorar/, "onorario"],
  [/spese tecniche|competenze tecniche|prestazioni professionali|incarichi professionali/, "spese tecniche"],
  [/visto di conformita/, "visto di conformità"],
  [/imprevist/, "imprevisti"],
  [/accantonament/, "accantonamenti"],
  [/incentiv\w* (per (le )?)?funzioni tecniche/, "incentivi per funzioni tecniche"],
  [/espropri|acquisizione (di |delle )?aree/, "espropri"],
  [/spese (di|per) (gara|pubblicita)|contributo anac/, "spese di gara"],
];
const DEBOLI: Array<[RegExp, string]> = [
  [/progettazion/, "progettazione"],
  [/direzione (dei )?lavori/, "direzione dei lavori"],
  [/collaud/, "collaudo"],
  [/coordinat\w* (per la |della |alla )?sicurezza/, "coordinamento della sicurezza"],
  [/allacciament/, "allacciamenti"],
  [/rilievi|accertamenti e indagini|indagini (geologiche|geotecniche)/, "rilievi e indagini"],
  [/assevera/, "asseverazione"],
];
const INIZIO_VOCE = 100;

/** Proposta automatica: «somme a disposizione» se una parola chiave lo dice, altrimenti «lavori». */
export function proponiSezioneQuadro(v: VoceQuadro): { sezione: SezioneQuadro; motivo: string | null } {
  if (v.is_sicurezza) return { sezione: "lavori", motivo: null };
  const capitoli = [v.super_categoria, v.categoria, v.sotto_categoria].map(norm).filter(Boolean);
  const descrizione = norm(v.descrizione_breve || v.descrizione_estesa).trim();
  const inizio = descrizione.slice(0, INIZIO_VOCE);
  for (const testo of capitoli) {
    for (const [re, motivo] of [...FORTI, ...DEBOLI]) if (re.test(testo)) return { sezione: "somme_a_disposizione", motivo };
  }
  for (const [re, motivo] of FORTI) if (re.test(inizio)) return { sezione: "somme_a_disposizione", motivo };
  for (const [re, motivo] of DEBOLI) {
    const m = re.exec(inizio);
    if (m && m.index <= 12) return { sezione: "somme_a_disposizione", motivo };
  }
  return { sezione: "lavori", motivo: null };
}

/** La sezione che vale: quella scelta a mano, altrimenti la proposta. */
export function sezioneVoce(v: VoceQuadro): SezioneQuadro {
  return v.quadro_voce ?? proponiSezioneQuadro(v).sezione;
}

export interface RigaSommeDisposizione { capitolo: string; importo: number; voci: number }

export interface QuadroEconomicoCompleto {
  /** A) lavori */
  lavori_a_misura: number;
  lavori_a_corpo: number;
  quadro: QuadroEconomico;
  /** B) somme a disposizione, per capitolo */
  somme: RigaSommeDisposizione[];
  totale_somme: number;
  /** A (a base d'asta) + B */
  totale_intervento: number;
  /** Totale delle voci così come stanno nel documento: deve tornare con A + B. */
  totale_computo: number;
}

const capitoloDi = (v: VoceQuadro) => [v.super_categoria, v.categoria, v.sotto_categoria].map(s => s?.trim()).filter(Boolean).join(" › ") || "Senza capitolo";

export function quadroEconomicoCompleto(voci: VoceQuadro[], ribassoPercentuale: number | null | undefined): QuadroEconomicoCompleto {
  let misura = 0, corpo = 0, sicurezza = 0, totale = 0;
  const somme = new Map<string, RigaSommeDisposizione>();
  for (const v of voci) {
    const imp = Number(v.importo_computo) || 0;
    totale += imp;
    if (sezioneVoce(v) === "somme_a_disposizione") {
      const cap = capitoloDi(v);
      const r = somme.get(cap) ?? { capitolo: cap, importo: 0, voci: 0 };
      r.importo += imp; r.voci += 1;
      somme.set(cap, r);
      continue;
    }
    if (v.a_corpo) corpo += imp; else misura += imp;
    if (v.is_sicurezza) sicurezza += imp;
  }
  const righe = [...somme.values()].map(r => ({ ...r, importo: cent(r.importo) }));
  const totaleSomme = cent(righe.reduce((s, r) => s + r.importo, 0));
  const quadro = quadroEconomico(cent(misura + corpo), cent(sicurezza), ribassoPercentuale);
  return {
    lavori_a_misura: cent(misura), lavori_a_corpo: cent(corpo), quadro,
    somme: righe, totale_somme: totaleSomme,
    totale_intervento: cent(quadro.importo_lavori + totaleSomme),
    totale_computo: cent(totale),
  };
}
