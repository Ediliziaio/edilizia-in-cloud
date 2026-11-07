import type { RfqSupplier } from "@/hooks/useSupplierRfqs";
export const TRASPORTO_LABELS: Record<string, string> = {
  da_confermare: "Da confermare",
  incluso: "Incluso",
  extra: "Extra",
  ritiro: "Ritiro a cura dell’impresa",
};
/** Totale documento = complessivo netto, già comprensivo del trasporto. Non sommarlo due volte. */
export function confrontoOfferta(
  f: Pick<
    RfqSupplier,
    | "status"
    | "totale_offerto"
    | "validita_offerta"
    | "trasporto_tipo"
    | "costo_trasporto"
  >,
  righe: { totale: number | null; righeCoperte: number; daRighe?: boolean },
  numeroVoci: number,
  oggi: string,
) {
  const scaduta = !!f.validita_offerta && f.validita_offerta < oggi;
  const trasportoNoto =
    ["incluso", "ritiro"].includes(f.trasporto_tipo ?? "") ||
    (f.trasporto_tipo === "extra" && f.costo_trasporto != null);
  const extra =
    f.trasporto_tipo === "extra" ? Number(f.costo_trasporto ?? 0) : 0;
  const totale =
    f.totale_offerto != null
      ? Number(f.totale_offerto)
      : righe.totale != null
        ? righe.totale + extra
        : null;
  const daRighe = righe.daRighe === false ? null : righe.totale;
  const coerente =
    f.totale_offerto == null ||
    daRighe == null ||
    Math.abs(Number(f.totale_offerto) - daRighe - extra) <= 0.02;
  const completa = numeroVoci > 0 && righe.righeCoperte === numeroVoci;
  return {
    totale,
    scaduta,
    trasportoNoto,
    coerente,
    completa,
    confrontabile:
      f.status === "risposta" &&
      completa &&
      !scaduta &&
      trasportoNoto &&
      coerente &&
      totale != null,
  };
}
