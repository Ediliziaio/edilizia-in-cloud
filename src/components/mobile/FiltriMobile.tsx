import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Search, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Pezzi comuni delle liste su telefono (Finanza, Persone, Formazione, Drive):
 * ricerca con accanto il bottone dei filtri, pannello dei filtri dal basso,
 * riquadri numero (nome + cifra) e riga da ~52px. Sul desktop non compaiono:
 * ogni pagina li monta solo sotto i 640px (`sm:hidden`) o con useIsMobile().
 */

/** Ricerca a tutta riga con il bottone-icona dei filtri (e il numero di quelli attivi). */
export function CercaConFiltri({
  valore,
  onCambia,
  segnaposto = "Cerca",
  filtriAttivi = 0,
  onApriFiltri,
  className,
}: {
  valore: string;
  onCambia: (v: string) => void;
  segnaposto?: string;
  filtriAttivi?: number;
  /** Senza, niente bottone dei filtri (solo ricerca). */
  onApriFiltri?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={segnaposto}
          value={valore}
          onChange={(e) => onCambia(e.target.value)}
          className="h-9 bg-background pl-9 text-sm"
        />
      </div>
      {onApriFiltri && (
        <BottoneFiltri attivi={filtriAttivi} onClick={onApriFiltri} />
      )}
    </div>
  );
}

/** Bottone-icona dei filtri con il pallino del numero di filtri attivi. */
export function BottoneFiltri({ attivi, onClick, className }: { attivi: number; onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("tap-compact relative h-9 w-9 shrink-0 bg-background", className)}
      onClick={onClick}
      aria-label="Filtri"
    >
      <SlidersHorizontal className="h-4 w-4" />
      {attivi > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
          {attivi}
        </span>
      )}
    </Button>
  );
}

/** Pannello dei filtri dal basso: in fondo «Azzera» (se serve) e «Mostra N». */
export function PannelloFiltri({
  aperto,
  onAperto,
  attivi,
  onAzzera,
  risultati,
  titolo = "Filtri",
  children,
}: {
  aperto: boolean;
  onAperto: (v: boolean) => void;
  attivi: number;
  onAzzera: () => void;
  /** Quanti elementi mostra la lista coi filtri scelti (etichetta del bottone). */
  risultati?: number;
  titolo?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={aperto} onOpenChange={onAperto}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{titolo}</SheetTitle>
        </SheetHeader>
        <div className="mt-3 space-y-4">{children}</div>
        <div className="mt-5 flex gap-2">
          {attivi > 0 && (
            <Button variant="outline" className="h-10" onClick={onAzzera}>
              Azzera
            </Button>
          )}
          <Button className="h-10 flex-1" onClick={() => onAperto(false)}>
            {risultati === undefined ? "Fatto" : `Mostra ${risultati}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Una fila di pillole nel pannello dei filtri. */
export function PilloleFiltro<T extends string>({
  titolo,
  valore,
  onScegli,
  scelte,
}: {
  titolo: string;
  valore: T;
  onScegli: (v: T) => void;
  scelte: { value: T; label: string; n?: number }[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titolo}</p>
      <div className="flex flex-wrap gap-1.5">
        {scelte.map((c) => {
          const attiva = valore === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onScegli(c.value)}
              aria-pressed={attiva}
              className={cn(
                "tap-compact h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                attiva ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-background text-slate-700",
              )}
            >
              {c.label}
              {c.n !== undefined && <span className={cn("ml-1 tabular-nums", attiva ? "text-white/70" : "text-muted-foreground")}>{c.n}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface VoceKpiMobile {
  label: string;
  valore: string;
  /** Colore del numero (es. text-rose-600) quando segnala qualcosa. */
  tono?: string;
  /** Riquadro cliccabile (filtro veloce). */
  onClick?: () => void;
  attivo?: boolean;
}

/** Riquadri numero su telefono: solo nome e cifra, due per riga. */
export function KpiMobili({ voci, className }: { voci: VoceKpiMobile[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {voci.map((v) => {
        const contenuto = (
          <>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{v.label}</p>
            <p className={cn("truncate text-base font-bold leading-tight tabular-nums", v.tono)}>{v.valore}</p>
          </>
        );
        // border-border: sui <button> il colore del bordo non eredita quello del tema (veniva quasi nero).
        const base = "min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-left";
        return v.onClick ? (
          <button
            key={v.label}
            type="button"
            onClick={v.onClick}
            aria-pressed={v.attivo}
            className={cn("tap-compact", base, v.attivo && "border-slate-900 ring-1 ring-slate-900")}
          >
            {contenuto}
          </button>
        ) : (
          <div key={v.label} className={base}>{contenuto}</div>
        );
      })}
    </div>
  );
}

/**
 * Una riga di lista da ~52px: titolo 13px e sottotitolo 11px a sinistra,
 * cifra e stato a destra. Link, bottone o riga semplice.
 */
export function RigaMobile({
  titolo,
  sottotitolo,
  valore,
  stato,
  sinistra,
  to,
  onClick,
  className,
}: {
  titolo: ReactNode;
  sottotitolo?: ReactNode;
  valore?: ReactNode;
  stato?: ReactNode;
  /** Pallino, avatar o icona piccola prima del titolo. */
  sinistra?: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const corpo = (
    <>
      {sinistra}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold leading-tight">{titolo}</div>
        {sottotitolo && <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{sottotitolo}</div>}
      </div>
      {(valore !== undefined || stato !== undefined) && (
        <div className="shrink-0 text-right">
          {valore !== undefined && <div className="text-[13px] font-semibold leading-tight tabular-nums">{valore}</div>}
          {stato !== undefined && <div className="mt-0.5 text-[11px] leading-tight">{stato}</div>}
        </div>
      )}
    </>
  );
  // py-2.5 e non min-h: su link e bottoni la regola tap-compact azzera il min-height.
  const cls = cn("flex min-h-[52px] w-full items-center gap-2.5 px-3 py-2.5 text-left", (to || onClick) && "active:bg-muted", className);
  if (to) return <Link to={to} className={cn("tap-compact", cls)}>{corpo}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn("tap-compact", cls)}>{corpo}</button>;
  return <div className={cls}>{corpo}</div>;
}
