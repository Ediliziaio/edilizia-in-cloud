/**
 * In che mese è stata venduta una commessa (08/11/2026).
 *
 * Le commesse non hanno una data di firma: il venduto si data con created_at,
 * il giorno in cui la commessa è stata inserita. Per chi la crea quando firma va
 * bene. Per chi importa lo storico no: Bonarrigo ha creato le sue 13 commesse
 * fra il 4 e il 6/11/2026, con inizio lavori dal 2023 e rate dal 2024. Il punto
 * di pareggio divideva così otto milioni e mezzo per un mese solo.
 *
 * Qui la data più antica che la commessa porta con sé: creazione, inizio
 * lavori, acconto (previsto o pagato), prima rata. Una commessa si firma prima
 * dei lavori e del primo pagamento: la data più antica è la più vicina alla
 * firma. Per chi lavora in piattaforma di solito è la creazione.
 */
export interface DateCommessa {
  created_at: string | null;
  work_start_date?: string | null;
  deposit_expected_date?: string | null;
  deposit_paid_date?: string | null;
}

/** Il giorno (YYYY-MM-DD) della vendita, o null se la commessa non ha nessuna data. */
export function dataVendita(o: DateCommessa, dateRate: Array<string | null | undefined> = []): string | null {
  const giorni = [
    o.created_at ? o.created_at.slice(0, 10) : null,
    o.work_start_date,
    o.deposit_expected_date,
    o.deposit_paid_date,
    ...dateRate,
  ].filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10));
  if (giorni.length === 0) return null;
  return giorni.reduce((a, b) => (b < a ? b : a));
}

/**
 * Il fatturato medio mensile degli ultimi 12 mesi, con le commesse datate da
 * dataVendita. Se ci sono commesse più vecchie di 12 mesi la finestra è di 12
 * mesi pieni; se l'azienda è più giovane, i mesi da quando ha venduto la prima
 * (almeno uno).
 */
export function fatturatoMedioMensile(
  commesse: Array<{ giorno: string | null; importo: number }>,
  oggi: Date = new Date(),
): number {
  const limite = new Date(oggi);
  limite.setMonth(limite.getMonth() - 12);
  const limiteGiorno = limite.toLocaleDateString("en-CA");
  const datate = commesse.filter((c): c is { giorno: string; importo: number } => !!c.giorno);
  const recenti = datate.filter((c) => c.giorno >= limiteGiorno && c.giorno <= oggi.toLocaleDateString("en-CA"));
  if (recenti.length === 0) return 0;
  const totale = recenti.reduce((s, c) => s + (Number(c.importo) || 0), 0);
  const piuVecchie = datate.some((c) => c.giorno < limiteGiorno);
  if (piuVecchie) return totale / 12;
  const primo = recenti.reduce((a, c) => (c.giorno < a ? c.giorno : a), recenti[0].giorno);
  const mesi = Math.max(1, (oggi.getTime() - new Date(`${primo}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24 * 30));
  return totale / Math.min(12, mesi);
}
