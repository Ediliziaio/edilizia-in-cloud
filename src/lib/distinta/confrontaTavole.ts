import { normalizzaTesto, normalizzaUnita } from "./generaDistinta";
export interface ConteggioTavola {
  id: string; documento_id: string | null; documento_nome: string | null; pagina?: number | null;
  simbolo: string; descrizione_legenda: string | null; quantita: number; unita?: string | null;
  phase_id: string | null; locale: string | null; confermato: boolean; updated_at: string;
  dettaglio?: unknown; metodo?: string;
}
export interface GruppoTavola { chiave: string; documento: string; pagina: number; nome: string; unita: string; faseId: string | null; quantita: number; conteggi: ConteggioTavola[] }
export function unitaConfrontabile(value: string | null | undefined): string {
  const u = normalizzaUnita(value ?? ""); return u === "cad" ? "pz" : u;
}
/** Documenti e pagine diversi sono riscontri alternativi: non si sommano fra loro. */
export function raggruppaConteggiTavola(conteggi: ConteggioTavola[]): GruppoTavola[] {
  const gruppi = new Map<string, GruppoTavola>();
  for (const c of conteggi) {
    if (!c.confermato || !Number.isFinite(Number(c.quantita)) || Number(c.quantita) <= 0) continue;
    const nome = c.descrizione_legenda?.trim() || c.simbolo.trim(), unita = unitaConfrontabile(c.unita || "pz");
    if (!nome || /^A\$C[\dA-F]+$|^\*U\d+$/i.test(nome)) continue;
    const pagina = c.pagina || 1;
    const dettaglio = c.dettaglio && typeof c.dettaglio === "object" ? c.dettaglio as Record<string, unknown> : {};
    const chiave = JSON.stringify([c.documento_id || dettaglio._file_sha256 || c.documento_nome || "senza-documento", pagina, c.metodo || "", normalizzaTesto(nome), unita, c.phase_id]);
    const g = gruppi.get(chiave) ?? { chiave, documento: c.documento_nome || "Disegno CAD", pagina, nome, unita, faseId: c.phase_id, quantita: 0, conteggi: [] };
    // Un ID si conta una sola volta, anche se una risposta viene ripetuta.
    if (!g.conteggi.some(x => x.id === c.id)) { g.quantita += Number(c.quantita); g.conteggi.push(c); }
    gruppi.set(chiave, g);
  }
  return [...gruppi.values()].map(g => ({ ...g, quantita: Math.round(g.quantita * 10000) / 10000 }));
}
export function candidatiDaTavola<T extends { id: string; name?: string | null; specifiche?: string | null; unita_misura?: string | null; phase_id?: string | null }>(g: GruppoTavola, materiali: T[]): { materiale: T; esatto: boolean }[] {
  const nome = normalizzaTesto(g.nome);
  return materiali.filter(m => unitaConfrontabile(m.unita_misura) === g.unita && (!g.faseId || m.phase_id === g.faseId))
    .map(materiale => ({ materiale, esatto: [materiale.name, [materiale.name, materiale.specifiche].filter(Boolean).join(" ")].some(n => normalizzaTesto(n) === nome) }))
    .sort((a, b) => Number(b.esatto) - Number(a.esatto) || (a.materiale.name ?? "").localeCompare(b.materiale.name ?? "", "it"));
}
/** La fonte viene invalidata anche se il conteggio è eliminato, non più confermato o modificato. */
export function riscontriTavolaObsoleti(origini: unknown[] | null | undefined, conteggi: ConteggioTavola[]): boolean {
  return (origini ?? []).some(o => {
    if (!o || typeof o !== "object") return false;
    const fonte = o as { tipo?: string; ruolo?: string; conteggio_id?: string; conteggio_versione?: string };
    if (fonte.tipo !== "planimetria" || fonte.ruolo !== "riscontro_quantita") return false;
    const c = conteggi.find(c => c.id === fonte.conteggio_id);
    return !c || !c.confermato || c.updated_at !== fonte.conteggio_versione;
  });
}
