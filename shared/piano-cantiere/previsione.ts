/**
 * Come finirà un cantiere e quanto si scostano le ore vere dalla stima (2/11/2026). La previsione
 * è una proporzione sull'avanzamento scritto nelle fasi: se i dati non bastano non dà una data.
 */
import { CALENDARIO_NAZIONALE, lavorativiTra, spostaLavorativi, type CalendarioCantiere } from "../silvio-commessa/calendario.ts";
import { chiaveLavorazione, type FaseCantiere } from "./calcolo.ts";

export interface Previsione {
  dataPrevista: string | null;
  ritardoGiorni: number | null;
  avanzamentoPct: number;
  affidabile: boolean;
  perche: string;
}

const MINIMO_AVANZAMENTO = 10;
const MINIMO_GIORNI = 3;
const MASSIMO_SILENZIO = 14;

export function prevediFine(
  fasi: readonly FaseCantiere[], ultimoRapportino: string | null, oggi: string,
  scadenza: string | null = null, cal: CalendarioCantiere = CALENDARIO_NAZIONALE,
): Previsione {
  const fine = scadenza ?? fasi.map((f) => f.al).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const inizio = fasi.map((f) => f.dal).filter((d): d is string => !!d).sort()[0] ?? null;
  const durata = (f: FaseCantiere) => (f.dal && f.al ? Math.max(1, lavorativiTra(f.dal, f.al, cal) + 1) : 1);
  const pesoTot = fasi.reduce((t, f) => t + durata(f), 0);
  const avanzamentoPct = pesoTot ? Math.round(fasi.reduce((t, f) => t + durata(f) * (f.completata ? 100 : f.percentuale), 0) / pesoTot) : 0;
  const senzaData = (perche: string): Previsione => ({
    dataPrevista: null, ritardoGiorni: fine && fine < oggi ? lavorativiTra(fine, oggi, cal) : null, avanzamentoPct, affidabile: false, perche,
  });
  if (!fasi.length || !inizio) return senzaData("Le fasi non hanno date: non posso fare una previsione.");
  if (avanzamentoPct >= 100) return { dataPrevista: oggi, ritardoGiorni: 0, avanzamentoPct, affidabile: true, perche: "Le fasi sono tutte completate." };
  if (inizio >= oggi) return senzaData("Il cantiere non è ancora partito.");
  const trascorsi = lavorativiTra(inizio, oggi, cal);
  if (avanzamentoPct < MINIMO_AVANZAMENTO) return senzaData(`L'avanzamento scritto è solo del ${avanzamentoPct}%: troppo poco per prevedere la fine.`);
  if (trascorsi < MINIMO_GIORNI) return senzaData("Il cantiere è partito da troppo poco per prevedere la fine.");
  const silenzio = ultimoRapportino ? lavorativiTra(ultimoRapportino, oggi, cal) : null;
  if (silenzio === null || silenzio > MASSIMO_SILENZIO) return senzaData("Non ci sono rapportini recenti: l'avanzamento può essere vecchio.");
  const restanti = Math.ceil(trascorsi * (100 - avanzamentoPct) / avanzamentoPct);
  const dataPrevista = spostaLavorativi(oggi, restanti, cal);
  const ritardoGiorni = fine ? (dataPrevista > fine ? lavorativiTra(fine, dataPrevista, cal) : 0) : null;
  return {
    dataPrevista, ritardoGiorni, avanzamentoPct, affidabile: true,
    perche: `In ${trascorsi} giorni lavorativi è avanzato del ${avanzamentoPct}%: allo stesso ritmo ne servono altri ${restanti}.`,
  };
}

export interface FaseChiusa { nome: string; orePreviste: number; oreVere: number }

const CAMPIONI_MINIMI = 5;

/** Quanto le ore vere si scostano dalla stima, per lavorazione: la mediana, da 5 fasi chiuse simili. */
export function correzioniDalloStorico(fasi: readonly FaseChiusa[]): Map<string, number> {
  const gruppi = new Map<string, number[]>();
  for (const f of fasi) {
    if (!(f.orePreviste > 0) || !(f.oreVere > 0)) continue;
    const k = chiaveLavorazione(f.nome);
    gruppi.set(k, [...(gruppi.get(k) ?? []), f.oreVere / f.orePreviste]);
  }
  const out = new Map<string, number>();
  for (const [k, valori] of gruppi) {
    if (valori.length < CAMPIONI_MINIMI) continue;
    const ord = [...valori].sort((a, b) => a - b);
    const m = ord.length >> 1;
    const mediana = ord.length % 2 ? ord[m] : (ord[m - 1] + ord[m]) / 2;
    // Una correzione enorme viene da dati sporchi, non da un cantiere: resta entro un limite.
    out.set(k, Math.min(3, Math.max(0.33, mediana)));
  }
  return out;
}
