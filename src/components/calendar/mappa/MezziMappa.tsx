import { ArrowUpRight, Construction, Route, Truck, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MezzoGiornoMappa, PuntoMezzoMappa } from "@/integrations/supabase/appDatabase";
import { TIPI_MEZZO } from "@/types/mezzi";
import { coordinate, partiNelFuso } from "../../../../shared/mappa-operativa/calcoli";
import { formatoKm } from "./servizio";
import type { FiltriMezzi, FiltroMezzi } from "./useMezziMappa";

const dataIt = (valore: string) => valore.split("-").reverse().join("/");
function dataOra(iso: string) {
  const { giorno, ora } = partiNelFuso(iso);
  return `${dataIt(giorno)} alle ${ora}`;
}

function Luogo({ titolo, luogo }: { titolo: string; luogo: PuntoMezzoMappa }) {
  return <div className="space-y-1 rounded-md border bg-background p-2">
    <p className="font-medium text-foreground">{titolo}</p>
    <p className="break-words">{luogo.nome}</p>
    <p className="text-muted-foreground">{luogo.fonte}{luogo.quando ? ` · ${dataOra(luogo.quando)}` : luogo.dal ? ` · dal ${dataIt(luogo.dal)}` : ""}</p>
    {luogo.order_id && <Link className="inline-flex items-center gap-1 font-medium text-primary underline" to={`/azienda/ordini/${luogo.order_id}`}>Apri cantiere <ArrowUpRight className="size-3" /></Link>}
  </div>;
}

type Props = FiltriMezzi & {
  mezzi: MezzoGiornoMappa[]; selezione: string | null; giorno: string; personale: boolean;
  caricamento: boolean; aggiornamento: boolean; errore: boolean; nonDisponibile?: string | null; onRiprova: () => void; onFiltri: (patch: Partial<FiltriMezzi>) => void;
  onSeleziona: (id: string | null) => void; haPercorso: (id: string) => boolean; onPercorso: (id: string) => void; registraRiga: (id: string, el: HTMLButtonElement | null) => void;
};

export default function MezziMappa({ mezzi, selezione, giorno, personale, tipoMezzi, cercaMezzi, caricamento, aggiornamento, errore,
  nonDisponibile, onRiprova, onFiltri, onSeleziona, haPercorso, onPercorso, registraRiga }: Props) {
  return <section aria-label="Mezzi sulla mappa" className="divide-y">
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Tipo di mezzo" className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={tipoMezzi}
          onChange={e => onFiltri({ tipoMezzi: e.target.value as FiltroMezzi })}>
          <option value="tutti">Mezzi e attrezzature</option><option value="stradali">Veicoli stradali</option><option value="cantiere">Mezzi da cantiere</option>
          <option value="attrezzature">Attrezzature</option>
        </select>
        <Input aria-label="Cerca un mezzo" className="min-w-28 flex-1" placeholder="Nome, targa, cantiere o persona" value={cercaMezzi}
          onChange={e => onFiltri({ cercaMezzi: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-2"><span className="size-2 rounded-sm bg-sky-800" aria-hidden="true" /> Posizione di riferimento
          <span className="size-2 rounded-sm bg-teal-700" aria-hidden="true" /> Attrezzatura
          <span className="size-2 rounded-sm bg-amber-700" aria-hidden="true" /> Destinazione prevista</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRiprova} disabled={aggiornamento}>Aggiorna mezzi</Button>
      </div>
      <p className="text-xs text-muted-foreground">{personale ? "Mezzi collegati alle tue assegnazioni, ai tuoi viaggi e ai piani di cui sei responsabile. " : ""}
        {tipoMezzi === "attrezzature" ? "Ubicazioni da assegnazioni, rapportini e scansioni QR." :
          "Posizioni da assegnazioni e arrivi registrati. I chilometri fanno riferimento al giorno di partenza."}</p>
    </div>
    {caricamento && <p role="status" className="p-3 text-sm text-muted-foreground">Caricamento mezzi…</p>}
    {errore && <p role="alert" className="p-3 text-sm">Mezzi temporaneamente indisponibili. <button className="underline" onClick={onRiprova}>Riprova</button></p>}
    {nonDisponibile && <p role="status" className="p-3 text-sm text-muted-foreground">
      {nonDisponibile} temporaneamente indisponibili. <button type="button" className="underline" onClick={onRiprova}>Riprova</button>
    </p>}
    {!caricamento && !errore && !nonDisponibile && !mezzi.length && <p className="p-3 text-sm text-muted-foreground">Nessun mezzo per il giorno e i filtri selezionati.</p>}
    {mezzi.map(m => {
      const attivo = selezione === m.id;
      const tipo = TIPI_MEZZO.find(t => t.value === m.tipo)?.label ?? m.tipo;
      const Icona = m.attrezzatura ? Wrench : m.stradale ? Truck : Construction;
      const misure = m.stradale ? [
        m.metri_registrati != null ? `${formatoKm(m.metri_registrati)} registrati` : null,
        m.metri_stimati != null ? `${formatoKm(m.metri_stimati)} stimati` : null,
      ].filter(Boolean) : [];
      return <article key={m.id} className={attivo ? "bg-primary/5" : undefined}>
        <button type="button" ref={el => registraRiga(m.id, el)} aria-expanded={attivo}
          className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/60"
          onClick={() => onSeleziona(attivo ? null : m.id)}>
          <Icona aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold">{m.nome}</span>
            <span className="block text-xs text-muted-foreground">{[tipo, m.targa].filter(Boolean).join(" · ")}</span>
            <span className="block text-xs">{m.attrezzatura ? [m.attrezzatura.quantita != null ? [m.attrezzatura.quantita.toLocaleString("it-IT"), m.unita].filter(Boolean).join(" ") : null,
              m.attrezzatura.custode ? `In carico a ${m.attrezzatura.custode}` : null].filter(Boolean).join(" · ") : m.stradale ? misure.join(" · ") || "Km da registrare" :
              m.contaore != null ? `${m.contaore.toLocaleString("it-IT")} h · lettura contaore` : m.unita === "ore" ? "Lettura contaore da registrare" : "Assegnazione operativa"}</span>
            <span className="block break-words text-xs text-muted-foreground">{m.posizione ? [m.posizione.nome, m.attrezzatura && m.posizione.quando ? dataOra(m.posizione.quando) : null].filter(Boolean).join(" · ")
              : m.attrezzatura?.quantita != null ? "Quantità senza ubicazione registrata" : "Posizione da documentare"}</span>
            {m.destinazione && m.destinazione.order_id !== m.posizione?.order_id &&
              <span className="block break-words text-xs text-primary">Destinazione prevista · {m.destinazione.nome}</span>}
            {m.destinazioni > 1 && <span className="block text-xs text-amber-800 dark:text-amber-300">{m.destinazioni} destinazioni previste · da verificare</span>}
          </span>
        </button>
        {attivo && <div className="space-y-2 px-3 pb-3 text-xs">
          {m.posizione && <Luogo titolo={m.attrezzatura ? "Ultima ubicazione registrata" : "Posizione di riferimento"} luogo={m.posizione} />}
          {m.posizioneVeicolo && <Luogo titolo="Posizione di riferimento del mezzo" luogo={m.posizioneVeicolo} />}
          {m.destinazione && <Luogo titolo="Destinazione prevista" luogo={m.destinazione} />}
          {!coordinate(m.posizione?.lat, m.posizione?.lng) && m.posizione && <p className="text-muted-foreground">Coordinate della posizione da verificare.</p>}
          {m.fonti_registrate.length > 0 && <p className="text-muted-foreground">{m.fonti_registrate.join(" · ")}</p>}
          {m.contaore_aggiornato && <p className="text-muted-foreground">Lettura del {dataOra(m.contaore_aggiornato)}</p>}
          {m.metri_stimati != null && <p className="text-muted-foreground">Stime salvate nel registro viaggi.</p>}
          <div className="flex flex-wrap gap-1">
            <Button asChild size="sm" variant="outline">
              <Link to={`/azienda/mezzi/${m.attrezzatura?.scheda_id ?? m.id}${m.stradale ? `?tab=viaggi&giorno=${giorno}` : ""}`}>{m.attrezzatura ? "Apri scheda attrezzatura" : "Apri scheda mezzo"}</Link>
            </Button>
            {m.stradale && <Button asChild size="sm" variant="outline">
              <Link to={`/azienda/mezzi/${m.id}?tab=viaggi&vista=mappa&giorno=${giorno}`}>Storico su mappa</Link>
            </Button>}
            {m.stradale && haPercorso(m.id) && <Button type="button" size="sm" variant="outline" onClick={() => onPercorso(m.id)}>
              <Route className="size-3.5" /> Percorso del mezzo
            </Button>}
          </div>
        </div>}
      </article>;
    })}
  </section>;
}
