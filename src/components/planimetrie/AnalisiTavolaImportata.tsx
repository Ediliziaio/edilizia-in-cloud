import { ArrowRight, CircleAlert, Layers2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LetturaTavolaTecnica } from "@/lib/planimetrie/analisiTavola";
import { scalaRasterHvacDiscordante, type AreaTavola, type DatiHvac, type VistaTavolaTecnica } from "@/lib/planimetrie/tavolaTecnica";

const formato = new Intl.NumberFormat("it-IT", { useGrouping: "always" });
const totalePortate = (dati: DatiHvac) => dati.portate.reduce((somma, p) => somma + p.cfm, 0);

export function SelettoreLivelliTecnici({ vista, legendaLetta, onVista }: {
  vista: VistaTavolaTecnica | "originale";
  legendaLetta: boolean;
  onVista: (vista: VistaTavolaTecnica | "originale") => void;
}) {
  const livelli = [
    { id: "originale", nome: "Originale" },
    { id: "pianta", nome: "Base architettonica" },
    { id: "mandata", nome: legendaLetta ? "Mandata" : "Traccia blu" },
    { id: "ripresa", nome: legendaLetta ? "Ripresa" : "Traccia rossa" },
  ] as const;
  return <div role="group" aria-label="Livelli della tavola" className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
    {livelli.map(({ id, nome }) => <Button key={id} type="button" size="sm" variant={vista === id ? "secondary" : "ghost"}
      className="h-8 px-2.5 text-xs" aria-pressed={vista === id} onClick={() => onVista(id)}>{nome}</Button>)}
  </div>;
}

export function ImmagineTecnica({ src, larghezza, altezza, zona, ritaglio }: {
  src: string;
  larghezza: number;
  altezza: number;
  zona: AreaTavola;
  ritaglio: boolean;
}) {
  const x = zona.x * larghezza;
  const y = zona.y * altezza;
  const w = zona.larghezza * larghezza;
  const h = zona.altezza * altezza;
  return <svg viewBox={`0 0 ${larghezza} ${altezza}`} className="h-full w-full min-h-0" role="img"
    aria-label={ritaglio ? "Tavola con l’area consigliata per il ritaglio" : "Tavola con il dato selezionato in evidenza"}>
    <image href={src} width={larghezza} height={altezza} />
    {ritaglio && <path d={`M 0 0 H ${larghezza} V ${altezza} H 0 Z M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`}
      fill="rgba(15,23,42,.25)" fillRule="evenodd" />}
    <rect x={x} y={y} width={w} height={h} fill={ritaglio ? "none" : "rgba(37,99,235,.2)"}
      stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" rx={3} />
  </svg>;
}

export function AnalisiTavolaImportata({ lettura, ritaglioApplicato, puoRitagliare, evidenza, onEvidenza, onRitaglia, onOriginale }: {
  lettura: LetturaTavolaTecnica;
  ritaglioApplicato: boolean;
  puoRitagliare: boolean;
  evidenza: AreaTavola | null;
  onEvidenza: (zona: AreaTavola | null) => void;
  onRitaglia: (area: AreaTavola) => void;
  onOriginale: () => void;
}) {
  const { tavola, righe, etichetteLette } = lettura;
  const pianoTerra = righe.some((s) => s.confidence >= 0.5 && /\bPRIZEM[IL]JE\b/i.test(s.text));
  return <section aria-labelledby="titolo-analisi-tavola" className="space-y-3 rounded-xl border bg-card p-4 motion-safe:animate-in motion-safe:fade-in-0">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ScanLine className="h-4 w-4" aria-hidden="true" /></span>
      <div>
        <h2 id="titolo-analisi-tavola" className="text-sm font-semibold">{
          tavola.tipo === "hvac" ? tavola.dati.portate.length || tavola.codiceMandata ? "Tavola HVAC" : "Schema con reti colorate"
            : tavola.tipo === "composita" ? "Pianta con viste affiancate" : "Esito dell’analisi"
        }</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{
          tavola.tipo === "hvac" ? "Controlla le reti nei livelli sopra la tavola." : tavola.tipo === "composita"
            ? pianoTerra ? "Il titolo della tavola indica il piano terra." : "Il riquadro suggerisce l’area della pianta principale."
            : "Puoi regolare il ritaglio e aprire la tavola nell’editor."
        }</p>
      </div>
    </div>
    {tavola.tipo === "hvac" && <RiscontriHvac dati={tavola.dati} etichetteLette={etichetteLette}
      scalaDiscordante={scalaRasterHvacDiscordante(tavola)} evidenza={evidenza} onEvidenza={onEvidenza} />}
    {tavola.tipo === "composita" && <>
      <p className="flex items-start gap-2 rounded-lg border bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        Verifica le quote minute e le aperture sul PDF o sul DWG originale. Imposta la scala nell’editor a partire da una quota leggibile.
      </p>
      {puoRitagliare && <Button type="button" size="sm" className="gap-2" onClick={() => onRitaglia(tavola.area)}>
        Usa la pianta principale <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>}
      {ritaglioApplicato && <div className="flex flex-wrap items-center gap-2">
        <span role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Ritaglio applicato</span>
        <Button type="button" size="sm" variant="outline" onClick={onOriginale}>Rivedi il foglio intero</Button>
      </div>}
    </>}
  </section>;
}

function RiscontriHvac({ dati, etichetteLette, scalaDiscordante, evidenza, onEvidenza }: {
  dati: DatiHvac; etichetteLette: boolean; scalaDiscordante: boolean; evidenza: AreaTavola | null; onEvidenza: (zona: AreaTavola | null) => void;
}) {
  const ripetute = new Map<string, number>();
  for (const { nome } of dati.portate) if (nome) ripetute.set(nome, (ripetute.get(nome) ?? 0) + 1);
  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-2">
      {!!dati.portate.length && <div className="rounded-lg border bg-muted/25 p-3">
        <p className="text-xs text-muted-foreground">Somma delle {dati.portate.length} portate in tavola</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{formato.format(totalePortate(dati))} CFM</p>
      </div>}
      {dati.orizzontale && <div className="rounded-lg border bg-muted/25 p-3">
        <p className="text-xs text-muted-foreground">Quote d’asse scritte</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{formato.format(dati.orizzontale.totaleMm / 1000)}{
          dati.verticale ? ` × ${formato.format(dati.verticale.totaleMm / 1000)} m` : " m in orizzontale"
        }</p>
      </div>}
    </div>
    {!etichetteLette && <p className="text-xs text-muted-foreground">Riconoscimento testo della foto non disponibile. Puoi comunque esplorare le tracce colorate.</p>}
    {!!dati.sezioni.length && <div className="space-y-1.5">
      <h3 className="flex items-center gap-2 text-xs font-semibold"><Layers2 className="h-4 w-4 text-primary" aria-hidden="true" />Sezioni lette</h3>
      <ul className="flex flex-wrap gap-1.5">
        {dati.sezioni.map((s) => <li key={`${s.rete}-${s.larghezzaMm}-${s.altezzaMm}`}
          className={cn("rounded-md border px-2 py-1 text-xs tabular-nums",
            s.rete === "mandata" ? "border-sky-600/20 bg-sky-500/10" : "border-rose-600/20 bg-rose-500/10")}>
          {s.rete === "mandata" ? "Mandata" : "Ripresa"} {s.larghezzaMm} × {s.altezzaMm} mm
        </li>)}
      </ul>
    </div>}
    {(dati.unitaTrattamentoAria || dati.simboli.length > 0) && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {dati.unitaTrattamentoAria && <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
        aria-pressed={evidenza === dati.unitaTrattamentoAria} onClick={() => onEvidenza(evidenza === dati.unitaTrattamentoAria ? null : dati.unitaTrattamentoAria)}>
        Individua UTA
      </Button>}
      {dati.simboli.length > 0 && <span>In legenda · {dati.simboli.join(" · ")}</span>}
    </p>}
    {!!dati.portate.length && <details className="rounded-lg border">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">Portate per ambiente</summary>
      <ul className="divide-y border-t">
        {dati.portate.map(({ nome, cfm, zona }) => <li key={`${zona.x}-${zona.y}`}>
          <button type="button" aria-pressed={evidenza === zona} onClick={() => onEvidenza(evidenza === zona ? null : zona)}
            className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              evidenza === zona && "bg-primary/10")}>
            <span className="min-w-0 break-words">{nome || "Ambiente da identificare"}{(ripetute.get(nome) ?? 0) > 1 && <span className="text-amber-700 dark:text-amber-400"> · Etichetta ripetuta</span>}</span>
            <span className="shrink-0 font-medium tabular-nums">{formato.format(cfm)} CFM</span>
          </button>
        </li>)}
      </ul>
    </details>}
    <p className="flex items-start gap-2 rounded-lg border bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>{dati.sigleDaVerificare > 0 && `${dati.sigleDaVerificare} sigle di sezione da ricontrollare. `}{
        dati.scalaScritta && `Scala stampata ${dati.scalaScritta}. `
      }{scalaDiscordante ? "La foto mostra una possibile differenza di scala tra i due assi. " : ""}Verifica scala, collegamenti e quote di posa sulla tavola tecnica prima di ricavare le quantità.</span>
    </p>
  </div>;
}
