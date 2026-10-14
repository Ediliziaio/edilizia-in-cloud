/** Importo di prova: virgola italiana, migliaia opzionali, massimo due decimali. */
export function totaleAnteprimaPagamento(raw: string): number | null {
  let testo = raw.trim().replace(/\s/g, "").replace(/€$/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(testo))
    testo = testo.replace(/\./g, "");
  if (!/^\d+([,.]\d{1,2})?$/.test(testo)) return null;
  const numero = Number(testo.replace(",", "."));
  return numero > 0 && Number.isSafeInteger(Math.round(numero * 100))
    ? numero
    : null;
}
