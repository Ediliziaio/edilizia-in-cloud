/**
 * Prospetti e sezioni della pianta (fase 6): si sceglie il lato o la linea di taglio, si vede
 * l'anteprima in scala e si scarica in SVG, DXF (AutoCAD) o si stampa in PDF.
 */
import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { disegnoInDxf, disegnoInSvg, prospetto, prospettoQuotato, sezione, type Lato, type PianoProspetto } from "@/lib/planimetrie/prospetti";
import type { StatoPianta, Tetto } from "../../../shared/planimetrie/modello.ts";

type Scelta = Lato | "sezione";

function scarica(nome: string, dati: Uint8Array | string, tipo: string) {
  const parte: BlobPart = typeof dati === "string" ? dati : (new Uint8Array(dati).buffer as ArrayBuffer);
  const url = URL.createObjectURL(new Blob([parte], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ProspettiDialog({ aperto, onChiudi, stato, titolo, tetto, piani }: { aperto: boolean; onChiudi: () => void; stato: StatoPianta | null; titolo: string; tetto?: Tetto | null; /** Tutti i piani (per ambito): con più di uno si può disegnare l'intero edificio. */ piani?: PianoProspetto[] }) {
  const [scelta, setScelta] = useState<Scelta>("sud");
  const [asse, setAsse] = useState<"orizzontale" | "verticale">("orizzontale");
  const [posizione, setPosizione] = useState(50);
  const [scala, setScala] = useState(50);
  const [quotato, setQuotato] = useState(true);
  const [edificio, setEdificio] = useState(true);
  const piuPiani = (piani?.length ?? 0) > 1;

  const limiti = useMemo(() => {
    const pts = (stato?.muri ?? []).flatMap((m) => [m.p1, m.p2]);
    if (!pts.length) return null;
    return { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
  }, [stato]);

  const disegno = useMemo(() => {
    if (!aperto || !stato || !limiti) return null;
    if (scelta !== "sezione") {
      if (!quotato) return prospetto(stato, scelta, tetto);
      return prospettoQuotato(piuPiani && edificio && piani ? piani : [{ id: "corrente", nome: titolo || "Piano", quota: 0, stato, tetto }], scelta);
    }
    const [a, b] = asse === "orizzontale" ? [limiti.minY, limiti.maxY] : [limiti.minX, limiti.maxX];
    return sezione(stato, { asse, valore: a + ((b - a) * posizione) / 100 }, "Sezione A-A", tetto);
  }, [aperto, stato, limiti, scelta, asse, posizione, tetto, quotato, edificio, piani, piuPiani, titolo]);
  const svg = useMemo(() => (disegno ? disegnoInSvg(disegno, scala).svg : null), [disegno, scala]);
  const base = `${(titolo || "pianta").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${scelta === "sezione" ? "sezione" : `prospetto-${scelta}`}`;

  const stampa = () => {
    if (!svg) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><title>${disegno?.titolo ?? "Disegno"}</title><style>@page{margin:10mm}body{margin:0}svg{max-width:100%;height:auto}</style>${svg}<script>window.onload=()=>{window.print()}<\/script>`);
    w.document.close();
  };

  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Prospetti e sezioni</DialogTitle>
          <DialogDescription>Disegnati dalle pareti, porte e finestre della pianta, in scala, con quote, codici dei serramenti, cassonetti e oscuranti. Si aggiornano da soli quando cambi la pianta.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Cosa</Label>
            <ToggleGroup type="single" value={scelta} onValueChange={(v) => v && setScelta(v as Scelta)} variant="outline" size="sm">
              <ToggleGroupItem value="sud">Sud</ToggleGroupItem>
              <ToggleGroupItem value="nord">Nord</ToggleGroupItem>
              <ToggleGroupItem value="est">Est</ToggleGroupItem>
              <ToggleGroupItem value="ovest">Ovest</ToggleGroupItem>
              <ToggleGroupItem value="sezione">Sezione</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Scala</Label>
            <ToggleGroup type="single" value={String(scala)} onValueChange={(v) => v && setScala(Number(v))} variant="outline" size="sm">
              <ToggleGroupItem value="50">1:50</ToggleGroupItem>
              <ToggleGroupItem value="100">1:100</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {scelta !== "sezione" && (
            <div className="flex flex-wrap items-center gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm"><Switch checked={quotato} onCheckedChange={setQuotato} />Quote e dettagli</label>
              {piuPiani && quotato && <label className="flex items-center gap-2 text-sm"><Switch checked={edificio} onCheckedChange={setEdificio} />Tutto l'edificio</label>}
            </div>
          )}
          {scelta === "sezione" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Taglio</Label>
                <ToggleGroup type="single" value={asse} onValueChange={(v) => v && setAsse(v as typeof asse)} variant="outline" size="sm">
                  <ToggleGroupItem value="orizzontale">Orizzontale</ToggleGroupItem>
                  <ToggleGroupItem value="verticale">Verticale</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="min-w-48 flex-1 space-y-2">
                <Label className="text-xs">Dove tagliare: {posizione}%</Label>
                <Slider value={[posizione]} min={2} max={98} step={1} onValueChange={([v]) => setPosizione(v)} aria-label="Posizione del taglio" />
              </div>
            </>
          )}
        </div>
        <div className="flex min-h-64 items-center justify-center overflow-auto rounded-lg border bg-white p-2">
          {svg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={disegno?.titolo ?? "Disegno"} className="max-h-[55vh] w-full object-contain" />
            : <p className="p-6 text-sm text-muted-foreground">La pianta non ha pareti da disegnare.</p>}
        </div>
        {scelta === "sezione" && <p className="text-xs text-muted-foreground">Le pareti tagliate sono campite in nero; quelle oltre il taglio si vedono in alzato, più chiare.</p>}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" disabled={!svg} onClick={() => svg && scarica(`${base}.svg`, svg, "image/svg+xml")}><Download className="mr-1.5 h-4 w-4" />SVG</Button>
          <Button variant="outline" disabled={!disegno} onClick={() => disegno && scarica(`${base}.dxf`, disegnoInDxf(disegno), "application/dxf")}><Download className="mr-1.5 h-4 w-4" />DXF (AutoCAD)</Button>
          <Button disabled={!svg} onClick={stampa}><Printer className="mr-1.5 h-4 w-4" />Stampa o salva PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
