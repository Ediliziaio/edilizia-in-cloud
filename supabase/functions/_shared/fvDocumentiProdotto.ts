export type DocumentoProdottoFv = {
  articolo_id: string;
  url: string;
  nome?: string | null;
  autorizzata: boolean;
};
export type SchedaProdottoFv = { url: string; nome: string };

/** Una disattivazione esplicita prevale sul vecchio campo della stessa scheda. */
export function selezionaSchedeProdottoFv(
  articoloIds: readonly string[],
  documenti: readonly DocumentoProdottoFv[],
  articoli: readonly { id: string; scheda_tecnica_url: string | null }[],
): SchedaProdottoFv[] {
  const risultato: SchedaProdottoFv[] = [], viste = new Set<string>();
  const aggiungi = (url: string, nome: string) => {
    if (!url || viste.has(url)) return;
    viste.add(url);
    risultato.push({ url, nome });
  };
  for (const id of new Set(articoloIds)) {
    const docs = documenti.filter(d => d.articolo_id === id);
    for (const doc of docs) if (doc.autorizzata === true) aggiungi(doc.url, doc.nome || "Scheda tecnica");
    const legacy = articoli.find(a => a.id === id)?.scheda_tecnica_url;
    if (legacy && !docs.some(d => d.url === legacy)) aggiungi(legacy, "Scheda tecnica");
  }
  return risultato;
}
