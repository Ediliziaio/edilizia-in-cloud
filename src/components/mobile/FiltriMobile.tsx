import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function SceltaFiltro<T extends string>({ titolo, valore, scelte, onScegli }: {
  titolo: string;
  valore: T;
  scelte: ReadonlyArray<{ value: T; label: string }>;
  onScegli: (v: T) => void;
}) {
  const t = useT();
  const scelta = scelte.find(opzione => opzione.value === valore);
  return (
    <label className="relative flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
      <span className="min-w-0 text-sm font-medium">{titolo}</span>
      <span aria-hidden="true" className="flex min-w-0 max-w-[58%] items-center gap-2 text-right text-sm text-muted-foreground">
        <span className="truncate">{scelta?.label ?? t("Seleziona")}</span>
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
  const t = useT();
  return (
    <div className="grid gap-2 p-3 min-[380px]:grid-cols-2">
      <label className="min-w-0 space-y-1 text-sm">
        <span>{t("Da")}</span>
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

/**
 * Le sezioni di una pagina da telefono e tablet: pillole arrotondate che scorrono di lato, come
 * Assistenza · Manutenzioni (decisione del founder, 23/11/2026). Prima era una tendina a tutta
 * riga: una forma diversa da tutte le altre schede e una scelta nascosta dietro un tocco in più.
 * `azione`: il bottone principale della pagina (es. «+ Nuova»), a destra sulla stessa riga.
 */
export function SelettoreSezione<T extends string>({ nome, valore, sezioni, onScegli, className, azione }: {
  nome: string;
  valore: T;
  sezioni: ReadonlyArray<{ id: T; label: string }>;
  onScegli: (id: T) => void;
  className?: string;
  azione?: ReactNode;
}) {
  // Scorrere di lato era scomodo (founder, 26/11/2026): la pillola scelta finiva tagliata sotto il
  // «+» e non si capiva che ce n'erano altre. Ora la scelta si porta da sola in vista e i bordi
  // sfumano solo dal lato dove c'è altro da scorrere.
  const fila = useRef<HTMLDivElement>(null);
  const [altro, setAltro] = useState({ sinistra: false, destra: false });
  const misura = useCallback(() => {
    const el = fila.current;
    if (!el) return;
    const sinistra = el.scrollLeft > 2;
    const destra = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setAltro(prima => (prima.sinistra === sinistra && prima.destra === destra ? prima : { sinistra, destra }));
  }, []);
  useEffect(() => {
    const el = fila.current;
    const scelta = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && scelta) {
      // Solo in orizzontale: scrollIntoView muoverebbe anche la pagina.
      const sinistra = scelta.offsetLeft; // la fila è «relative»: misura dal suo bordo
      if (sinistra < el.scrollLeft || sinistra + scelta.offsetWidth > el.scrollLeft + el.clientWidth) {
        el.scrollTo({ left: Math.max(0, sinistra - (el.clientWidth - scelta.offsetWidth) / 2) });
      }
    }
    misura();
  }, [valore, sezioni.length, misura]);
  useEffect(() => {
    const el = fila.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, [misura]);
  const sfuma = altro.sinistra && altro.destra
    ? "[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%_-_32px),transparent)]"
    : altro.destra ? "[mask-image:linear-gradient(to_right,black_calc(100%_-_32px),transparent)]"
    : altro.sinistra ? "[mask-image:linear-gradient(to_right,transparent,black_24px)]" : "";
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div ref={fila} onScroll={misura} role="group" aria-label={nome} className={cn("relative -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", sfuma)}>
        {sezioni.map(({ id, label }) => {
          const attiva = id === valore;
          return (
            <button key={id} type="button" aria-pressed={attiva} onClick={() => onScegli(id)}
              className={cn("h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                attiva ? "border-orange-200 bg-orange-50 text-orange-700" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          );
        })}
      </div>
      {azione && <div className="flex shrink-0 items-center gap-1.5">{azione}</div>}
    </div>
  );
}

/** Ricerca a tutta riga con il bottone-icona dei filtri (e il numero di quelli attivi). */
export function CercaConFiltri({
  valore,
  onCambia,
  segnaposto: segnapostoDato,
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
  const t = useT();
  const segnaposto = segnapostoDato ?? t("Cerca");
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
  const t = useT();
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("relative size-11 shrink-0 bg-background", className)}
      onClick={onClick}
      aria-label={t("Filtri")}
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
  titolo: titoloDato,
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
  const t = useT();
  const titolo = titoloDato ?? t("Filtri");
  return (
    <Sheet open={aperto} onOpenChange={onAperto}>
      <SheetContent side="bottom" overlayClassName="bg-slate-950/45" aria-describedby={undefined} className="mx-auto flex max-h-[90dvh] max-w-md flex-col gap-0 overflow-hidden rounded-t-3xl p-0 pt-4 [&>button:last-child]:right-2 [&>button:last-child]:top-[calc(env(safe-area-inset-top)+0.25rem)] [&>button:last-child]:grid [&>button:last-child]:size-11 [&>button:last-child]:place-items-center">
        <SheetHeader className="shrink-0 px-4 pb-2 pr-14 text-left">
          <SheetTitle className="text-base">{titolo}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 [&_input]:min-w-0 [&_input]:text-base [&_select]:text-base [&_[role=combobox]]:text-base">{children}</div>
        <div className="flex shrink-0 gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {attivi > 0 && (
            <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={onAzzera}>
              {t("Azzera")}
            </Button>
          )}
          <Button className="min-h-11 flex-1" onClick={() => onAperto(false)}>
            {risultati === undefined ? t("Fatto") : t("Mostra {cosa}", { cosa: String(risultati ?? "") })}
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
                attiva ? "border-orange-200 bg-orange-50 text-orange-700" : "border-border bg-background text-slate-700",
              )}
            >
              {c.label}
              {c.n !== undefined && <span className={cn("ml-1 tabular-nums", attiva ? "text-orange-700/70" : "text-muted-foreground")}>{c.n}</span>}
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
  // Una riga di pillole tonde «numero etichetta» (decisione del founder, 23/11/2026: stesse forme
  // in tutte le pagine; prima riquadri 2×2 alti ~150px). Toccata, la pillola filtra come prima.
  return (
    <div className={cn("-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {voci.map((v) => {
        const contenuto = (
          <>
            <span className={cn("font-semibold tabular-nums text-foreground", v.tono)}>{v.valore}</span>
            <span className="text-muted-foreground">{/^[A-ZÀ-Ý][a-zà-ÿ]/.test(v.label) ? v.label.charAt(0).toLowerCase() + v.label.slice(1) : v.label}</span>
          </>
        );
        const base = "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm";
        return v.onClick ? (
          <button
            key={v.label}
            type="button"
            onClick={v.onClick}
            aria-pressed={v.attivo}
            className={cn("tap-compact", base, v.attivo ? "border-orange-200 bg-orange-50" : "border-border bg-background")}
          >
            {contenuto}
          </button>
        ) : (
          <div key={v.label} className={cn(base, "border-border bg-background")}>{contenuto}</div>
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
        <div className="truncate text-sm font-semibold leading-snug">{titolo}</div>
        {sottotitolo && <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">{sottotitolo}</div>}
      </div>
      {(valore !== undefined || stato !== undefined) && (
        <div className="shrink-0 text-right">
          {valore !== undefined && <div className="text-sm font-semibold leading-tight tabular-nums">{valore}</div>}
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
