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
