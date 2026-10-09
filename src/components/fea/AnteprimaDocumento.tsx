import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Apre il documento da firmare. Il preventivo fotovoltaico e quello dei
 * serramenti sono pagine HTML: lo storage le manda come testo semplice e il
 * cliente vedeva il codice. La si scarica e la si apre come pagina, come fa il
 * dettaglio del preventivo nell'app. Un PDF si apre com'è, dal link.
 */
export async function apriDocumento(evento: { preventDefault: () => void }, url: string | null | undefined) {
  if (!url) return;
  let pagina = false;
  try {
    pagina = new URL(url).pathname.toLowerCase().endsWith(".html");
  } catch {
    // Indirizzo non leggibile: ci pensa il link.
  }
  if (!pagina) return;
  evento.preventDefault();
  // La scheda si apre subito, dentro il clic: dopo l'attesa il browser la bloccherebbe.
  const finestra = window.open("", "_blank");
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) throw new Error(String(risposta.status));
    const indirizzo = URL.createObjectURL(new Blob([await risposta.text()], { type: "text/html" }));
    if (finestra) finestra.location.href = indirizzo;
    else window.location.href = indirizzo;
    setTimeout(() => URL.revokeObjectURL(indirizzo), 60_000);
  } catch {
    finestra?.close();
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Anteprima del documento dentro la pagina: il cliente lo legge qui, prima del
 * codice. Il PDF va in un iframe; il preventivo in HTML (fotovoltaico,
 * serramenti: lo storage lo manderebbe come testo) si scarica e si mostra in un
 * iframe isolato, senza script. Se non si carica, non si mostra niente: resta il
 * link per aprirlo a parte.
 *
 * Mai un iframe puntato direttamente allo storage: la CSP della pagina
 * (public/_headers, frame-src) non ammette frame verso supabase.co, e il
 * riquadro restava vuoto. Si scarica con una fetch (connect-src la ammette) e si
 * mostra da blob: o da srcdoc, che frame-src ammette. `classeIframe` cambia solo
 * l'aspetto (il riquadro di default ha bordo e angoli arrotondati).
 */
export function AnteprimaDocumento({ url, classeIframe }: { url: string; classeIframe?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [errore, setErrore] = useState(false);
  const eHtml = (() => {
    try { return new URL(url).pathname.toLowerCase().endsWith('.html'); } catch { return false; }
  })();

  useEffect(() => {
    let annullato = false;
    let creato: string | null = null;
    setHtml(null);
    setPdfUrl(null);
    setErrore(false);
    fetch(url)
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return eHtml ? await r.text() : await r.blob(); })
      .then((contenuto) => {
        if (annullato) return;
        if (typeof contenuto === 'string') { setHtml(contenuto); return; }
        // La CSP della pagina (public/_headers, frame-src) non ammette frame verso
        // supabase.co ma ammette blob:, e la fetch sì (connect-src): il PDF si
        // scarica e si mostra da blob:. Il tipo lo forziamo noi: un file che non è
        // un PDF non può eseguire niente nell'origine della pagina.
        creato = URL.createObjectURL(new Blob([contenuto], { type: 'application/pdf' }));
        setPdfUrl(creato);
      })
      .catch(() => { if (!annullato) setErrore(true); });
    return () => {
      annullato = true;
      if (creato) URL.revokeObjectURL(creato);
    };
  }, [url, eHtml]);

  if (errore) return null;
  if ((eHtml ? html : pdfUrl) === null) {
    return (
      <div className="h-40 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />Carico il preventivo…
      </div>
    );
  }
  return (
    <iframe
      title="Anteprima del documento"
      {...(eHtml ? { srcDoc: html ?? '', sandbox: '' } : { src: pdfUrl ?? undefined })}
      className={classeIframe ?? 'w-full h-[70vh] min-h-[420px] rounded-xl border border-slate-200 bg-white'}
    />
  );
}
