/**
 * Il sigillo di una garanzia nei preventivi: gli anni, quando la garanzia li dice
 * («Due anni sui lavori», «Garanzia decennale»), altrimenti un'icona.
 *
 * Gli anni si leggono da quello che l'azienda ha scritto: un sigillo non dice mai
 * più di così. Una garanzia senza durata («Garanzia dei produttori») prende
 * l'icona del suo argomento.
 */
import type { NomeIcona } from "./iconePreventivo.ts";

export interface DurataGaranzia {
  numero: number;
  /** «ANNI», «ANNO», «MESI». */
  unita: string;
}

const PAROLE: Record<string, number> = {
  un: 1, uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  undici: 11, dodici: 12, quindici: 15, venti: 20, venticinque: 25, trenta: 30,
};
const AGGETTIVI: Record<string, number> = {
  biennale: 2, triennale: 3, quinquennale: 5, decennale: 10, ventennale: 20, trentennale: 30,
};

function durataIn(testo: string): DurataGaranzia | null {
  const t = testo.toLowerCase();
  const cifre = t.match(/\b(\d{1,2})\s*(anni|anno|mesi)\b/);
  if (cifre) {
    const numero = Number(cifre[1]);
    if (numero >= 1) return { numero, unita: cifre[2] === "mesi" ? "MESI" : numero === 1 ? "ANNO" : "ANNI" };
  }
  const parole = t.match(/\b(un|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|quindici|venti|venticinque|trenta)\s+(anni|anno|mesi)\b/);
  if (parole) {
    const numero = PAROLE[parole[1]];
    return { numero, unita: parole[2] === "mesi" ? "MESI" : numero === 1 ? "ANNO" : "ANNI" };
  }
  const aggettivo = t.match(/\b(biennale|triennale|quinquennale|decennale|ventennale|trentennale)\b/);
  if (aggettivo) return { numero: AGGETTIVI[aggettivo[1]], unita: "ANNI" };
  return null;
}

/** La durata scritta nella garanzia: prima nel titolo, poi nella descrizione. */
export function durataDellaGaranzia(titolo: string, descrizione?: string | null): DurataGaranzia | null {
  return durataIn(titolo) ?? (descrizione ? durataIn(descrizione) : null);
}

/** L'argomento di un testo, se se ne riconosce uno. */
function argomento(testo: string): NomeIcona | null {
  const t = testo.toLowerCase();
  if (/prezz|cost[oi]|€|euro|bloccat|sorpres/.test(t)) return "pagamento";
  // Prima dei tempi: «Assistenza dopo la consegna» è assistenza, non una data.
  if (/assistenz|referent|telefon|reperibil|interveni/.test(t)) return "assistenza";
  if (/temp[oi]|consegn|scadenz|cronoprogramm|calendari|data\b/.test(t)) return "calendario";
  if (/produttor|material|prodott|marca/.test(t)) return "materiali";
  if (/pulizi|ordine/.test(t)) return "pulizia";
  if (/document|certificat|conformit|dichiarazion/.test(t)) return "documenti";
  if (/sicurezz|assicura|polizz/.test(t)) return "protezione";
  if (/acqua|infiltraz|tenuta|impermeabil/.test(t)) return "acqua";
  return null;
}

/** L'icona di una garanzia che non dice gli anni: l'argomento del titolo, poi della descrizione. */
export function iconaDellaGaranzia(titolo: string, descrizione?: string | null): NomeIcona {
  return argomento(titolo) ?? (descrizione ? argomento(descrizione) : null) ?? "garanzia";
}

/**
 * I punti del contorno del sigillo, a festoni come un timbro: `punte` rientranze
 * attorno a un cerchio di raggio `raggio`, centrato in (`raggio`, `raggio`).
 */
export function contornoSigillo(raggio: number, punte = 24, rientro = 0.07): string {
  const punti: string[] = [];
  for (let i = 0; i < punte * 2; i += 1) {
    const angolo = (Math.PI * i) / punte - Math.PI / 2;
    const r = i % 2 === 0 ? raggio : raggio * (1 - rientro);
    punti.push(`${(raggio + r * Math.cos(angolo)).toFixed(2)},${(raggio + r * Math.sin(angolo)).toFixed(2)}`);
  }
  return punti.join(" ");
}
