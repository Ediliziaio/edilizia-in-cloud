import { useState } from "react";
import { Route, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { chiaveTratto, type AttraversamentoImpianto, type Percorso } from "../../../../shared/planimetrie/impianti.ts";
import { LINEE_IMPIANTO, type CollettoreRadiante, type Elemento, type LineaImpianto, type Punto, type StatoPianta, type TracciatoImpianto,
  type ZonaRadiante } from "../../../../shared/planimetrie/modello.ts";
import { CATALOGO } from "./catalogo";
import { PavimentoRadiantePanel } from "./PavimentoRadiantePanel";

export const NOMI_LINEE: Record<LineaImpianto, string> = {
  elettrica: "Elettrico", acqua: "Acqua", scarico: "Scarichi", frigorifera: "Rame clima", condensa: "Condensa", riscaldamento: "Riscaldamento",
};
const nomiSimbolo = new Map(CATALOGO.map(v => [String(v.tipo), v.nome]));
const metri = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

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
  const [sezione, setSezione] = useState<"tracciati" | "radiante">(stato.pavimentoRadiante?.length || !percorsi.length ? "radiante" : "tracciati");
  const radiante = soloRadiante || (sezione === "radiante" && !selezionato);
  const reti = LINEE_IMPIANTO.filter(rete => percorsi.some(p => p.linea === rete));
  const [preferita, setPreferita] = useState<LineaImpianto | undefined>(reti[0]);
  const rete = selezionato?.linea ?? (preferita && reti.includes(preferita) ? preferita : reti[0]);
  const simboli = new Map(elementi.map(e => [e.id, e.etichetta ?? nomiSimbolo.get(e.tipo) ?? e.tipo]));
  const nome = (t: Pick<TracciatoImpianto, "daId" | "aId">) => `${simboli.get(t.daId) ?? t.daId} → ${simboli.get(t.aId) ?? t.aId}`;
  const chiave = selezionato ? chiaveTratto(selezionato) : "";
  const corrente = anteprima ?? selezionato;
  return <aside aria-label={soloRadiante ? "Pavimento radiante" : "Tracciati impianti"} className="z-[1] max-h-[44dvh] shrink-0 space-y-3 overflow-y-auto border-t bg-background p-3 lg:max-h-none lg:w-[19rem] lg:border-l lg:border-t-0">
    <div className="flex items-center gap-2">
      <Route className="size-4 text-primary" aria-hidden="true" />
      <h3 className="flex-1 text-sm font-semibold">{soloRadiante ? "Pavimento radiante" : "Tracciati impianti"}</h3>
      <Button variant="ghost" size="icon" className="size-7" aria-label="Chiudi tracciati impianti" onClick={onChiudi}><X className="size-4" /></Button>
    </div>
    {!soloRadiante && <div className="flex gap-1.5">
      <Button type="button" size="sm" variant={radiante ? "outline" : "secondary"} aria-pressed={!radiante}
        onClick={() => { onPosaCollettore(null); setSezione("tracciati"); }}>Percorsi</Button>
      <Button type="button" size="sm" variant={radiante ? "secondary" : "outline"} aria-pressed={radiante} onClick={() => { onScegli(""); setSezione("radiante"); }}>Pavimento radiante</Button>
    </div>}
    {scalaIncerta && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">Riscontra la scala prima di usare i metri nel computo.</p>}
    {radiante ? <PavimentoRadiantePanel stato={stato} scalaIncerta={scalaIncerta} inPosa={posaCollettore} onCambia={onCambiaRadiante}
      onPosa={onPosaCollettore} onCollettore={onCambiaCollettore} /> : <>
    {rete ? <>
      <label className="block space-y-1 text-xs font-medium"><span>Rete</span>
        <UniformSelect value={rete} onChange={e => { setPreferita(e.target.value as LineaImpianto); onScegli(""); }}>
          {reti.map(r => <option key={r} value={r}>{NOMI_LINEE[r]}</option>)}
        </UniformSelect>
      </label>
      <label className="block space-y-1 text-xs font-medium"><span>Tratto</span>
        <UniformSelect value={chiave} onChange={e => onScegli(e.target.value)}>
          <option value="">Seleziona un tratto</option>
          {percorsi.filter(p => p.linea === rete).map((p, i) => <option key={chiaveTratto(p)} value={chiaveTratto(p)}>
            {i + 1} · {nome(p)} · {metri.format(p.lunghezzaCm / 100)} m
          </option>)}
        </UniformSelect>
      </label>
    </> : <p className="text-xs text-muted-foreground">Posa punti impianto e la relativa partenza sulla pianta per iniziare.</p>}
    {corrente && <div className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium">{nome(corrente)}</p>
        <output aria-label="Lunghezza del tratto" className="shrink-0 text-sm font-semibold tabular-nums">{metri.format(corrente.lunghezzaCm / 100)} m</output>
      </div>
      <p className="text-xs text-muted-foreground">Sviluppo senza sfrido, con calate stimate.</p>
      {vertici === null ? <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" onClick={onModifica}>{corrente.vertici ? "Modifica percorso" : "Disegna percorso"}</Button>
        {corrente.vertici && <Button type="button" size="sm" variant="ghost" onClick={() => onRipristina(chiave)}>Ripristina stima</Button>}
      </div> : <>
        <p className="text-xs text-muted-foreground">
          {sposta !== null ? `Tocca la nuova posizione del punto ${sposta + 1}.` : vertici.length
            ? "Tocca la pianta per aggiungere un vertice o scegli quale spostare."
            : "Percorso diretto in anteprima. Tocca la pianta per aggiungere una svolta."}
        </p>
        {!!vertici.length && <div className="flex flex-wrap gap-1" aria-label="Vertici del percorso">
          {vertici.map((_, i) => <Button key={i} size="sm" variant={sposta === i ? "secondary" : "outline"} className="h-7 px-1.5 text-xs"
            aria-pressed={sposta === i} onClick={() => onSposta(sposta === i ? null : i)}>Punto {i + 1}</Button>)}
        </div>}
        {!!vertici.length && <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={onTogliUltimo}>Togli ultimo punto</Button>
          {vertici.length>1 && <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={onAzzera}>Azzera punti</Button>}
        </div>}
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" onClick={onApplica}>Applica tracciato</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onAnnulla}>Annulla tracciato</Button>
        </div>
      </>}
    </div>}
    {!!attraversamenti.length && <section aria-label="Interferenze in pianta" className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
      <p className="font-medium">{attraversamenti.length} {attraversamenti.length === 1 ? "interferenza da verificare" : "interferenze da verificare"}</p>
      <ul className="space-y-1">{attraversamenti.map((a, i) => <li key={i}>
        {a.aperturaId ? `Apertura ${a.aperturaId}` : a.tipoMuro === "portante" ? "Parete indicata come portante" : a.tipoMuro === "esterno" ? "Parete esterna" : "Tramezzo"}
      </li>)}</ul>
      <p>Controlla la quota di posa sul progetto.</p>
    </section>}
    {!!daRicollegare.length && <div className="space-y-1 rounded-md border p-2.5 text-xs">
      <p className="font-medium">Tratti da ricollegare</p>
      <p className="text-muted-foreground">I simboli di questi tratti formano ora collegamenti diversi. Ridisegna il nuovo tratto.</p>
      {daRicollegare.map(t => <div key={chiaveTratto(t)} className="flex items-center justify-between gap-1">
        <span>{nome(t)}</span>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => onRipristina(chiaveTratto(t))}>Rimuovi</Button>
      </div>)}
    </div>}
    </>}
  </aside>;
}
