import { useState } from "react";
import { Columns2, Download, ImageIcon, Layers2 } from "lucide-react";
import { useBlobRef } from "../useBlobRef";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ConfrontoRender3D({ nome, riferimento, risultato, nomeFile, errore, testoAttesa = "In attesa del calcolo Cycles", rapporto = 1120 / 744 }: {
  nome: string; riferimento?: Blob; risultato?: Blob; nomeFile: string; errore?: string; testoAttesa?: string; rapporto?: number;
}) {
  const [confronto, setConfronto] = useState("lati");
  const [confine, setConfine] = useState(50);
  const prima = useBlobRef<HTMLImageElement>(riferimento, "src");
  const foto = useBlobRef<HTMLImageElement>(risultato, "src");
  const download = useBlobRef<HTMLAnchorElement>(risultato, "href");
  return <div className="space-y-3">
    {risultato && riferimento && <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" value={confronto} variant="outline" size="sm" aria-label="Confronto delle inquadrature" onValueChange={v => v && setConfronto(v)}>
        <ToggleGroupItem value="lati" className="gap-1.5"><Columns2 className="size-4"/>Affiancate</ToggleGroupItem>
        <ToggleGroupItem value="sovrapposte" className="gap-1.5"><Layers2 className="size-4"/>Sovrapponi</ToggleGroupItem>
      </ToggleGroup>
    </div>}
    {confronto === "sovrapposte" && riferimento && risultato ? <div className="overflow-hidden rounded-xl border bg-muted/30">
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden" style={{ aspectRatio: rapporto, maxWidth: `min(100%, ${rapporto * 56}dvh)` }}>
        <img ref={foto} alt={nome + " · Render fotorealistico"} className="absolute inset-0 size-full" />
        <img ref={prima} alt={nome + " · Anteprima 3D"} className="absolute inset-0 size-full" style={{ clipPath: `inset(0 ${100 - confine}% 0 0)` }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_6px_#0008]" style={{ left: `${confine}%` }} />
        <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-xs text-white">3D</span>
        <span className="absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-xs text-white">Render</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <input type="range" min={0} max={100} value={confine} onChange={e => setConfine(+e.target.value)} className="w-full max-w-md accent-primary"
          aria-label="Divisore tra 3D e render" aria-valuetext={`${confine}% anteprima 3D`} />
        <a ref={download} download={nomeFile} aria-label={"Scarica render " + nome} className="rounded p-1 text-primary hover:bg-primary/10"><Download className="size-4" /></a>
      </div>
    </div> : <div className="grid items-start gap-3 md:grid-cols-2">
      <figure className="overflow-hidden rounded-xl border bg-muted/30">
        <figcaption className="border-b bg-card px-3 py-2 text-sm font-medium">Anteprima 3D</figcaption>
        <div className="grid place-items-center" style={{ aspectRatio: rapporto }}>
          {riferimento ? <img ref={prima} alt={nome + " · Anteprima 3D"} className="size-full object-contain" /> :
            <span className="p-3 text-center text-sm text-muted-foreground">Inquadratura in preparazione</span>}
        </div>
      </figure>
      <figure className="overflow-hidden rounded-xl border bg-muted/30">
        <figcaption className="flex items-center justify-between gap-2 border-b bg-card px-3 py-2 text-sm font-medium">
          Render fotorealistico
          {risultato && <a ref={download} download={nomeFile} aria-label={"Scarica render " + nome} className="rounded text-primary hover:underline"><Download className="size-4" /></a>}
        </figcaption>
        <div className="grid place-items-center" style={{ aspectRatio: rapporto }}>
          {risultato ? <img ref={foto} alt={nome + " · Render fotorealistico"} className="size-full object-contain" /> :
            <p className="space-y-2 p-4 text-center text-sm text-muted-foreground">
              <ImageIcon className="mx-auto size-5" aria-hidden="true" /><span>{errore ?? testoAttesa}</span>
            </p>}
        </div>
      </figure>
    </div>}
  </div>;
}
