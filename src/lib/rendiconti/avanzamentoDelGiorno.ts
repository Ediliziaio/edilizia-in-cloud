/**
 * L'avanzamento del giorno (lotto 4 del modello, 28/11/2026).
 *
 * Un documento del giorno — il rendiconto al committente, il rapportino di cantiere — dice anche
 * quanto si è fatto delle lavorazioni del computo. Ogni documento scrive UN movimento per
 * lavorazione: risalvare lo stesso giorno sostituisce, mettere zero cancella, e giorni diversi si
 * sommano. Il conto lo tiene il registro (`avanzamento_movimenti`), non questa pagina.
 *
 * Le due funzioni del database non sono nei tipi generati (si rigenerano a parte): gli accessi non
 * tipizzati stanno qui, in un punto solo.
 */
import { supabase } from "@/integrations/supabase/client";

export type ModoAvanzamento = "quantita" | "percentuale";
export type OrigineAvanzamento = "rendiconto" | "rapportino" | "ufficio" | "campo";

/** Una lavorazione nella griglia: com'è a contratto, quanto è fatto, quanto dichiara questo giorno. */
export interface LavorazioneDelGiorno {
  fase_id: string;
  fase: string;
  sottofase_id: string;
  lavorazione: string;
  modo: ModoAvanzamento;
  unita: string | null;
  quantita_contratto: number | null;
  quantita_fatta: number | null;
  percentuale: number;
  a_movimenti: boolean;
  /** Quello che QUESTO documento ha già dichiarato: null se non ha ancora detto niente. */
  quantita_del_giorno: number | null;
  percentuale_del_giorno: number | null;
  /** La voce del computo di questa lavorazione: è quella che le righe a prezzo citano. */
  voce_computo_id: string | null;
}

export interface RigaDelGiorno {
  sottofase_id: string;
  quantita?: number | null;
  percentuale?: number | null;
}

export interface EsitoAvanzamento {
  scritti: number;
  togliti: number;
  fermi: number;
  aperte: number;
  motivi: Array<{ sottofase: string | null; motivo: string }>;
  spostate_dall_apertura: Array<{ sottofase: string; prima: unknown; dopo: unknown }>;
}

const cliente = supabase as unknown as {
  rpc: (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const numero = (x: unknown): number | null => (x == null ? null : Number(x));

export async function leggiLavorazioniDelGiorno(
  orderId: string,
  origine: OrigineAvanzamento,
  documentoId: string | null,
): Promise<LavorazioneDelGiorno[]> {
  const { data, error } = await cliente.rpc("rendiconto_lavorazioni_del_giorno", {
    p_order: orderId, p_origine: origine, p_documento: documentoId,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((x) => ({
    fase_id: String(x.fase_id),
    fase: String(x.fase ?? ""),
    sottofase_id: String(x.sottofase_id),
    lavorazione: String(x.lavorazione ?? ""),
    modo: (x.modo as ModoAvanzamento) ?? "percentuale",
    unita: (x.unita as string | null) ?? null,
    quantita_contratto: numero(x.quantita_contratto),
    quantita_fatta: numero(x.quantita_fatta),
    percentuale: Number(x.percentuale ?? 0),
    a_movimenti: x.a_movimenti === true,
    quantita_del_giorno: numero(x.quantita_del_giorno),
    percentuale_del_giorno: numero(x.percentuale_del_giorno),
    voce_computo_id: (x.voce_computo_id as string | null) ?? null,
  }));
}

export async function salvaAvanzamentoDelGiorno(p: {
  orderId: string;
  data: string;
  origine: OrigineAvanzamento;
  documentoId: string;
  righe: RigaDelGiorno[];
}): Promise<EsitoAvanzamento> {
  const { data, error } = await cliente.rpc("avanzamento_del_giorno_salva", {
    p_order: p.orderId, p_data: p.data, p_origine: p.origine, p_documento: p.documentoId,
    p_righe: p.righe.map((r) => ({
      sottofase_id: r.sottofase_id,
      ...(r.quantita == null ? {} : { quantita: r.quantita }),
      ...(r.percentuale == null ? {} : { percentuale: r.percentuale }),
    })),
  });
  if (error) throw error;
  return data as EsitoAvanzamento;
}

/** Quanto dice la lavorazione nel modo in cui si misura: il numero che va nel campo della griglia. */
export function valoreDelGiorno(l: LavorazioneDelGiorno): number | null {
  return l.modo === "quantita" ? l.quantita_del_giorno : l.percentuale_del_giorno;
}

/**
 * Quanto risulterebbe fatto, a oggi, se il giorno dichiarasse `valore`.
 *
 * A quantità è una somma col tetto alla quantità di contratto (lo stesso conto del registro);
 * a percentuale vince la più alta fra quella di adesso e quella dichiarata, perché la percentuale
 * di una lavorazione non torna indietro da sé — per farla scendere serve una rettifica dell'ufficio.
 */
export function anteprimaAOggi(l: LavorazioneDelGiorno, valore: number | null): { quantita: number | null; percentuale: number } {
  const v = valore ?? 0;
  if (l.modo === "quantita") {
    const base = l.quantita_contratto ?? 0;
    const giaDichiarato = l.quantita_del_giorno ?? 0;
    const altri = Math.max(0, (l.quantita_fatta ?? 0) - giaDichiarato);
    const totale = base > 0 ? Math.min(altri + v, base) : altri + v;
    const pct = base > 0
      ? (totale <= 0 ? 0 : totale >= base ? 100 : Math.max(1, Math.min(99, Math.round((100 * totale) / base))))
      : 0;
    return { quantita: Number(totale.toFixed(3)), percentuale: pct };
  }
  const giaDichiarata = l.percentuale_del_giorno ?? 0;
  const altre = l.percentuale === giaDichiarata ? 0 : l.percentuale;
  return { quantita: null, percentuale: Math.max(0, Math.min(100, Math.max(altre, Math.round(v)))) };
}

/** Le righe da mandare al database: solo quelle toccate, con il numero nel modo giusto. */
export function righeDaSalvare(
  lavorazioni: LavorazioneDelGiorno[],
  scritte: Record<string, number | null>,
): RigaDelGiorno[] {
  const out: RigaDelGiorno[] = [];
  for (const l of lavorazioni) {
    if (!Object.hasOwn(scritte, l.sottofase_id)) continue;
    const v = scritte[l.sottofase_id];
    const prima = valoreDelGiorno(l);
    if ((v ?? 0) === (prima ?? 0)) continue;
    out.push(l.modo === "quantita"
      ? { sottofase_id: l.sottofase_id, quantita: v ?? 0 }
      : { sottofase_id: l.sottofase_id, percentuale: v ?? 0 });
  }
  return out;
}
