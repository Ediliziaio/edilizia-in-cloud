/** The same authorised product sheets used by the FV app download, scoped to its company. */
// deno-lint-ignore no-explicit-any
export async function fvSchedeFirma(db: any, companyId: string, projectId: string): Promise<string[]> {
  const components = await db.from("fv_componenti_progetto").select("articolo_id").eq("progetto_id", projectId).order("ordinamento");
  if (components.error) throw new Error("Impossibile leggere i prodotti da allegare al preventivo.");
  const ids = [...new Set<string>((components.data ?? []).map((r: { articolo_id?: string }) => r.articolo_id).filter(Boolean))];
  if (!ids.length) return [];
  const [documents, articles] = await Promise.all([
    db.from("articoli_native_documenti").select("articolo_id,url").eq("company_id", companyId).in("articolo_id", ids)
      .eq("autorizzata", true).order("ordine").order("created_at"),
    db.from("articoli_native").select("id,scheda_tecnica_url").eq("company_id", companyId).in("id", ids),
  ]);
  if (documents.error || articles.error) throw new Error("Impossibile leggere le schede autorizzate. Riprova prima di inviare per la firma.");
  const result: string[] = [];
  for (const id of ids) {
    for (const doc of documents.data ?? []) if (doc.articolo_id === id && doc.url && !result.includes(doc.url)) result.push(doc.url);
    const legacy = (articles.data ?? []).find((article: { id: string }) => article.id === id)?.scheda_tecnica_url;
    if (legacy && !result.includes(legacy)) result.push(legacy);
  }
  return result;
}
