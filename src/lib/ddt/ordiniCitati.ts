import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import type { PurchaseOrder } from "@/hooks/usePurchaseOrders";
import { unitaComparabile } from "./proposteImportazione";
import type { RigaOrdine } from "./abbinaRigheOrdine";
import { abbinaOrdine, type OrdineNoto } from "../../../shared/acquisti/catena";
import { leggiRiferimentiFattura, ordiniNeiTesti } from "../../../shared/acquisti/riferimentiFattura";

const vuoto = leggiRiferimentiFattura("");
const codice = (v?: string | null) => (v ?? "").trim().toLowerCase();

export function riferimentoOrdineLetto(documento: Record<string, unknown> | null) {
  const valore = (documento?.riferimenti as Record<string, unknown> | undefined)?.ordine_acquisto;
  return (Array.isArray(valore) ? valore : [valore])
    .filter((v): v is string => typeof v === "string").join(", ");
}

function riferimentiEspliciti(valore: string) {
  return valore.split(/[,;\n]|\s+e\s+/i).flatMap(parte => {
    const testo = parte.trim();
    if (!testo) return [];
    const dichiarati = ordiniNeiTesti(vuoto, testo);
    return dichiarati.length ? dichiarati : ordiniNeiTesti(vuoto, `Ordine ${testo}`);
  });
}

type DatiOrdine = Pick<PurchaseOrder, "id" | "company_id" | "supplier_id" | "oda_number" | "supplier_reference" | "issue_date" | "status" | "order_id" | "delivery_warehouse_id">;

export function ordiniCitatiNellaBolla(
  companyId: string, fornitoreId: string | null, data: string, riferimenti: string,
  note: string, righe: DDTRigaNuova[], ordini: DatiOrdine[],
) {
  const inTestata = [...riferimentiEspliciti(riferimenti), ...ordiniNeiTesti(vuoto, note)];
  const perRiga = righe.map(r => ordiniNeiTesti(vuoto, [r.descrizione, r.testo_grezzo, r.note].filter(Boolean).join("\n")));
  const tutti = [...inTestata, ...perRiga.flat()];
  const catalogo: OrdineNoto[] = ordini.filter(o => o.issue_date <= data && ["inviato", "confermato", "parziale"].includes(o.status)).map(o => ({
    id: o.id, companyId: o.company_id, fornitoreId: o.supplier_id, numero: o.oda_number,
    riferimentoFornitore: o.supplier_reference, data: o.issue_date,
    commessaId: o.order_id, magazzinoId: o.delivery_warehouse_id,
  }));
  const chiave = (r: (typeof tutti)[number]) => `${r.testo.toLowerCase()}|${r.data ?? ""}`;
  const verifiche = new Map([...new Map(tutti.map(r => [chiave(r), r])).values()].map(r => {
    const esito = abbinaOrdine(r, { companyId, fornitoreId }, catalogo);
    return [chiave(r), { riferimento: r.testo, id: esito.esito === "automatico" ? esito.sceltoId : null }];
  }));
  const ids = [...new Set([...verifiche.values()].flatMap(v => v.id ? [v.id] : []))];
  return {
    citati: tutti.length > 0,
    ordini: catalogo.filter(o => ids.includes(o.id)),
    pendenti: [...verifiche.values()].filter(v => !v.id).map(v => v.riferimento),
    perRiga: perRiga.map(r => {
      const esiti = r.map(x => verifiche.get(chiave(x))?.id);
      if (esiti.some(id => !id)) return [];
      return r.length ? esiti.filter((id): id is string => !!id) : ids;
    }),
  };
}

export function abbinaRigheAgliOrdiniCitati(righe: DDTRigaNuova[], ordini: RigaOrdine[], perRiga: string[][]) {
  const scelte = righe.map((r, i) => {
    if (r.purchase_order_item_id || !codice(r.codice_articolo) || !(Number(r.quantita) > 0)) return null;
    const candidati = ordini.filter(o => o.purchase_order_id && perRiga[i]?.includes(o.purchase_order_id)
      && codice(r.codice_articolo) === codice(o.sku) && unitaComparabile(r.unita_misura, o.unit_of_measure)
      && Number(o.quantity) > Number(o.quantity_received ?? 0) && !o.su_misura);
    return candidati.length === 1 ? candidati[0] : null;
  });
  const somme = new Map<string, number>();
  scelte.forEach((o, i) => { if (o) somme.set(o.id, (somme.get(o.id) ?? 0) + Number(righe[i].quantita)); });
  return scelte.map(o => o && (somme.get(o.id) ?? 0) <= Number(o.quantity) - Number(o.quantity_received ?? 0) + 0.000001 ? o : null);
}
