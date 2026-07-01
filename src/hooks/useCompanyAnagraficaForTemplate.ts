/**
 * useCompanyAnagraficaForTemplate — dati anagrafici dell'azienda (tabella
 * companies / Profilo azienda) usati come valori EREDITATI nei template
 * preventivo (Serramenti / Fotovoltaico / Ristrutturazione).
 *
 * Scopo: mostrare nell'editor del template, come placeholder, i dati del profilo
 * quando il campo del template è vuoto. Nel PDF il renderer fa lo stesso
 * fallback (template → profilo), quindi l'utente VEDE in anticipo cosa comparirà.
 *
 * Condiviso fra i 3 editor per garantire UX identica.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface TemplateCompanyAnagrafica {
  ragione_sociale: string | null;
  indirizzo_completo: string | null;
  telefono: string | null;
  email: string | null;
  partita_iva: string | null;
  pec: string | null;
  numero_rea: string | null;
  capitale_sociale: string | null;
  anno_fondazione: number | null;
}

export function useCompanyAnagraficaForTemplate(): TemplateCompanyAnagrafica | null {
  const companyId = useEffectiveCompanyId();
  const { data } = useQuery<TemplateCompanyAnagrafica | null>({
    queryKey: ["template-company-anagrafica", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: c } = await supabase
        .from("companies")
        .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, pec, numero_rea, capitale_sociale, anno_fondazione")
        .eq("id", companyId!)
        .maybeSingle();
      if (!c) return null;
      const indirizzo = [
        c.legal_address,
        [c.legal_postal_code, c.legal_city].filter(Boolean).join(" "),
        c.legal_province,
      ].filter(Boolean).join(", ");
      return {
        ragione_sociale: (c.business_name || c.name || "").trim() || null,
        indirizzo_completo: indirizzo || null,
        telefono: (c.phone || "").trim() || null,
        email: (c.email || "").trim() || null,
        partita_iva: (c.vat_number || "").trim() || null,
        // @ts-ignore — colonne aggiunte da migration 20270514020000/070000
        pec: (c.pec || "").trim() || null,
        // @ts-ignore
        numero_rea: (c.numero_rea || "").trim() || null,
        // @ts-ignore
        capitale_sociale: (c.capitale_sociale || "").trim() || null,
        // @ts-ignore
        anno_fondazione: c.anno_fondazione ?? null,
      };
    },
  });
  return data ?? null;
}

/** Genera il testo di default per il brand legitimacy footer dai dati azienda. */
export function buildBrandFooterText(a: TemplateCompanyAnagrafica): string {
  const parts: string[] = [];
  if (a.ragione_sociale) parts.push(a.ragione_sociale);
  if (a.partita_iva) parts.push(`P.IVA ${a.partita_iva}`);
  if (a.numero_rea) parts.push(`REA ${a.numero_rea}`);
  if (a.indirizzo_completo) parts.push(`Sede legale: ${a.indirizzo_completo}`);
  if (a.pec) parts.push(`PEC: ${a.pec}`);
  if (a.capitale_sociale) parts.push(`Cap. Soc. ${a.capitale_sociale}`);
  if (a.anno_fondazione) parts.push(`Attivi dal ${a.anno_fondazione}`);
  return parts.join(" · ");
}

/** Placeholder ereditato: mostra il valore del profilo (·dal profilo) o un esempio. */
export function inheritedPlaceholder(value: string | null | undefined, esempio: string): string {
  return value ? `${value} · dal profilo` : esempio;
}
