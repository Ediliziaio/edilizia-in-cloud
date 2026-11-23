import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Target } from "lucide-react";
import { dataAdiacente, minuti, partiNelFuso, type Coordinate } from "../../../../shared/mappa-operativa/calcoli";
import { erroreFasciaVicini, fasciaInizialeVicini, oraDaMinuti } from "./fasce";
import { formatoKm, servizioMappa, type Ambito, type CandidatoMappa, type EsitoVicini, type PropostaMappa, type TipoCandidato } from "./servizio";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type FnT = ReturnType<typeof useT>;

interface Props {
  company: string; ambito: Ambito; giorno: string; nomeDestinazione: string; meta: Coordinate;
  vendite: boolean; lavori: boolean; partenza?: string; fineIntervento?: string;
  escludi?: string; onChiudi: () => void;
  puoProporre?: (tipo: TipoCandidato, id: string) => boolean;
  onProposta?: (proposta: PropostaMappa) => void;
}

function margine(minuti: number | null | undefined, etichetta: "all’arrivo" | "sul prossimo impegno", t: FnT) {
  if (minuti == null) return null;
  if (etichetta === "all’arrivo") return minuti < 0 ? t("{n} min di ritardo all’arrivo", { n: Math.ceil(-minuti) }) : t("{n} min di margine all’arrivo", { n: Math.floor(minuti) });
  return minuti < 0 ? t("{n} min di ritardo sul prossimo impegno", { n: Math.ceil(-minuti) }) : t("{n} min di margine sul prossimo impegno", { n: Math.floor(minuti) });
}

function arrivoStimato(inizio: string, margineArrivo: number | null | undefined, t: FnT) {
  const inizioMinuti = minuti(inizio);
  if (inizioMinuti == null || margineArrivo == null) return null;
  const arrivo = Math.ceil(inizioMinuti - margineArrivo);
  return t("Arrivo stimato {ora}", { ora: oraDaMinuti(arrivo) });
}

function motivoEsclusione(r: CandidatoMappa, t: FnT) {
  if (r.motivo === "ritardo") return margine(r.margineArrivo, "all’arrivo", t);
  if (r.motivo === "rientro") return margine(r.margineRientro, "sul prossimo impegno", t);
  if (r.motivo === "da_verificare") return t("Trasferimento al prossimo impegno da verificare");
  return t("Percorso stradale non disponibile");
}

export default function PianificaIntervento({ company, ambito, giorno, nomeDestinazione, meta, vendite, lavori, partenza, fineIntervento, escludi, onChiudi, puoProporre, onProposta }: Props) {
  const t = useT();
  const adesso = new Date();
  const oggi = partiNelFuso(adesso).giorno;
  const ultimaData = dataAdiacente(oggi, 365);
  const [fascia, setFascia] = useState(() => fasciaInizialeVicini(giorno, new Date(), partenza, fineIntervento));
  const { giorno: data, inizio, fine } = fascia;
  const [tipo, setTipo] = useState<TipoCandidato>(ambito === "vendite" && vendite ? "vendite" : lavori ? "squadre" : "vendite");
  const [qualifica, setQualifica] = useState("");
  const [esito, setEsito] = useState<EsitoVicini>();
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState("");

  const cambiaFascia = (prossima: typeof fascia) => {
    setFascia(prossima);
    setEsito(undefined);
    setErrore("");
  };
  const validazione = erroreFasciaVicini(data, inizio, fine, adesso);
  const inizioMinuti = minuti(inizio);
  const durata = inizioMinuti == null ? null : (minuti(fine) ?? 0) - inizioMinuti;
  const cerca = async () => {
    const messaggio = erroreFasciaVicini(data, inizio, fine, new Date());
    if (attesa || messaggio) {
      if (messaggio) { setErrore(messaggio); setEsito(undefined); }
      return;
    }
    setAttesa(true);
    setErrore("");
    setEsito(undefined);
    try {
      setEsito(await servizioMappa<EsitoVicini>(company, ambito, { azione: "vicini", giorno: data, inizio, fine, tipo, qualifica, meta, escludi: tipo === "vendite" ? escludi : undefined }));
    } catch (e) { setErrore((e as Error).message); }
    finally { setAttesa(false); }
  };

  return <section className="space-y-3 rounded-lg border bg-card p-3" aria-label={t("Chi è più vicino?")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-2 font-medium"><Target className="size-4" /> {t("Chi è più vicino?")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{nomeDestinazione}</p></div>
      <Button type="button" variant="ghost" onClick={onChiudi}>{t("Chiudi")}</Button>
    </div>
    <div className="space-y-3">
      <fieldset disabled={attesa} className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(9rem,1fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(9rem,1fr)]">
        <label className="grid min-w-0 gap-1 text-xs">{t("Giorno")}<Input type="date" value={data} min={oggi} max={ultimaData} required
          onChange={e => cambiaFascia({ ...fascia, giorno: e.target.value })} /></label>
        <label className="grid min-w-0 gap-1 text-xs">{t("Dalle")}<Input type="time" value={inizio} required
          onChange={e => cambiaFascia({ ...fascia, inizio: e.target.value })} /></label>
        <label className="grid min-w-0 gap-1 text-xs">{t("Alle")}<Input type="time" value={fine} required
          onChange={e => cambiaFascia({ ...fascia, fine: e.target.value })} /></label>
        <label className="grid gap-1 text-xs">{t("Cerca")}
          <select value={tipo} onChange={e => { setTipo(e.target.value as TipoCandidato); setQualifica(""); setEsito(undefined); setErrore(""); }} className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm">
            {vendite && <option value="vendite">{t("Commerciali")}</option>}
            {lavori && <><option value="operai">{t("Operai")}</option><option value="squadre">{t("Squadre")}</option></>}
          </select></label>
        {tipo !== "vendite" && <label className="col-span-2 grid gap-1 text-xs">{t("Mansione o qualifica richiesta")}
          <Input placeholder={t("Facoltativa")} maxLength={100} value={qualifica} onChange={e => { setQualifica(e.target.value); setEsito(undefined); setErrore(""); }} />
        </label>}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("Durata dell’intervento")}>
        {[30, 60, 120].map(d => <Button key={d} size="sm" type="button" variant={durata === d ? "secondary" : "outline"}
          aria-pressed={durata === d} disabled={attesa || inizioMinuti == null || inizioMinuti + d >= 1440}
          onClick={() => cambiaFascia({ ...fascia, fine: oraDaMinuti(inizioMinuti! + d) })}>{d === 30 ? t("30 min") : d === 60 ? t("1 ora") : t("2 ore")}</Button>)}
        {validazione && <Button type="button" size="sm" variant="ghost" disabled={attesa}
          onClick={() => cambiaFascia(fasciaInizialeVicini(data >= oggi && data <= ultimaData ? data : oggi, new Date()))}>{t("Prima fascia utile")}</Button>}
      </div>
      {validazione && !errore && <p className="text-sm text-destructive">{t(validazione)}</p>}
      <Button type="button" onClick={() => void cerca()} disabled={attesa || !!validazione}>{attesa ? t("Controllo disponibilità…") : t("Valuta candidati")}</Button>
    </div>
    {errore && <p role="alert" className="text-sm text-destructive">{t(errore)}</p>}
    {esito && <div aria-live="polite" className="space-y-2 text-sm">
      <p className="font-medium">{esito.metodo === "linea" ? t("Distanza in linea d’aria") : t("Tra i candidati valutati · {n} su {totale}", { n: esito.valutati, totale: esito.totale })}</p>
      {esito.metodo === "linea" && <p className="text-xs text-muted-foreground">
        {esito.motivo === "quota" ? t("Quota esaurita.") : t("Tempi stradali non disponibili.")} {t("Verifica la fattibilità prima di assegnare.")}
      </p>}
      {esito.motivo && esito.metodo === "strada" && <p className="text-xs text-muted-foreground">{t("Valutazione parziale. Alcune stime sono temporaneamente assenti.")}</p>}
      {!esito.risultati.length && <p>{t("Nessun candidato con trasferimento verificabile nella fascia scelta.")}</p>}
      <ol className="space-y-1">
        {esito.risultati.map(r => <li key={r.id} className="rounded-md border px-2.5 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="break-words font-medium">{r.nome}</span>
            <span className="tabular-nums">{formatoKm(r.metri)}{r.secondi != null && ` · ${t("{n} min stimati", { n: Math.ceil(r.secondi / 60) })}`}</span>
          </div>
          <p className="text-xs text-muted-foreground">{r.fonte}{r.aggiornato && ` · ${partiNelFuso(r.aggiornato).ora}`}</p>
          {r.secondi != null && <p className="text-xs text-emerald-800 dark:text-emerald-300">
            {[arrivoStimato(inizio, r.margineArrivo, t), margine(r.margineArrivo, "all’arrivo", t), margine(r.margineRientro, "sul prossimo impegno", t)].filter(Boolean).join(" · ") || t("Disponibile nella fascia")}
          </p>}
          {esito.metodo === "strada" && r.secondi != null && onProposta && puoProporre?.(tipo, r.id) &&
            <Button className="mt-1" type="button" size="sm" variant="outline"
              onClick={() => onProposta({ tipo, id: r.id, nome: r.nome, giorno: data, inizio, fine })}>{t("Rivedi assegnazione")}</Button>}
        </li>)}
      </ol>
      {!!esito.esclusi?.length && <div className="space-y-1.5">
        <h4 className="text-xs font-medium">{t("Vincoli di trasferimento")}</h4>
        <ul className="space-y-1">
          {esito.esclusi.map(r => <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
            <span><strong>{r.nome}</strong> · {motivoEsclusione(r, t)}</span>
            {r.secondi != null && <span className="tabular-nums">{t("{n} min stimati", { n: Math.ceil(r.secondi / 60) })}</span>}
          </li>)}
        </ul>
      </div>}
      {!!esito.senzaOrigine.length && <p className="text-xs text-muted-foreground">{t("Senza origine verificabile")} · {esito.senzaOrigine.join(", ")}</p>}
    </div>}
  </section>;
}
