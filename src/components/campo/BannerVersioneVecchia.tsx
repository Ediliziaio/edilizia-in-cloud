/**
 * «La tua app è vecchia»: la riga rossa in cima all'area operaio.
 *
 * Nata il 25/11/2026: un operaio non vedeva i cantieri perché il suo telefono girava
 * codice di tre giorni prima, e né lui né l'ufficio potevano accorgersene. Il motivo e la
 * regola della soglia stanno in lib/campo/versioneApp.
 *
 * Due testi diversi, perché due sono le vie d'uscita: sul web si butta via quello che il
 * telefono ha salvato e si riapre (lo facciamo noi, col bottone); nell'app installata il
 * codice sta dentro il pacchetto e si cambia solo dallo store.
 */
import { useState, type JSX } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useVersioneApp } from "@/hooks/campo/useVersioneApp";
import { svuotaERiapri } from "@/lib/campo/versioneApp";
import { isNative } from "@/lib/mobile";
import { useFormatiCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export default function BannerVersioneVecchia(): JSX.Element | null {
  const { daAggiornare, build } = useVersioneApp();
  const t = useT();
  const formati = useFormatiCampo();
  const [inCorso, setInCorso] = useState(false);

  if (!daAggiornare) return null;

  return (
    <div
      role="alert"
      className="flex-none flex flex-wrap items-center gap-2 border-b border-red-800 bg-red-600 px-4 py-2 text-sm font-medium text-white"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-[12rem] flex-1 leading-tight">
        {t("Questa app è vecchia (del {data}): i cantieri e i dati che vedi possono essere sbagliati.", {
          data: formati.data(build),
        })}
      </span>
      {isNative ? (
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide">
          {t("Scarica l’aggiornamento dallo store.")}
        </span>
      ) : (
        <button
          type="button"
          disabled={inCorso}
          onClick={() => {
            setInCorso(true);
            void svuotaERiapri();
          }}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-red-700 disabled:opacity-70"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${inCorso ? "animate-spin" : ""}`} aria-hidden="true" />
          {t("Aggiorna adesso")}
        </button>
      )}
    </div>
  );
}
