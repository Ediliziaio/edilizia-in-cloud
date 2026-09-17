/**
 * Immagini dei modelli PDF nel browser: firma dei percorsi prima di generare PDF
 * e anteprime. Le regole, e il perche' nel modello ci sia il percorso e non un
 * link, stanno in supabase/functions/_shared/immaginiModelloPdf.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { eRiferimentoNudo, linkFileRiservato, SCADENZA_PREDEFINITA } from "@/lib/storage/fileRiservati";
import {
  firmaImmaginiModello as firmaConFirmatario,
  firmatarioStorage,
  type CampiImmagine,
} from "../../../supabase/functions/_shared/immaginiModelloPdf";

export {
  CAMPI_IMMAGINE_FOTOVOLTAICO,
  CAMPI_IMMAGINE_SERRAMENTI,
  immaginiDelModello,
  normalizzaImmaginiModello,
  riferimentoImmagine,
  sostituisciImmagini,
} from "../../../supabase/functions/_shared/immaginiModelloPdf";
export type { CampiImmagine } from "../../../supabase/functions/_shared/immaginiModelloPdf";

/**
 * Il modello con le immagini firmate per chi e' collegato. Decidono le policy
 * dello storage: si firmano solo i file nella cartella dell'azienda su cui si
 * lavora, gli altri percorsi diventano null.
 */
export function firmaImmaginiModello<T>(
  modello: T,
  campi: CampiImmagine,
  scadenzaSecondi = SCADENZA_PREDEFINITA,
): Promise<T> {
  return firmaConFirmatario(modello, campi, firmatarioStorage(supabase, scadenzaSecondi));
}

/**
 * Un'immagine passata a parte (per esempio il logo dato all'anteprima come logo
 * dell'azienda): il link firmato, o null se e' un percorso che non si riesce a
 * firmare. Gli indirizzi normali tornano come sono.
 */
export async function firmaImmagine(valore: string | null | undefined): Promise<string | null> {
  const link = await linkFileRiservato(valore);
  return link && !eRiferimentoNudo(link) ? link : null;
}
