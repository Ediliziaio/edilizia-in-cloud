import { ScanLine } from "lucide-react";
import type { Planimetria } from "@/components/planimetrie/editor/adattatore";
import { useBlobRef } from "./useBlobRef";

export function EsitoLetturaPianta({ pianta, sorgente, avvisi = [] }: { pianta: Planimetria; sorgente?: { file: Blob; nome: string }; avvisi?: string[] }) {
  const immagine = useBlobRef<HTMLImageElement>(sorgente?.file, "src");
  const link = useBlobRef<HTMLAnchorElement>(sorgente?.file, "href");
  const locali = pianta.livelli.flatMap((l) => l.fatto.locali);
  const aperture = pianta.livelli.flatMap((l) => l.fatto.aperture);
  const elementi = pianta.livelli.flatMap((l) => l.fatto.elementi);
  return <section aria-label="Risultato della lettura del documento" className="rounded-xl border bg-background p-3">
    <details>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-center gap-2 font-semibold"><ScanLine className="h-4 w-4 text-primary" />Bozza ricavata dal documento</span><span className="text-xs font-medium text-primary">Confronta con il foglio ↕</span></summary>
    <div className="mt-3 flex flex-wrap items-start gap-4">
      {sorgente && <a ref={link} target="_blank" rel="noreferrer" aria-label="Apri il documento letto dall’AI" className="shrink-0 rounded-lg border bg-muted/30 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img ref={immagine} alt="Documento usato per la lettura AI" className="h-32 w-32 object-contain" /></a>}
      <div className="min-w-[200px] flex-1">
        <p className="text-sm text-muted-foreground">Confronta il disegno con il foglio originale prima di salvarlo.</p>
        <p className="mt-3 text-xs text-muted-foreground">Le misure con ≈ restano stimate. Controlla soprattutto i numeri scritti a mano, i rientri e le aperture.</p>
      </div>
    </div>
    </details>
    <div className="mt-2 flex flex-wrap gap-2 text-xs">{[`${locali.length} ${locali.length === 1 ? "ambiente" : "ambienti"}`, `${aperture.filter((a) => a.tipo === "porta" || a.tipo === "varco").length} porte / passaggi`, `${aperture.filter((a) => a.tipo === "finestra" || a.tipo === "portafinestra").length} finestre / portefinestre`, `${elementi.length} arredi / sanitari`].map((s) => <span key={s} className="rounded-md bg-muted px-2 py-1">{s}</span>)}</div>
    {avvisi.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      <p className="font-semibold">Da verificare sul documento</p>
      <p className="mt-1">{avvisi[0]}</p>
      {avvisi.length > 1 && <details className="mt-2"><summary className="cursor-pointer rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Altre {avvisi.length - 1} osservazioni della lettura</summary><ul className="mt-2 list-disc space-y-1.5 pl-4">{avvisi.slice(1).map((a, i) => <li key={`${i}:${a}`}>{a}</li>)}</ul></details>}
    </div>}
    {sorgente && (!aperture.length || !elementi.length) && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{!aperture.length ? "Porte e finestre non riconosciute. " : ""}{!elementi.length ? "Arredi e sanitari non riconosciuti. " : ""}Questo non significa che siano assenti: confronta i simboli sul foglio.</p>}
  </section>;
}
