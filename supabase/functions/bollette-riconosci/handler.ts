/**
 * Il giro che legge le bollette appena arrivate (area D, 15/11/2026).
 *
 * Ogni 15 minuti: le fatture ricevute con un POD o un PDR nell'XML e non ancora lette
 * (`bollette_da_leggere`, al massimo TETTO per giro, le più vecchie prima), lette con
 * `leggiBolletta` (nessuna AI, nessun servizio esterno) e registrate con `bolletta_registra`, che
 * decide utenza, doppioni, conguagli e costo (quest'ultimo sotto l'interruttore del collegamento
 * automatico). Una fattura senza utenze leggibili si registra «senza utenze» e non torna.
 */
import { leggiBolletta, sembraBolletta } from "../../../shared/bollette/lettura.ts";
import { registraEsitoLavoroAi } from "../_shared/esitoLavoroAi.ts";

export const TETTO = 30;

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

export interface EsitoGiroBollette {
  lette: number;
  riconosciute: number;
  doppioni: number;
  senzaUtenze: number;
  costi: Record<string, number>;
  errori: string[];
}

export async function giroBollette(db: Db, opz: { tetto?: number } = {}): Promise<EsitoGiroBollette> {
  const esito: EsitoGiroBollette = { lette: 0, riconosciute: 0, doppioni: 0, senzaUtenze: 0, costi: {}, errori: [] };
  const { data, error } = await db.rpc("bollette_da_leggere", { p_limite: opz.tetto ?? TETTO });
  if (error) { esito.errori.push(`elenco: ${error.message}`); return esito; }
  for (const f of (data ?? []) as Array<{ id: string; company_id: string; indice_corpo: number | null; xml_raw: string }>) {
    esito.lette++;
    let lettura: ReturnType<typeof leggiBolletta> | { utenze: [] };
    try {
      lettura = sembraBolletta(f.xml_raw) ? leggiBolletta(f.xml_raw, f.indice_corpo ?? 0) : { utenze: [] };
    } catch (e) {
      // Un XML che non si legge non deve fermare il giro: la fattura resta «senza utenze».
      esito.errori.push(`${f.id}: lettura ${e instanceof Error ? e.message : String(e)}`);
      lettura = { utenze: [] };
    }
    const r = await db.rpc("bolletta_registra", { p_fattura: f.id, p_lettura: lettura });
    if (r.error) { esito.errori.push(`${f.id}: ${r.error.message}`); continue; }
    const stato = (r.data as { stato?: string } | null)?.stato;
    if (stato === "riconosciuta") esito.riconosciute++;
    else if (stato === "doppione_sospetto") esito.doppioni++;
    else if (stato === "senza_utenze") esito.senzaUtenze++;
    const costo = (r.data as { costo?: { esito?: string } } | null)?.costo?.esito;
    if (costo) esito.costi[costo] = (esito.costi[costo] ?? 0) + 1;
    await registraEsitoLavoroAi(db, {
      companyId: f.company_id, flusso: "bolletta_lettura", chiave: f.id,
      esito: stato === "riconosciuta" ? "senza_ai" : "eccezione", motivo: stato ?? null,
    });
  }
  return esito;
}
