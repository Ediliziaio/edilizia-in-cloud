/**
 * A cosa è collegata una fattura ricevuta e se è stata verificata. Le quote stanno sul costo (company_costs.allocations):
 * è da lì che margine, esposizione e pagamenti le leggono già.
 */
export interface QuotaCommessa { order_id: string; importo: number; righe?: number[] }
export interface QuotaSalvata { order_id: string; pct: number; importo?: number; righe?: number[] }

const centesimi = (n: number) => Math.round(n * 100) / 100;

/** Chi ha scelto vince; finché nessuno sceglie, contabilizzata vale verificata. */
export function fatturaVerificata(f: { stato?: string | null; verifica_manuale?: string | null }): boolean {
  if (f.verifica_manuale === "verificata") return true;
  if (f.verifica_manuale === "da_verificare" || f.verifica_manuale === "da_rettificare") return false;
  return f.stato === "contabilizzata";
}

/** Le quote di un costo: dalla ripartizione, altrimenti tutta la commessa a cui è intestato. */
export function quoteDelCosto(costo: { order_id?: string | null; allocations?: unknown } | null | undefined): QuotaSalvata[] {
  if (!costo) return [];
  const voci = Array.isArray(costo.allocations) ? costo.allocations as Array<Record<string, unknown>> : [];
  const quote = voci.flatMap((v) => {
    const pct = Number(v?.pct);
    return typeof v?.order_id === "string" && Number.isFinite(pct)
      ? [{ order_id: v.order_id, pct, ...(v.importo != null ? { importo: Number(v.importo) } : {}), ...(Array.isArray(v.righe) ? { righe: v.righe.map(Number) } : {}) }]
      : [];
  });
  if (quote.length) return quote;
  return costo.order_id ? [{ order_id: costo.order_id, pct: 100 }] : [];
}

export interface RigaFatturaXml { numero: number; descrizione: string; imponibile: number }

/** Le voci del documento, numerate come nell'XML. Una voce senza importo non si può assegnare. */
export function vociFattura(righe: unknown): RigaFatturaXml[] {
  if (!Array.isArray(righe)) return [];
  return righe.flatMap((r, i) => {
    const x = (r ?? {}) as Record<string, unknown>;
    const imponibile = Number(x.imponibile ?? x.totale_riga ?? x.totale);
    if (!Number.isFinite(imponibile) || imponibile === 0) return [];
    return [{ numero: Number(x.numero_linea) || i + 1, descrizione: String(x.descrizione ?? `Voce ${i + 1}`), imponibile }];
  });
}

/** La destinazione «magazzino» di una voce: non è una commessa, quindi non è un uuid. */
export const DESTINAZIONE_MAGAZZINO = "magazzino";

/** Dalle voci assegnate alle quote per commessa. Una commessa col totale non positivo (solo anticipi) non è una quota. */
export function quoteDaVoci(voci: RigaFatturaXml[], scelte: Record<number, string | undefined>): QuotaCommessa[] {
  const perCommessa = new Map<string, { importo: number; righe: number[] }>();
  for (const v of voci) {
    const id = scelte[v.numero];
    if (!id || id === DESTINAZIONE_MAGAZZINO) continue;
    const q = perCommessa.get(id) ?? { importo: 0, righe: [] };
    q.importo = centesimi(q.importo + v.imponibile);
    q.righe.push(v.numero);
    perCommessa.set(id, q);
  }
  return [...perCommessa].map(([order_id, q]) => ({ order_id, ...q }));
}

/** Quanto delle voci è stato mandato a magazzino, sull'imponibile: le voci sono già nette. */
export function magazzinoDaVoci(voci: RigaFatturaXml[], scelte: Record<number, string | undefined>): number {
  return centesimi(voci.reduce((n, v) => (scelte[v.numero] === DESTINAZIONE_MAGAZZINO ? n + v.imponibile : n), 0));
}

/**
 * La merce che avanza e resta in magazzino è la terza destinazione di una fattura, accanto
 * alle commesse e alle spese generali: commesse + magazzino + spese generali = imponibile.
 * Non è costo di nessuna commessa finché la merce non esce, e non è nemmeno spesa generale:
 * è valore fermo in giacenza. Diventa costo all'uscita, quando lo scarico porta sulla
 * commessa il costo medio della scheda — così la stessa spesa non si conta due volte.
 */
export function problemaRipartizione(quote: QuotaCommessa[], imponibile: number, magazzino = 0): string | null {
  if (quote.some((q) => !q.order_id)) return "Scegli la commessa di ogni riga.";
  if (quote.some((q) => !(q.importo > 0))) return "Ogni commessa ha bisogno di un importo maggiore di zero.";
  if (new Set(quote.map((q) => q.order_id)).size !== quote.length) return "Una commessa compare due volte.";
  if (magazzino < 0) return "La quota a magazzino non può essere negativa.";
  const totale = quote.reduce((n, q) => n + q.importo, 0) + magazzino;
  if (totale > Math.abs(imponibile) + 0.01) {
    return magazzino > 0
      ? "Commesse e magazzino insieme superano l'imponibile della fattura."
      : "Le quote superano l'imponibile della fattura.";
  }
  return null;
}

export const residuoDaAssegnare = (quote: QuotaCommessa[], imponibile: number, magazzino = 0) =>
  centesimi(Math.abs(imponibile) - quote.reduce((n, q) => n + q.importo, 0) - magazzino);

/**
 * Chi collega ragiona col totale della fattura, IVA compresa; margine e quote ragionano sull'imponibile.
 * L'ultima quota prende il resto, così se tutto è assegnato i centesimi tornano esatti.
 */
export function quoteLordeInNette(quote: QuotaCommessa[], totale: number, imponibile: number, magazzinoLordo = 0): QuotaCommessa[] {
  const lordo = Math.abs(totale), netto = Math.abs(imponibile);
  if (!lordo || !netto) return quote;
  const magazzino = magazzinoLordo > 0 ? magazzinoLordo : 0;
  const somma = quote.reduce((n, q) => n + q.importo, 0) + magazzino;
  // Tutto assegnato: l'ultima quota prende il resto e i centesimi tornano esatti. Col
  // magazzino nel mezzo il resto è quello che avanza dopo aver messo via la sua parte.
  const tutto = Math.abs(somma - lordo) <= 0.01;
  let assegnato = magazzino > 0 ? centesimi((magazzino * netto) / lordo) : 0;
  return quote.map((q, i) => {
    const importo = tutto && i === quote.length - 1 ? centesimi(netto - assegnato) : centesimi((q.importo * netto) / lordo);
    assegnato = centesimi(assegnato + importo);
    return { ...q, importo };
  });
}

/** La quota a magazzino segue la stessa strada: dal lordo che si vede allo netto che si salva. */
export function magazzinoInNetto(magazzinoLordo: number, totale: number, imponibile: number): number {
  const lordo = Math.abs(totale), netto = Math.abs(imponibile);
  if (!(magazzinoLordo > 0) || !lordo || !netto) return 0;
  return centesimi((magazzinoLordo * netto) / lordo);
}

/** Quanto di questo costo è dichiarato fermo in magazzino. */
export function quotaMagazzinoDelCosto(costo: { quota_magazzino?: unknown } | null | undefined): number {
  const n = Number((costo ?? {}).quota_magazzino ?? 0);
  return Number.isFinite(n) && n > 0 ? centesimi(n) : 0;
}

/** Quali voci della fattura sono andate a magazzino, quando si è diviso voce per voce. */
export function righeMagazzinoDelCosto(costo: { quota_magazzino_righe?: unknown } | null | undefined): number[] {
  const righe = (costo ?? {}).quota_magazzino_righe;
  if (!Array.isArray(righe)) return [];
  return righe.map(Number).filter((n) => Number.isFinite(n));
}
