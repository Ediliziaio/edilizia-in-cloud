/**
 * Quello che serve al PDF dei preventivatori edili oltre al preventivo stesso (07/11/2026).
 *
 * Prima viveva dentro lo `StepPdf` di ogni modulo, uguale otto volte. Ora serve anche al PDF vero a destra
 * del wizard, che deve stampare esattamente quello che stampa «Scarica»: le stesse opzioni del computo e la
 * stessa azienda, lette una volta sola.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LivelloComputoPdf = "dettagliato" | "sintetico" | "corpo";

/** «Come mostrare il computo nel PDF»: una scelta per questo preventivo, non del modello. */
export interface OpzioniPdfComputo {
  livello: LivelloComputoPdf;
  mostraPrezzi: boolean;
  mostraQta: boolean;
  mostraSubtotali: boolean;
}

export const OPZIONI_PDF_DI_SERIE: OpzioniPdfComputo = {
  livello: "dettagliato", mostraPrezzi: true, mostraQta: true, mostraSubtotali: true,
};

/** Le colonne si scelgono solo nel computo dettagliato: sintetico e a corpo le hanno tutte. */
export function opzioniEffettive(o: OpzioniPdfComputo): OpzioniPdfComputo {
  const dettaglio = o.livello === "dettagliato";
  return {
    livello: o.livello,
    mostraPrezzi: dettaglio ? o.mostraPrezzi : true,
    mostraQta: dettaglio ? o.mostraQta : true,
    mostraSubtotali: dettaglio ? o.mostraSubtotali : true,
  };
}

/** L'azienda nell'intestazione e nei contatti del PDF: la stessa forma per gli otto moduli. */
export interface AziendaDelPdf {
  name?: string | null;
  ragione_sociale?: string | null;
  indirizzo?: string | null;
  telefono?: string | null;
  email?: string | null;
  partita_iva?: string | null;
  website?: string | null;
  logo_url?: string | null;
  colore_marca?: string | null;
  logo_chiaro_url?: string | null;
}

export const chiaveAziendaDelPdf = (companyId: string | null | undefined) => ["preventivo-pdf-azienda", companyId] as const;

export async function leggiAziendaDelPdf(companyId: string): Promise<AziendaDelPdf | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, website, logo_url, brand_primary_color, brand_logo_dark_url")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const indirizzo = [
    data.legal_address,
    [data.legal_postal_code, data.legal_city].filter(Boolean).join(" "),
    data.legal_province,
  ].filter(Boolean).join(", ");
  return {
    name: data.name,
    ragione_sociale: data.business_name ?? data.name,
    indirizzo: indirizzo || null,
    telefono: data.phone,
    email: data.email,
    partita_iva: data.vat_number,
    // `website` può non esistere su companies: cast difensivo.
    website: ((data as Record<string, unknown>).website as string | null) ?? null,
    logo_url: data.logo_url,
    // Il kit del marchio: il colore vale quando il modello è rimasto a quello di fabbrica, il logo chiaro va
    // sulla copertina scura (dal 22/09/2026).
    colore_marca: data.brand_primary_color ?? null,
    logo_chiaro_url: data.brand_logo_dark_url ?? null,
  };
}

/** Una lettura per azienda, condivisa fra il passo PDF e il PDF vero a destra (5 minuti di cache). */
export function useAziendaDelPdf(companyId: string | null | undefined) {
  return useQuery<AziendaDelPdf | null>({
    queryKey: chiaveAziendaDelPdf(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => leggiAziendaDelPdf(companyId!),
  });
}
