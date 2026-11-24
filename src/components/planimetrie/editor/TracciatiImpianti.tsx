import { useState } from "react";
import { Route, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { chiaveTratto, type AttraversamentoImpianto, type Percorso } from "../../../../shared/planimetrie/impianti.ts";
import { LINEE_IMPIANTO, type CollettoreRadiante, type Elemento, type LineaImpianto, type Punto, type StatoPianta, type TracciatoImpianto,
  type ZonaRadiante } from "../../../../shared/planimetrie/modello.ts";
import { CATALOGO } from "./catalogo";
import { PavimentoRadiantePanel } from "./PavimentoRadiantePanel";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export const NOMI_LINEE: Record<LineaImpianto, string> = {
  elettrica: "Elettrico", acqua: "Acqua", scarico: "Scarichi", frigorifera: "Rame clima", condensa: "Condensa", riscaldamento: "Riscaldamento",
};
const nomiSimbolo = new Map(CATALOGO.map(v => [String(v.tipo), v.nome]));
const metri = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });

type Props = {
  percorsi: Percorso[];
  daRicollegare: TracciatoImpianto[];
  elementi: Elemento[];
  selezionato?: Percorso;
  anteprima?: Percorso;
  vertici: Punto[] | null;
  sposta: number | null;
  attraversamenti: AttraversamentoImpianto[];
  scalaIncerta: boolean;
  stato: StatoPianta;
  soloRadiante: boolean;
  onCambiaRadiante: (localeId: string, zona: ZonaRadiante | null) => void;
  posaCollettore: boolean;
  onPosaCollettore: (impostazioni: Omit<CollettoreRadiante, "posizione"> | null) => void;
  onCambiaCollettore: (collettore: CollettoreRadiante | null) => void;
  onScegli: (chiave: string) => void;
  onModifica: () => void;
  onSposta: (indice: number | null) => void;
  onTogliUltimo: () => void;
  onAzzera: () => void;
  onAnnulla: () => void;
  onApplica: () => void;
  onRipristina: (chiave: string) => void;
  onChiudi: () => void;
};

export function TracciatiImpianti({ percorsi, daRicollegare, elementi, selezionato, anteprima, vertici, sposta, attraversamenti,
  scalaIncerta, stato, soloRadiante, onCambiaRadiante, posaCollettore, onPosaCollettore, onCambiaCollettore,
  onScegli, onModifica, onSposta, onTogliUltimo, onAzzera, onAnnulla, onApplica, onRipristina, onChiudi }: Props) {
  const tr = useT();
  const [sezione, setSezione] = useState<"tracciati" | "radiante">(stato.pavimentoRadiante?.length || !percorsi.length ? "radiante" : "tracciati");
  const radiante = soloRadiante || (sezione === "radiante" && !selezionato);
  const reti = LINEE_IMPIANTO.filter(rete => percorsi.some(p => p.linea === rete));
  const [preferita, setPreferita] = useState<LineaImpianto | undefined>(reti[0]);
  const rete = selezionato?.linea ?? (preferita && reti.includes(preferita) ? preferita : reti[0]);
  const simboli = new Map(elementi.map(e => [e.id, e.etichetta ?? nomiSimbolo.get(e.tipo) ?? e.tipo]));
  const nome = (t: Pick<TracciatoImpianto, "daId" | "aId">) => `${simboli.get(t.daId) ?? t.daId} → ${simboli.get(t.aId) ?? t.aId}`;
  const chiave = selezionato ? chiaveTratto(selezionato) : "";
  const corrente = anteprima ?? selezionato;
  return <aside aria-label={soloRadiante ? tr("Pavimento radiante") : tr("Tracciati impianti")} className="z-[1] max-h-[44dvh] shrink-0 space-y-3 overflow-y-auto border-t bg-background p-3 lg:max-h-none lg:w-[19rem] lg:border-l lg:border-t-0">
    <div className="flex items-center gap-2">
      <Route className="size-4 text-primary" aria-hidden="true" />
      <h3 className="flex-1 text-sm font-semibold">{soloRadiante ? tr("Pavimento radiante") : tr("Tracciati impianti")}</h3>
      <Button variant="ghost" size="icon" className="size-7" aria-label={tr("Chiudi tracciati impianti")} onClick={onChiudi}><X className="size-4" /></Button>
    </div>
    {!soloRadiante && <div className="flex gap-1.5">
      <Button type="button" size="sm" variant={radiante ? "outline" : "secondary"} aria-pressed={!radiante}
        onClick={() => { onPosaCollettore(null); setSezione("tracciati"); }}>{tr("Percorsi")}</Button>
      <Button type="button" size="sm" variant={radiante ? "secondary" : "outline"} aria-pressed={radiante} onClick={() => { onScegli(""); setSezione("radiante"); }}>{tr("Pavimento radiante")}</Button>
    </div>}
    {scalaIncerta && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">{tr("Riscontra la scala prima di usare i metri nel computo.")}</p>}
    {radiante ? <PavimentoRadiantePanel stato={stato} scalaIncerta={scalaIncerta} inPosa={posaCollettore} onCambia={onCambiaRadiante}
      onPosa={onPosaCollettore} onCollettore={onCambiaCollettore} /> : <>
    {rete ? <>
      <label className="block space-y-1 text-xs font-medium"><span>{tr("Rete")}</span>
        <UniformSelect value={rete} onChange={e => { setPreferita(e.target.value as LineaImpianto); onScegli(""); }}>
          {reti.map(r => <option key={r} value={r}>{tr(NOMI_LINEE[r])}</option>)}
        </UniformSelect>
      </label>
      <label className="block space-y-1 text-xs font-medium"><span>{tr("Tratto")}</span>
        <UniformSelect value={chiave} onChange={e => onScegli(e.target.value)}>
          <option value="">{tr("Seleziona un tratto")}</option>
          {percorsi.filter(p => p.linea === rete).map((p, i) => <option key={chiaveTratto(p)} value={chiaveTratto(p)}>
            {i + 1} · {nome(p)} · {metri.format(p.lunghezzaCm / 100)} m
          </option>)}
        </UniformSelect>
      </label>
    </> : <p className="text-xs text-muted-foreground">{tr("Posa punti impianto e la relativa partenza sulla pianta per iniziare.")}</p>}
    {corrente && <div className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium">{nome(corrente)}</p>
        <output aria-label={tr("Lunghezza del tratto")} className="shrink-0 text-sm font-semibold tabular-nums">{metri.format(corrente.lunghezzaCm / 100)} m</output>
      </div>
      <p className="text-xs text-muted-foreground">{tr("Sviluppo senza sfrido, con calate stimate.")}</p>
      {vertici === null ? <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" onClick={onModifica}>{corrente.vertici ? tr("Modifica percorso") : tr("Disegna percorso")}</Button>
        {corrente.vertici && <Button type="button" size="sm" variant="ghost" onClick={() => onRipristina(chiave)}>{tr("Ripristina stima")}</Button>}
      </div> : <>
        <p className="text-xs text-muted-foreground">
          {sposta !== null ? tr("Tocca la nuova posizione del punto {sposta}.", { sposta: sposta + 1 }) : vertici.length
            ? tr("Tocca la pianta per aggiungere un vertice o scegli quale spostare.")
            : tr("Percorso diretto in anteprima. Tocca la pianta per aggiungere una svolta.")}
        </p>
        {!!vertici.length && <div className="flex flex-wrap gap-1" aria-label={tr("Vertici del percorso")}>
          {vertici.map((_, i) => <Button key={i} size="sm" variant={sposta === i ? "secondary" : "outline"} className="h-7 px-1.5 text-xs"
            aria-pressed={sposta === i} onClick={() => onSposta(sposta === i ? null : i)}>{tr("Punto {i}", { i: i + 1 })}</Button>)}
        </div>}
        {!!vertici.length && <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={onTogliUltimo}>{tr("Togli ultimo punto")}</Button>
          {vertici.length>1 && <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={onAzzera}>{tr("Azzera punti")}</Button>}
        </div>}
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" onClick={onApplica}>{tr("Applica tracciato")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onAnnulla}>{tr("Annulla tracciato")}</Button>
        </div>
      </>}
    </div>}
    {!!attraversamenti.length && <section aria-label={tr("Interferenze in pianta")} className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
      <p className="font-medium">{tr(attraversamenti.length === 1 ? "{n} interferenza da verificare" : "{n} interferenze da verificare", { n: attraversamenti.length })}</p>
      <ul className="space-y-1">{attraversamenti.map((a, i) => <li key={i}>
        {a.aperturaId ? tr("Apertura {aperturaId}", { aperturaId: String(a.aperturaId ?? "") }) : a.tipoMuro === "portante" ? tr("Parete indicata come portante") : a.tipoMuro === "esterno" ? tr("Parete esterna") : tr("Tramezzo")}
      </li>)}</ul>
      <p>{tr("Controlla la quota di posa sul progetto.")}</p>
    </section>}
    {!!daRicollegare.length && <div className="space-y-1 rounded-md border p-2.5 text-xs">
      <p className="font-medium">{tr("Tratti da ricollegare")}</p>
      <p className="text-muted-foreground">{tr("I simboli di questi tratti formano ora collegamenti diversi. Ridisegna il nuovo tratto.")}</p>
      {daRicollegare.map(t => <div key={chiaveTratto(t)} className="flex items-center justify-between gap-1">
        <span>{nome(t)}</span>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => onRipristina(chiaveTratto(t))}>{tr("Rimuovi")}</Button>
      </div>)}
    </div>}
    </>}
  </aside>;
}
