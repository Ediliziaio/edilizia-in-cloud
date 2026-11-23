/**
 * Che cosa manca perché l'IVA di un periodo sia giusta (23/11/2026).
 *
 * Un'impresa che fattura con un altro programma ha importato a novembre tutto l'anno: da
 * gennaio a luglio fatture emesse e ricevute col solo totale, senza imponibile né IVA. La
 * contabilità generale le salta (non sa dividere il totale), la LIPE non parte (impostazioni
 * IVA mai compilate, acquisti senza data di ricezione) e la liquidazione in contabilità di
 * quei mesi diceva 0 €, o un importo fatto con due fatture su novantasei, senza avvisare.
 * Qui si conta, periodo per periodo, quello che la liquidazione NON vede.
 */

export interface DocumentoSenzaImporti {
  /** Data che decide il periodo: emissione per le vendite, data della fattura per gli acquisti. */
  data: string;
  lato: "emesse" | "ricevute";
}

export interface IncompletiPeriodo { emesse: number; ricevute: number }

/** Quanti documenti senza importi cadono in ciascun periodo `[dal, al]` (date ISO comprese). */
export function incompletiPerPeriodo(
  documenti: readonly DocumentoSenzaImporti[],
  periodi: readonly { dal: string; al: string }[],
): IncompletiPeriodo[] {
  return periodi.map((p) => {
    const c: IncompletiPeriodo = { emesse: 0, ricevute: 0 };
    for (const d of documenti) {
      const g = d.data.slice(0, 10);
      if (g >= p.dal && g <= p.al) c[d.lato] += 1;
    }
    return c;
  });
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** «gennaio–luglio», «marzo, maggio–giugno»: i mesi con documenti senza importi, per dirlo in una riga. */
export function mesiInLettere(date: readonly string[]): string {
  const mesi = [...new Set(date.map((d) => Number(d.slice(5, 7))))].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  const tratti: string[] = [];
  for (let i = 0; i < mesi.length; i++) {
    let j = i;
    while (j + 1 < mesi.length && mesi[j + 1] === mesi[j] + 1) j++;
    tratti.push(i === j ? MESI[mesi[i] - 1] : `${MESI[mesi[i] - 1]}–${MESI[mesi[j] - 1]}`);
    i = j;
  }
  return tratti.join(", ");
}

/** Il testo per il periodo: «3 emesse e 94 ricevute senza importi». Vuoto se il periodo è completo. */
export function avvisoPeriodo(c: IncompletiPeriodo | undefined): string {
  if (!c || c.emesse + c.ricevute === 0) return "";
  const parti = [
    c.emesse ? `${c.emesse} ${c.emesse === 1 ? "emessa" : "emesse"}` : "",
    c.ricevute ? `${c.ricevute} ${c.ricevute === 1 ? "ricevuta" : "ricevute"}` : "",
  ].filter(Boolean);
  return `${parti.join(" e ")} senza importi`;
}
