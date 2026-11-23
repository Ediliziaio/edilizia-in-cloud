import { useMemo, useState, type ReactNode } from "react";
import { Armchair, Check, Grid2X2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { ambientiPerModifiche3D, STILI_ARREDI, type ModificaCasa3D, type anteprimaModificheCasa3D } from "@/lib/planimetrie/modificheCasa3D";
import { PAVIMENTI_STANZA } from "../../../../shared/planimetrie/finiture";
import type { Planimetria } from "../../../../shared/planimetrie/modello";
import { modelliArredo } from "../../../../shared/planimetrie/modelliArredo";
import { nomeDelTipo, TIPI_ARREDO_3D } from "../editor/catalogo";
import { CampioneSuperficie } from "./CampioneSuperficie";

export const COLORI_ARREDO = [
  { nome: "Lino", hex: "#d4c4af" },
  { nome: "Terracotta", hex: "#ac6f57" },
  { nome: "Salvia", hex: "#829180" },
  { nome: "Noce", hex: "#80624d" },
] as const;

interface Props {
  documento: Planimetria;
  ambito: string;
  livelloId: string;
  onLivello: (id: string) => void;
  modifica: ModificaCasa3D | null;
  onModifica: (modifica: ModificaCasa3D | null) => void;
  anteprima?: ReturnType<typeof anteprimaModificheCasa3D>;
  prima: boolean;
  onPrima: (prima: boolean) => void;
  onApplica: () => void;
  onChiudi: () => void;
  stato?: string;
  occupato: boolean;
  azioniBozza: ReactNode;
}

export function riepilogoModificheCasa(anteprima: ReturnType<typeof anteprimaModificheCasa3D>) {
  const locali = anteprima.piani.reduce((n, p) => n + p.locali.length, 0);
  const arredi = anteprima.piani.reduce((n, p) => n + p.arredi, 0);
  const piani = anteprima.piani.length;
  return [arredi > 0 && `${arredi} ${arredi === 1 ? "arredo" : "arredi"}`,
    `${locali} ${locali === 1 ? "ambiente" : "ambienti"}`,
    `${piani} ${piani === 1 ? "piano" : "piani"}`].filter(Boolean).join(" · ");
}

export function ModificheRapide3D({
  documento, ambito, livelloId, onLivello, modifica, onModifica, anteprima, prima, onPrima, onApplica, onChiudi, stato, occupato, azioniBozza,
}: Props) {
  const [scheda, setScheda] = useState<"pavimenti" | "arredi">("pavimenti");
  const [mantieniBagni, setMantieniBagni] = useState(false);
  const gruppoArredo = modifica?.tipo === "arredo" ? modifica : undefined;
  const tipi = useMemo(() => {
    const conteggio = new Map<string, number>();
    for (const { arredi } of ambientiPerModifiche3D(documento, ambito, livelloId || undefined)) {
      for (const { elemento } of arredi) {
        if (TIPI_ARREDO_3D.has(elemento.tipo)) conteggio.set(elemento.tipo, (conteggio.get(elemento.tipo) ?? 0) + 1);
      }
    }
    return [...conteggio].sort(([a], [b]) => nomeDelTipo(a).localeCompare(nomeDelTipo(b), "it"));
  }, [documento, ambito, livelloId]);
  const puoApplicare = !!anteprima?.piani.length;
  const mostraEsito = !!anteprima && (modifica?.tipo !== "arredo" || modifica.modello !== undefined || modifica.colore !== undefined);

  return <aside id="modifiche-rapide-3d" aria-label="Modifiche rapide 3D"
    className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
    <div className="flex items-start justify-between gap-3 border-b px-3.5 py-3">
      <div>
        <h3 className="text-sm font-semibold">Modifiche rapide</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Prova le scelte direttamente nel 3D.</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Chiudi modifiche rapide" onClick={onChiudi}><X className="size-4" /></Button>
    </div>
    <fieldset disabled={occupato} className="space-y-3 p-3.5">
      <label className="block text-xs font-medium">Applica a
        <UniformSelect className="mt-1 h-9 w-full" value={livelloId} onChange={e => onLivello(e.target.value)}>
          <option value="">Tutta la casa</option>
          {documento.livelli.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </UniformSelect>
      </label>
      <Tabs value={scheda} onValueChange={v => { setScheda(v as typeof scheda); onModifica(null); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pavimenti" className="gap-1.5 text-xs"><Grid2X2 className="size-3.5" />Pavimenti</TabsTrigger>
          <TabsTrigger value="arredi" className="gap-1.5 text-xs"><Armchair className="size-3.5" />Arredi</TabsTrigger>
        </TabsList>
        <TabsContent value="pavimenti" className="space-y-2.5">
          <label className="flex min-h-8 items-center gap-2 text-xs">
            <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={mantieniBagni} onChange={e => {
              const checked = e.currentTarget.checked;
              setMantieniBagni(checked);
              if (modifica?.tipo === "pavimento") onModifica({ ...modifica, mantieniBagni: checked });
            }} />
            Mantieni il pavimento di bagni e lavanderie
          </label>
          <div className="grid grid-cols-2 gap-2 p-0.5 xl:max-h-[min(38dvh,425px)] xl:overflow-y-auto">
            {PAVIMENTI_STANZA.map(c => <CampioneSuperficie key={c.id} campione={c}
              attivo={modifica?.tipo === "pavimento" && modifica.campioneId === c.id}
              onClick={() => onModifica({ tipo: "pavimento", campioneId: c.id, mantieniBagni })} />)}
          </div>
        </TabsContent>
        <TabsContent value="arredi" className="space-y-3 p-0.5 xl:max-h-[min(46dvh,480px)] xl:overflow-y-auto">
          {!tipi.length ? <p className="text-xs text-muted-foreground">Nessun arredo negli ambienti selezionati.</p> : <>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Palette coordinata</p>
              <div className="grid gap-1.5">
                {(Object.keys(STILI_ARREDI) as Array<keyof typeof STILI_ARREDI>).map(id => {
                  const stile = STILI_ARREDI[id];
                  const scelto = modifica?.tipo === "stile" && modifica.stile === id;
                  return <Button key={id} type="button" size="sm" variant={scelto ? "secondary" : "outline"} aria-pressed={scelto}
                    className="justify-start gap-2 px-2.5 text-xs" onClick={() => onModifica({ tipo: "stile", stile: id })}>
                    <span className="flex shrink-0" aria-hidden>
                      {[stile.tessile, stile.mobile].map(colore => <span key={colore} className="size-4 rounded-full border border-white/70 first:z-10 last:-ml-1" style={{ backgroundColor: colore }} />)}
                    </span>{stile.nome}
                    {scelto && <Check className="ml-auto size-3.5" />}
                  </Button>;
                })}
              </div>
            </div>
            <label className="block border-t pt-3 text-xs font-medium">Modifica arredi per tipo
              <UniformSelect value={gruppoArredo?.arredo ?? ""} className="mt-1 h-9 w-full" onChange={e => onModifica(e.target.value ? { tipo: "arredo", arredo: e.target.value } : null)}>
                <option value="">Scegli il tipo di arredo</option>
                {tipi.map(([tipo, quanti]) => <option key={tipo} value={tipo}>{nomeDelTipo(tipo)} ({quanti})</option>)}
              </UniformSelect>
            </label>
            {gruppoArredo && tipi.some(([tipo]) => tipo === gruppoArredo.arredo) && <>
              {modelliArredo(gruppoArredo.arredo).length > 0 && <label className="block text-xs font-medium">Modello
                <UniformSelect value={gruppoArredo.modello === undefined ? "mantieni" : gruppoArredo.modello ?? ""} className="mt-1 h-9 w-full"
                  onChange={e => onModifica({ ...gruppoArredo, modello: e.target.value === "mantieni" ? undefined : e.target.value || null })}>
                  <option value="mantieni">Mantieni i modelli attuali</option>
                  <option value="">Modello di base</option>
                  {modelliArredo(gruppoArredo.arredo).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </UniformSelect>
              </label>}
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Colore</p>
                <div className="flex flex-wrap items-center gap-2">
                  {COLORI_ARREDO.map(c => <button key={c.hex} type="button" title={c.nome} aria-label={"Colore " + c.nome}
                    aria-pressed={gruppoArredo.colore === c.hex} onClick={() => onModifica({ ...gruppoArredo, colore: c.hex })}
                    className={cn("size-8 rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", gruppoArredo.colore === c.hex && "ring-2 ring-primary ring-offset-1")}
                    style={{ backgroundColor: c.hex }} />)}
                  <input type="color" className="h-8 w-9 rounded border bg-background p-0.5" aria-label="Colore personalizzato degli arredi"
                    value={gruppoArredo.colore ?? "#d4c4af"} onChange={e => onModifica({ ...gruppoArredo, colore: e.currentTarget.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">La modifica mantiene posizione, rotazione e misure degli arredi.</p>
            </>}
          </>}
        </TabsContent>
      </Tabs>
    </fieldset>
    <div className="space-y-2 border-t bg-card px-3.5 py-3">
      {mostraEsito && <div role="status" className="space-y-1 text-xs">
        <p className={cn("font-medium", anteprima.errore && "text-destructive")}>
          {anteprima.errore ?? (puoApplicare ? riepilogoModificheCasa(anteprima) : "Nessuna modifica per questa scelta.")}
        </p>
        {puoApplicare && <div role="group" aria-label="Confronto modifiche 3D" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <Button type="button" variant={prima ? "outline" : "ghost"} size="sm" className="h-7 text-xs" aria-pressed={prima} onClick={() => onPrima(true)}>Prima</Button>
          <Button type="button" variant={prima ? "ghost" : "outline"} size="sm" className="h-7 text-xs" aria-pressed={!prima} onClick={() => onPrima(false)}>Anteprima</Button>
        </div>}
      </div>}
      {stato && <p role="status" className="text-xs text-muted-foreground">{stato}</p>}
      {modifica && <Button type="button" size="sm" className="w-full gap-1.5" disabled={occupato || !puoApplicare} onClick={onApplica}>
        <Check className="size-4" />Applica alla bozza
      </Button>}
      {azioniBozza}
    </div>
  </aside>;
}
