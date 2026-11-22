/** Somma delle spese annuali, con la stessa ipotesi del calcolo salvato. */
export function proiezioneSpesaFv(spesaAnnua: number, variazione: unknown, anni = 25): number | null {
  if (!Number.isFinite(spesaAnnua) || spesaAnnua <= 0 || typeof variazione !== "number" ||
    !Number.isFinite(variazione) || variazione <= -1 || variazione > 1 ||
    !Number.isInteger(anni) || anni < 1 || anni > 100) return null;
  let totale = 0;
  for (let anno = 0; anno < anni; anno++) totale += spesaAnnua * (1 + variazione) ** anno;
  return Math.round(totale);
}
