import { useEffect, useRef, useState } from "react";

/**
 * Il calendario di prenotazione dentro una pagina del sito.
 *
 * Non usa lo script `prenota.js` di admin.ediliziaincloud.com — che è la strada
 * giusta per i siti ESTERNI (marketingedile.com e gli altri brand), ma qui
 * sarebbe bloccato dalla nostra stessa CSP: `script-src 'self'` e
 * `frame-src 'self'` non elencano admin.*. La pagina /prenota vive in questa
 * stessa applicazione, quindi l'iframe punta a un percorso relativo e resta
 * "self": nessun header da allargare, nessuno script di terze parti.
 *
 * L'altezza la dice la pagina dentro l'iframe (postMessage `eic-prenota`), così
 * il riquadro cresce e si accorcia con il contenuto invece di lasciare un
 * vuoto sotto il calendario o una barra di scorrimento dentro la pagina.
 */
export interface PrenotazioneFatta {
  date: string | null;
  time: string | null;
  calendar?: string | null;
}

export function CalendarioInPagina({
  slug,
  titolo,
  sottotitolo,
  className,
  onPrenotato,
}: {
  slug: string;
  titolo?: string;
  sottotitolo?: string;
  className?: string;
  /**
   * Chiamata quando la prenotazione è confermata dentro il riquadro: la pagina
   * che ospita il calendario la conta come conversione (Pixel, GA4).
   */
  onPrenotato?: (prenotazione: PrenotazioneFatta) => void;
}) {
  const riquadro = useRef<HTMLIFrameElement>(null);
  const [altezza, setAltezza] = useState(720);
  // In un ref: se la pagina ricrea la funzione a ogni render, l'ascolto resta lo stesso.
  const alPrenotato = useRef(onPrenotato);
  useEffect(() => {
    alPrenotato.current = onPrenotato;
  }, [onPrenotato]);

  useEffect(() => {
    const ascolta = (e: MessageEvent) => {
      // Solo i messaggi della nostra pagina, e solo dalla nostra origine.
      if (e.origin !== window.location.origin) return;
      const dato = e.data as {
        source?: string;
        event?: string;
        height?: number;
        detail?: PrenotazioneFatta;
      } | null;
      if (dato?.source !== "eic-prenota") return;
      if (e.source !== riquadro.current?.contentWindow) return;
      if (dato.event === "prenotato") {
        alPrenotato.current?.({
          date: dato.detail?.date ?? null,
          time: dato.detail?.time ?? null,
          calendar: dato.detail?.calendar ?? null,
        });
        return;
      }
      if (dato.event !== "altezza") return;
      const h = Number(dato.height);
      if (Number.isFinite(h) && h > 200) setAltezza(Math.min(Math.ceil(h) + 8, 2000));
    };
    window.addEventListener("message", ascolta);
    return () => window.removeEventListener("message", ascolta);
  }, []);

  return (
    <div className={className}>
      {titolo && <h3 className="text-xl font-bold text-[#111111]">{titolo}</h3>}
      {sottotitolo && <p className="mt-1 text-sm text-[#111111]/60">{sottotitolo}</p>}
      <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <iframe
          ref={riquadro}
          title="Fissa un appuntamento"
          src={`/prenota/${slug}?embed=1`}
          className="w-full border-0"
          style={{ height: altezza }}
          loading="lazy"
        />
      </div>
    </div>
  );
}

export default CalendarioInPagina;
