/**
 * Le rate di pagamento del cliente nello step Economia dei Serramenti (06/10/2026): i conti puri, senza
 * interfaccia. La forma resta quella di sempre (`pagamento_milestones`: nome, percentuale, quando): qui non
 * si inventa nessun campo, si decide solo come cambiano le percentuali quando chi lavora ne tocca una.
 *
 * La regola: l'ULTIMA rata è quella che chiude il conto («Saldo», «Finanziamento»). Quando si cambia una
 * delle altre, l'ultima prende quello che resta per arrivare a 100, e le percentuali scritte dall'utente
 * nelle altre righe non si toccano. Se le altre superano già 100 l'ultima va a 0 e non sotto: il totale resta
 * sbagliato e lo dice l'avviso, invece di inventare una percentuale negativa.
 *
 * Negli schemi con finanziamento (tutto finanziato, acconto + finanziato, 2 acconti + finanziato) l'ANTICIPO del
 * cliente e le rate non sono due cose: l'anticipo è la quota NON finanziata, cioè tutte le rate tranne quella che
 * paga il finanziamento. `anticipoDaRate` lo legge dalle rate; `rateConAnticipo` rifà le rate quando l'anticipo
 * cambia (così la scheda del finanziamento, le rate e il PDF dicono la stessa cifra).
 */
import type { SrPagamentoMilestone, SrSchemaPagamento } from "@/types/serramenti";

/** Al centesimo di punto: 33,33 + 33,33 + 33,34 deve fare 100 e non 99,99999999999999. */
const arrotonda = (n: number): number => Math.round(n * 100) / 100;

const percentuale = (rata: SrPagamentoMilestone): number => Number(rata.percentuale) || 0;

/** La somma delle percentuali delle rate. */
export function totalePercentuali(rate: SrPagamentoMilestone[]): number {
  return arrotonda(rate.reduce((somma, rata) => somma + percentuale(rata), 0));
}

/**
 * L'importo di una rata sul totale del documento, IVA inclusa. Lo stesso conto del PDF
 * (SerramentoPDF: totale × percentuale / 100): quello che si vede qui è quello che legge il cliente.
 */
export function importoRata(totale: number, percentualeRata: number): number {
  return (totale * (Number(percentualeRata) || 0)) / 100;
}

/** L'ultima rata prende quello che resta per arrivare a 100; le altre restano com'erano. */
export function ribilanciaUltimaRata(rate: SrPagamentoMilestone[]): SrPagamentoMilestone[] {
  if (rate.length === 0) return rate;
  const ultima = rate.length - 1;
  const altre = totalePercentuali(rate.slice(0, ultima));
  const resto = Math.max(0, arrotonda(100 - altre));
  return rate.map((rata, i) => (i === ultima ? { ...rata, percentuale: resto } : rata));
}

/**
 * Le rate tutte uguali, in punti interi: 100 diviso il numero di rate, e il resto va alle ultime
 * (3 rate: 33 / 33 / 34; 6 rate: 16 / 16 / 17 / 17 / 17 / 17). La somma fa sempre 100. Nomi e «quando»
 * non si toccano.
 */
export function dividiInPartiUguali(rate: SrPagamentoMilestone[]): SrPagamentoMilestone[] {
  const n = rate.length;
  if (n === 0) return rate;
  const base = Math.floor(100 / n);
  const conUnoInPiu = 100 - base * n;
  return rate.map((rata, i) => ({ ...rata, percentuale: base + (i >= n - conUnoInPiu ? 1 : 0) }));
}

const tra0e100 = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * La rata che paga il finanziamento: l'ultima il cui nome dice «finanziamento» (di serie la rata si chiama proprio
 * così), altrimenti l'ultima. Le altre sono quello che il cliente paga di tasca sua.
 */
export function indiceRataFinanziata(rate: SrPagamentoMilestone[]): number {
  for (let i = rate.length - 1; i >= 0; i--) {
    if (/finanziament/i.test(rate[i].label ?? "")) return i;
  }
  return rate.length - 1;
}

/** L'anticipo che dicono le rate, in percentuale del totale: la somma di tutte le rate tranne quella finanziata. */
export function anticipoDaRate(rate: SrPagamentoMilestone[]): number {
  if (rate.length === 0) return 0;
  const finanziata = indiceRataFinanziata(rate);
  return tra0e100(totalePercentuali(rate.filter((_, i) => i !== finanziata)));
}

/**
 * Le rate dopo che l'anticipo è diventato `anticipoPct`: la rata finanziata prende il resto (100 meno l'anticipo) e
 * l'anticipo si divide fra le altre rate nelle stesse proporzioni di prima (in parti uguali se prima erano tutte a 0);
 * l'ultima delle altre chiude il conto al centesimo, così la loro somma fa ESATTAMENTE l'anticipo. Nomi e «quando»
 * non si toccano.
 *
 * Due casi cambiano il numero delle rate:
 *  - anticipo 0: le rate dell'acconto non servono più, resta quella del finanziamento (tutto finanziato);
 *  - anticipo > 0 senza nessuna rata di acconto (tutto finanziato): se ne aggiunge una davanti, fatta come `rigaAcconto`.
 */
export function rateConAnticipo(
  rate: SrPagamentoMilestone[],
  anticipoPct: number,
  rigaAcconto: SrPagamentoMilestone,
): SrPagamentoMilestone[] {
  if (rate.length === 0) return rate;
  const anticipo = arrotonda(tra0e100(Number(anticipoPct) || 0));
  const iFinanziata = indiceRataFinanziata(rate);
  const finanziata: SrPagamentoMilestone = { ...rate[iFinanziata], percentuale: arrotonda(100 - anticipo) };
  const altre = rate.filter((_, i) => i !== iFinanziata);
  if (altre.length === 0) return anticipo > 0 ? [{ ...rigaAcconto, percentuale: anticipo }, finanziata] : [finanziata];
  if (anticipo === 0) return [finanziata];
  const prima = totalePercentuali(altre);
  let assegnato = 0;
  const nuove = altre.map((rata, k) => {
    if (k === altre.length - 1) return Math.max(0, arrotonda(anticipo - assegnato));
    const quota = prima > 0 ? percentuale(rata) / prima : 1 / altre.length;
    const valore = arrotonda(anticipo * quota);
    assegnato += valore;
    return valore;
  });
  let k = 0;
  return rate.map((rata, i) => (i === iFinanziata ? finanziata : { ...rata, percentuale: nuove[k++] }));
}

/**
 * Lo schema che corrisponde alle rate dopo un cambio di anticipo: con una sola rata è «tutto finanziato»; con un
 * acconto dove prima non c'era (tutto finanziato) è «acconto + finanziato»; altrimenti lo schema resta quello.
 */
export function schemaDopoAnticipo(schema: SrSchemaPagamento, rate: SrPagamentoMilestone[]): SrSchemaPagamento {
  if (rate.length === 1) return "tutto_finanziato";
  return schema === "tutto_finanziato" ? "acconto_finanziato" : schema;
}
