/**
 * Lo stato dell'IVA dell'anno per la Contabilità generale: impostazioni, acquisti senza data di
 * ricezione, documenti col solo totale (23/11/2026). Vedi `lib/contabilita/controlloIva.ts`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DocumentoSenzaImporti } from "@/lib/contabilita/controlloIva";

// La vista fatture_vendite_iva e le colonne nuove non sono tutte nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface StatoControlloIva {
  impostazioniCompilate: boolean;
  /** La periodicità delle Impostazioni IVA dell'anno: quella della LIPE e dei giroconti. */
  periodicita: "mensile" | "trimestrale" | null;
  /** Acquisti dell'anno senza data di ricezione SDI né data dichiarata: la LIPE si ferma. */
  acquistiSenzaRicezione: number;
  /** Documenti dell'anno col solo totale: né la contabilità né la LIPE ne conoscono l'IVA. */
  senzaImporti: DocumentoSenzaImporti[];
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
      const [impostazioni, ricezione, emesse, ricevute] = await Promise.all([
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
      ]);
      if (impostazioni.error) throw impostazioni.error;
      if (ricezione.error) throw ricezione.error;
      return {
        impostazioniCompilate: !!impostazioni.data,
        // Come la LIPE: «mensile» è mensile, ogni altra periodicità (anche la trimestrale speciale) è a trimestri.
        periodicita: !impostazioni.data?.periodicita ? null : impostazioni.data.periodicita === "mensile" ? "mensile" : "trimestrale",
        acquistiSenzaRicezione: ricezione.count ?? 0,
        senzaImporti: [
          ...(emesse as Array<{ data_emissione: string }>).map((r) => ({ data: r.data_emissione, lato: "emesse" as const })),
          ...(ricevute as Array<{ data_fattura: string }>).map((r) => ({ data: r.data_fattura, lato: "ricevute" as const })),
        ],
      };
    },
  });
}
