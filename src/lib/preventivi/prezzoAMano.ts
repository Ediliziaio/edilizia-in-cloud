/**
 * Il prezzo del preventivo scritto a mano nella fase Economia (vedi
 * components/preventivi/PrezzoPreventivoAMano.tsx): il numero scritto nel campo.
 * Vuoto, zero o non valido = nessun prezzo scritto, e si torna alla somma delle
 * righe. La virgola vale come punto decimale; si arrotonda al centesimo.
 */
export function prezzoDaTesto(testo: string): number | null {
  const pulito = testo.trim().replace(",", ".");
  const valore = Number(pulito);
  if (pulito === "" || !Number.isFinite(valore) || valore <= 0) return null;
  const alCentesimo = Math.round(valore * 100) / 100;
  // «0,004» arrotonda a zero: non è un prezzo, e il vincolo quotes.prezzo_manuale > 0
  // rifiuterebbe il salvataggio di tutto il preventivo.
  return alCentesimo > 0 ? alCentesimo : null;
}
