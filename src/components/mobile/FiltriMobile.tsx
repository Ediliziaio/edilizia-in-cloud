import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SceltaFiltro<T extends string>({ titolo, valore, scelte, onScegli }: {
  titolo: string;
  valore: T;
  scelte: ReadonlyArray<{ value: T; label: string }>;
  onScegli: (v: T) => void;
}) {
  const scelta = scelte.find(opzione => opzione.value === valore);
  return (
    <label className="relative flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
      <span className="min-w-0 text-sm font-medium">{titolo}</span>
      <span aria-hidden="true" className="flex min-w-0 max-w-[58%] items-center gap-2 text-right text-sm text-muted-foreground">
        <span className="truncate">{scelta?.label ?? "Seleziona"}</span>
        <ChevronDown className="size-4 shrink-0" />
      </span>
      <select
        aria-label={titolo}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={valore}
        onChange={e => {
          const opzione = scelte.find(item => item.value === e.target.value);
          if (opzione) onScegli(opzione.value);
        }}
      >
        {scelte.map(opzione => <option key={opzione.value} value={opzione.value}>{opzione.label}</option>)}
      </select>
    </label>
  );
}

export function GruppoFiltri({ children }: { children: ReactNode }) {
  return <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>;
}

export function DettaglioFiltri({ titolo, riepilogo, children }: { titolo: string; riepilogo?: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{titolo}</span>
        <span className="flex min-w-0 max-w-[58%] items-center gap-2 text-right font-normal text-muted-foreground">
          {riepilogo && <span className="truncate">{riepilogo}</span>}
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
        </span>
      </summary>
      <div className="divide-y border-t">{children}</div>
    </details>
  );
}

export function DateFiltro({ dal, al, cambiaDal, cambiaAl }: {
  dal: string;
  al: string;
  cambiaDal: (data: string) => void;
  cambiaAl: (data: string) => void;
}) {
  return (
    <div className="grid gap-2 p-3 min-[380px]:grid-cols-2">
      <label className="min-w-0 space-y-1 text-sm">
        <span>Da</span>
        <Input type="date" className="h-11" value={dal} onChange={e => cambiaDal(e.target.value)} />
      </label>
      <label className="min-w-0 space-y-1 text-sm">
        <span>A</span>
        <Input type="date" className="h-11" value={al} min={dal || undefined} onChange={e => cambiaAl(e.target.value)} />
      </label>
    </div>
  );
}

/**
 * Pezzi comuni delle liste su telefono (Finanza, Persone, Formazione, Drive):
 * ricerca con accanto il bottone dei filtri, pannello dei filtri dal basso,
 * riquadri numero (nome + cifra) e righe compatte.
 */

export function SelettoreSezione<T extends string>({ nome, valore, sezioni, onScegli, className }: {
  nome: string;
  valore: T;
  sezioni: ReadonlyArray<{ id: T; label: string }>;
  onScegli: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        aria-label={nome}
        value={valore}
        onChange={(e) => {
          const sezione = sezioni.find(({ id }) => id === e.target.value);
          if (sezione) onScegli(sezione.id);
        }}
        className="h-11 w-full min-w-0 appearance-none truncate rounded-lg border bg-background pl-3 pr-9 text-base font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {sezioni.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

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
          aria-label={segnaposto}
          placeholder={segnaposto}
          value={valore}
          onChange={(e) => onCambia(e.target.value)}
          className="h-11 bg-background pl-9 text-base md:text-base"
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
      className={cn("relative size-11 shrink-0 bg-background", className)}
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
      <SheetContent side="bottom" overlayClassName="bg-slate-950/45" aria-describedby={undefined} className="mx-auto flex max-h-[90dvh] max-w-md flex-col gap-0 overflow-hidden rounded-t-3xl p-0 pt-4 [&>button:last-child]:right-2 [&>button:last-child]:top-1 [&>button:last-child]:grid [&>button:last-child]:size-11 [&>button:last-child]:place-items-center">
        <SheetHeader className="shrink-0 px-4 pb-2 pr-14 text-left">
          <SheetTitle className="text-base">{titolo}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 [&_input]:min-w-0 [&_input]:text-base [&_select]:text-base [&_[role=combobox]]:text-base">{children}</div>
        <div className="flex shrink-0 gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {attivi > 0 && (
            <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={onAzzera}>
              Azzera
            </Button>
          )}
          <Button className="min-h-11 flex-1" onClick={() => onAperto(false)}>
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
                "min-h-11 rounded-full border px-3 text-sm font-medium transition-colors",
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
  // border-border: dentro un elenco `divide-y` la riga-bottone prendeva il
  // bordo del bottone (quasi nero) invece di quello del tema.
  const cls = cn("flex min-h-[52px] w-full items-center gap-2.5 border-border px-3 py-2.5 text-left", (to || onClick) && "active:bg-muted", className);
  if (to) return <Link to={to} className={cn("tap-compact", cls)}>{corpo}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn("tap-compact", cls)}>{corpo}</button>;
  return <div className={cls}>{corpo}</div>;
}
