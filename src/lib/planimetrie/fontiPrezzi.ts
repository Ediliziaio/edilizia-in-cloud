/**
 * Da dove arrivano i prezzi proposti per le lavorazioni della pianta: prima il listino
 * dell'azienda; dove non arriva, la voce del prezzario pubblico della sua regione abbinata
 * PER CODICE alla lavorazione (`shared/planimetrie/abbinamentiPrezzario.ts`); poi il prezzo
 * indicativo dichiarato.
 *
 * Niente ricerca per parole nel prezzario, di proposito. Provata il 23/11/2026 su Lombardia
 * 2026: restituiva forniture senza posa («Zoccolino di plastica» 2,30 €/m per il battiscopa),
 * voci d'altro genere («Pavimento di piscine») e per quattro lavorazioni su dieci niente.
 * Un prezzo così, con accanto «Prezzario Lombardia», sembrerebbe attendibile e non lo è.
 * Una lavorazione senza abbinamento resta al prezzo indicativo; dal prezzario si sceglie a
 * mano con «Cambia prezzo» → «Scegli dal listino».
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { regioneAzienda } from "@/lib/geo/provinceRegioni";
import { abbinamentiPerRegione, unitaDelPrezzario } from "../../../shared/planimetrie/abbinamentiPrezzario.ts";
import { FONTI_VUOTE, REGOLE_LAVORAZIONI, type FontiPrezzi, type TipoLavorazione, type VoceDiPrezzo } from "./prezziProposti";

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

/**
 * Le voci abbinate per codice nel prezzario della regione dell'azienda, con il nome da mostrare
 * («Lombardia 2026»). Vuoto se la regione non si conosce, non ha abbinamenti o la sua fonte non
 * è pubblicata. Si caricano tutte (sono una decina): il risultato non dipende dalle righe.
 */
async function prezzarioAbbinato(companyId: string): Promise<Pick<FontiPrezzi, "prezzario" | "prezzarioNome">> {
  const vuoto = { prezzario: {}, prezzarioNome: null };
  const { data: azienda } = await sb().from("companies").select("region, operational_province, legal_province").eq("id", companyId).maybeSingle();
  const abbinamenti = abbinamentiPerRegione(regioneAzienda(azienda));
  if (!abbinamenti) return vuoto;
  const { data: fonte } = await sb().from("prezzario_fonte").select("id")
    .eq("regione", abbinamenti.regione).eq("anno", abbinamenti.anno).eq("stato", "pubblicato").limit(1).maybeSingle();
  if (!fonte?.id) return vuoto;
  const perCodice = new Map(Object.entries(abbinamenti.voci).map(([tipo, v]) => [v.codice, tipo as TipoLavorazione]));
  const { data, error } = await sb().from("prezzario_voce").select("codice, descrizione, unita_misura, prezzo")
    .eq("fonte_id", fonte.id).in("codice", [...perCodice.keys()]).limit(perCodice.size * 2);
  if (error || !data?.length) return vuoto;
  const righe = data as { codice: string; descrizione: string; unita_misura: string | null; prezzo: number | string | null }[];
  const prezzario: FontiPrezzi["prezzario"] = {};
  for (const v of righe) {
    const tipo = perCodice.get(v.codice);
    // Un codice ripetuto nella fonte non è più un abbinamento sicuro: si scarta.
    if (!tipo || !(tipo in REGOLE_LAVORAZIONI) || righe.filter((x) => x.codice === v.codice).length > 1) continue;
    prezzario[tipo] = { codice: v.codice, descrizione: v.descrizione, unita: unitaDelPrezzario(v.unita_misura), prezzo: Number(v.prezzo) };
  }
  return { prezzario, prezzarioNome: `${abbinamenti.regione} ${abbinamenti.anno}` };
}

export async function caricaFontiPrezzi(companyId: string, tipi: readonly TipoLavorazione[]): Promise<FontiPrezzi> {
  if (!tipi.length) return FONTI_VUOTE;
  const [listino, prezzario] = await Promise.all([
    listinoAzienda(companyId).catch(() => []),
    prezzarioAbbinato(companyId).catch(() => ({ prezzario: {}, prezzarioNome: null })),
  ]);
  return { listino, ...prezzario };
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
