import { supabase } from '@/integrations/supabase/client';
import { QUOTE_LISTINO_SOURCES } from '../../../supabase/functions/_shared/quoteListinoSource';
import type { NativeComputoModule, NativeComputoRow } from './wizardAiDraft';

type ListinoClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Le righe che l'AI ha preso dal listino aziendale portano già prezzo e collegamento; i COSTI (materiali e manodopera)
 * servono al margine e li ha solo il listino. Si leggono al momento di applicare, con le regole di accesso dell'utente.
 * Se la lettura non riesce, le righe si applicano lo stesso (costi a zero = margine non noto): non si blocca il lavoro.
 * Una riga con costi già scritti nel wizard non si tocca.
 */
export async function enrichComputoRowsFromListino(
  module: NativeComputoModule, rows: NativeComputoRow[], client: ListinoClient = supabase as unknown as ListinoClient,
): Promise<NativeComputoRow[]> {
  const ids = [...new Set(rows.filter(r => r.listino_voce_id && !r.costo_materiali && !r.costo_manodopera).map(r => r.listino_voce_id as string))];
  if (!ids.length) return rows;
  try {
    const { data, error } = await client.from(QUOTE_LISTINO_SOURCES[module].table).select('id,costo_materiali,costo_manodopera').in('id', ids);
    if (error || !Array.isArray(data)) throw new Error(error?.message ?? 'risposta non valida');
    const costi = new Map<string, { m: number; l: number }>(data.map((v: { id: string; costo_materiali: unknown; costo_manodopera: unknown }) => [v.id, { m: Number(v.costo_materiali) || 0, l: Number(v.costo_manodopera) || 0 }]));
    return rows.map(r => {
      const c = r.listino_voce_id && !r.costo_materiali && !r.costo_manodopera ? costi.get(r.listino_voce_id) : undefined;
      return c ? { ...r, costo_materiali: c.m, costo_manodopera: c.l } : r;
    });
  } catch (e) {
    console.warn('[listino] costi non letti, righe applicate senza costi:', e instanceof Error ? e.message : e);
    return rows;
  }
}
