import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import { abbinamentiCerti, type RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";
export interface CommessaProposta {
  id: string;
  order_code: string;
  indirizzo_lavori?: string | null;
  work_address?: string | null;
}
export interface OdaProposto {
  id: string;
  oda_number: string;
  supplier_id: string | null;
  order_id: string | null;
}
const normalizza = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-ZÀ-Ü0-9]+/g, " ")
    .trim();
const cita = (testo: unknown, codice: unknown) =>
  !!normalizza(codice) &&
  ` ${normalizza(testo)} `.includes(` ${normalizza(codice)} `);
export function proponiCollegamenti(
  documento: Record<string, unknown> | null,
  supplierId: string | null,
  commesse: CommessaProposta[],
  ordini: OdaProposto[],
) {
  const rif = (documento?.riferimenti ?? {}) as Record<string, unknown>;
  const luogo = (documento?.luogo_destinazione ?? {}) as Record<
    string,
    unknown
  >;
  const indirizzo = normalizza(luogo.indirizzo);
  const suggerite = commesse.flatMap((c) => {
    const codice = cita(rif.commessa, c.order_code);
    const sede = [c.indirizzo_lavori, c.work_address].some(
      (a) => indirizzo.length >= 12 && normalizza(a) === indirizzo,
    );
    return codice || sede
      ? [
          {
            ...c,
            motivo: codice
              ? "Codice commessa citato sul documento"
              : "Indirizzo di consegna corrispondente",
          },
        ]
      : [];
  });
  const oda = supplierId
    ? ordini
        .filter(
          (o) =>
            o.supplier_id === supplierId &&
            (!o.order_id || commesse.some((c) => c.id === o.order_id)),
        )
        .map((o) => ({
          ...o,
          riferimento: cita(rif.ordine_acquisto, o.oda_number),
          motivo: cita(rif.ordine_acquisto, o.oda_number)
            ? "Fornitore e riferimento dell’OdA corrispondenti"
            : "Stesso fornitore: verifica il contenuto dell’ordine",
        }))
        .sort((a, b) => Number(b.riferimento) - Number(a.riferimento))
        .slice(0, 5)
    : [];
  return { commesse: suggerite, oda };
}
export function unitaComparabile(a: string | null, b: string | null) {
  const unita = (v: string | null) => {
    const n = normalizza(v);
    if (["PZ", "PEZZO", "PEZZI", "CAD", "NR", "N"].includes(n)) return "PZ";
    if (["MQ", "M2"].includes(n)) return "M2";
    if (["MC", "M3"].includes(n)) return "M3";
    return n;
  };
  return !!unita(a) && unita(a) === unita(b);
}
/** Confronto cumulativo: due righe della bolla sullo stesso articolo non nascondono un eccesso. */
export function confrontaRighe(righe: DDTRigaNuova[], ordine: RigaOrdine[]) {
  const automatici = abbinamentiCerti(
    righe.map((r, i) => ({ ...r, id: String(i) })),
    ordine,
  );
  const proposte = righe.map((r, i) => {
    const id = r.purchase_order_item_id ?? automatici[String(i)];
    const o = ordine.find((x) => x.id === id);
    return {
      riga: r,
      ordine: o,
      propostaId: o?.id,
      confermata: !!r.purchase_order_item_id,
    };
  });
  return proposte.map((p) => {
    if (!p.ordine) return { ...p, esito: "Articolo non abbinato" };
    if (!unitaComparabile(p.riga.unita_misura, p.ordine.unit_of_measure))
      return {
        ...p,
        esito: "UM diversa o mancante: quantità non confrontabili",
      };
    if (p.riga.quantita == null)
      return { ...p, esito: "Quantità da verificare" };
    const consegna = proposte
      .filter(
        (x) =>
          x.ordine?.id === p.ordine!.id &&
          unitaComparabile(x.riga.unita_misura, p.ordine!.unit_of_measure),
      )
      .reduce((sum, x) => sum + (x.riga.quantita ?? 0), 0);
    const residuo = Math.max(
      0,
      Number(p.ordine.quantity) - Number(p.ordine.quantity_received ?? 0),
    );
    return {
      ...p,
      residuo,
      esito:
        consegna > residuo + 0.000001
          ? `Eccesso di ${Number((consegna - residuo).toFixed(6))} ${p.ordine.unit_of_measure ?? ""}`
          : consegna < residuo - 0.000001
            ? `Consegna parziale: restano ${Number((residuo - consegna).toFixed(6))}`
            : "Quantità coerente con il residuo",
    };
  });
}
