/**
 * La galleria di una stanza della pianta: tutti i suoi render, i più recenti per primi.
 * Si apre dalla scheda (tocca la stanza) o subito dopo «Salva nella galleria».
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Star, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";

export interface RenderDellaStanza {
  id: string;
  url: string;
  salvato: boolean;
  creato: string;
}

const dataBreve = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function GalleriaStanza({ aperto, onChiudi, nomeStanza, render, nuovoRender }: {
  aperto: boolean;
  onChiudi: () => void;
  nomeStanza: string;
  render: RenderDellaStanza[];
  /** Dove si fa un altro render di questa stanza. */
  nuovoRender: string;
}) {
  const [i, setI] = useState(0);
  useEffect(() => { if (aperto) setI(0); }, [aperto]);
  const n = render.length;
  const corrente = render[Math.min(i, Math.max(0, n - 1))];
  const vai = (d: number) => setI((x) => (n ? (x + d + n) % n : 0));

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-w-3xl gap-3 max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none max-md:p-3">
        <DialogHeader>
          <DialogTitle>{nomeStanza}</DialogTitle>
          <DialogDescription>{n === 0 ? "Nessun render ancora." : n === 1 ? "1 render" : `${n} render`}</DialogDescription>
        </DialogHeader>
        {corrente ? (
          <>
            <div className="relative overflow-hidden rounded-lg border bg-muted">
              <img src={corrente.url} alt={`Render di ${nomeStanza}, ${dataBreve(corrente.creato)}`} className="max-h-[60vh] w-full object-contain max-md:max-h-[55dvh]" />
              {n > 1 && (
                <>
                  <Button size="icon" variant="secondary" className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2" onClick={() => vai(-1)} aria-label="Render precedente"><ChevronLeft className="h-5 w-5" /></Button>
                  <Button size="icon" variant="secondary" className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2" onClick={() => vai(1)} aria-label="Render successivo"><ChevronRight className="h-5 w-5" /></Button>
                </>
              )}
              {corrente.salvato && (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium shadow-sm">
                  <Star className="h-3 w-3 fill-current text-amber-500" /> In galleria
                </span>
              )}
            </div>
            {n > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {render.map((r, k) => (
                  <button key={r.id} type="button" onClick={() => setI(k)} aria-label={`Render del ${dataBreve(r.creato)}`} aria-current={k === i}
                    className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 ${k === i ? "border-primary" : "border-transparent"}`}>
                    <img src={r.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{dataBreve(corrente.creato)}</p>
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Quando fai un render di questa stanza lo trovi qui.</p>
        )}
        <div className="flex gap-2 max-md:flex-col">
          <Button asChild className="flex-1 gap-2">
            <Link to={nuovoRender}><Wand2 className="h-4 w-4" />Nuovo render di questa stanza</Link>
          </Button>
          {corrente && (
            <Button variant="outline" className="gap-2" onClick={() => downloadRenderImage(corrente.url, `render-${nomeStanza.replace(/\W+/g, "-").toLowerCase()}.png`).catch(() => toast.error("Download non riuscito: riprova."))}>
              <Download className="h-4 w-4" />Scarica
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
