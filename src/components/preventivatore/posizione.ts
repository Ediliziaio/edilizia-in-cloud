/**
 * Dove si «attaccano» le barre del preventivatore.
 *
 * `position: sticky` si misura dal bordo interno del contenitore che scorre
 * (il `<main>` di CompanyLayout), che ha 12px (telefono) o 24px (computer) di
 * padding: con `top-0` la barra si fermerebbe lì e nella fessura sopra si
 * vedrebbero passare i campi. Gli offset negativi la portano a filo.
 *
 * Perché lo sticky funzioni da computer la rotta deve avere l'altezza bloccata
 * (`isGuscioPreventivatore` in CompanyLayout): con l'altezza libera scorre il
 * documento intero e nessuna barra resta ferma.
 */
export const STICKY_ALTO = "max-md:-top-3 md:-top-6";

/**
 * In basso: da telefono sopra la barra dell'app (il contenitore ha già 7rem di
 * spazio in fondo, -1.5rem lo mette appena sopra la barra); da computer a filo.
 */
export const STICKY_BASSO = "bottom-[calc(env(safe-area-inset-bottom)-1.5rem)] md:-bottom-6";

/** Sotto la barra delle fasi (≈5rem con la striscia), con un respiro. */
export const STICKY_ANTEPRIMA = "xl:top-[4.25rem]";

/**
 * Passo PDF da telefono: la barra «indietro · PDF · invia per firma» (`BarraInvioMobile`) è fissa, alta 66 px e a
 * 5,5 rem dal fondo (più l'area sicura), mentre il contenitore che scorre ha solo 7 rem di spazio in fondo e il piede
 * che di solito lo riempie al passo PDF è nascosto. Misurato a 375 × 740: in fondo alla pagina il riquadro «Il cliente
 * ha accettato? · Crea commessa» stava tra 578 e 628 px, la barra tra 586 e 652: pulsante coperto, né da toccare né da
 * scorrere oltre. Questo è lo spazio che manca, solo da telefono e solo quando la barra c'è.
 */
export const RISERVA_BARRA_INVIO_TELEFONO = "max-md:pb-[calc(env(safe-area-inset-bottom)+3.5rem)]";
