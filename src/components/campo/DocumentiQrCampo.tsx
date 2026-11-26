/**
 * I documenti del cartello col QR, dentro l'app dell'operaio (richiesta del founder, 23/11/2026): «l'azienda carica
 * i documenti che vedo con il QR: mettili anche qui». Stessa selezione e stessa funzione della pagina pubblica del
 * QR (documenti-cantiere); il codice del QR lo dà `campo_qr_cantiere_token` solo a chi lavora su quel cantiere.
 * Senza QR o senza documenti non compare niente.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TIPI_DOCUMENTO_CANTIERE, type TipoDocumentoCantiere } from "@/lib/commesse/documentiCantiere";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { Capacitor } from "@capacitor/core";
import { apriDocumentoNativo } from "@/lib/mobile/documenti";
import { condividiFile } from "@/lib/mobile/condividiFile";

interface DocumentoQr { id: string; nome: string; tipo: TipoDocumentoCantiere; byte: number; anteprima: boolean }
interface ElencoQr { token: string; documenti: DocumentoQr[] }

async function chiediDocumenti<T>(body: object): Promise<T> {
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, "");
  const controller = new AbortController();
  const limite = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const risposta = await fetch(`${base}/functions/v1/documenti-cantiere`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(body), signal: controller.signal, cache: "no-store", referrerPolicy: "no-referrer",
    });
    if (!risposta.ok) throw new Error(risposta.status === 409 ? "Anteprima non disponibile. Scarica il file." : "Documento non disponibile. Riprova.");
    return await risposta.json();
  } finally {
    window.clearTimeout(limite);
  }
}

export function DocumentiQrCampo({ orderId }: { orderId: string }) {
  const t = useT();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState("");
  const bloccato = useRef(false);
  const elenco = useQuery({
    queryKey: ["campo-documenti-qr", orderId],
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<ElencoQr | null> => {
      const { data: token, error } = await supabase.rpc("campo_qr_cantiere_token", { p_ordine: orderId });
      if (error) throw error;
      if (!token) return null;
      const { documenti } = await chiediDocumenti<{ documenti: DocumentoQr[] }>({ token });
      return { token, documenti: documenti ?? [] };
    },
  });
  const dati = elenco.data;
  if (!dati?.documenti.length) return null;

  async function apri(doc: DocumentoQr, azione: "apri" | "scarica") {
    if (bloccato.current || !dati) return;
    const nativo = Capacitor.isNativePlatform();
    const scheda = azione === "apri" && !nativo ? window.open("about:blank", "_blank") : null;
    if (azione === "apri" && !nativo && !scheda) { setErrore(t("Consenti l’apertura della scheda o scegli Scarica.")); return; }
    if (scheda) scheda.opener = null;
    bloccato.current = true;
    setInCorso(doc.id);
    setErrore("");
    try {
      const { url } = await chiediDocumenti<{ url: string }>({ token: dati.token, id: doc.id, azione });
      const destinazione = new URL(url);
      if (destinazione.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin) throw new Error("Indirizzo non valido");
      if (nativo) {
        if (azione === "apri") await apriDocumentoNativo(destinazione.href, doc.nome);
        else {
          const risposta = await fetch(destinazione.href, { referrerPolicy: "no-referrer" });
          if (!risposta.ok) throw new Error("Documento non disponibile");
          await condividiFile(await risposta.blob(), doc.nome, doc.nome);
        }
      } else if (scheda) scheda.location.replace(destinazione.href);
      else {
        const link = document.createElement("a");
        link.href = destinazione.href;
        link.rel = "noreferrer";
        document.body.append(link);
        link.click();
        link.remove();
      }
    } catch (e) {
      scheda?.close();
      setErrore(t(e instanceof Error && e.message.startsWith("Anteprima") ? e.message : "Documento non disponibile. Riprova."));
    } finally {
      bloccato.current = false;
      setInCorso(null);
    }
  }

  return (
    <section aria-labelledby="titolo-documenti-qr" className="rounded-2xl border border-border bg-background p-4 shadow-sm max-sm:p-3">
      <h2 id="titolo-documenti-qr" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <QrCode className="size-4" aria-hidden="true" /> {t("Documenti del cantiere")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("Gli stessi del cartello con il QR.")}</p>
      {errore && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{errore}</p>}
      <ul className="mt-2 divide-y">
        {dati.documenti.map(doc => (
          <li key={doc.id} className="flex flex-wrap items-center gap-2 py-2">
            <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">{doc.nome}</p>
              <p className="text-xs text-muted-foreground">{t(TIPI_DOCUMENTO_CANTIERE[doc.tipo] ?? "Altro documento di cantiere")}</p>
            </div>
            <div className="flex gap-1.5">
              {doc.anteprima && (
                <button type="button" disabled={inCorso !== null} onClick={() => void apri(doc, "apri")}
                  aria-label={`${t("Apri")} ${doc.nome}`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-50">
                  <ExternalLink className="size-4" aria-hidden="true" /> {t("Apri")}
                </button>
              )}
              <button type="button" disabled={inCorso !== null} onClick={() => void apri(doc, "scarica")}
                aria-label={`${t("Scarica")} ${doc.nome}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-50">
                <Download className="size-4" aria-hidden="true" /> {t("Scarica")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
