/**
 * Il giro che collega da sole le fatture dei subappaltatori (area D, 15/11/2026).
 *
 * Ogni 15 minuti, per le sole aziende con l'interruttore del collegamento automatico acceso
 * (company_governance_settings.collegamento_automatico, docs/automazioni-acquisti.md §3):
 * 1. prende le fatture ricevute degli ultimi GIORNI giorni non ancora collegate, del cui
 *    cedente esiste un contratto di subappalto (stessa P.IVA, `chiaveFiscale`);
 * 2. salta quelle su cui c'è già una riga nella traccia (una persona ha deciso, o il giro le ha
 *    già passate): una regola non contraddice una persona;
 * 3. le controlla col motore `decidiGiro` (nessuna AI, nessun servizio esterno);
 * 4. collega solo le «unico e verificato», con subappalto_collega_fattura(…, 'automatico'), che
 *    ricontrolla interruttore, P.IVA, azienda e SAL e scrive la traccia. Le altre restano
 *    proposte nella scheda della fattura, all'utente.
 *
 * Un tetto di TETTO fatture per giro (la CPU del worker è il limite vero), le più recenti prima.
 * Rilanciato, non fa niente di nuovo: la funzione SQL è idempotente e le fatture collegate
 * escono dalla lista.
 */
import {
  decidiGiro, proveTraccia, testoFattura,
  type ContrattoCtrl, type FatturaCtrl, type SalCtrl,
} from "../../../shared/subappalti/controlloFattura.ts";
import { chiaveFiscale } from "../../../shared/acquisti/normalizza.ts";
import { registraEsitoLavoroAi } from "../_shared/esitoLavoroAi.ts";

export const TETTO = 40;
export const GIORNI = 120;
const COLONNE_FATTURA = "id, company_id, cedente_piva, numero_fattura, data_fattura, tipo_documento, imponibile_totale, totale_documento, stato, contratto_subappalto_id, sal_subappaltatore_id, righe, note, created_at";

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };
type RigaFattura = Omit<FatturaCtrl, "testo"> & { righe?: unknown; note?: string | null; created_at?: string };

export interface EsitoGiro {
  aziende: number;
  controllate: number;
  collegate: number;
  /** L'interruttore si è spento fra la lettura e la scrittura: la funzione ha registrato la proposta. */
  proposte: number;
  lasciate: Record<string, number>;
  errori: string[];
}

function soglia(oggi: Date): string {
  return new Date(oggi.getTime() - GIORNI * 86_400_000).toISOString();
}

export async function giroSubappalti(db: Db, opz: { oggi?: Date; tetto?: number } = {}): Promise<EsitoGiro> {
  const esito: EsitoGiro = { aziende: 0, controllate: 0, collegate: 0, proposte: 0, lasciate: {}, errori: [] };
  let budget = opz.tetto ?? TETTO;

  const { data: accese, error: eAz } = await db.from("company_governance_settings").select("company_id").eq("collegamento_automatico", true);
  if (eAz) { esito.errori.push(`aziende: ${eAz.message}`); return esito; }

  for (const { company_id: azienda } of (accese ?? []) as Array<{ company_id: string }>) {
    if (budget <= 0) break;
    esito.aziende++;
    try {
      const { data: righeContratti, error: eC } = await db.from("contratti_subappalto")
        .select("id, company_id, numero_contratto, importo_contrattuale, oneri_sicurezza, acconto_importo, stato, subappaltatore_id")
        .eq("company_id", azienda);
      if (eC) throw new Error(`contratti: ${eC.message}`);
      const grezzi = (righeContratti ?? []) as Array<ContrattoCtrl & { subappaltatore_id: string }>;
      if (!grezzi.length) continue;
      const { data: ditte, error: eD } = await db.from("subappaltatori_sicurezza").select("id, piva")
        .eq("company_id", azienda).in("id", [...new Set(grezzi.map((c) => c.subappaltatore_id))]);
      if (eD) throw new Error(`subappaltatori: ${eD.message}`);
      const pivaDi = new Map(((ditte ?? []) as Array<{ id: string; piva: string | null }>).map((d) => [d.id, d.piva]));
      const contratti: ContrattoCtrl[] = grezzi.map(({ subappaltatore_id, ...c }) => ({ ...c, piva: pivaDi.get(subappaltatore_id) ?? null }));
      const pive = new Set(contratti.map((c) => chiaveFiscale(c.piva)).filter(Boolean));
      if (!pive.size) continue;

      // Le fatture libere recenti dei subappaltatori, le più nuove prima.
      const { data: righeLibere, error: eF } = await db.from("fatture_ricevute").select(COLONNE_FATTURA)
        .eq("company_id", azienda).is("contratto_subappalto_id", null).or("stato.is.null,stato.neq.rifiutata")
        .gte("created_at", soglia(opz.oggi ?? new Date())).order("created_at", { ascending: false }).limit(1000);
      if (eF) throw new Error(`fatture: ${eF.message}`);
      let libere = ((righeLibere ?? []) as RigaFattura[]).filter((f) => pive.has(chiaveFiscale(f.cedente_piva)));
      if (!libere.length) continue;

      // Già nella traccia (decise da una persona o già passate): non si ripassano.
      const { data: tracciate, error: eT } = await db.from("acquisti_collegamenti").select("da_id")
        .eq("company_id", azienda).eq("da_tipo", "fattura_ricevuta").in("a_tipo", ["contratto", "sal"]).in("da_id", libere.map((f) => f.id));
      if (eT) throw new Error(`traccia: ${eT.message}`);
      const viste = new Set(((tracciate ?? []) as Array<{ da_id: string }>).map((t) => t.da_id));
      libere = libere.filter((f) => !viste.has(f.id)).slice(0, budget);
      if (!libere.length) continue;
      budget -= libere.length;
      esito.controllate += libere.length;

      const ids = contratti.map((c) => c.id);
      const [s, a] = await Promise.all([
        db.from("sal_subappaltatori").select("id, company_id, contratto_id, numero_sal, importo_lordo, oneri_quota, ritenuta_importo, acconto_recuperato, importo_netto, stato, data_emissione")
          .eq("company_id", azienda).in("contratto_id", ids),
        db.from("fatture_ricevute").select(COLONNE_FATTURA).eq("company_id", azienda).in("contratto_subappalto_id", ids).limit(5000),
      ]);
      if (s.error) throw new Error(`SAL: ${s.error.message}`);
      if (a.error) throw new Error(`fatture collegate: ${a.error.message}`);
      const aCtrl = (f: RigaFattura): FatturaCtrl => ({ ...f, testo: testoFattura(f) });

      const { automatiche, altre } = decidiGiro(libere.map(aCtrl), {
        contratti, sal: (s.data ?? []) as SalCtrl[], altreFatture: ((a.data ?? []) as RigaFattura[]).map(aCtrl),
      });
      for (const [k, n] of Object.entries(altre)) if (n) esito.lasciate[k] = (esito.lasciate[k] ?? 0) + n;

      for (const { fattura, risultato } of automatiche) {
        const { data, error } = await db.rpc("subappalto_collega_fattura", {
          p_fattura: fattura.id, p_contratto: risultato.contrattoId, p_sal: risultato.salId,
          p_esito: "automatico", p_regola: "subappalto_controllo_fattura", p_prove: proveTraccia(risultato),
        });
        if (error) { esito.errori.push(`${fattura.id}: ${error.message}`); continue; }
        if ((data as { esito?: string } | null)?.esito === "proposta") { esito.proposte++; continue; }
        esito.collegate++;
        await registraEsitoLavoroAi(db, { companyId: azienda, flusso: "subappalto_fattura_contratto", chiave: fattura.id, esito: "senza_ai", motivo: risultato.regola });
      }
    } catch (e) {
      esito.errori.push(`${azienda}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return esito;
}
