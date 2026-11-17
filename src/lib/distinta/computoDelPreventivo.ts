/**
 * Il computo del preventivo da cui è nata la commessa (17/11/2026).
 *
 * Una commessa creata da un preventivo con computo ha già tutte le voci (misure, capitoli,
 * codici) nella bozza del computo (`computo_preventivo_drafts`). «Genera dal computo»
 * chiedeva lo stesso PDF un'altra volta: ora le prende da lì, e il file non serve.
 */
import { supabase } from "@/integrations/supabase/client";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import type { BozzaComputo } from "@/lib/computo/editorNativo";
import type { VoceImportata } from "@/lib/computo/importaVoci";

const SORGENTE = /^modulo:computo:([0-9a-f-]{36})$/i;

/** L'id della bozza del computo, se il preventivo viene dal preventivatore con computo. */
export function bozzaDaSorgente(source: string | null | undefined): string | null {
  return SORGENTE.exec(String(source ?? ""))?.[1] ?? null;
}

/** Le voci della bozza come le dà «Importa voci»: senza le opzionali, che non sono nel contratto. */
export function vociDaBozza(bozza: Pick<BozzaComputo, "voci">, origine: string): VoceImportata[] {
  return bozza.voci.filter((v) => !v.opzionale).map((v): VoceImportata => ({ ...v, avvisi: [] as string[], origine }));
}

export interface ComputoDelPreventivo { draftId: string; quoteNumber: string | null; titolo: string; voci: VoceImportata[] }

/** Il computo del preventivo della commessa, o null se la commessa non viene da un computo. */
export async function computoDelPreventivo(companyId: string, orderId: string): Promise<ComputoDelPreventivo | null> {
  const { data: ordine, error } = await supabase.from("orders").select("quote_id").eq("id", orderId).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  if (!ordine?.quote_id) return null;
  const { data: q, error: e2 } = await supabase.from("quotes").select("source, quote_number").eq("id", ordine.quote_id).maybeSingle();
  if (e2) throw e2;
  const draftId = bozzaDaSorgente(q?.source);
  if (!draftId) return null;
  const computo = await leggiComputoCloud(companyId, draftId);
  if (!computo) return null;
  const numero = q?.quote_number ?? null;
  const titolo = `Computo del preventivo${numero ? ` ${numero}` : ""}`;
  return { draftId, quoteNumber: numero, titolo, voci: vociDaBozza(computo.bozza, titolo) };
}
