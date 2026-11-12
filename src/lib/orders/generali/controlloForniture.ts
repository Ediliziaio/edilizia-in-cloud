/** Documentary stages are alternatives in the cost lifecycle, never additive costs. */
export interface OrdineFornitura {
  id: string;
  order_id: string | null;
  oda_number: string | null;
  status: string;
  supplier_id?: string | null;
}
export interface RigaOrdinata {
  id: string;
  purchase_order_id: string;
  description: string;
  quantity: number;
  quantity_received: number;
  unit_price: number;
  discount_percent: number;
  line_total: number | null;
  price_pending?: boolean;
}
export interface RigaConsegnata {
  id: string;
  ddt_ricezione_id: string;
  purchase_order_item_id: string | null;
  quantita: number | null;
  prezzo_unitario: number | null;
  importo: number | null;
  descrizione?: string | null;
  unita_misura?: string | null;
}
export interface DocumentoConsegna {
  id: string;
  purchase_order_id: string | null;
  order_id: string | null;
  numero_ddt: string | null;
  stato: string;
}
export interface LegameFatturaDdt {
  id: string;
  fattura_ricevuta_id: string;
  ddt_ricezione_id: string | null;
}
export interface RigaFatturata {
  purchase_order_item_id?: string | null;
  descrizione?: string;
  quantita?: number | null;
  prezzo_unitario?: number | null;
  prezzo_totale?: number | null;
  totale_riga?: number | null;
  totale?: number | null;
  imponibile?: number | null;
  importo?: number | null;
}
export interface FatturaFornitura {
  id: string;
  purchase_order_id: string | null;
  company_cost_id: string | null;
  fornitore_id?: string | null;
  numero_fattura: string | null;
  righe: RigaFatturata[];
  tipo_documento: string | null;
  imponibile_totale: number | null;
  stato: string | null;
  updated_at: string | null;
}
export const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const numero = (n: unknown): number | null =>
  n == null || n === "" || !Number.isFinite(Number(n)) ? null : Number(n);
export function valoreRigaFattura(r: RigaFatturata): number | null {
  const totale = numero(r.imponibile ?? r.totale_riga ?? r.totale ?? r.prezzo_totale ?? r.importo);
  if (totale !== null) return totale;
  const q = numero(r.quantita),
    p = numero(r.prezzo_unitario);
  return q === null || p === null ? null : cent(q * p);
}
export const segnoFattura = (f: Pick<FatturaFornitura, "tipo_documento">) =>
  ["TD04", "TD08", "nota_credito", "passive_credit_note"].includes(f.tipo_documento ?? "") ? -1 : 1;

/** Un DDT diretto non ha bisogno di una riga d'ordine. Il confronto è documentale,
 * e non ripartisce l'intera fattura su ogni bolla quando ne copre più di una. */
export function riconciliaDdtDiretto(
  bolla: DocumentoConsegna,
  consegne: RigaConsegnata[],
  fatture: FatturaFornitura[],
  legami: LegameFatturaDdt[],
) {
  const righe = [
    ...new Map(consegne.filter((r) => r.ddt_ricezione_id === bolla.id).map((r) => [r.id, r])).values(),
  ];
  const idsFatture = new Set(
    legami.filter((l) => l.ddt_ricezione_id === bolla.id).map((l) => l.fattura_ricevuta_id),
  );
  const collegate = [
    ...new Map(
      fatture
        .filter((f) => idsFatture.has(f.id) && !["annullata", "rifiutata"].includes(f.stato ?? ""))
        .map((f) => [f.id, f]),
    ).values(),
  ];
  const valori = righe.map((r) => {
    const importo = numero(r.importo);
    if (importo !== null) return importo;
    const q = numero(r.quantita),
      p = numero(r.prezzo_unitario);
    return q === null || p === null ? null : cent(q * p);
  });
  const valore =
    !righe.length || valori.some((v) => v === null) ? null : cent(valori.reduce<number>((s, v) => s + v!, 0));
  const fatturaCondivisa = collegate.some((f) =>
    legami.some((l) => l.fattura_ricevuta_id === f.id && l.ddt_ricezione_id !== bolla.id),
  );
  const bollaMista = righe.some((r) => !!r.purchase_order_item_id);
  const fatturato =
    !collegate.length ||
    fatturaCondivisa ||
    bollaMista ||
    collegate.some((f) => numero(f.imponibile_totale) === null)
      ? null
      : cent(
          collegate.reduce(
            (s, f) =>
              s +
              (segnoFattura(f) < 0 ? -Math.abs(Number(f.imponibile_totale)) : Number(f.imponibile_totale)),
            0,
          ),
        );
  const avvisi: string[] = [];
  if (valore === null) avvisi.push("Valore della bolla da completare");
  if (!collegate.length) avvisi.push("In attesa della fattura o del suo collegamento");
  if (collegate.some((f) => !f.company_cost_id)) avvisi.push("Fattura da contabilizzare");
  if (
    collegate.length &&
    !fatturaCondivisa &&
    !bollaMista &&
    collegate.some((f) => numero(f.imponibile_totale) === null)
  )
    avvisi.push("Importo della fattura da completare");
  if (valore !== null && fatturato !== null && Math.abs(valore - fatturato) > 0.01)
    avvisi.push("Importi della bolla e delle fatture diversi: verifica acconti, sconti e rettifiche");
  return { righe, fatture: collegate, valore, fatturato, fatturaCondivisa, bollaMista, avvisi };
}

export function riconciliaRiga(r: RigaOrdinata, consegne: RigaConsegnata[], fatture: FatturaFornitura[]) {
  const bolle = [
    ...new Map(consegne.filter((d) => d.purchase_order_item_id === r.id).map((d) => [d.id, d])).values(),
  ];
  const righe = [...new Map(fatture.map((f) => [f.id, f])).values()]
    .filter((f) => !["annullata", "rifiutata"].includes(f.stato ?? ""))
    .flatMap((f) =>
      (Array.isArray(f.righe) ? f.righe : [])
        .filter((x) => x.purchase_order_item_id === r.id)
        .map((x) => ({ f, r: x })),
    );
  // quantity_received already includes posted DDTs. Adding it to the DDT quantity would duplicate deliveries.
  const qBolle = bolle.reduce((s, b) => s + (numero(b.quantita) ?? 0), 0);
  const ricevuta = Math.max(Number(r.quantity_received ?? 0), qBolle);
  const prezzo = r.price_pending ? null : Number(r.unit_price) * (1 - Number(r.discount_percent ?? 0) / 100);
  const impegnato =
    prezzo === null ? null : cent(r.line_total == null ? r.quantity * prezzo : Number(r.line_total));
  const ricevutaCompleta = !bolle.some((b) => numero(b.quantita) === null);
  const maturato = prezzo === null || !ricevutaCompleta ? null : cent(ricevuta * prezzo);
  const valori = righe.map((x) => valoreRigaFattura(x.r));
  const fatturato = valori.some((v) => v === null)
    ? null
    : cent(righe.reduce((s, x, i) => s + (segnoFattura(x.f) < 0 ? -Math.abs(valori[i]!) : valori[i]!), 0));
  const qFatturata = righe.some((x) => numero(x.r.quantita) === null)
    ? null
    : righe.reduce(
        (s, x) => s + (segnoFattura(x.f) < 0 ? -Math.abs(Number(x.r.quantita)) : Number(x.r.quantita)),
        0,
      );
  const avvisi: string[] = [];
  if (prezzo === null) avvisi.push("Prezzo d'ordine da definire");
  if (!ricevutaCompleta) avvisi.push("Quantità di DDT da completare");
  if (ricevuta > Number(r.quantity) + 0.0001) avvisi.push("Consegnato oltre l'ordinato");
  if (qFatturata !== null && qFatturata > ricevuta + 0.0001)
    avvisi.push("Quantità fatturata oltre il ricevuto");
  if (
    prezzo !== null &&
    righe.some((x) => {
      const p = numero(x.r.prezzo_unitario);
      return p !== null && Math.abs(p - prezzo) > 0.01;
    })
  )
    avvisi.push("Prezzo fatturato diverso dall'ordine: verifica sconti e accordi");
  if (ricevuta > 0 && righe.length === 0) avvisi.push("Ricevuto: righe di fattura da collegare");
  if (fatturato === null) avvisi.push("Importo di fattura da completare");
  return {
    ordinata: Number(r.quantity),
    ricevuta,
    ricevutaCompleta,
    qFatturata,
    impegnato,
    maturato,
    fatturato,
    daFatturare: maturato === null || fatturato === null ? null : cent(Math.max(0, maturato - fatturato)),
    fatture: [...new Set(righe.map((x) => x.f.id))],
    bolle: [...new Set(bolle.map((b) => b.ddt_ricezione_id))],
    avvisi,
  };
}
