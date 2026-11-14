// src/lib/orders/generali/fasiDalPiano.ts
// Le fasi del cantiere dal piano economico (lotto 6 del piano
// 2026-11-14-operazione-immobiliare-piano-completo). Un'operazione appena caricata ha nel piano
// le voci della costruzione — «Opere civili secondo computo», «Impianti elettrici», «Finestre» —
// ma il cantiere ha zero fasi: chi costruisce riscriverebbe a mano quello che il piano sa già.
//
// Qui si propongono le fasi tipiche di un cantiere, ognuna con le voci del piano che le
// appartengono (dal nome) e le date ricavate dal calendario della costruzione. Le voci che non
// sono lavori (assicurazioni, magazzini, locazione dell'ufficio, operai interni su tutto il
// cantiere) restano costi della generale, senza fase. Niente si crea senza conferma.
import type { VocePiano } from "./pianoConti";
import { CATEGORIE_CANTIERE, aggiungiMesi } from "./pianoCategorie";

export interface FaseTipica {
  chiave: string;
  nome: string;
  /** Dove cade nella durata della costruzione: da 0 (inizio) a 1 (fine). */
  da: number;
  a: number;
  /** Le parole delle voci che le appartengono, sul nome normalizzato. */
  parole: RegExp;
}

/**
 * Le fasi di una costruzione, nell'ordine in cui si fanno. Le finestre si sovrappongono come
 * in cantiere: gli impianti partono mentre si chiudono le tamponature.
 */
export const FASI_TIPICHE: readonly FaseTipica[] = [
  { chiave: "allestimento", nome: "Allestimento del cantiere e demolizioni", da: 0, a: 0.08,
    parole: /allestiment|servizi di cantiere|servizi cantiere|demoli|baracc|recinzione di cantiere/ },
  { chiave: "scavi", nome: "Scavi e fondazioni", da: 0.05, a: 0.2,
    parole: /scav|sbanc|fondaz|palificaz|\bpali\b|vespai|platea/ },
  { chiave: "strutture", nome: "Strutture e opere civili", da: 0.15, a: 0.45,
    parole: /struttur|cemento armato|\bc\.?a\.?\b|solai|opere civili|opere da computo|opere edili|muratur|tamponatur|\bcomputo\b/ },
  { chiave: "coperture", nome: "Coperture e involucro", da: 0.35, a: 0.55,
    parole: /tetto|copertur|impermeabil|lattoner|cappott|isolament|facciat/ },
  { chiave: "impianti", nome: "Impianti", da: 0.4, a: 0.8,
    parole: /impiant|idraulic|elettric|termic|climatizz|fotovolt|ascensor|illuminaz/ },
  { chiave: "serramenti", nome: "Serramenti e opere da fabbro", da: 0.55, a: 0.8,
    parole: /finestr|serrament|cassonett|tapparell|\bporte\b|portone|bascul|fabbr|ringhier|infiss/ },
  { chiave: "finiture", nome: "Finiture", da: 0.65, a: 0.95,
    parole: /pavimen|rivestim|soglie|davanzal|sanitar|lavandin|doccia|\bscale\b|marmo|intonac|tinteggi|finitur|massett|cartongess/ },
  { chiave: "esterni", nome: "Sistemazioni esterne", da: 0.8, a: 1,
    parole: /estern|aree verdi|piantum|irrigaz|vialett|marciap|recinzion|acque meteoriche|reflue|fognat|piscin|cassette postali|parchegg|vasche|giardin|betonell|precedenti alla posa/ },
];

export interface FaseProposta {
  chiave: string;
  nome: string;
  /** «2027-03»; null se il piano non ha i mesi della costruzione. */
  inizio: string | null;
  fine: string | null;
  voci: VocePiano[];
}

export interface PropostaFasi {
  /** La costruzione nel calendario del piano, primo e ultimo mese. */
  finestra: { inizio: string; fine: string } | null;
  fasi: FaseProposta[];
  /** Le voci di cantiere che non sono un lavoro di una fase: restano costi della generale. */
  restano: VocePiano[];
}

const norma = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** La fase tipica di una voce, dal nome; null se la voce non è un lavoro di una fase. */
export function faseDellaVoce(descrizione: string): string | null {
  const d = norma(descrizione);
  return FASI_TIPICHE.find((f) => f.parole.test(d))?.chiave ?? null;
}

/** Le voci del piano che riguardano il cantiere (costruzione, materiali, manodopera…). */
export const vociDiCantiere = (voci: readonly VocePiano[]) =>
  voci.filter((v) => v.tipo === "costo" && CATEGORIE_CANTIERE.has(v.categoria) && v.descrizione.trim() !== "");

export function proponiFasi(voci: readonly VocePiano[]): PropostaFasi {
  const cantiere = vociDiCantiere(voci).sort((a, b) => a.ordine - b.ordine);
  const conMese = cantiere.filter((v) => v.mese);
  const finestra = conMese.length
    ? {
        inizio: conMese.map((v) => v.mese!).sort()[0],
        fine: conMese.map((v) => aggiungiMesi(v.mese!, Math.max(1, v.durataMesi) - 1)).sort().reverse()[0],
      }
    : null;
  const mesi = finestra ? distanza(finestra.inizio, finestra.fine) + 1 : 0;
  const per = new Map<string, VocePiano[]>(FASI_TIPICHE.map((f): [string, VocePiano[]] => [f.chiave, []]));
  const restano: VocePiano[] = [];
  for (const v of cantiere) {
    const k = faseDellaVoce(v.descrizione);
    if (k) per.get(k)!.push(v);
    else restano.push(v);
  }
  return {
    finestra,
    restano,
    fasi: FASI_TIPICHE.map((f) => ({
      chiave: f.chiave,
      nome: f.nome,
      inizio: finestra ? aggiungiMesi(finestra.inizio, Math.floor(f.da * mesi)) : null,
      fine: finestra ? aggiungiMesi(finestra.inizio, Math.max(Math.floor(f.da * mesi), Math.ceil(f.a * mesi) - 1)) : null,
      voci: per.get(f.chiave)!,
    })),
  };
}

function distanza(da: string, a: string): number {
  const [ya, ma] = da.split("-").map(Number);
  const [yb, mb] = a.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** «2027-03» → primo giorno del mese; «2027-08» come fine → ultimo giorno del mese. */
export const primoGiorno = (mese: string) => `${mese}-01`;
export function ultimoGiorno(mese: string): string {
  const [y, m] = mese.split("-").map(Number);
  const giorni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mese}-${String(giorni).padStart(2, "0")}`;
}

export interface FasePerIlDatabase {
  nome: string;
  inizio: string | null;
  fine: string | null;
  voci: string[];
}

/** Le fasi scelte, come le vuole generale_fasi_dal_piano: nome, date e id delle voci. */
export function fasiPerIlDatabase(fasi: readonly { nome: string; inizio: string | null; fine: string | null; voci: readonly { id: string }[] }[]): FasePerIlDatabase[] {
  return fasi
    .filter((f) => f.nome.trim() !== "")
    .map((f) => ({
      nome: f.nome.trim(),
      inizio: f.inizio ? primoGiorno(f.inizio) : null,
      fine: f.fine ? ultimoGiorno(f.fine) : null,
      voci: f.voci.map((v) => v.id),
    }));
}
