/**
 * Commessa generale nei selettori di commessa (14/11/2026).
 *
 * Ogni movimento (rapportino, ordine al fornitore, DDT, fattura ricevuta, costo, magazzino) si
 * aggancia a una riga di `orders`: una commessa qualsiasi, una figlia di una commessa generale o
 * la generale stessa. I selettori però le mostravano tutte uguali, in un elenco piatto: chi
 * registrava una bolla del grande appalto non distingueva la generale dalle sue figlie, né
 * capiva a quale lavoro appartenesse una figlia. Qui le regole comuni per riconoscerle e metterle
 * in fila: la generale, subito sotto le sue figlie, poi il resto.
 */

/**
 * Colonne da chiedere a `orders` per riconoscere generale e figlie. Il nome della generale non
 * si prende con un embed: il client legge `orders` dalla vista `orders_visibili`, dove PostgREST
 * scambia la relazione per quella delle figlie e restituisce un elenco vuoto. Lo aggiunge
 * `conGenerali`, con una lettura sola per tutte le figlie dell'elenco.
 */
export const COLONNE_GERARCHIA = "workflow_kind, commessa_generale_id";

type NomeGenerale = { id: string; order_code: string | null; description: string | null };

/** Aggiunge a ogni figlia codice e nome della sua generale (dall'elenco stesso, o letti a parte). */
export async function conGenerali<T extends RigaGerarchia & { description?: string | null }>(
  righe: T[],
  leggi: (ids: string[]) => Promise<NomeGenerale[]>,
): Promise<T[]> {
  const noti = new Map<string, NomeGenerale>();
  for (const r of righe) if (eGenerale(r)) noti.set(r.id, { id: r.id, order_code: r.order_code ?? null, description: r.description ?? null });
  const mancanti = [...new Set(righe.map((r) => r.commessa_generale_id).filter((id): id is string => !!id && !noti.has(id)))];
  if (mancanti.length) for (const g of await leggi(mancanti)) noti.set(g.id, g);
  return righe.map((r) => {
    const g = r.commessa_generale_id ? noti.get(r.commessa_generale_id) : undefined;
    return g ? { ...r, generale: { order_code: g.order_code, description: g.description } } : r;
  });
}

export interface RigaGerarchia {
  id: string;
  order_code?: string | null;
  workflow_kind?: string | null;
  commessa_generale_id?: string | null;
  generale?: { order_code: string | null; description: string | null } | null;
}

export const eGenerale = (r: Pick<RigaGerarchia, "workflow_kind">) => r.workflow_kind === "generale";

/** «in O-0003 · Via Lotti 196» per una figlia; null per tutto il resto. */
export function appartenenza(r: RigaGerarchia): string | null {
  if (!r.commessa_generale_id) return null;
  const g = r.generale;
  const nome = g ? [g.order_code, g.description].filter(Boolean).join(" · ") : "";
  return nome ? `in ${nome}` : "in una commessa generale";
}

/**
 * Mette ogni figlia subito sotto la sua generale, se la generale è nell'elenco; il resto resta
 * nell'ordine in cui è arrivato. `annidata` dice se la riga va rientrata sotto la generale.
 */
export function raggruppaPerGenerale<T extends RigaGerarchia>(righe: T[]): Array<{ riga: T; annidata: boolean }> {
  const generali = new Set(righe.filter(eGenerale).map((r) => r.id));
  const figlie = new Map<string, T[]>();
  for (const r of righe) {
    if (r.commessa_generale_id && generali.has(r.commessa_generale_id)) {
      const elenco = figlie.get(r.commessa_generale_id) ?? [];
      elenco.push(r);
      figlie.set(r.commessa_generale_id, elenco);
    }
  }
  const fuori: Array<{ riga: T; annidata: boolean }> = [];
  for (const r of righe) {
    if (r.commessa_generale_id && generali.has(r.commessa_generale_id)) continue;
    fuori.push({ riga: r, annidata: false });
    if (eGenerale(r)) {
      const sue = [...(figlie.get(r.id) ?? [])].sort((a, b) =>
        String(a.order_code ?? "").localeCompare(String(b.order_code ?? ""), "it", { numeric: true }),
      );
      for (const f of sue) fuori.push({ riga: f, annidata: true });
    }
  }
  return fuori;
}
