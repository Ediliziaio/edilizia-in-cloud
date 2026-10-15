type Prodotto = { id: string; nome: string; custom_field_values?: unknown };
const chiave = (v: unknown) => String(v ?? '').trim().toLowerCase();
export function indiceProdottiImport(prodotti: Prodotto[]) {
  const nomi = new Map<string, Set<string>>();
  const codici = new Map<string, Set<string>>();
  const codiciPerId = new Map<string, string>();
  const aggiungi = (mappa: Map<string, Set<string>>, k: string, id: string) => {
    if (!k) return;
    const ids = mappa.get(k) ?? new Set<string>(); ids.add(id); mappa.set(k,ids);
  };
  for (const p of prodotti) {
    const cf = (p.custom_field_values ?? {}) as Record<string, unknown>;
    const codice = chiave(cf.catalog_import_sku ?? cf.palma_source_sku);
    aggiungi(nomi,chiave(p.nome),p.id);
    aggiungi(codici,codice,p.id);
    if (codice) codiciPerId.set(p.id,codice);
  }
  return (nome: string, codice?: string | null): { id: string | null; ambiguo: boolean } => {
    const sku = chiave(codice);
    const ids = (sku && codici.get(sku)) || nomi.get(chiave(nome));
    if (!ids?.size) return { id:null, ambiguo:false };
    if (ids.size !== 1) return { id:null, ambiguo:true };
    const id = [...ids][0];
    if (sku && codiciPerId.has(id) && codiciPerId.get(id) !== sku) return {id:null,ambiguo:true};
    return { id, ambiguo:false };
  };
}
