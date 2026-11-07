/** null indica un finanziamento storico non ancora riconciliato. */
export type ModalitaCostoFinanziaria = "trattenuto" | "separato";

export function modalitaCostoFinanziaria(value: unknown): ModalitaCostoFinanziaria | null {
  return value === "trattenuto" || value === "separato" ? value : null;
}

/** Il costo riduce il saldo cliente solo nella lettura compatibile dello storico.
 * Per entrambe le modalità esplicite è un costo dell'azienda, non uno sconto. */
export function costoDaSottrarreAlSaldo(costo: number, modalita?: ModalitaCostoFinanziaria | null): number {
  return modalita == null ? costo : 0;
}

export function costoTrattenuto(costo: number, modalita?: ModalitaCostoFinanziaria | null): number {
  return modalita === "separato" ? 0 : costo;
}

/** Calcolo preventivo: non registra incassi o uscite, né riscrive lo storico. */
export function riepilogoFinanziamento(input: {
  totaleContratto: number;
  accontiCliente: number;
  quotaFinanziata: number;
  costo: number;
  modalita: ModalitaCostoFinanziaria;
}) {
  const values = [input.totaleContratto, input.accontiCliente, input.quotaFinanziata, input.costo];
  if (values.some(v => !Number.isFinite(v) || v < 0)) throw new Error("Inserisci importi validi e non negativi.");
  const cent = (v: number) => Math.round((v + Number.EPSILON) * 100);
  const [totale, acconti, finanziato, costo] = values.map(cent);
  if (acconti + finanziato > totale) throw new Error("Acconti e quota finanziata superano il contratto.");
  if (input.modalita !== "trattenuto" && input.modalita !== "separato") throw new Error("Scegli come viene pagato il costo della finanziaria.");
  if (input.modalita === "trattenuto" && costo > finanziato) throw new Error("Il costo trattenuto supera la quota finanziata.");
  const trattenuto = input.modalita === "trattenuto" ? costo : 0;
  return {
    saldoCliente: (totale - acconti - finanziato) / 100,
    incassoFinanziaria: (finanziato - trattenuto) / 100,
    uscitaSeparata: (costo - trattenuto) / 100,
    costoEconomico: costo / 100,
    entrateComplessive: (totale - trattenuto) / 100,
  };
}

/** Una trattenuta va attribuita a un'erogazione precisa, mai ripartita implicitamente. */
export function verificaCostoSuPiano(costo: number, modalita: ModalitaCostoFinanziaria | null, rate: ReadonlyArray<{ type: string; amount: number }>): void {
  if (!Number.isFinite(costo) || costo < 0) throw new Error("Inserisci un costo della finanziaria valido e non negativo.");
  if (modalita !== "trattenuto" || costo === 0) return;
  const erogazioni = rate.filter(r => r.type === "financing");
  if (erogazioni.length !== 1) throw new Error("Il costo trattenuto richiede una singola erogazione della finanziaria.");
  if (!Number.isFinite(erogazioni[0].amount) || costo > erogazioni[0].amount) throw new Error("Il costo trattenuto supera la quota finanziata.");
}
