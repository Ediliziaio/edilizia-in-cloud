/** Compensa il padding laterale del main alle stesse larghezze del layout. */
export const BORDI_GUSCIO = "-m-3 md:-m-4 xl:-m-6";

/** Gli inset sticky compensano il padding del main ai tre breakpoint del layout. */
export const STICKY_ALTO = "max-md:-top-3 md:-top-4 xl:-top-6";

/** Sul telefono il padding del main include già l’area sicura e lo spazio per la navigazione. */
export const STICKY_BASSO = "-bottom-6 md:-bottom-4 xl:-bottom-6";

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
