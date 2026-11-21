import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { LOTTO_RIGHE, sommaALotti } from "@/lib/lottiDiId";

type RigaOpportunita = TablesInsert<"marketing_opportunities"> & { contact_id: string };

export async function improntaOpportunitaInBlocco(valore: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valore));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function idDellaRiga(operazione: string, contatto: string) {
  const impronta = await improntaOpportunitaInBlocco(`${operazione}:${contatto}`);
  const variante = ((Number.parseInt(impronta[16], 16) & 3) | 8).toString(16);
  return `${impronta.slice(0, 8)}-${impronta.slice(8, 12)}-8${impronta.slice(13, 16)}-${variante}${impronta.slice(17, 20)}-${impronta.slice(20, 32)}`;
}

export async function salvaOpportunitaInBlocco(azienda: string, righe: RigaOpportunita[], operazione: string) {
  return sommaALotti(righe, async lotto => {
    const valori = await Promise.all(lotto.map(async riga => ({
      ...riga, id: await idDellaRiga(operazione, riga.contact_id),
    })));
    const { data, error } = await supabase.from("marketing_opportunities")
      .upsert(valori, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    if (data?.length === valori.length) return valori.length;

    const conferma = await supabase.from("marketing_opportunities").select("id")
      .eq("company_id", azienda).in("id", valori.map(riga => riga.id));
    if (conferma.error) throw conferma.error;
    return conferma.data?.length ?? 0;
  }, LOTTO_RIGHE);
}
