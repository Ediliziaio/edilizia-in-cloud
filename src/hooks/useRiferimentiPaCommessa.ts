/**
 * Riferimenti dell'appalto e della fatturazione PA di una commessa (lotto 3).
 *
 * Restituisce le righe di order_riferimenti_pa in ordine, l'interruttore della commessa, se il
 * cliente è una PA e le «fonti»: CIG/CUP scritti sul contratto della commessa generale o sul
 * computo, da importare con un clic. Lo usa la Panoramica; lo userà la fattura (lotti 4-5).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  anagraficaEPa, COLONNE_RIFERIMENTO_PA, fonteGiaPresente, ordinaRiferimenti, pianoSalvataggio, problemiFonte,
  type BozzaRiferimentoPa, type FonteRiferimentoEsistente, type RiferimentoPa,
} from "@/lib/orders/riferimentiPa";

export const chiaveRiferimentiPa = (orderId?: string | null) => ["order-riferimenti-pa", orderId] as const;

export interface DatiRiferimentiPaCommessa {
  righe: RiferimentoPa[];
  fonti: FonteRiferimentoEsistente[];
  attivi: boolean;
  clientePa: boolean;
  customerId: string | null;
}

/** Il cliente (profilo) è una PA secondo la sua anagrafica di fatturazione? */
export async function clienteEPa(companyId: string, customerId: string | null | undefined): Promise<boolean> {
  if (!customerId) return false;
  const { data, error } = await supabase
    .from("anagrafiche_native")
    .select("tipo_cliente, tipo_soggetto")
    .eq("company_id", companyId)
    .eq("cliente_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return anagraficaEPa(data);
}

export async function leggiRiferimentiPa(orderId: string): Promise<DatiRiferimentiPaCommessa> {
  const [ordine, righe, contratto, computi] = await Promise.all([
    supabase.from("orders").select("id, company_id, customer_id, riferimenti_pa_attivi").eq("id", orderId).maybeSingle(),
    supabase.from("order_riferimenti_pa").select(COLONNE_RIFERIMENTO_PA).eq("order_id", orderId),
    supabase.from("generale_contratti").select("generale_id, riferimento, data_firma, cig, cup").eq("generale_id", orderId).maybeSingle(),
    supabase.from("computo_uploads").select("id, titolo, stazione_appaltante, cig, cup, created_at").eq("order_id", orderId).or("cig.not.is.null,cup.not.is.null"),
  ]);
  if (ordine.error) throw ordine.error;
  if (righe.error) throw righe.error;
  const ordinate = ordinaRiferimenti((righe.data ?? []) as unknown as RiferimentoPa[]);
  const fonti: FonteRiferimentoEsistente[] = [];
  // Le fonti sono un aiuto: se non si leggono (permessi, tabella), la sezione funziona lo stesso.
  const c = contratto.error ? null : contratto.data;
  if (c && (c.cig || c.cup)) {
    fonti.push({
      fonte: "contratto_generale", fonte_id: c.generale_id, etichetta: "Contratto della commessa generale",
      cig: c.cig, cup: c.cup, numero: c.riferimento, data: c.data_firma,
      giaPresente: fonteGiaPresente(ordinate, "contratto_generale", c.generale_id, c.cig, c.cup),
      problemi: problemiFonte(c.cig, c.cup),
    });
  }
  for (const k of computi.error ? [] : computi.data ?? []) {
    fonti.push({
      fonte: "computo", fonte_id: k.id,
      etichetta: `Computo${k.titolo ? ` «${k.titolo}»` : ""}${k.stazione_appaltante ? ` — ${k.stazione_appaltante}` : ""}`,
      cig: k.cig, cup: k.cup, numero: null, data: null,
      giaPresente: fonteGiaPresente(ordinate, "computo", k.id, k.cig, k.cup),
      problemi: problemiFonte(k.cig, k.cup),
    });
  }
  const o = ordine.data;
  const pa = o ? await clienteEPa(o.company_id, o.customer_id).catch(() => false) : false;
  return { righe: ordinate, fonti, attivi: !!o?.riferimenti_pa_attivi, clientePa: pa, customerId: o?.customer_id ?? null };
}

/**
 * Salva le bozze contro le righe salvate: inserisce le nuove, aggiorna le cambiate, toglie le
 * tolte. `attivi` (se dato) scrive l'interruttore della commessa. Usata da creazione, modifica e
 * dal riquadro in Panoramica.
 */
export async function salvaRiferimentiPa(orderId: string, bozze: BozzaRiferimentoPa[], salvate: RiferimentoPa[], attivi?: boolean) {
  const piano = pianoSalvataggio(bozze, salvate);
  if (attivi !== undefined) {
    const { error } = await supabase.from("orders").update({ riferimenti_pa_attivi: attivi }).eq("id", orderId);
    if (error) throw error;
  }
  if (piano.eliminare.length) {
    const { error } = await supabase.from("order_riferimenti_pa").delete().in("id", piano.eliminare);
    if (error) throw error;
  }
  for (const u of piano.aggiornare) {
    const { error } = await supabase.from("order_riferimenti_pa").update(u.campi).eq("id", u.id);
    if (error) throw error;
  }
  if (piano.inserire.length) {
    const { error } = await supabase.from("order_riferimenti_pa")
      .insert(piano.inserire.map((r) => ({ ...r, order_id: orderId })))
      .select("id");
    if (error) throw error;
  }
  return piano;
}

export function useRiferimentiPaCommessa(orderId?: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: chiaveRiferimentiPa(orderId),
    enabled: !!orderId,
    queryFn: () => leggiRiferimentiPa(orderId!),
  });
  const salva = useMutation({
    mutationFn: ({ bozze, attivi }: { bozze: BozzaRiferimentoPa[]; attivi?: boolean }) =>
      salvaRiferimentiPa(orderId!, bozze, query.data?.righe ?? [], attivi),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chiaveRiferimentiPa(orderId) });
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });
  return { ...query, salva };
}

/** Il cliente scelto nel modulo è una PA? (creazione e modifica della commessa) */
export function useClientePa(customerId: string | null | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["cliente-e-pa", companyId, customerId],
    enabled: !!companyId && !!customerId,
    queryFn: () => clienteEPa(companyId!, customerId),
    staleTime: 60_000,
  });
}
