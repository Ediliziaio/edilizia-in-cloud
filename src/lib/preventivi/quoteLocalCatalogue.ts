import { supabase } from "@/integrations/supabase/client";
import { withHeavyDatabaseRead } from "@/lib/limitHeavyReads";
import { assessCatalogueMatch, catalogueQueries, catalogueUnit, rankCatalogueReferences } from "../../../supabase/functions/_shared/quoteCatalogue";
import { catalogueCodeVariants } from '../../../supabase/functions/_shared/quoteCatalogueCodes';
import { readIndicativeEstimate, type QuoteIndicativeEstimate } from './quoteCalculations';
import type { QuoteChatProposal, QuoteChatReference } from "../../../supabase/functions/_shared/quoteConversation";

export type LocalCatalogueRead = { references: QuoteChatReference[]; queries: Array<{ kind: "code" | "text"; text: string }>; missingCodes: string[] };
/** Range of actual compatible candidate rates, not a statistical market range.
 * Does not certify equivalence and never changes the quote's verified prices. */
export function catalogueIndicativeEstimate(row: QuoteChatProposal, references: QuoteChatReference[]): QuoteIndicativeEstimate | null {
  const candidates = [...new Map(references.filter(r => !assessCatalogueMatch(row, r).length).map(r => [r.id, r])).values()].slice(0, 6);
  if (!candidates.length || new Set(candidates.map(r => r.sourceId)).size !== 1) return null;
  const prices = candidates.map(r => r.price!);
  return readIndicativeEstimate({ low: Math.min(...prices), high: Math.max(...prices), unit: row.unit, origin: 'catalogue', sourceId: candidates[0].sourceId, codes: candidates.map(r => r.code), basis: `${candidates[0].sourceName}: ${candidates.map(r => r.code).join('; ')}`,
    assumptions: 'Intervallo dei soli candidati recuperati e compatibili con i controlli automatici, non quotazione di mercato o equivalenza tecnica certificata. Verificare specifiche, inclusioni/esclusioni e condizioni di cantiere. Nessun coefficiente o margine aggiunto.' });
}
/** Normal signed-in read-only RLS client. No service key, adoption, write or wildcard scan. */
export async function readLocalQuoteCatalogue(sourceId: string, codes: string[], targets: QuoteChatProposal[], signal: AbortSignal): Promise<LocalCatalogueRead> {
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(sourceId) || codes.length > 3 || codes.some(c => !/^[a-z]{2,}\d[\w.-]{6,159}$/i.test(c))) throw new Error("Fonte o codice non valido.");
  const terms = targets.slice(0, 3).map(p => {
    if (/rimozion|demolizion/i.test(p.title) && /serrament|finestr|infiss/i.test(p.title)) return "rimozione serramenti";
    if (/serrament|finestr|infiss/i.test(p.title)) return /pvc/i.test(p.title) ? "serramenti pvc" : "serramenti";
    if (/sanitari/i.test(p.title)) return /rimozion|demolizion/i.test(p.title) ? 'rimozione apparecchi sanitari' : /montaggio|collegament|posa/i.test(p.title) ? 'posa apparecchi sanitari' : 'apparecchi sanitari';
    return p.title;
  });
  const queries = codes.length ? codes.map(text => ({ kind: "code" as const, text })) : catalogueQueries(terms, targets).slice(0, 4);
  if (!queries.length) throw new Error("Indica un codice oppure una lavorazione da cercare.");
  const refs = new Map<string, QuoteChatReference>();
  for (let i = 0; i < queries.length; i += 2) {
    signal.throwIfAborted();
    await Promise.all(queries.slice(i, i + 2).map(async q => {
      // Prezzario tables aren't part of the generated application schema yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data, error } = await withHeavyDatabaseRead(async deadline => {
        let read = client.from("prezzario_voce").select("id,fonte_id,codice,descrizione,unita_misura,prezzo,fonte:prezzario_fonte!inner(stato,nome)").eq("fonte_id", sourceId).eq("fonte.stato", "pubblicato");
        // Filter before the bounded page: unrelated units must not crowd out
        // matching work. Exact-code reads still expose missing-unit defects.
        const unit = targets.length === 1 ? catalogueUnit(targets[0].unit) : '';
        const aliases: Record<string, string[]> = { m2: ['m²', 'm2', 'mq'], m3: ['m³', 'm3', 'mc'], m: ['m', 'ml'], cad: ['cad', 'cad.', 'pz', 'n', 'n.'], h: ['h', 'ora'], t: ['t', 'ton'], kg: ['kg'] };
        if (q.kind !== 'code' && aliases[unit]) read = read.in('unita_misura', aliases[unit]);
        if (q.kind === 'code') {
          const variants = catalogueCodeVariants(q.text);
          read = variants.length === 1 ? read.eq('codice', variants[0]) : read.in('codice', variants);
        } else read = read.textSearch("search", q.text, { config: "italian", type: "websearch" });
        return await read.order("codice").order("id").limit(q.kind === "code" ? 2 : 48).abortSignal(deadline);
      }, "Ricerca prezzario della chat", 8000, signal);
      if (error) throw new Error("Ricerca prezzario non riuscita: non equivale a codice assente.");
      for (const r of data ?? []) {
        if (typeof r.descrizione !== "string" || r.descrizione.length > 6000 || typeof r.codice !== "string" || r.fonte_id !== sourceId) continue;
        const amount = r.prezzo == null ? null : Number(r.prezzo);
        refs.set(r.id, { id: r.id, sourceId, code: r.codice, description: r.descrizione, unit: r.unita_misura ?? "", price: amount != null && Number.isFinite(amount) && amount > 0 && amount <= 1e6 ? amount : null, sourceName: r.fonte?.nome ?? "Fonte selezionata" });
      }
    }));
  }
  signal.throwIfAborted();
  const all = [...refs.values()];
  return { references: codes.length ? all : rankCatalogueReferences(all, targets).slice(0, 6), queries,
    missingCodes: codes.filter(code => !all.some(r => catalogueCodeVariants(code).includes(r.code))) };
}
