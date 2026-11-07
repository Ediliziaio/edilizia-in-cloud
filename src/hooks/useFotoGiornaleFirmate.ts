/**
 * Indirizzi firmati per le foto del giornale (bucket privato `foto-cantiere`).
 * Una sola `createSignedUrls` per elenco, in cache con react-query: riaprire la
 * stessa pagina non rifirma. Le regole stanno in supabase/functions/_shared/fotoGiornale.ts.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BUCKET_FOTO_GIORNALE, indirizziFotoGiornale, type FirmaInBlocco, type RigaFotoGiornale,
} from "../../supabase/functions/_shared/fotoGiornale";

/** Otto ore come gli altri file riservati; la cache si rinnova prima che scadano. */
const SCADENZA_SECONDI = 8 * 60 * 60;

export const firmaFotoGiornaleBrowser: FirmaInBlocco = async (paths): Promise<(string | null)[]> => {
  const { data, error } = await supabase.storage.from(BUCKET_FOTO_GIORNALE).createSignedUrls(paths, SCADENZA_SECONDI);
  if (error || !data) return paths.map((): null => null);
  return paths.map((_, i) => data[i]?.signedUrl ?? null);
};

/** Un indirizzo per riga, nello stesso ordine; "" finché non c'è o se non si può leggere. */
export function useFotoGiornaleFirmate(righe: RigaFotoGiornale[] | null | undefined): string[] {
  const elenco = righe ?? [];
  const chiave = elenco.map((r) => `${r.storage_path ?? ""}|${r.url ?? ""}`);
  const { data } = useQuery({
    queryKey: ["foto-giornale-firmate", chiave],
    queryFn: () => indirizziFotoGiornale(elenco, firmaFotoGiornaleBrowser),
    enabled: elenco.length > 0,
    staleTime: (SCADENZA_SECONDI - 60 * 60) * 1000,
    gcTime: (SCADENZA_SECONDI - 60 * 60) * 1000,
  });
  return data && data.length === elenco.length ? data : elenco.map(() => "");
}
