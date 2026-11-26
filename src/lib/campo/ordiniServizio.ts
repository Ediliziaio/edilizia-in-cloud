/**
 * Ordini di servizio e contestazioni alle ditte (26/11/2026, piano campo completo, punto 3.4): tipi, stati e foto.
 * Le foto stanno nel bucket della ditta, percorso «azienda/ditta/os-…»: lo stesso controllo dei documenti
 * (ognuno vede solo la sua ditta) le protegge.
 */
import { supabase } from "@/integrations/supabase/client";

export const BUCKET_DITTE = "subappaltatori-documenti";

export interface OrdineServizio {
  id: string; company_id: string; subappaltatore_id: string; order_id: string | null;
  tipo: "ordine" | "contestazione"; titolo: string; testo: string | null; foto: string[]; scadenza: string | null;
  stato: "inviato" | "letto" | "risolto" | "accettato" | "riaperto"; letto_il: string | null;
  risposta: string | null; foto_risposta: string[]; risolto_il: string | null; nota_chiusura: string | null; created_at: string;
}
export const COLONNE_OS = "id, company_id, subappaltatore_id, order_id, tipo, titolo, testo, foto, scadenza, stato, letto_il, risposta, foto_risposta, risolto_il, nota_chiusura, created_at";

export const STATI_OS: Record<OrdineServizio["stato"], { label: string; cls: string }> = {
  inviato: { label: "Da leggere", cls: "bg-amber-100 text-amber-900" },
  letto: { label: "Letto", cls: "bg-sky-100 text-sky-900" },
  risolto: { label: "Risolto dalla ditta", cls: "bg-emerald-100 text-emerald-800" },
  accettato: { label: "Chiuso", cls: "bg-slate-100 text-slate-700" },
  riaperto: { label: "Riaperto", cls: "bg-red-100 text-red-800" },
};

/** Carica le foto (al massimo 6) nella cartella della ditta e restituisce i percorsi. */
export async function caricaFotoOs(companyId: string, dittaId: string, files: File[]): Promise<string[]> {
  const percorsi: string[] = [];
  for (const f of files.slice(0, 6)) {
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${companyId}/${dittaId}/os-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_DITTE).upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
    percorsi.push(path);
  }
  return percorsi;
}

export async function linkFotoOs(percorsi: string[]): Promise<string[]> {
  if (!percorsi.length) return [];
  const { data } = await supabase.storage.from(BUCKET_DITTE).createSignedUrls(percorsi, 600);
  return (data ?? []).map(d => d.signedUrl).filter((u): u is string => !!u);
}
