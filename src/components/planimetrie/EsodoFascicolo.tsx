import { useMemo, useState } from "react";
import { ArrowDownRight, FileText, PencilLine, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { CampoUrbanistico as Campo, FonteLink } from "./InterventoUrbanistico";
import { TavolaInterattiva } from "./TavolaInterattiva";
import type { Planimetria, Punto } from "../../../shared/planimetrie/modello.ts";
import {
  esodoDellaVariante, esodoValido, firmaRiscontroTecnico, STATI_ESODO,
  type DatiUrbanistici, type RiscontroTecnico, type TracciatoEsodo,
} from "../../../shared/planimetrie/urbanistica.ts";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  documento: Planimetria;
  dati: DatiUrbanistici;
  varianteId: string;
  livelloIniziale?: string;
  oggi: string;
  onModifica?: (riscontri: RiscontroTecnico[]) => void;
  onFonti: () => void;
  onPdf: (percorso: string) => void;
}

export function EsodoFascicolo(props: Props) {
  const t = useT();
  const [livelloId, setLivelloId] = useState(props.livelloIniziale);
  const piani = useMemo(() => esodoDellaVariante(props.documento, props.varianteId, props.dati),
    [props.documento, props.varianteId, props.dati]);
  const piano = piani.find(p => p.livello.id === livelloId) ?? piani[0];
  if (!piano) return <p className="rounded-lg border bg-card p-4 text-sm">{t("Crea una variante per registrare le vie d’esodo.")}</p>;

  return <section aria-label={t("Vie d’esodo del fascicolo")} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold"><Route className="size-4 text-primary" />{t("Vie d’esodo")}</h3>
      <Button size="sm" variant="outline" onClick={props.onFonti}><FileText className="mr-1.5 size-3.5" />{t("Tavole del fascicolo")}</Button>
    </div>
    <div role="group" aria-label={t("Piani della via d’esodo")} className="flex flex-wrap gap-2">
      {piani.map(p => <Button key={p.livello.id} type="button" variant="outline"
        aria-pressed={p.livello.id === piano.livello.id} className={cn("h-auto items-start gap-0.5 p-2.5 text-left",
          p.livello.id === piano.livello.id && "border-primary/70 bg-primary/10 text-primary hover:bg-primary/10")}
        onClick={() => setLivelloId(p.livello.id)}>
        <span className="flex flex-col"><span>{p.livello.nome}</span>
          <span className={cn("text-xs font-normal text-muted-foreground", p.stato === "da_rinnovare" && "font-medium text-amber-800 dark:text-amber-200")}>{STATI_ESODO[p.stato]}</span>
        </span>
      </Button>)}
    </div>
    <EsodoPiano key={props.varianteId + ":" + piano.livello.id + ":" + piano.riscontro?.firma}
      {...props} piano={piano} vaiAlPiano={setLivelloId} />
  </section>;
}

function EsodoPiano({ documento, dati, varianteId, oggi, onModifica, onPdf, piano, vaiAlPiano }: Props & {
  piano: ReturnType<typeof esodoDellaVariante>[number];
  vaiAlPiano: (id: string) => void;
}) {
  const tr = useT();
  const { livello, riscontro, fonte, stato } = piano;
  const [modifica, setModifica] = useState(false);
  const [tracciati, setTracciati] = useState<TracciatoEsodo[]>([]);
  const [traccia, setTraccia] = useState(0);
  const [fonteId, setFonteId] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [riferimento, setRiferimento] = useState("");
  const [prosegue, setProsegue] = useState("");
  const [uscita, setUscita] = useState("");
  const [esito, setEsito] = useState<RiscontroTecnico["esito"]>("riscontrato");
  const [errore, setErrore] = useState("");
  const prima = riscontro?.esodo;
  const prosegueAl = documento.livelli.find(p => p.id === prima?.prosegueAl);
  const tavole = dati.fonti.filter(f => f.tipo === "tavola" && (f.allegato || f.url) &&
    (!f.inquadramento || f.inquadramento.livelloId === livello.id));

  const inizia = () => {
    setTracciati(prima?.tracciati ?? [{ nome: "Percorso 1", punti: [] }]);
    setTraccia(0);
    setFonteId(riscontro?.fonteId ?? "");
    setTecnico(riscontro?.tecnico ?? "");
    setRiferimento(riscontro?.riferimento ?? "");
    setProsegue(prima?.prosegueAl ?? (prima?.uscita ? "uscita" : ""));
    setUscita(prima?.uscita ?? "");
    setEsito(riscontro?.esito ?? "riscontrato");
    setErrore("");
    setModifica(true);
  };
  const aggiornaTraccia = (aggiorna: (t: TracciatoEsodo) => TracciatoEsodo) =>
    setTracciati(v => v.map((t, i) => i === traccia ? aggiorna(t) : t));
  const aggiungiPunto = (p: Punto) => aggiornaTraccia(t => t.punti.length < 80 ? { ...t, punti: [...t.punti, p] } : t);
  const registra = () => {
    const esodo = { tracciati: tracciati.map(t => ({ ...t, nome: t.nome.trim() })),
      ...(prosegue && prosegue !== "uscita" ? { prosegueAl: prosegue } : {}),
      ...(prosegue === "uscita" ? { uscita: uscita.trim() } : {}),
      ...(prima?.simulazione ? { simulazione: true } : {}),
    };
    if (!esodoValido(esodo)) return setErrore(tr("Dai un nome a ogni traccia, posa almeno due punti distinti e completa l’eventuale uscita."));
    if (!tecnico.trim() || !riferimento.trim()) return setErrore(tr("Indica chi ha eseguito il riscontro e il riferimento alla pagina o al dettaglio della tavola."));
    const base = { varianteId, livelloId: livello.id, criterio: "esodo" as const, fonteId, tecnico: tecnico.trim(),
      riferimento: riferimento.trim(), esito, data: oggi, esodo };
    const firma = firmaRiscontroTecnico(documento, base, dati);
    if (!firma) return setErrore(tr("Collega una tavola del fascicolo al piano selezionato."));
    const altri = (dati.riscontriTecnici ?? []).filter(r => r !== riscontro);
    if (altri.length >= 200) return setErrore(tr("Sono già presenti 200 riscontri in questo fascicolo."));
    onModifica?.([...altri, { ...base, firma }]);
    setModifica(false);
  };

  return <div className="space-y-3">
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <p className="font-medium">{livello.nome}</p>
        {onModifica && !modifica && <Button size="sm" variant="outline" disabled={!tavole.length} onClick={inizia}>
          <PencilLine className="mr-1.5 size-3.5" />{riscontro ? tr("Rivedi percorso") : tr("Traccia il percorso")}
        </Button>}
      </div>
      {modifica && <div className="space-y-2 border-b bg-muted/40 p-3">
        <p className="text-sm">{tr("Tocca la tavola in ordine di percorrenza.")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Campo nome={tr("Traccia attiva")}><UniformSelect value={String(traccia)} onChange={e => setTraccia(Number(e.target.value))}>
            {tracciati.map((t,i) => <option key={i} value={i}>{t.nome || tr("Percorso {n}", { n: i+1 })}</option>)}
          </UniformSelect></Campo>
          <Campo nome={tr("Nome della traccia")}><Input maxLength={80} value={tracciati[traccia]?.nome ?? ""}
            onChange={e => aggiornaTraccia(t => ({ ...t, nome: e.target.value }))} /></Campo>
          <Button size="sm" variant="outline" disabled={tracciati.length >= 16} onClick={() => {
            setTraccia(tracciati.length);
            setTracciati([...tracciati, { nome: `Percorso ${tracciati.length + 1}`, punti: [] }]);
          }}>{tr("Aggiungi traccia")}</Button>
          <Button size="sm" variant="ghost" disabled={!tracciati[traccia]?.punti.length}
            onClick={() => aggiornaTraccia(t => ({ ...t, punti: t.punti.slice(0, -1) }))}>{tr("Annulla ultimo punto")}</Button>
          <Button size="sm" variant="ghost" onClick={() => {
            setTracciati(v => v.length > 1 ? v.filter((_,i) => i !== traccia) : [{ ...v[0], punti: [] }]);
            setTraccia(0);
          }}>{tr("Rimuovi traccia")}</Button>
        </div>
      </div>}
      <TavolaInterattiva documento={documento} livelloId={livello.id} ambito={`progetto:${varianteId}`}
        className="h-[clamp(230px,37vh,420px)]" comandi
        esodo={{ tracciati: modifica ? tracciati : prima?.tracciati ?? [], daRinnovare: !modifica && stato === "da_rinnovare" }}
        onPunto={modifica ? aggiungiPunto : undefined} />
      <div className="space-y-2 border-t p-3 text-sm">
        {stato === "da_rinnovare" && <p className="font-medium text-amber-800 dark:text-amber-200">{tr("Verifica riaperta · la traccia in arancione viene dal riscontro precedente.")}</p>}
        {prima?.simulazione && <p className="text-muted-foreground">{tr("Tracciato di simulazione · da verificare sulle tavole e sul posto.")}</p>}
        {fonte && <div className="flex flex-wrap items-center gap-x-2">
          <span>{fonte.url ? <FonteLink url={fonte.url}>{fonte.titolo}</FonteLink> : fonte.titolo}</span>
          {fonte.allegato && <Button size="sm" variant="link" className="h-auto p-0"
            onClick={() => onPdf(fonte.allegato!.percorso)}>{tr("Apri tavola collegata")}</Button>}
        </div>}
        {riscontro && <p className="text-xs text-muted-foreground">{riscontro.riferimento}</p>}
        {prosegueAl ? <Button size="sm" variant="outline" onClick={() => vaiAlPiano(prosegueAl.id)}>
          <ArrowDownRight className="mr-1 size-3.5" />{tr("Prosegue a {nome}", { nome: prosegueAl.nome })}
        </Button> : prima?.uscita ? <p>{tr("Arrivo indicato · {uscita}", { uscita: String(prima.uscita ?? "") })}</p> : <p className="text-muted-foreground">{tr("Collegamento o uscita da riscontrare.")}</p>}
        {!tavole.length && onModifica && <p className="text-muted-foreground">{tr("Aggiungi una tavola del piano in «Fonti e atti» per registrare il percorso.")}</p>}
      </div>
    </div>
    {modifica && onModifica && <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo nome={tr("Tavola del riscontro")}><UniformSelect value={fonteId} onChange={e => setFonteId(e.target.value)}>
          <option value="">{tr("Scegli una tavola")}</option>{tavole.map(f => <option key={f.id} value={f.id}>{f.titolo}</option>)}
        </UniformSelect></Campo>
        <Campo nome={tr("Tecnico del riscontro")}><Input maxLength={160} value={tecnico} onChange={e => setTecnico(e.target.value)} /></Campo>
        <Campo nome={tr("Arrivo del percorso")}><UniformSelect value={prosegue} onChange={e => setProsegue(e.target.value)}>
          <option value="">{tr("Da riscontrare")}</option><option value="uscita">{tr("Uscita")}</option>
          {documento.livelli.filter(l => l.id !== livello.id).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </UniformSelect></Campo>
        {prosegue === "uscita" && <Campo nome={tr("Destinazione indicata")}><Input maxLength={200} value={uscita} onChange={e => setUscita(e.target.value)} /></Campo>}
        <Campo nome={tr("Esito del riscontro")}><UniformSelect value={esito} onChange={e => setEsito(e.target.value as typeof esito)}>
          <option value="riscontrato">{tr("Riscontro documentato")}</option><option value="criticita">{tr("Criticità da risolvere")}</option>
        </UniformSelect></Campo>
      </div>
      <Campo nome={tr("Pagina, dettaglio e nota")}><Textarea maxLength={1500} value={riferimento} onChange={e => setRiferimento(e.target.value)} /></Campo>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={registra}>{tr("Registra percorso")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setModifica(false)}>{tr("Annulla modifiche al percorso")}</Button></div>
    </div>}
  </div>;
}
