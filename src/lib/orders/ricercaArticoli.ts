/**
 * La ricerca unica del popup «Aggiungi articolo»: cosa si vede, in che gruppi e
 * in che ordine. Niente React, così si prova senza aprire la finestra.
 */
const norm = (t: string | null | undefined) => (t ?? "").toLocaleLowerCase("it").trim();

export const PER_GRUPPO = 6;

export interface VoceMagazzino { id: string; name: string; internal_code?: string | null; barcode?: string | null; quantity: number }
export interface VoceListino { id: string; name: string; sku?: string | null; description?: string | null; category?: string | null }
export interface VoceRecente { chiave: string; name: string; product_code?: string | null }

export interface RisultatiRicerca<M, L, R> {
  magazzino: { voci: M[]; altri: number };
  listino: { voci: L[]; altri: number };
  recenti: { voci: R[]; altri: number };
  /** Il nome scritto, se non esiste già tale e quale. */
  nuovo: string | null;
}

const taglia = <T,>(voci: T[], max = PER_GRUPPO) => ({ voci: voci.slice(0, max), altri: Math.max(0, voci.length - max) });

export function cercaArticoli<M extends VoceMagazzino, L extends VoceListino, R extends VoceRecente>(
  testo: string,
  magazzino: M[],
  listino: L[],
  recenti: R[],
): RisultatiRicerca<M, L, R> {
  const q = norm(testo);
  const hit = (...campi: (string | null | undefined)[]) => !q || campi.some((c) => norm(c).includes(q));

  const inMagazzino = magazzino.filter((s) => hit(s.name, s.internal_code, s.barcode));
  const dalListino = listino.filter((l) => hit(l.name, l.sku, l.description, l.category));
  // Un articolo che sta già nel listino si sceglie da lì: porta costo e fornitore aggiornati.
  const nomiListino = new Set(listino.map((l) => norm(l.name)));
  const usati = recenti.filter((r) => !nomiListino.has(norm(r.name)) && hit(r.name, r.product_code));

  const esiste = !q
    || magazzino.some((s) => norm(s.name) === q)
    || listino.some((l) => norm(l.name) === q)
    || recenti.some((r) => norm(r.name) === q);

  return {
    magazzino: taglia(inMagazzino),
    listino: taglia(dalListino),
    recenti: taglia(usati, q ? PER_GRUPPO : 8),
    nuovo: esiste ? null : testo.trim(),
  };
}

export interface RigaUsata {
  name: string;
  product_code?: string | null;
  purchase_price?: number | null;
  vat_rate?: number | null;
  supplier_id?: string | null;
  unita_misura?: string | null;
  categoria?: string | null;
}

/** Dalle ultime righe un elemento per nome, la più recente: le righe arrivano già dalla più nuova. */
export function righeUsateDistinte<T extends RigaUsata>(righe: T[]): (T & { chiave: string })[] {
  const visti = new Set<string>();
  const fuori: (T & { chiave: string })[] = [];
  for (const r of righe) {
    const chiave = norm(r.name);
    if (!chiave || visti.has(chiave)) continue;
    visti.add(chiave);
    fuori.push({ ...r, chiave });
  }
  return fuori;
}
