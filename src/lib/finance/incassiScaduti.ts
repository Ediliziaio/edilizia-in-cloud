/**
 * Lo scaduto da incassare: una regola sola, quella del Previsionale di cassa
 * (08/11/2026).
 *
 * Prima lo scaduto aveva tre valori in tre pagine. Su Demo Azienda 2, il
 * 08/11/2026: 990.543 € nel Cruscotto, 1.027.032 € nello Scadenzario e
 * 1.503.771 € nel Previsionale. Su Ke Bei: 1.213.167 €, 0 € e 1.217.900 €.
 * - il Cruscotto contava solo le rate delle commesse;
 * - lo Scadenzario conta solo le sue scadenze, sull'anno scelto;
 * - il Previsionale mette insieme rate, scadenze e fatture una volta sola
 *   (buildForecastLedger: la fattura coperta dalle sue rate non si ripete, la
 *   nota di credito toglie, l'incasso che potrebbe essere già nelle rate resta
 *   fuori finché non lo si collega).
 * Fa fede il Previsionale. Qui il filtro che la sua pagina usa per «Incassi
 * scaduti da sollecitare», e la divisione per età che usa il Cruscotto: tutti
 * e due leggono da qui, così il numero è lo stesso per costruzione.
 */
import type { ForecastMovement } from "@/lib/finance/forecastLedger";

/** Gli incassi con una data già passata, esclusi i possibili doppioni. */
export function incassiScaduti(movements: ForecastMovement[], today: string): ForecastMovement[] {
  return movements.filter(
    (m) => m.direction === "in" && !m.possibleDuplicate && !!m.date && m.date < today,
  );
}

export interface ScadutoPerEta {
  fasce: Array<{ etichetta: string; importo: number; rate: number }>;
  totale: number;
  /** quante voci (rate, scadenze, fatture) */
  rate: number;
  /** giorni medi di ritardo, pesati sull'importo */
  ritardoMedio: number | null;
}

/** Lo scaduto diviso per età (fino a 30, 31–60, 61–90, oltre 90 giorni), in euro. */
export function scadutoPerEtaDaIncassi(scaduti: ForecastMovement[], today: string): ScadutoPerEta {
  const fasce = [
    { etichetta: "fino a 30 giorni", max: 30, importo: 0, rate: 0 },
    { etichetta: "31–60 giorni", max: 60, importo: 0, rate: 0 },
    { etichetta: "61–90 giorni", max: 90, importo: 0, rate: 0 },
    { etichetta: "oltre 90 giorni", max: Infinity, importo: 0, rate: 0 },
  ];
  const giornoOggi = new Date(`${today}T12:00:00`).getTime();
  let centesimi = 0, quante = 0, pesoGiorni = 0;
  for (const m of scaduti) {
    if (m.cents <= 0 || !m.date) continue;
    const giorni = Math.max(1, Math.round((giornoOggi - new Date(`${m.date}T12:00:00`).getTime()) / 86_400_000));
    const fascia = fasce.find((f) => giorni <= f.max)!;
    fascia.importo += m.cents;
    fascia.rate += 1;
    centesimi += m.cents;
    quante += 1;
    pesoGiorni += giorni * m.cents;
  }
  return {
    fasce: fasce.map(({ etichetta, importo, rate }) => ({ etichetta, importo: importo / 100, rate })),
    totale: centesimi / 100,
    rate: quante,
    ritardoMedio: centesimi > 0 ? Math.round(pesoGiorni / centesimi) : null,
  };
}
