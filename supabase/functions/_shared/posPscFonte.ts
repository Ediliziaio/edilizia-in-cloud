import {
  normalizzaRiferimentoPsc,
  type RiferimentoPsc,
  stessaFontePsc,
} from "./posPsc.ts";
// The caller has already checked the authenticated actor, company and POS permissions.
// deno-lint-ignore no-explicit-any
export async function verificaFontePsc(
  db: any,
  companyId: string,
  orderId: string,
  valore: unknown,
): Promise<RiferimentoPsc> {
  const r = normalizzaRiferimentoPsc(valore);
  if (!r || r.company_id !== companyId || r.order_id !== orderId) {
    throw new Error("Il PSC di riferimento non appartiene a questa commessa.");
  }
  const colonne = r.archivio === "sicurezza_documenti"
    ? "id,company_id,order_id,titolo,file_name,file_path,data_documento,created_at"
    : "id,company_id,order_id,titolo,file_name,file_path,data_rilascio,revisione,created_at,stato";
  const { data, error } = await db.from(r.archivio).select(colonne).eq(
    "company_id",
    companyId,
  ).eq("order_id", orderId).eq("id", r.id).eq("tipo", "psc").is(
    "subappaltatore_id",
    null,
  ).maybeSingle();
  if (error) {
    throw new Error("Fonte PSC non verificabile: emissione non completata.");
  }
  if (!data || data.stato === "non_applicabile") {
    throw new Error("Originale PSC non più disponibile per questa commessa.");
  }
  const s = (k: string) => typeof data[k] === "string" ? data[k] : "";
  if (
    !stessaFontePsc(r, {
      archivio: r.archivio,
      id: s("id"),
      company_id: s("company_id"),
      order_id: s("order_id"),
      titolo: s("titolo"),
      file_name: s("file_name"),
      file_path: s("file_path"),
      data_documento: s(
        r.archivio === "sicurezza_documenti"
          ? "data_documento"
          : "data_rilascio",
      ),
      revisione: s("revisione"),
      created_at: s("created_at"),
    })
  ) {
    throw new Error(
      "La fonte PSC è cambiata: riesamina il riferimento prima di emettere.",
    );
  }
  return r;
}
