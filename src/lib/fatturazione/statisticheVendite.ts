import { chiaveClienteVendite, documentoNelRegistro, isNotaCredito, isTipoVendita, nomeIntestatario, type RigaVendite } from "./registroVendite";

const arrotonda = (v: number) => Math.round(v * 100) / 100;
export function fatturatoPeriodo(docs: readonly RigaVendite[], inizio: string, fineEsclusa: string) {
  const emesse = docs.filter(d => documentoNelRegistro(d) && d.data_emissione >= inizio && d.data_emissione < fineEsclusa);
  return {
    imponibile: arrotonda(emesse.reduce((s, d) => s + d.imponibile_totale, 0)),
    fatture: emesse.filter(d => !isNotaCredito(d.tipo)).length,
  };
}
export function conteggiPreparazione(docs: readonly RigaVendite[]) {
  return {
    bozze: docs.filter(d => d.origine === "nativa" && d.stato === "bozza" && isTipoVendita(d.tipo) && !isNotaCredito(d.tipo)).length,
    proforma: docs.filter(d => d.origine === "nativa" && d.tipo === "proforma" && ["bozza", "inviata"].includes(d.stato)).length,
  };
}
export function classificaClienti(docs: readonly RigaVendite[], residuiNativi: ReadonlyMap<string, number>, inizio: string, fineEsclusa: string, limit: number) {
  const map = new Map<string, { id: string; nome: string; fatturato: number; daIncassare: number; incassiImportatiDaVerificare: boolean; anagraficaId?: string }>();
  for (const d of docs) {
    if (!documentoNelRegistro(d) || d.data_emissione < inizio || d.data_emissione >= fineEsclusa) continue;
    const key = chiaveClienteVendite(d);
    const entry = map.get(key) ?? { id: d.anagrafica_id || key, nome: nomeIntestatario(d.cliente_snapshot), fatturato: 0, daIncassare: 0, incassiImportatiDaVerificare: false };
    if (d.anagrafica_id) entry.anagraficaId = d.anagrafica_id;
    if (d.origine === "importata" && !isNotaCredito(d.tipo)) entry.incassiImportatiDaVerificare = true;
    entry.fatturato += d.imponibile_totale;
    // Il residuo è lordo e deriva dai pagamenti reali. Lo storico XML senza incassi non è automaticamente insoluto.
    if (d.origine === "nativa" && !isNotaCredito(d.tipo)) entry.daIncassare += Math.max(0, residuiNativi.get(d.id) ?? 0);
    map.set(key, entry);
  }
  return [...map.values()].map(e => ({ ...e, fatturato: arrotonda(e.fatturato), daIncassare: arrotonda(e.daIncassare) }))
    .sort((a, b) => b.fatturato - a.fatturato).slice(0, limit);
}
