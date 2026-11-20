import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, ExternalLink, FileText, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIPI_DOCUMENTO_CANTIERE, type TipoDocumentoCantiere } from "@/lib/commesse/documentiCantiere";

interface Documento {
  id: string;
  nome: string;
  tipo: TipoDocumentoCantiere;
  byte: number;
  anteprima: boolean;
}
interface Elenco { codice: string | null; documenti: Documento[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function richiesta<T>(body: object, signal?: AbortSignal): Promise<T> {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, "");
  const controller = new AbortController();
  const annulla = () => controller.abort(signal?.reason);
  if (signal?.aborted) annulla();
  else signal?.addEventListener("abort", annulla, { once: true });
  const limite = window.setTimeout(() => controller.abort(new Error("La connessione è troppo lenta. Riprova.")), 20_000);
  try {
    const response = await fetch(`${base}/functions/v1/documenti-cantiere`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify(body), signal: controller.signal, cache: "no-store", referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      const errore = response.status === 404 ? "Link o documento non più disponibile."
        : response.status === 409 ? "Anteprima non disponibile. Scarica il file." : "Impossibile caricare i documenti. Riprova.";
      throw new Error(errore);
    }
    return await response.json();
  } finally {
    window.clearTimeout(limite);
    signal?.removeEventListener("abort", annulla);
  }
}

function osservaToken(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
const tokenCorrente = () => window.location.hash.slice(1);

export default function DocumentiCantiere() {
  const token = useSyncExternalStore(osservaToken, tokenCorrente, () => "");
  return <ElencoDocumenti key={token} token={token} />;
}

function ElencoDocumenti({ token }: { token: string }) {
  const [tentativo, setTentativo] = useState(0);
  const [elenco, setElenco] = useState<Elenco | null>(null);
  const [errore, setErrore] = useState(() => UUID.test(token) ? "" : "Inquadra il QR esposto in cantiere per aprire i documenti.");
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);
  const [erroreDocumento, setErroreDocumento] = useState("");
  const apertura = useRef<AbortController | null>(null);

  useEffect(() => () => apertura.current?.abort(), []);

  useEffect(() => {
    document.title = "Documenti di cantiere · EdiliziaInCloud";
    if (!UUID.test(token)) return;
    const controller = new AbortController();
    void richiesta<Elenco>({ token }, controller.signal).then(setElenco).catch(error => {
      if (!controller.signal.aborted) setErrore(error.message || "Connessione interrotta. Riprova.");
    });
    return () => controller.abort();
  }, [token, tentativo]);

  async function apriDocumento(doc: Documento, azione: "apri" | "scarica") {
    if (apertura.current) return;
    const scheda = azione === "apri" ? window.open("about:blank", "_blank") : null;
    if (azione === "apri" && !scheda) { setErroreDocumento("Consenti l’apertura della scheda o scegli Scarica."); return; }
    if (scheda) scheda.opener = null;
    const controller = new AbortController();
    apertura.current = controller;
    setErroreDocumento("");
    setAzioneInCorso(doc.id);
    try {
      const { url } = await richiesta<{ url: string }>({ token, id: doc.id, azione }, controller.signal);
      controller.signal.throwIfAborted();
      const destinazione = new URL(url);
      if (destinazione.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin) throw new Error("Indirizzo del documento non valido.");
      if (scheda) scheda.location.replace(destinazione.href);
      else {
        const download = document.createElement("a");
        download.href = destinazione.href;
        download.rel = "noreferrer";
        document.body.append(download);
        download.click();
        download.remove();
      }
    } catch (error) {
      scheda?.close();
      if (!controller.signal.aborted) setErroreDocumento(error instanceof Error ? error.message : "Documento non disponibile. Riprova.");
    } finally {
      apertura.current = null;
      if (!controller.signal.aborted) setAzioneInCorso(null);
    }
  }

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="bg-[#15365b] text-white">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-7 sm:px-8 sm:py-9">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-400 text-slate-950"><HardHat className="h-6 w-6" aria-hidden="true" /></span>
        <div><h1 className="text-xl font-semibold sm:text-2xl">Documenti di cantiere</h1>
          {elenco?.codice && <p className="mt-1 text-sm text-slate-200">Commessa {elenco.codice}</p>}
        </div>
      </div>
    </header>
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-8">
      {errore ? <div role="alert" className="space-y-3 rounded-xl border bg-white p-4 text-sm">
        <p>{errore}</p>{UUID.test(token) && <Button variant="outline" onClick={() => { setErrore(""); setTentativo(tentativo + 1); }}>Riprova</Button>}
      </div> : !elenco ? <p role="status" className="text-sm text-slate-600">Caricamento documenti…</p> : elenco.documenti.length === 0 ?
        <p className="rounded-xl border bg-white p-4 text-sm">Non ci sono documenti condivisi per questo cantiere.</p> : <>
          {erroreDocumento && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erroreDocumento}</p>}
          <ul className="divide-y rounded-xl border bg-white">
            {elenco.documenti.map(doc => <li key={doc.id} className="flex flex-col items-start gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="flex w-full min-w-0 items-center gap-3 sm:flex-1">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-[#15365b]"><FileText className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{doc.nome}</p>
                  <p className="text-xs text-slate-600">{TIPI_DOCUMENTO_CANTIERE[doc.tipo]}</p></div>
              </div>
              <div className="flex flex-wrap gap-2 pl-12 sm:shrink-0 sm:pl-0">
                {doc.anteprima && <Button variant="outline" size="sm" className="min-h-10" disabled={azioneInCorso !== null} onClick={() => void apriDocumento(doc, "apri")} aria-label={`Apri ${doc.nome}`}><ExternalLink className="mr-1.5 h-4 w-4" /> Apri</Button>}
                <Button variant="outline" size="sm" className="min-h-10" disabled={azioneInCorso !== null} onClick={() => void apriDocumento(doc, "scarica")} aria-label={`Scarica ${doc.nome}`}><Download className="mr-1.5 h-4 w-4" /> Scarica</Button>
              </div>
            </li>)}
          </ul>
        </>}
    </div>
  </main>;
}
