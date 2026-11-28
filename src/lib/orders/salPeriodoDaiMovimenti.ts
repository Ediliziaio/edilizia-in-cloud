/**
 * Quanto dicono i giorni, per il verbale SAL (lotto 5 del modello, 28/11/2026).
 *
 * `sal_quantita_del_periodo` (migrazione 20290630260000) somma i movimenti del registro: «a oggi»
 * fino alla data del verbale, «nel periodo» da quella del verbale precedente. Non è un numero da
 * ricopiare nel verbale — il verbale resta cumulativo e la percentuale la compila chi lo fa — è la
 * risposta alla domanda «questo mese che cosa abbiamo fatto, e chi l'ha dichiarato».
 *
 * Risponde solo per le lavorazioni che sono nel registro: dove nessun giorno ha ancora dichiarato
 * niente la mappa è vuota e il verbale resta quello di prima, senza righe in più.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PeriodoDaiMovimenti {
  sottofase_id: string;
  modo: "quantita" | "percentuale";
  unita: string | null;
  quantita_contratto: number | null;
  quantita_a_oggi: number | null;
  quantita_del_periodo: number | null;
  percentuale_a_oggi: number;
  giorni_del_periodo: number;
  origini: string[];
}

const cliente = supabase as unknown as {
  rpc: (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const numero = (x: unknown): number | null => (x == null ? null : Number(x));

export async function leggiPeriodoDaiMovimenti(
  orderId: string, dal: string | null, al: string | null,
): Promise<Map<string, PeriodoDaiMovimenti>> {
  const { data, error } = await cliente.rpc("sal_quantita_del_periodo", { p_order: orderId, p_dal: dal, p_al: al });
  if (error) throw error;
  const out = new Map<string, PeriodoDaiMovimenti>();
  for (const x of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(String(x.sottofase_id), {
      sottofase_id: String(x.sottofase_id),
      modo: (x.modo as "quantita" | "percentuale") ?? "quantita",
      unita: (x.unita as string | null) ?? null,
      quantita_contratto: numero(x.quantita_contratto),
      quantita_a_oggi: numero(x.quantita_a_oggi),
      quantita_del_periodo: numero(x.quantita_del_periodo),
      percentuale_a_oggi: Number(x.percentuale_a_oggi ?? 0),
      giorni_del_periodo: Number(x.giorni_del_periodo ?? 0),
      origini: ((x.origini as string[] | null) ?? []),
    });
  }
  return out;
}

const NOMI: Record<string, string> = {
  rendiconto: "rendiconti",
  rapportino: "rapportini",
  ufficio: "ufficio",
  campo: "cantiere",
  apertura: "saldo di apertura",
};

/**
 * «28 m² in 3 giorni, da rendiconti e rapportini»: la riga che il verbale mostra sotto la
 * lavorazione. Vuota quando il periodo non ha niente da raccontare, così non si aggiunge rumore.
 */
export function periodoInParole(
  p: PeriodoDaiMovimenti | undefined,
  tr: (chiave: string, valori?: Record<string, unknown>) => string,
): string {
  if (!p || p.giorni_del_periodo <= 0) return "";
  const quanto = p.modo === "quantita" && p.quantita_del_periodo != null
    ? `${p.quantita_del_periodo.toLocaleString("it-IT", { maximumFractionDigits: 3 })} ${p.unita ?? ""}`.trim()
    : "";
  const giorni = p.giorni_del_periodo === 1 ? tr("1 giorno") : tr("{n} giorni", { n: p.giorni_del_periodo });
  const da = p.origini.map((o) => tr(NOMI[o] ?? o)).join(", ");
  const parti = [quanto, giorni, da ? tr("da {dove}", { dove: da }) : ""].filter(Boolean);
  return tr("Nel periodo: {dettaglio}", { dettaglio: parti.join(" · ") });
}
