// src/lib/orders/generali/unitaDalPiano.ts
// Le unità dalle vendite del piano economico. Un business plan immobiliare elenca già cosa si
// vende — «Unità 1 520.000», «Posto auto 3 12.000» —: riscriverlo a mano nella finestra delle
// unità in serie è lavoro doppio e un'occasione di sbagliare un prezzo.
// Qui si leggono le righe di vendita della versione del piano e si preparano le righe della
// serie (sigla, tipologia, listino) da controllare prima di confermare. Niente si inventa: la
// sigla è il nome della riga del piano, la tipologia si mette solo dove il nome la dice.
import type { VocePiano } from "./pianoConti";
import { MAX_SERIE, rigaVuota, type RigaSerie } from "./unitaSerie";

/** Le parole che dicono la tipologia. L'ordine conta: «posto auto coperto» è un posto auto, non un box. */
const TIPOLOGIE: [RegExp, string][] = [
  [/posto\s*moto|\bmoto\b/i, "Posto moto"],
  [/posto\s*auto|parcheggio|\bp\.?\s*auto\b/i, "Posto auto"],
  [/\bbox\b|garage|autorimess/i, "Box"],
  [/cantin/i, "Cantina"],
  [/attico/i, "Attico"],
  [/villett|\bvilla\b/i, "Villetta"],
  [/appartament|alloggi|abitazion|bilocal|trilocal|quadrilocal|monolocal/i, "Appartamento"],
  [/negozi|commercial/i, "Negozio"],
  [/uffici/i, "Ufficio"],
  [/magazzin|deposit/i, "Magazzino"],
];

export const tipologiaDalNome = (nome: string): string => TIPOLOGIE.find(([re]) => re.test(nome))?.[1] ?? "";

const chiaveSigla = (s: string) => s.trim().toLowerCase();

/**
 * 520000 → «520.000»; 1184.63 → «1.184,63». Come si scrive in Italia, come lo legge controllaSerie.
 * Il formato italiano da solo scrive «3000» senza punto sotto le diecimila: qui il punto c'è
 * sempre, così nella griglia i prezzi si leggono tutti allo stesso modo.
 */
const listino = (n: number) =>
  n.toLocaleString("it-IT", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  } as Intl.NumberFormatOptions);

export interface UnitaDalPiano {
  /** Le righe della serie, già compilate, nell'ordine del piano. */
  righe: RigaSerie[];
  /** Le righe di vendita del piano in tutto (create e no). */
  vendite: number;
  /** Il valore delle righe ancora da creare. */
  valore: number;
  /** «7 unità, 16 posti auto, 3 posti moto». */
  composizione: string;
}

const PLURALI: Record<string, [string, string]> = {
  "": ["unità", "unità"],
  "Posto moto": ["posto moto", "posti moto"],
  "Posto auto": ["posto auto", "posti auto"],
  Box: ["box", "box"],
  Cantina: ["cantina", "cantine"],
  Attico: ["attico", "attici"],
  Villetta: ["villetta", "villette"],
  Appartamento: ["appartamento", "appartamenti"],
  Negozio: ["negozio", "negozi"],
  Ufficio: ["ufficio", "uffici"],
  Magazzino: ["magazzino", "magazzini"],
};

export function composizioneUnita(tipologie: string[]): string {
  const conti = new Map<string, number>();
  for (const t of tipologie) conti.set(t, (conti.get(t) ?? 0) + 1);
  return [...conti.entries()]
    .map(([t, n]) => {
      const [uno, tanti] = PLURALI[t] ?? [t.toLowerCase(), t.toLowerCase()];
      return `${n} ${n === 1 ? uno : tanti}`;
    })
    .join(", ");
}

/**
 * Le righe della serie dalle vendite del piano. Null quando il piano non elenca quello che si
 * vende riga per riga (nessuna vendita, o una sola riga «Vendite»: è un totale, non un'unità).
 * Le righe con la sigla di un'unità che c'è già non si ripropongono.
 */
export function unitaDalPiano(voci: VocePiano[], sigleEsistenti: string[]): UnitaDalPiano | null {
  const vendite = voci
    .filter((v) => v.tipo === "ricavo" && v.categoria === "vendite" && v.descrizione.trim() !== "")
    .sort((a, b) => a.ordine - b.ordine);
  if (vendite.length < 2) return null;

  const esistenti = new Set(sigleEsistenti.map(chiaveSigla));
  const viste = new Set<string>();
  const righe: RigaSerie[] = [];
  let valore = 0;
  for (const v of vendite) {
    const sigla = v.descrizione.trim().replace(/\s+/g, " ").slice(0, 40);
    const k = chiaveSigla(sigla);
    if (esistenti.has(k) || viste.has(k)) continue;
    viste.add(k);
    righe.push({ ...rigaVuota(), sigla, tipologia: tipologiaDalNome(sigla), listino: v.importo > 0 ? listino(v.importo) : "" });
    valore += Math.max(0, v.importo);
  }
  if (righe.length === 0) return null;
  return {
    righe: righe.slice(0, MAX_SERIE),
    vendite: vendite.length,
    valore,
    composizione: composizioneUnita(righe.map((r) => r.tipologia)),
  };
}
