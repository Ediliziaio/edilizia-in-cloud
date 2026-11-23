/**
 * Da dove arrivano i prezzi proposti per le lavorazioni della pianta. Oggi: il listino
 * dell'azienda; dove non arriva, `proponiPrezzo` scende al prezzo indicativo dichiarato.
 *
 * Il prezzario pubblico della regione NON si interroga in automatico, di proposito.
 * Provato il 23/11/2026 su Lombardia 2026: la ricerca per parole restituisce forniture
 * senza posa («Zoccolino di plastica» 2,30 €/m per il battiscopa), voci d'altro genere
 * («Pavimento di piscine» per il pavimento) e per quattro lavorazioni su dieci niente.
 * Un prezzo così, con accanto «Prezzario Lombardia», sembrerebbe attendibile e non lo è.
 * Dal prezzario si sceglie a mano, con «Cambia prezzo» → «Scegli dal listino».
 * `proponiPrezzo` sa già usare le voci di un prezzario (`fonti.prezzario`): quando ci sarà
 * un abbinamento verificato regione per regione, basta riempirlo qui.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FONTI_VUOTE, type FontiPrezzi, type TipoLavorazione, type VoceDiPrezzo } from "./prezziProposti";

// La tabella del listino non è nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

async function listinoAzienda(companyId: string): Promise<VoceDiPrezzo[]> {
  const { data, error } = await sb().from("rst_listino_voci").select("codice, descrizione, unita_misura, prezzo_unitario")
    .eq("company_id", companyId).gt("prezzo_unitario", 0).limit(3000);
  if (error) return [];
  return ((data ?? []) as { codice: string | null; descrizione: string; unita_misura: string | null; prezzo_unitario: number }[])
    .map((v) => ({ codice: v.codice, descrizione: v.descrizione, unita: v.unita_misura, prezzo: Number(v.prezzo_unitario) }));
}

export async function caricaFontiPrezzi(companyId: string, tipi: readonly TipoLavorazione[]): Promise<FontiPrezzi> {
  if (!tipi.length) return FONTI_VUOTE;
  try {
    return { ...FONTI_VUOTE, listino: await listinoAzienda(companyId) };
  } catch {
    return FONTI_VUOTE;
  }
}

/** Le fonti per proporre i prezzi; finché caricano (o se non si possono vedere i prezzi) sono vuote. */
export function useFontiPrezzi(companyId: string | null | undefined, tipi: readonly TipoLavorazione[], abilitato = true): { fonti: FontiPrezzi; pronte: boolean } {
  const serve = tipi.length > 0;
  const { data, isFetched } = useQuery({
    queryKey: ["planimetrie", "fonti-prezzi", companyId],
    enabled: !!companyId && abilitato && serve,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => caricaFontiPrezzi(companyId!, tipi),
  });
  return { fonti: data ?? FONTI_VUOTE, pronte: isFetched || !serve };
}
