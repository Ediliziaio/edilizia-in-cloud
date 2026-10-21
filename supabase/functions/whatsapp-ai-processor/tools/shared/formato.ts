// Formati leggibili condivisi per i messaggi del bot (italiano).
// Un solo posto per euro e date, così i tool non divergono:
// prima scadenze/stato cantiere potevano stampare «€ 8.000,5».

/** Euro in formato italiano, simbolo davanti, sempre 2 decimali: «€ 12.500,00». */
export const fmtEur = (n: unknown): string =>
  "€ " + new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

/** Data ISO (AAAA-MM-GG…) → «GG/MM/AAAA». Se non è una data ISO la lascia com'è. */
export const dataIt = (iso: unknown): string => {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? "");
};
