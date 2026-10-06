/**
 * /offerta/<qualcosa> serve due pagine pubbliche:
 *  - la firma del preventivo di un'azienda: /offerta/<token UUID> (QuoteSignPage);
 *  - il checkout dei piani Edilizia in Cloud: /offerta/clienti-marketing (OffertaCheckout).
 *
 * React Router non le distingue dal percorso: con due rotte «/offerta/:slug» e
 * «/offerta/:token» vince sempre la prima. Dal 15/07/2026 (checkout dei piani)
 * ogni link di firma di un preventivo mostrava «Offerta non trovata».
 * Una rotta sola, e qui si sceglie la pagina dalla forma del valore.
 */
import { useParams } from "react-router-dom";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { eTokenOffertaPreventivo } from "@/lib/preventivi/offertaPubblica";

const OffertaCheckout = lazy(() => import("@/pages/OffertaCheckout"));
const QuoteSignPage = lazy(() => import("@/pages/public/QuoteSignPage"));

export default function OffertaPubblica() {
  const { slug = "" } = useParams<{ slug: string }>();
  // Il caricamento a richiesta delle due pagine lo copre il Suspense dell'app
  // (PageLoader), lo stesso di ogni altra rotta pubblica.
  return eTokenOffertaPreventivo(slug) ? <QuoteSignPage /> : <OffertaCheckout />;
}
