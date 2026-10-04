/**
 * Il colore di un serramento a schermo e nel PDF: dall'etichetta della scelta
 * nel listino («Bianco RAL 9010», «RAL 7016», «Legno Rovere Dorato») alla tinta
 * con cui si colora il telaio nel disegno.
 *
 * Tre casi: un RAL (colore pieno dalla tabella), un colore con nome senza codice
 * («Sabbia», «Titanio»), un effetto legno (due toni, che il disegno riempie di
 * venature). Se l'etichetta non si riconosce si ritorna null e il disegno usa un
 * grigio neutro: meglio un telaio grigio di un colore sbagliato.
 */
import { codiceRalDaEtichetta, RAL_COLORI } from "./ralColori";

export type Finitura =
  | { tipo: "tinta"; hex: string; nome: string }
  | { tipo: "legno"; chiaro: string; scuro: string; nome: string };

export const FINITURA_NEUTRA: Finitura = { tipo: "tinta", hex: "#d4d6d8", nome: "Grigio" };

/** Chiave di confronto: minuscole, senza accenti e senza punteggiatura. */
function chiave(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Colori con nome e senza codice RAL: tinte approssimate, quelle del fornitore. */
const TINTE_CON_NOME: Array<[string, string]> = [
  // Colori speciali del fornitore (nome tedesco + descrizione italiana): prima dei nomi generici.
  ["metbrush alu", "#b9bcc0"],
  ["metbrush brass", "#b79b5d"],
  ["alux db 703", "#6f7377"],
  ["woodec concrete", "#9a9a96"],
  ["effetto cemento", "#9a9a96"],
  ["bianco antico", "#efe8d4"],
  ["weiss antik", "#efe8d4"],
  ["crema", "#ece0b8"],
  ["terra d ombra", "#5a4b3f"],
  ["marrone seppia", "#4a3a30"],
  ["marrone scuro", "#3b2a22"],
  ["schwarzbraun", "#3b2a22"],
  ["rosso vino", "#5b1f2a"],
  ["blu acciaio", "#2f4a63"],
  ["verde scuro", "#2f4a38"],
  ["grigio luce", "#b9bcbf"],
  ["grigio argento", "#9ea1a3"],
  ["grigio basalto", "#4e5254"],
  ["grigio segnale", "#8b8e90"],
  ["grigio quarzo", "#6f7172"],
  ["grigio ardesia", "#4a4f52"],
  ["grigio antracite", RAL_COLORI["7016"].hex],
  ["nero", "#1f2022"],
  ["bronzo opaco", "#6d5a47"],
  ["bianco renolit", "#f4f4f0"],
  ["bianco", "#f1ece1"],
  ["panna", "#e9dcb8"],
  ["avorio", "#e6ddc0"],
  ["sabbia", "#d6c4a0"],
  ["ocra", "#c8962e"],
  ["grigio medio", "#8a8d8f"],
  ["titanio", "#9aa0a6"],
  ["bronzo", "#7a5c3e"],
  ["salmone", "#e8a08a"],
  ["celeste", "#a9cbe0"],
  ["verde acqua", "#8fc7b5"],
  ["grigio raffaello", "#8c9094"],
  ["verde raffaello", "#4d6b4f"],
  ["rosso raffaello", "#8e2f2b"],
  ["marrone raffaello", "#5a3f2e"],
  ["rosso mattone", "#9a4a36"],
  ["verde oliva", "#6b6f3a"],
  ["verde pisello", "#9aa86a"],
  ["beige chiaro", "#d9c9a8"],
  ["bruno", "#5b3a29"],
  ["blu", "#2f4f7f"],
  ["antracite", RAL_COLORI["7016"].hex],
  ["grigio", RAL_COLORI["7016"].hex],
  ["pellicola solo un lato", "#d4d6d8"],
];

/** Effetti legno: [parola nell'etichetta, tono chiaro, tono scuro delle venature]. Il primo che combacia vince. */
const LEGNI: Array<[string, string, string]> = [
  ["rovere palude", "#5a4030", "#33241a"],
  ["rovere polare", "#e0d4bc", "#b8a67f"],
  ["golden oak", "#c9964f", "#9a6a2c"],
  ["larice bianco", "#e6dcc4", "#bfae88"],
  ["nebraska", "#a98a63", "#6f5538"],
  ["gmalt", "#c9a064", "#9c7440"],
  ["ambra", "#c98a3a", "#8f5a1c"],
  ["miele", "#d9a94f", "#a97a28"],
  ["amaranto", "#8a3a3a", "#5c2020"],
  ["alpine", "#e8e2d4", "#cfc6b0"],
  ["rovere dorato", "#c9964f", "#9a6a2c"],
  ["rovere scuro", "#7d5634", "#4a2f1a"],
  ["rovere chiaro", "#d8b98a", "#a9824f"],
  ["legno chiaro", "#d8b98a", "#a9824f"],
  ["legno olmo", "#b98a5a", "#7e5530"],
  ["legno europa", "#c79a62", "#8a5e32"],
  ["legno scuro", "#6b4528", "#3e2614"],
  ["legno pino", "#d9ae6e", "#b07f3c"],
  ["pino", "#d9ae6e", "#b07f3c"],
  ["douglas", "#c98a4a", "#8f5426"],
  ["castagno", "#b27a44", "#7a4a22"],
  ["noce", "#6f4a2f", "#46291a"],
  ["mogano", "#8a3f2a", "#5c2416"],
  ["frassino", "#d9c8a6", "#b49a6b"],
  ["legno", "#b98a5a", "#7e5530"],
];

export function finituraDaEtichetta(etichetta: string | null | undefined): Finitura | null {
  if (!etichetta) return null;
  const k = chiave(etichetta);

  const legno = LEGNI.find(([parola]) => k.includes(parola));
  if (legno) return { tipo: "legno", chiaro: legno[1], scuro: legno[2], nome: etichetta };

  const ral = codiceRalDaEtichetta(etichetta);
  if (ral) return { tipo: "tinta", hex: RAL_COLORI[ral].hex, nome: etichetta };

  const tinta = TINTE_CON_NOME.find(([parola]) => k.includes(parola));
  if (tinta) return { tipo: "tinta", hex: tinta[1], nome: etichetta };

  return null;
}

/** Un tono più scuro, per i contorni del disegno: `quanto` va da 0 (uguale) a 1 (nero). */
export function scurisci(hex: string, quanto: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const canale = (shift: number) => Math.round(((n >> shift) & 255) * (1 - quanto));
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(canale(16))}${h(canale(8))}${h(canale(0))}`;
}

/**
 * Le finiture della maniglia: i tre toni del metallo (luce, mezzo, ombra), il
 * contorno e se è lucida (riflesso forte) o opaca (riflesso appena accennato).
 */
export type FinituraManigliaId = "argento" | "bianco" | "nero" | "inox" | "ottone" | "bronzo";

export interface FinituraManiglia {
  nome: string;
  luce: string;
  mezzo: string;
  ombra: string;
  bordo: string;
  riflesso: number;
}

export const FINITURE_MANIGLIA: Record<FinituraManigliaId, FinituraManiglia> = {
  argento: { nome: "Argento", luce: "#f6f8f9", mezzo: "#c3c9cd", ombra: "#80878d", bordo: "#6b7278", riflesso: 0.75 },
  inox: { nome: "Inox", luce: "#e9ecee", mezzo: "#9aa1a6", ombra: "#6b7278", bordo: "#4a5055", riflesso: 0.45 },
  bianco: { nome: "Bianco", luce: "#ffffff", mezzo: "#ffffff", ombra: "#c3c7c9", bordo: "#9ea3a6", riflesso: 0.9 },
  nero: { nome: "Nero", luce: "#5a5f63", mezzo: "#1c1f22", ombra: "#14171a", bordo: "#000000", riflesso: 0.28 },
  ottone: { nome: "Ottone", luce: "#fbeaa5", mezzo: "#d4a82e", ombra: "#8a6a1c", bordo: "#8a6a1c", riflesso: 0.8 },
  bronzo: { nome: "Bronzo", luce: "#c9a07a", mezzo: "#8a5a37", ombra: "#4b2f1b", bordo: "#4b2f1b", riflesso: 0.4 },
};
