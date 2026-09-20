/**
 * Le condizioni generali di contratto, per settore.
 *
 * Il testo vive in `supabase/functions/_shared`: lo usano sia l'app (editor dei
 * modelli e PDF disegnati nel browser) sia le edge function che generano i
 * documenti del Fotovoltaico e dei Serramenti. Una copia sola, un testo solo.
 */
export {
  condizioniStandard, CONDIZIONI_STANDARD_MD, TITOLO_CLAUSOLE_SPECIFICHE,
  type SettoreCondizioni,
} from "../../supabase/functions/_shared/condizioniStandard.ts";
