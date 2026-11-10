import { useEffect, useState } from "react";
import { Check, FileImage, ScanLine, ShieldCheck } from "lucide-react";

/** Fasi reali del browser; il server risponde al termine, senza percentuali simulate. */
export function AttesaLetturaPianta({ fase, anteprima }: { fase: "preparazione" | "lettura"; anteprima?: string | null }) {
  const [inizio] = useState(Date.now);
  const [secondi, setSecondi] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecondi(Math.floor((Date.now() - inizio) / 1000)), 1000);
    return () => clearInterval(t);
  }, [inizio]);
  return <section aria-label="Lettura della planimetria in corso" className="overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.025]">
    <div className="flex items-center gap-4 p-4">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-white">
        {anteprima ? <img src={anteprima} alt="Documento in lettura" className="h-full w-full object-contain opacity-70" /> : <FileImage className="m-6 h-12 w-12 text-primary/30" />}
        <div aria-hidden="true" className="pianta-scansione absolute inset-x-0 top-0 h-8 border-b-2 border-primary/70 bg-gradient-to-t from-primary/15 to-transparent" />
      </div>
      <div className="min-w-0 flex-1">
        <p role="status" className="font-semibold">{fase === "preparazione" ? "Preparo il documento" : "L’AI sta leggendo la pianta"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{fase === "preparazione" ? "Ottimizzo il foglio e le quote per la lettura." : "Misure, contorno, aperture e arredi. Poi potrai confrontare la bozza con l’originale."}</p>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">{secondi} s trascorsi{secondi >= 90 ? " · Il foglio richiede più tempo: la lettura è ancora in corso." : ""}</p>
      </div>
    </div>
    <ol className="grid grid-cols-3 gap-2 border-t bg-background/60 px-4 py-3 text-xs">
      <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" />Documento pronto</li>
      <li className="flex items-center gap-1.5 text-primary"><ScanLine className="h-3.5 w-3.5 motion-safe:animate-pulse" />{fase === "preparazione" ? "Preparazione" : "Lettura AI"}</li>
      <li className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Controllo nell’editor</li>
    </ol>
    <style>{`@keyframes piantaScan{0%,100%{transform:translateY(-32px)}70%{transform:translateY(96px)}}.pianta-scansione{animation:piantaScan 2.8s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.pianta-scansione{animation:none;top:40%}}`}</style>
  </section>;
}
