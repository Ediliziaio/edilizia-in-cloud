/**
 * Due aiuti del dettaglio di una scadenza (16/11/2026): la frase sui tempi e la nota senza le
 * etichette tecniche che gli import lasciano dentro («[DOC:uuid]»).
 */
import { giorniDaOggi, oggiIso } from "@/lib/finance/collegamentiFinanza";

interface PerTempo {
  direction: "entrata" | "uscita";
  due_date: string;
  status: string;
  amount: number;
  paid_amount: number;
  paid_date: string | null;
}

const giorni = (n: number) => (n === 1 ? "1 giorno" : `${n} giorni`);

/** «Scaduta da 12 giorni», «Scade tra 3 giorni», «Incassata 5 giorni dopo la scadenza»… */
export function tempoScadenza(s: PerTempo, oggi = oggiIso()): { testo: string; tono: "neutro" | "attenzione" | "cattivo" | "buono" } {
  const entrata = s.direction === "entrata";
  if (s.status === "annullata") return { testo: "Annullata", tono: "neutro" };
  const residuo = Math.round((Number(s.amount) - Number(s.paid_amount || 0)) * 100) / 100;
  if (s.status === "pagata" || residuo <= 0) {
    const verbo = entrata ? "Incassata" : "Pagata";
    if (!s.paid_date) return { testo: verbo, tono: "buono" };
    const scarto = -giorniDaOggi(s.due_date, s.paid_date.slice(0, 10));
    if (scarto > 0) return { testo: `${verbo} ${giorni(scarto)} dopo la scadenza`, tono: "neutro" };
    if (scarto < 0) return { testo: `${verbo} ${giorni(-scarto)} prima della scadenza`, tono: "buono" };
    return { testo: `${verbo} il giorno della scadenza`, tono: "buono" };
  }
  const tra = giorniDaOggi(s.due_date, oggi);
  if (tra < 0) return { testo: `Scaduta da ${giorni(-tra)}`, tono: "cattivo" };
  if (tra === 0) return { testo: "Scade oggi", tono: "attenzione" };
  if (tra <= 7) return { testo: `Scade tra ${giorni(tra)}`, tono: "attenzione" };
  return { testo: `Scade tra ${giorni(tra)}`, tono: "neutro" };
}

/** La nota senza «[DOC:…]» e simili: segni lasciati dagli import, che a chi legge non dicono niente. */
export function notaLeggibile(nota: string | null | undefined): string {
  return (nota ?? "").replace(/\[[A-Z_]+:[0-9a-f-]{8,}\]/gi, "").replace(/\s{2,}/g, " ").trim();
}
