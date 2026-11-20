export function calcoloAcquistoAssistito(p: { base: number; resa: number; mani: number; sfrido: number; modo: "consumo" | "copertura"; confezione?: number | null }) {
  if (![p.base, p.resa, p.mani, p.sfrido].every(Number.isFinite) || p.base <= 0 || p.resa <= 0 || p.mani < 1 || !Number.isInteger(p.mani) || p.sfrido < 0) throw new Error("Inserisci quantità di lavoro e resa positive, un numero intero di mani e uno sfrido non negativo.");
  if (p.confezione != null && (!Number.isFinite(p.confezione) || p.confezione <= 0)) throw new Error("Il contenuto della confezione deve essere maggiore di zero.");
  const netto = (p.modo === "consumo" ? p.base * p.resa : p.base / p.resa) * p.mani;
  const totale = netto * (1 + p.sfrido / 100);
  if (!Number.isFinite(totale)) throw new Error("Il risultato è troppo grande: controlla i valori inseriti.");
  const confezioni = p.confezione ? Math.max(1, Math.ceil(Number((totale / p.confezione).toPrecision(12)))) : null;
  return { netto, totale, confezioni, quantitaAcquisto: confezioni ?? totale, avanzo: confezioni && p.confezione ? confezioni * p.confezione - totale : 0 };
}

/** Sostituisce le note di confezionamento generate, preservando le altre caratteristiche e la fonte originale. */
export function specificheConCalcolo(prima: string, confezione: string): string {
  const prodotto = prima.replace(/(?:^|\s*·\s*|\n)Ipotesi di confezione da confermare:[^·\n]*/gi, "")
    .replace(/(?:^|\n)Confezione d'acquisto:[^\n]*/gi, "").replace(/^[\s·]+|[\s·]+$/g, "").trim();
  return [prodotto, confezione].filter(Boolean).join("\n");
}
