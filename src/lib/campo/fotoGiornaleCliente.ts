/**
 * Quali foto del giornale può aprire il cliente esterno, dal suo browser.
 *
 * Il cliente esterno NON può leggere `foto-cantiere`, dove ora stanno le foto del giornale
 * (`campo_file_cantiere_visibile` rifiuta `utente_e_cliente_esterno`), né gli altri bucket
 * riservati. Si mostrano solo le foto con un indirizzo http fuori da quei bucket; le altre
 * si saltano, invece di disegnare immagini rotte.
 * DA FARE (lotto 5): un'edge che firmi lato server le foto delle giornate visibili al cliente,
 * dopo aver controllato che la commessa sia sua. Non aprire la policy del bucket al cliente.
 */
import { BUCKET_RISERVATI, riconosciFile } from "@/lib/storage/fileRiservati";
import { comeLeggereFotoGiornale, type RigaFotoGiornale } from "../../../supabase/functions/_shared/fotoGiornale";

export function fotoLeggibileDalCliente(f: RigaFotoGiornale): boolean {
  const modo = comeLeggereFotoGiornale(f);
  if (modo?.tipo !== "diretto") return false;
  const rif = riconosciFile(modo.url);
  return !rif || !(BUCKET_RISERVATI as readonly string[]).includes(rif.bucket);
}
