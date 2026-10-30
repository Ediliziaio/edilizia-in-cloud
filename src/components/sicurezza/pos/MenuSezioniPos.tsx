import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronsDownUp, ChevronsUpDown, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface VoceMenuSezione {
  id: string;
  titolo: string;
  /** Voci da completare; `undefined` = sezione senza controllo di completezza (Firme e consegna). */
  mancanti?: number;
}

interface MenuProps {
  sezioni: VoceMenuSezione[];
  onVai: (id: string) => void;
  onComprimiComplete: () => void;
  onEspandiTutto: () => void;
}

const Stato = ({ mancanti }: { mancanti?: number }) =>
  mancanti === undefined ? null
    : mancanti > 0
      ? <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900" aria-label={`${mancanti} da completare`}>{mancanti}</span>
      : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="completa" />;

/** Computer: l'elenco delle sezioni che resta fermo di lato mentre si scorre (grazie a `useStickyNelDocumento`). */
export function NavSezioniPos({ sezioni, onVai, onComprimiComplete, onEspandiTutto }: MenuProps) {
  return (
    <nav aria-label="Sezioni del POS" className="hidden lg:block">
      <div className="sticky top-20 space-y-1 rounded-xl border bg-card p-2 text-sm">
        <ol className="space-y-0.5">
          {sezioni.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => onVai(s.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.titolo}</span>
                <Stato mancanti={s.mancanti} />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex gap-1 border-t pt-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-8 flex-1 gap-1 px-1 text-[11px]" onClick={onComprimiComplete} title="Chiude le sezioni complete: restano aperte quelle con voci da completare">
            <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />Solo da fare
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 flex-1 gap-1 px-1 text-[11px]" onClick={onEspandiTutto} title="Apre tutte le sezioni">
            <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />Apri tutto
          </Button>
        </div>
      </div>
    </nav>
  );
}

interface BarraProps extends MenuProps {
  percento: number;
  mancantiTotali: number;
  onMostraMancanti: () => void;
}

/**
 * Telefono e tablet: una barra sottile che resta in cima mentre si scorre (un POS arriva a decine di schermate), con le
 * sezioni a un tocco, l'avanzamento e le voci mancanti. Prima non c'era nessun modo di spostarsi se non scorrere.
 */
export function BarraSezioniPos({ sezioni, onVai, onComprimiComplete, onEspandiTutto, percento, mancantiTotali, onMostraMancanti }: BarraProps) {
  const [aperto, setAperto] = useState(false);
  return (
    <div className="sticky top-0 z-30 -mx-1 border-b bg-background/95 px-1 py-1.5 backdrop-blur lg:hidden" role="region" aria-label="Avanzamento del POS">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="tap-compact h-9 shrink-0 gap-1.5 px-2.5" onClick={() => setAperto(true)} aria-haspopup="dialog">
          <ListTree className="h-4 w-4" aria-hidden="true" />Sezioni
        </Button>
        <Progress value={percento} className="h-2 min-w-0 flex-1" aria-label={`Completezza ${percento}%`} />
        {mancantiTotali > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="tap-compact h-9 shrink-0 gap-1 px-2 text-amber-800" onClick={onMostraMancanti} aria-label={`${mancantiTotali} voci da completare: vedi quali`}>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />{mancantiTotali}
          </Button>
        ) : (
          <span className="inline-flex h-9 shrink-0 items-center gap-1 px-2 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Completo</span>
        )}
      </div>
      <Sheet open={aperto} onOpenChange={setAperto}>
        <SheetContent side="bottom" className="space-y-2 p-4">
          <SheetHeader><SheetTitle className="text-base">Sezioni del POS</SheetTitle></SheetHeader>
          <ol className="space-y-1">
            {sezioni.map((s, i) => (
              <li key={s.id}>
                <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm active:bg-muted"
                  onClick={() => { setAperto(false); setTimeout(() => onVai(s.id), 60); }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">{s.titolo}</span>
                  <Stato mancanti={s.mancanti} />
                </button>
              </li>
            ))}
          </ol>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="tap-compact h-10 flex-1" onClick={() => { onComprimiComplete(); setAperto(false); }}>Solo da fare</Button>
            <Button type="button" variant="outline" className="tap-compact h-10 flex-1" onClick={() => { onEspandiTutto(); setAperto(false); }}>Apri tutto</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
