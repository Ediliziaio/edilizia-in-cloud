/**
 * Ciò che i controlli PA della fattura non trovano sul documento (lotto 5, 15/11/2026): le
 * commesse collegate, il cliente della commessa principale, l'ufficio scelto come sta nel
 * database. Lo stesso contesto che carica invia-sdi, così editor e invio dicono le stesse cose.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContestoControlliPa } from "../../supabase/functions/_shared/controlliFatturaSdi";

interface Documento {
  id?: string;
  ordine_id?: string | null;
  ufficio_pa_id?: string | null;
}

export async function leggiContestoControlliPa(doc: Documento): Promise<ContestoControlliPa> {
  const contesto: ContestoControlliPa = {};
  const collegate = new Set<string>(doc.ordine_id ? [doc.ordine_id] : []);
  if (doc.id) {
    const { data } = await supabase.from("fattura_ordine").select("ordine_id").eq("fattura_id", doc.id);
    for (const l of data ?? []) collegate.add(l.ordine_id);
  }
  contesto.commesseCollegate = [...collegate];
  if (doc.ordine_id) {
    const { data: ordine } = await supabase.from("orders").select("id, order_code, customer_id, company_id").eq("id", doc.ordine_id).maybeSingle();
    if (ordine?.customer_id) {
      const { data: ana } = await supabase.from("anagrafiche_native").select("id, ragione_sociale")
        .eq("company_id", ordine.company_id).eq("cliente_id", ordine.customer_id).maybeSingle();
      contesto.commessa = { id: ordine.id, codice: ordine.order_code, anagrafica_id: ana?.id ?? null, cliente: ana?.ragione_sociale ?? null };
    }
  }
  if (doc.ufficio_pa_id) {
    const { data: uff } = await supabase.from("anagrafica_uffici_pa")
      .select("id, anagrafica_id, codice_univoco_ufficio, descrizione, attivo").eq("id", doc.ufficio_pa_id).maybeSingle();
    if (uff) contesto.ufficio = uff;
  }
  return contesto;
}

export function useContestoControlliPa(doc: Documento | undefined): ContestoControlliPa {
  const { data } = useQuery({
    queryKey: ["contesto-controlli-pa", doc?.id ?? null, doc?.ordine_id ?? null, doc?.ufficio_pa_id ?? null],
    enabled: !!doc?.id,
    queryFn: () => leggiContestoControlliPa(doc!),
    staleTime: 30_000,
  });
  return data ?? {};
}
