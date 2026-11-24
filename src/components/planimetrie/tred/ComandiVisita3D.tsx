import { useRef } from "react";
import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, Building2, ChevronUp, DoorOpen, Footprints, Map as MapIcon, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PassaggioVisita, TappaVisita, luogoVisita } from "@/lib/planimetrie/tred/visita";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function PartenzaVisita({ tappe, partenza, occupato, onParti, onArrivo }: {
  tappe: TappaVisita[]; partenza: string; occupato: boolean; onParti: (id: string) => void; onArrivo: () => void;
}) {
  const tr = useT();
  const scelta = useRef(false);
  if (!tappe.length) return <p className="text-xs text-muted-foreground">{tr("Disegna un pavimento o un ambiente per iniziare la visita.")}</p>;
  const gruppi = [
    { nome: "Ambienti", tappe: tappe.filter(t => !t.transito) },
    { nome: "Scale e uscite", tappe: tappe.filter(t => t.transito) },
  ];
  return <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
    <span className="shrink-0">{tr("Vai a")}</span>
    <Select value={partenza} disabled={occupato} onValueChange={id => { scelta.current = true; onParti(id); }}>
      <SelectTrigger aria-label={tr("Vai a un ambiente della visita")} title={tappe.find(t => t.id === partenza)?.nome}
        className="h-9 w-auto min-w-0 max-w-64 text-sm sm:max-w-[20rem]"><SelectValue /></SelectTrigger>
      <SelectContent onCloseAutoFocus={e => {
        if (!scelta.current) return;
        e.preventDefault();
        scelta.current = false;
        onArrivo();
      }}>
        {gruppi.filter(g => g.tappe.length > 0).map(g => <SelectGroup key={g.nome}>
          <SelectLabel>{tr(g.nome)}</SelectLabel>
          {g.tappe.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
        </SelectGroup>)}
      </SelectContent>
    </Select>
  </div>;
}

const MOSSE = [
  { nome: "Cammina avanti", icona: ArrowUp, davanti: 1, lato: 0 },
  { nome: "Spostati a sinistra", icona: ArrowLeft, davanti: 0, lato: -1 },
  { nome: "Cammina indietro", icona: ArrowDown, davanti: -1, lato: 0 },
  { nome: "Spostati a destra", icona: ArrowRight, davanti: 0, lato: 1 },
] as const;

export function MovimentoVisita({ disabilitato, onCammina, onPremi, onRilascia, onGira }: {
  disabilitato: boolean;
  onCammina: (avanti: number, lato: number) => void;
  onPremi: (avanti: number, lato: number) => void;
  onRilascia: () => void;
  onGira: (lato: number) => void;
}) {
  const t = useT();
  const direzione = ({ nome, icona: Icona, davanti, lato }: typeof MOSSE[number]) => <Button key={nome} type="button" variant="outline" size="icon"
    className="size-9 touch-none" disabled={disabilitato} aria-label={t(nome)} title={t(nome)}
    onPointerDown={e => {
      if (!e.isPrimary || e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      // Il clic resta sul visore mentre i comandi si usano con mouse o dito.
      e.preventDefault();
      onPremi(davanti, lato);
    }}
    onPointerUp={onRilascia} onPointerCancel={onRilascia} onLostPointerCapture={onRilascia}
    onClick={e => { if (!e.detail) onCammina(davanti, lato); }}>
    <Icona className="size-4"/>
  </Button>;
  return <div role="group" aria-label={t("Comandi della visita")} className="pointer-events-auto grid grid-cols-3 gap-1 rounded-xl bg-card/95 p-1.5 shadow-md ring-1 ring-black/10 supports-[backdrop-filter]:backdrop-blur-sm">
    <Button type="button" variant="ghost" size="icon" disabled={disabilitato} className="size-9 motion-safe:transition-colors" aria-label={t("Ruota a sinistra")} title={t("Ruota a sinistra")} onClick={() => onGira(-1)}>
      <RotateCcw className="size-4"/>
    </Button>
    {direzione(MOSSE[0])}
    <Button type="button" variant="ghost" size="icon" disabled={disabilitato} className="size-9 motion-safe:transition-colors" aria-label={t("Ruota a destra")} title={t("Ruota a destra")} onClick={() => onGira(1)}>
      <RotateCw className="size-4"/>
    </Button>
    {MOSSE.slice(1).map(direzione)}
  </div>;
}

export function IndicazioniVisita({ luogo, vicino, passaggioInCorso, avviso, invito, onPassaggio, onRender, onGuardaEdificio, mostraMappa, onMappa }: {
  luogo: ReturnType<typeof luogoVisita>; vicino?: PassaggioVisita; passaggioInCorso: string; avviso?: string; invito?: string;
  onPassaggio: (p: PassaggioVisita) => void; onRender?: () => void; onGuardaEdificio?: () => void;
  mostraMappa?: boolean; onMappa?: () => void;
}) {
  const t = useT();
  const Icona = vicino?.tipo === "sali" ? ChevronUp : vicino?.tipo === "scendi" ? ArrowDownLeft : vicino?.tipo === "esci" ? ArrowDownRight : DoorOpen;
  return <>
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
      {luogo && <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-card/95 px-3.5 py-2.5 shadow-md ring-1 ring-black/10 supports-[backdrop-filter]:backdrop-blur-sm">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {luogo.esterno ? <DoorOpen className="size-4"/> : <Footprints className="size-4"/>}
        </span>
        <div role="status" aria-label={t("Posizione nella visita")} className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{luogo.piano}</p>
          <p className="truncate text-sm font-semibold" title={luogo.nome}>{luogo.nome}</p>
        </div>
      </div>}
      <div className="ml-auto flex shrink-0 gap-1.5">
        {onMappa && <Button type="button" size="sm" variant="outline" aria-pressed={mostraMappa} aria-label={t("Mappa 2D")}
          className="pointer-events-auto h-9 gap-1.5 bg-card shadow-sm aria-pressed:bg-primary/10 aria-pressed:text-primary motion-safe:active:scale-[.96]"
          onClick={onMappa}><MapIcon className="size-3.5"/>{t("Mappa")}</Button>}
        {onGuardaEdificio && <Button type="button" size="sm" variant="outline" className="pointer-events-auto h-9 gap-1.5 bg-card shadow-sm"
          onClick={onGuardaEdificio} title={t("Guarda l’edificio")}><Building2 className="size-3.5"/><span className="max-sm:sr-only">{t("Guarda l’edificio")}</span></Button>}
        {onRender && <Button type="button" size="sm" variant="outline" className="pointer-events-auto h-9 gap-1.5 bg-card shadow-sm max-sm:hidden"
          onClick={onRender}><Sparkles className="size-3.5"/>{t("Render da qui")}</Button>}
      </div>
    </div>
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-end gap-1.5 pr-32">
      {passaggioInCorso ? <p role="status" className="rounded-lg bg-card/95 px-3 py-2 text-xs font-medium shadow-md motion-safe:animate-in motion-safe:fade-in">{passaggioInCorso}</p>
        : avviso ? <p role="status" className="rounded-lg bg-card/95 px-3 py-2 text-xs font-medium shadow-md">{avviso}</p>
        : vicino ? <Button type="button" size="sm" className="pointer-events-auto h-auto min-h-9 whitespace-normal text-left shadow-md motion-safe:animate-in motion-safe:fade-in"
          onClick={() => onPassaggio(vicino)}><Icona className="size-4 shrink-0"/>{vicino.nome}<kbd aria-hidden className="ml-1 hidden rounded border border-white/35 px-1 text-[10px] sm:inline">E</kbd></Button>
        : invito && <p className="hidden rounded-lg bg-card/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm sm:block">{invito}</p>}
    </div>
  </>;
}
