/**
 * Banner dei cookie del sito pubblico (Garante privacy, linee guida 10/06/2021).
 *
 * Fino al 30/10/2026 il sito non chiedeva niente: Google Tag Manager, Analytics
 * e Meta Pixel partivano al primo scroll. Ora il consenso lo gestisce
 * `window.eicConsensoCookie` (index.html), che carica i tracciamenti solo dopo
 * il «sì»; qui c'è solo la scelta:
 *  - «Accetta tutti» e «Rifiuta» con lo stesso peso (niente rifiuto nascosto);
 *  - «Personalizza»: statistiche e marketing separati, spenti di partenza;
 *  - chiudere il banner con la X vale «Rifiuta» (solo cookie tecnici);
 *  - la scelta vale 6 mesi, poi si richiede; si cambia da «Preferenze cookie»
 *    nel piè di pagina.
 * Compare solo sulle pagine pubbliche del sito (non nell'app, dove non partono
 * tracciamenti).
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";

interface Scelta { analitici: boolean; marketing: boolean }
interface ApiConsenso {
  scelta: (Scelta & { v: number; il: number }) | null;
  salva: (analitici: boolean, marketing: boolean) => void;
}

const HOST_SITO = new Set(["ediliziaincloud.com", "www.ediliziaincloud.com"]);
/** Le stesse rotte private su cui index.html non carica i tracciamenti. */
const ROTTE_PRIVATE =
  /^\/(app|admin|azienda|commercialista|cliente|dipendente|venditore|partner|produttore|produttore-login|tecnico|campo|portale|portale-cliente|login|admin-login|clienti-login|lavori-login|referral-login|commercialista-login|auth-callback|reset-password|cambia-password|accetta-preventivo|preventivo|offerta|firma|firma-odv|firma-fea|firma-sal|booking|prenota|appuntamento|nps|feedback|ref|talent-profile|candidatura|q)(\/|$)/;

const api = (): ApiConsenso | null =>
  (window as unknown as { eicConsensoCookie?: ApiConsenso }).eicConsensoCookie ?? null;

/** Riapre le preferenze (link «Preferenze cookie»). */
export function apriPreferenzeCookie() {
  window.dispatchEvent(new CustomEvent("eic:apri-preferenze-cookie"));
}

export function BannerCookie() {
  const { pathname } = useLocation();
  const [aperto, setAperto] = useState(() => !api()?.scelta);
  const [dettagli, setDettagli] = useState(false);
  const [analitici, setAnalitici] = useState(() => !!api()?.scelta?.analitici);
  const [marketing, setMarketing] = useState(() => !!api()?.scelta?.marketing);

  useEffect(() => {
    const riapri = () => {
      const s = api()?.scelta;
      setAnalitici(!!s?.analitici);
      setMarketing(!!s?.marketing);
      setDettagli(true);
      setAperto(true);
    };
    window.addEventListener("eic:apri-preferenze-cookie", riapri);
    return () => window.removeEventListener("eic:apri-preferenze-cookie", riapri);
  }, []);

  const sulSito = HOST_SITO.has(window.location.hostname) && !ROTTE_PRIVATE.test(pathname || "/");
  if (!aperto || !sulSito || !api()) return null;

  const scegli = (a: boolean, m: boolean) => {
    api()?.salva(a, m);
    setAperto(false);
  };

  const interruttore = (nome: string, descr: string, valore: boolean, cambia: (v: boolean) => void) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#F97316]" checked={valore} onChange={(e) => cambia(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold text-[#111111]">{nome}</span>
        <span className="block text-xs text-[#111111]/70">{descr}</span>
      </span>
    </label>
  );

  return (
    <div role="dialog" aria-modal="false" aria-labelledby="banner-cookie-titolo"
      className="fixed inset-x-0 bottom-0 z-[1000] p-3 sm:p-4">
      <div className="relative mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:p-5">
        <button type="button" onClick={() => scegli(false, false)} aria-label="Chiudi e rifiuta i cookie non necessari"
          className="absolute right-3 top-3 rounded p-1 text-gray-500 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
        <p id="banner-cookie-titolo" className="pr-6 text-base font-bold text-[#111111]">Cookie e privacy</p>
        <p className="mt-1 text-sm text-[#111111]/75">
          Usiamo cookie tecnici, necessari al sito. Con il tuo consenso usiamo anche cookie di statistica (Google
          Analytics) e di marketing (Meta) per misurare le visite e le campagne. Puoi cambiare idea quando vuoi da
          «Preferenze cookie» in fondo alla pagina.{" "}
          <Link to="/cookie-policy/" className="underline">Cookie Policy</Link>
        </p>
        {dettagli && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {interruttore("Statistiche", "Google Analytics tramite Google Tag Manager e contatore visite: quante persone visitano il sito e quali pagine.", analitici, setAnalitici)}
            {interruttore("Marketing", "Meta Pixel: misura i risultati delle campagne su Facebook e Instagram.", marketing, setMarketing)}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {dettagli ? (
            <button type="button" onClick={() => scegli(analitici, marketing)}
              className="rounded-lg border border-[#111111] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-gray-50">
              Salva le scelte
            </button>
          ) : (
            <button type="button" onClick={() => setDettagli(true)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-[#111111] underline hover:bg-gray-50">
              Personalizza
            </button>
          )}
          <button type="button" onClick={() => scegli(false, false)}
            className="rounded-lg border border-[#111111] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-gray-50">
            Rifiuta
          </button>
          <button type="button" onClick={() => scegli(true, true)}
            className="rounded-lg border border-[#111111] bg-[#111111] px-4 py-2 text-sm font-semibold text-white hover:bg-black">
            Accetta tutti
          </button>
        </div>
      </div>
    </div>
  );
}
