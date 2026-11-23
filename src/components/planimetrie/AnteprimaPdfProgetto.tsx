import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBlobRef } from "./useBlobRef";

export function PaginaPdfProgetto({ file, pagina, copertina = false }: { file: Blob; pagina: number; copertina?: boolean }) {
  const [esito, setEsito] = useState<{ file: Blob; pagina: number; immagine: Blob | null }>();
  const attuale = esito?.file === file && esito.pagina === pagina ? esito : undefined;
  const immagineRef = useBlobRef<HTMLImageElement>(attuale?.immagine ?? undefined, "src");
  useEffect(() => {
    let attiva = true;
    void (async () => {
      let immagine: Blob | null = null;
      try {
        const { conPaginePdf } = await import("./editor/paginaPdf");
        immagine = await conPaginePdf(file, copertina ? 680 : 1440, async disegna => {
          const { canvas } = await disegna(pagina);
          try { return await new Promise<Blob | null>(ok => canvas.toBlob(ok, "image/png")); }
          finally { canvas.width = canvas.height = 1; }
        });
      } catch { /* Il file resta disponibile dal pulsante di download. */ }
      if (attiva) setEsito({ file, pagina, immagine });
    })();
    return () => { attiva = false; };
  }, [file, pagina, copertina]);
  if (attuale?.immagine) return <img ref={immagineRef}
    alt={copertina ? "Copertina del PDF appena generato" : `Pagina ${pagina} del fascicolo`}
    className="block w-full bg-white object-contain motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"/>;
  return <div className="grid aspect-[1.414/1] place-items-center bg-muted/30 p-3 text-center text-xs text-muted-foreground">
    {attuale ? <p>{copertina ? "Copertina non disponibile." : "Anteprima di questa pagina non disponibile. Puoi scaricare il PDF."}</p>
      : <p role="status" className="flex items-center gap-2"><Loader2 className="size-4 motion-safe:animate-spin"/>{copertina ? "Carico la copertina…" : `Carico pagina ${pagina}…`}</p>}
  </div>;
}

export function SfogliaPdfProgetto({ file, pagine, torna }: { file: Blob; pagine: number; torna: () => void }) {
  const ritorno = useRef<HTMLButtonElement>(null);
  const [pagina, setPagina] = useState(1);
  const [campo, setCampo] = useState("1");
  useEffect(() => { ritorno.current?.focus({ preventScroll: true }); }, []);
  const vai = (n: number) => {
    if (!Number.isFinite(n)) { setCampo(String(pagina)); return; }
    const destinazione = Math.min(pagine, Math.max(1, Math.trunc(n)));
    setPagina(destinazione);
    setCampo(String(destinazione));
  };
  return <section aria-label="Lettura del fascicolo" className="space-y-3">
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-2 shadow-sm">
      <Button ref={ritorno} type="button" variant="ghost" size="sm" onClick={torna}><ArrowLeft className="size-4"/>Torna alle opzioni</Button>
      <div className="flex items-center gap-1.5">
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Pagina precedente" disabled={pagina === 1}
          onClick={() => vai(pagina - 1)}><ArrowLeft className="size-4"/></Button>
        <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); vai(Number(campo || pagina)); }}>
          <Input type="number" inputMode="numeric" aria-label="Numero di pagina del fascicolo" value={campo} min={1} max={pagine}
            className="h-8 w-16 px-1.5 text-center tabular-nums" onChange={e => setCampo(e.target.value)}
            onBlur={() => vai(Number(campo || pagina))}/>
          <span className="text-xs text-muted-foreground">di {pagine}</span>
        </form>
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Pagina successiva" disabled={pagina === pagine}
          onClick={() => vai(pagina + 1)}><ArrowRight className="size-4"/></Button>
      </div>
    </div>
    <figure className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <PaginaPdfProgetto file={file} pagina={pagina}/>
    </figure>
  </section>;
}
