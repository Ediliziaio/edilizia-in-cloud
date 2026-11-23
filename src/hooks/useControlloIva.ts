/**
 * Lo stato dell'IVA dell'anno per la Contabilità generale: impostazioni, acquisti senza data di
 * ricezione, documenti col solo totale (23/11/2026). Vedi `lib/contabilita/controlloIva.ts`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DocumentoSenzaImporti } from "@/lib/contabilita/controlloIva";
import type { DatiPercorsoIva, LipeConfermata } from "@/lib/contabilita/percorsoIva";

// La vista fatture_vendite_iva e le colonne nuove non sono tutte nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Lo stato dell'IVA dell'anno: impostazioni, acquisti senza data di ricezione SDI (la LIPE si ferma),
 * documenti col solo totale (né la contabilità né la LIPE ne conoscono l'IVA), LIPE confermate, quante
 * sono registrate in contabilità, F24 IVA. È quello che serve al percorso guidato.
 */
export interface StatoControlloIva extends DatiPercorsoIva {
  senzaImporti: DocumentoSenzaImporti[];
}

// Le LIPE che la contabilità registra: confermate, inviate o accolte (non le scartate).
const LIPE_VALIDE = new Set(["reviewed_commercialista", "submitted", "accepted_ade"]);

/** Le LIPE confermate dell'anno e quante hanno già il giroconto. Chi non può leggerle (non amministratore) ha null. */
async function leggiLipe(companyId: string, anno: number): Promise<{ lipe: LipeConfermata[] | null; registrate: number }> {
  const { data, error } = await db.rpc("liquidazioni_iva_anno", { p_company: companyId, p_anno: anno });
  if (error) return { lipe: null, registrate: 0 };
  const lipe = ((data ?? []) as Array<{ dal: string; al: string; stato: string; dati?: { versamento?: { stato?: string } } }>)
    .filter((l) => LIPE_VALIDE.has(l.stato))
    .map((l) => ({ dal: l.dal, al: l.al, daVersare: l.dati?.versamento?.stato === "da_versare" }));
  let registrate = 0;
  for (const l of lipe) {
    const { data: esito, error: e } = await db.rpc("contabilita_liquida_iva", { p_company: companyId, p_dal: l.dal, p_al: l.al, p_anteprima: true });
    if (!e && (esito as { gia_liquidato?: boolean } | null)?.gia_liquidato) registrate += 1;
  }
  return { lipe, registrate };
}

const PAGINA = 1000;

async function tutteLePagine(leggi: (da: number, a: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const righe: unknown[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await leggi(da, da + PAGINA - 1);
    if (error) throw error;
    righe.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) return righe;
  }
}

export function useControlloIva(companyId: string, anno: number) {
  return useQuery({
    queryKey: ["contabilita-generale", companyId, "controllo-iva", anno],
    queryFn: async (): Promise<StatoControlloIva> => {
      const dal = `${anno}-01-01`, al = `${anno}-12-31`;
      const [impostazioni, ricezione, emesse, ricevute, lipe, f24DaPagare, f24Pagati] = await Promise.all([
        db.from("fiscalita_impostazioni_iva").select("anno, periodicita").eq("company_id", companyId).eq("anno", anno).maybeSingle(),
        db.from("fatture_ricevute").select("id", { count: "exact", head: true }).eq("company_id", companyId)
          .gte("data_fattura", dal).lte("data_fattura", al).neq("stato", "rifiutata")
          .is("data_ricezione_sdi", null).is("ricezione_dichiarata_il", null),
        tutteLePagine((da, a) => db.from("fatture_vendite_iva").select("data_emissione").eq("company_id", companyId)
          .gte("data_emissione", dal).lte("data_emissione", al).is("deleted_at", null)
          .or("imponibile_totale.is.null,iva_totale.is.null").order("data_emissione").range(da, a)),
        tutteLePagine((da, a) => db.from("fatture_ricevute").select("data_fattura").eq("company_id", companyId)
          .gte("data_fattura", dal).lte("data_fattura", al).neq("stato", "rifiutata")
          .or("imponibile_totale.is.null,iva_totale.is.null").order("data_fattura").range(da, a)),
        leggiLipe(companyId, anno),
        // I tributi IVA: 6001-6012 mensili, 6031-6034 trimestrali, 6035 acconto.
        db.from("f24_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("anno", anno)
          .like("tributo_code", "60%").eq("stato", "da_pagare"),
        db.from("f24_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("anno", anno)
          .like("tributo_code", "60%").eq("stato", "pagato"),
      ]);
      if (impostazioni.error) throw impostazioni.error;
      if (ricezione.error) throw ricezione.error;
      return {
        impostazioniCompilate: !!impostazioni.data,
        // Come la LIPE: «mensile» è mensile, ogni altra periodicità (anche la trimestrale speciale) è a trimestri.
        periodicita: !impostazioni.data?.periodicita ? null : impostazioni.data.periodicita === "mensile" ? "mensile" : "trimestrale",
        acquistiSenzaRicezione: ricezione.count ?? 0,
        lipe: lipe.lipe,
        lipeRegistrate: lipe.registrate,
        f24Iva: f24DaPagare.error || f24Pagati.error ? null : { daPagare: f24DaPagare.count ?? 0, pagati: f24Pagati.count ?? 0 },
        senzaImporti: [
          ...(emesse as Array<{ data_emissione: string }>).map((r) => ({ data: r.data_emissione, lato: "emesse" as const })),
          ...(ricevute as Array<{ data_fattura: string }>).map((r) => ({ data: r.data_fattura, lato: "ricevute" as const })),
        ],
      };
    },
  });
}
