// Il giornale dei lavori allegato al rendiconto: solo le pagine firmate dei giorni rendicontati.
// Una pagina in bozza può ancora cambiare: al committente non si manda. Mai importi.

export interface RigaGiornaleDb {
  order_id: string;
  data_lavori: string;
  condizioni_meteo: string | null;
  lavorazioni_eseguite: string | null;
  materiali_utilizzati: string | null;
  personale_presente: number | string | null;
  firmato_da: string | null;
  pm_signed_at: string | null;
}

export interface GiornataAllegata {
  data: string;
  meteo: string | null;
  lavorazioni: string;
  materiali: string | null;
  personale: number | null;
  firmatoDa: string | null;
  firmatoIl: string | null;
}
export interface CantiereAllegato { orderId: string; nome: string; giornate: GiornataAllegata[]; senzaPagina: string[] }

/** Per ogni cantiere le pagine firmate, e i giorni rendicontati che non ne hanno una. Vuoto se non c'è nessuna pagina firmata. */
export function giornaleDaAllegare(
  giorni: ReadonlyArray<{ order_id: string; data: string }>,
  pagine: ReadonlyArray<RigaGiornaleDb>,
  nomi: ReadonlyMap<string, string>,
): CantiereAllegato[] {
  const chiave = (o: string, d: string): string => `${o}|${d.slice(0, 10)}`;
  const firmate = new Map(pagine.map((p) => [chiave(p.order_id, p.data_lavori), p]));
  const perCantiere = new Map<string, Set<string>>();
  for (const g of giorni) {
    const giornata = g.data.slice(0, 10);
    perCantiere.set(g.order_id, (perCantiere.get(g.order_id) ?? new Set<string>()).add(giornata));
  }
  const esito: CantiereAllegato[] = [];
  for (const [orderId, date] of perCantiere) {
    const ordinate = [...date].sort();
    const giornate = ordinate.flatMap((d): GiornataAllegata[] => {
      const p = firmate.get(chiave(orderId, d));
      if (!p) return [];
      const n = p.personale_presente == null ? null : Number(p.personale_presente);
      return [{ data: d, meteo: p.condizioni_meteo, lavorazioni: (p.lavorazioni_eseguite ?? "").trim(), materiali: p.materiali_utilizzati?.trim() || null,
        personale: n != null && Number.isFinite(n) ? n : null, firmatoDa: p.firmato_da, firmatoIl: p.pm_signed_at }];
    });
    esito.push({ orderId, nome: nomi.get(orderId) ?? "Cantiere", giornate, senzaPagina: ordinate.filter((d) => !firmate.has(chiave(orderId, d))) });
  }
  return esito.some((c) => c.giornate.length > 0) ? esito.filter((c) => c.giornate.length > 0 || c.senzaPagina.length > 0) : [];
}
