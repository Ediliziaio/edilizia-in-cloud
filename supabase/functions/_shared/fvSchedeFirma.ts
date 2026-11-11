import { selezionaSchedeProdottoFv } from "./fvDocumentiProdotto.ts";
/** The same authorised product sheets used by the FV app download, scoped to its company. */
// deno-lint-ignore no-explicit-any
export async function fvSchedeFirma(db: any, companyId: string, projectId: string): Promise<string[]> {
  const components = await db.from("fv_componenti_progetto").select("articolo_id").eq("progetto_id", projectId).order("ordinamento");
  if (components.error) throw new Error("Impossibile leggere i prodotti da allegare al preventivo.");
  const ids = [...new Set<string>((components.data ?? []).map((r: { articolo_id?: string }) => r.articolo_id).filter(Boolean))];
  if (!ids.length) return [];
  const [documents, articles] = await Promise.all([
    db.from("articoli_native_documenti").select("articolo_id,url,autorizzata").eq("company_id", companyId).in("articolo_id", ids)
      .order("ordine").order("created_at"),
    db.from("articoli_native").select("id,scheda_tecnica_url").eq("company_id", companyId).in("id", ids),
  ]);
  if (documents.error || articles.error) throw new Error("Impossibile leggere le schede autorizzate. Riprova prima di inviare per la firma.");
  return selezionaSchedeProdottoFv(ids, documents.data ?? [], articles.data ?? []).map(s => s.url);
}
