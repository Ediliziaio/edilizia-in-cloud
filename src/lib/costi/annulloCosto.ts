/**
 * Annulla costo (16/11/2026, docs/piano-punti-aperti-20261116.md §3).
 *
 * Un costo si annulla, non si cancella: il database (costo_annulla) lo lascia nella tabella con
 * data, persona e motivo, porta l'importo a 0 (così esce da CdG, commesse e cassa) e tiene quello
 * vero in `annullato_dati.amount`. Qui le letture che servono alle schermate.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OstacoloAnnullo {
  codice: "banca" | "pagamento" | "pagato_senza_prima_nota" | "scadenza_pagata" | "rata_pagata" | "riba_in_corso" | string;
  testo: string;
  /** storna_pagamento: «Storna pagamento» lo toglie (riga di storno in prima nota); tesoreria: va scollegato il bonifico; a_mano: altro. */
  rimedio: "storna_pagamento" | "tesoreria" | "a_mano" | string;
  importo?: number;
}

export interface AnteprimaAnnullo {
  annullato: boolean;
  annullato_il: string | null;
  annullato_motivo: string | null;
  importo: number | null;
  ostacoli: OstacoloAnnullo[];
  scadenze_da_annullare: number;
  rate_da_annullare: number;
}

export interface CostoForseAnnullato {
  amount?: number | string | null;
  annullato_il?: string | null;
  annullato_motivo?: string | null;
  annullato_dati?: { amount?: number | string | null } | null;
}

export function costoAnnullato(c: CostoForseAnnullato | null | undefined): boolean {
  return !!c?.annullato_il;
}

/** L'importo vero di un costo annullato (prima dell'annullamento); per gli altri, l'importo. */
export function importoOriginale(c: CostoForseAnnullato): number {
  const v = costoAnnullato(c) ? c.annullato_dati?.amount : c.amount;
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Il motivo predefinito per una bolletta scartata o doppia. */
export function motivoBolletta(stato: string | null | undefined): string {
  return stato === "doppione_sospetto" ? "Bolletta doppia" : "Bolletta scartata: fattura rifiutata";
}

/** Si può annullare subito solo se non c'è nessun ostacolo. */
export function annullabile(a: Pick<AnteprimaAnnullo, "annullato" | "ostacoli"> | null | undefined): boolean {
  return !!a && !a.annullato && a.ostacoli.length === 0;
}

/** Il solo ostacolo è un pagamento in prima nota senza banca: «Storna pagamento» lo toglie da qui. */
export function stornoRisolve(a: Pick<AnteprimaAnnullo, "ostacoli"> | null | undefined): boolean {
  return !!a && a.ostacoli.length > 0 && a.ostacoli.every((o) => o.rimedio === "storna_pagamento");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function leggiAnteprimaAnnullo(costId: string): Promise<AnteprimaAnnullo> {
  const { data, error } = await db.rpc("costo_annullo_anteprima", { p_costo: costId });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<AnteprimaAnnullo>;
  return {
    annullato: !!d.annullato,
    annullato_il: d.annullato_il ?? null,
    annullato_motivo: d.annullato_motivo ?? null,
    importo: d.importo == null ? null : Number(d.importo),
    ostacoli: Array.isArray(d.ostacoli) ? d.ostacoli : [],
    scadenze_da_annullare: Number(d.scadenze_da_annullare ?? 0),
    rate_da_annullare: Number(d.rate_da_annullare ?? 0),
  };
}

export async function annullaCosto(costId: string, motivo: string) {
  const { data, error } = await db.rpc("costo_annulla", { p_costo: costId, p_motivo: motivo });
  if (error) throw new Error(error.message);
  return data as { scadenze_annullate: number; rate_annullate: number };
}

export async function ripristinaCosto(costId: string) {
  const { data, error } = await db.rpc("costo_ripristina", { p_costo: costId });
  if (error) throw new Error(error.message);
  return data as { scadenze_riaperte: number; rate_riaperte: number };
}

export async function stornaPagamentiCosto(costId: string) {
  const { error } = await db.rpc("storna_pagamenti_costo", { p_costo: costId });
  if (error) throw new Error(error.message);
}
