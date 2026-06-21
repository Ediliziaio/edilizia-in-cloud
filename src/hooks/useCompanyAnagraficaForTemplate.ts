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
        .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number")
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
      };
    },
  });
  return data ?? null;
}

/** Placeholder ereditato: mostra il valore del profilo (·dal profilo) o un esempio. */
export function inheritedPlaceholder(value: string | null | undefined, esempio: string): string {
  return value ? `${value} · dal profilo` : esempio;
}
