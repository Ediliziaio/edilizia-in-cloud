/** Lettore del PDF di PriMus: il codice vive in supabase/functions/_shared per essere usato anche dalla edge function. */
export {
  eComputoPrimus, leggiComputoPrimus, leggiEControllaPrimus,
  type PdfPaginaPosizionata, type PdfPezzoTesto,
} from "../../../supabase/functions/_shared/computoPrimusPdf";
