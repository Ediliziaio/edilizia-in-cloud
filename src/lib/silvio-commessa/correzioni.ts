/**
 * Il registro delle correzioni di Silvio (31/10/2026, fase 0, lotto 0.3).
 * Tabella `silvio_correzioni` (migrazione 20281106090000): per ogni valore che Silvio
 * ha proposto nel popup, quello che la persona ha tenuto. Vedi
 * docs/piano-silvio-commessa-ai.md, sezioni 4 e 6.
 *
 * `correzioniDalPiano` confronta la bozza com'era uscita dalle fonti con quella che la
 * persona conferma; `registraCorrezioni` le scrive. La tabella è a sola aggiunta: chi
 * scrive è sempre l'utente collegato (lo mette il database).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Area, Fonte, PianoCommessa, TipoFonte } from "../../../shared/silvio-commessa/piano.ts";
import { stessoValore } from "../../../shared/silvio-commessa/fondi.ts";

export interface Correzione {
  companyId: string;
  /** La commessa, se c'è già; altrimenti la bozza. Almeno uno dei due. */
  orderId?: string | null;
  bozzaId?: string | null;
  area: Area;
  chiave: string;
  proposto: unknown;
  /** null = tolto. */
  tenuto: unknown;
  fonte: Fonte | null;
}

/** Riga per l'insert, nei nomi delle colonne. */
export function rigaCorrezione(c: Correzione) {
  if (!c.orderId && !c.bozzaId) throw new Error("Una correzione va legata a una commessa o a una bozza");
  return {
    company_id: c.companyId,
    order_id: c.orderId ?? null,
    bozza_id: c.bozzaId ?? null,
    area: c.area,
    chiave: c.chiave,
    valore_proposto: c.proposto ?? null,
    valore_tenuto: c.tenuto ?? null,
    fonte_tipo: (c.fonte?.tipo ?? null) as TipoFonte | null,
    fonte: c.fonte ?? null,
  };
}

/**
 * Le correzioni fra la proposta di Silvio e quello che la persona conferma: una riga per
 * ogni valore proposto (non scritto da una persona), anche quando è stato tenuto così —
 * serve a misurare la quota tenuta. I valori che la persona ha aggiunto da sé non
 * c'erano nella proposta: non sono correzioni di Silvio.
 */
export function correzioniDalPiano(
  proposto: PianoCommessa,
  tenuto: PianoCommessa,
  legame: { orderId?: string | null; bozzaId?: string | null },
): Correzione[] {
  const out: Correzione[] = [];
  for (const [nomeArea, valori] of Object.entries(proposto.aree)) {
    const area = nomeArea as Area;
    for (const [chiave, v] of Object.entries(valori ?? {})) {
      if (v.fonte.tipo === "persona") continue;
      const finale = tenuto.aree[area]?.[chiave];
      const valoreTenuto = finale ? finale.valore : null;
      out.push({
        companyId: proposto.companyId,
        orderId: legame.orderId ?? null,
        bozzaId: legame.bozzaId ?? null,
        area,
        chiave,
        proposto: v.valore,
        // Se dice la stessa cosa (a meno di centesimi e spazi) si registra il proposto:
        // così il database lo conta come tenuto così.
        tenuto: stessoValore(v.valore, valoreTenuto) ? v.valore : valoreTenuto,
        fonte: v.fonte,
      });
    }
  }
  return out;
}

/** Scrive le correzioni. Lancia l'errore del database: una correzione persa è una misura falsa. */
export async function registraCorrezioni(correzioni: Correzione[]): Promise<void> {
  if (correzioni.length === 0) return;
  const { error } = await supabase.from("silvio_correzioni" as never).insert(correzioni.map(rigaCorrezione) as never);
  if (error) throw error;
}
