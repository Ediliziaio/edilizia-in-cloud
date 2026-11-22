import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Target } from "lucide-react";
import { partiNelFuso, type Coordinate } from "../../../../shared/mappa-operativa/calcoli";
import { formatoKm, servizioMappa, type Ambito, type EsitoVicini } from "./servizio";

interface Props {
  company: string; ambito: Ambito; giorno: string; nomeDestinazione: string; meta: Coordinate;
  vendite: boolean; lavori: boolean; partenza?: string; fineIntervento?: string;
  escludi?: string; onChiudi: () => void;
}

export default function PianificaIntervento({ company, ambito, giorno, nomeDestinazione, meta, vendite, lavori, partenza, fineIntervento, escludi, onChiudi }: Props) {
  const oggi = partiNelFuso(new Date()).giorno;
  const [data, setData] = useState(giorno < oggi ? oggi : giorno);
  const [inizio, setInizio] = useState(partenza ?? "09:00");
  const [fine, setFine] = useState(fineIntervento ?? "10:00");
  const [tipo, setTipo] = useState(ambito === "vendite" && vendite ? "vendite" : lavori ? "squadre" : "vendite");
  const [qualifica, setQualifica] = useState("");
  const [esito, setEsito] = useState<EsitoVicini>();
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState("");

  const cerca = async () => {
    setAttesa(true);
    setErrore("");
    setEsito(undefined);
    try {
      setEsito(await servizioMappa<EsitoVicini>(company, ambito, { azione: "vicini", giorno: data, inizio, fine, tipo, qualifica, meta, escludi: tipo === "vendite" ? escludi : undefined }));
    } catch (e) { setErrore((e as Error).message); }
    finally { setAttesa(false); }
  };

  return <section className="space-y-3 rounded-lg border bg-card p-3" aria-label="Chi è più vicino?">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-2 font-medium"><Target className="size-4" /> Chi è più vicino?</h3>
        <p className="mt-1 text-xs text-muted-foreground">{nomeDestinazione}</p></div>
      <Button type="button" variant="ghost" onClick={onChiudi}>Chiudi</Button>
    </div>
    <div className="space-y-3">
      <fieldset disabled={attesa} className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(9rem,1fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(9rem,1fr)]">
        <label className="grid gap-1 text-xs">Giorno<Input type="date" value={data} min={oggi} required onChange={e => { setData(e.target.value); setEsito(undefined); }} /></label>
        <label className="grid gap-1 text-xs">Dalle<Input type="time" value={inizio} required onChange={e => { setInizio(e.target.value); setEsito(undefined); }} /></label>
        <label className="grid gap-1 text-xs">Alle<Input type="time" value={fine} required onChange={e => { setFine(e.target.value); setEsito(undefined); }} /></label>
        <label className="grid gap-1 text-xs">Cerca
          <select value={tipo} onChange={e => { setTipo(e.target.value); setQualifica(""); setEsito(undefined); }} className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm">
            {vendite && <option value="vendite">Commerciali</option>}
            {lavori && <><option value="operai">Operai</option><option value="squadre">Squadre</option></>}
          </select></label>
        {tipo !== "vendite" && <label className="col-span-2 grid gap-1 text-xs">Mansione o qualifica richiesta
          <Input placeholder="Facoltativa" maxLength={100} value={qualifica} onChange={e => { setQualifica(e.target.value); setEsito(undefined); }} />
        </label>}
      </fieldset>
      <Button type="button" onClick={() => void cerca()} disabled={attesa || !data || !inizio || !fine || inizio >= fine}>{attesa ? "Controllo disponibilità…" : "Valuta candidati"}</Button>
    </div>
    {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    {esito && <div aria-live="polite" className="space-y-2 text-sm">
      <p className="font-medium">{esito.metodo === "linea" ? "Distanza in linea d’aria" : `Tra i candidati valutati · ${esito.valutati} su ${esito.totale}`}</p>
      {esito.metodo === "linea" && <p className="text-xs text-muted-foreground">
        {esito.motivo === "quota" ? "Quota esaurita." : "Tempi stradali non disponibili."} Verifica la fattibilità prima di assegnare.
      </p>}
      {esito.motivo && esito.metodo === "strada" && <p className="text-xs text-muted-foreground">Valutazione parziale. Alcune stime sono temporaneamente assenti.</p>}
      {!esito.risultati.length && <p>Nessun candidato con trasferimento verificabile nella fascia scelta.</p>}
      <ol className="space-y-1">
        {esito.risultati.map(r => <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-2 rounded-md bg-muted/40 px-2.5 py-2">
          <div><span className="font-medium">{r.nome}</span><p className="text-xs text-muted-foreground">
            {r.fonte}{r.aggiornato && ` · ${partiNelFuso(r.aggiornato).ora}`} · {r.secondi == null ? "Fascia libera" : "Disponibile nella fascia"}
          </p></div>
          <span className="tabular-nums">{formatoKm(r.metri)}{r.secondi != null && ` · ${Math.round(r.secondi / 60)} min`}</span>
        </li>)}
      </ol>
      {!!esito.senzaOrigine.length && <p className="text-xs text-muted-foreground">Senza origine verificabile · {esito.senzaOrigine.join(", ")}</p>}
    </div>}
  </section>;
}
