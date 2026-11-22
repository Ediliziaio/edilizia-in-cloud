import { useMemo, useState } from "react";
import { ArrowUpRight, LocateFixed, MessageCircle, Route, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { analizzaProgetto, type RiscontroImpianti, type SegnalazioneProgetto } from "@/lib/planimetrie/analisiProgetto";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const NOMI_PRIORITA: Record<SegnalazioneProgetto["priorita"], string> = {
  problema: "Problema nel disegno", tecnico: "Da verificare con il tecnico", dato: "Dato da riscontrare",
};
const numero = (testo: string) => testo.trim() && Number.isFinite(Number(testo.replace(",", "."))) ? Number(testo.replace(",", ".")) : undefined;

export function AnalisiProgettoPlanimetria({ documento, ambito, anteprima, occupato, evidenziata, onMostra, onApprofondisci, onPreparaCorrezioni, onEsodo, onRiscontro }: {
  documento: Planimetria;
  ambito: string;
  anteprima: boolean;
  occupato: boolean;
  evidenziata?: SegnalazioneProgetto | null;
  onMostra?: (esito: SegnalazioneProgetto | null) => void;
  onApprofondisci?: (esito: SegnalazioneProgetto) => void;
  onPreparaCorrezioni?: () => void;
  onEsodo?: () => void;
  onRiscontro?: (riscontro: RiscontroImpianti) => void;
}) {
  const [filtro, setFiltro] = useState("");
  const [altezza, setAltezza] = useState("");
  const [autorimessa, setAutorimessa] = useState("");
  const esiti = useMemo(() => analizzaProgetto(documento, ambito, {
    altezzaAntincendio: numero(altezza), autorimessaCoperta: numero(autorimessa),
  }), [documento, ambito, altezza, autorimessa]);
  const aree = [...new Set(esiti.map(e => e.area))];
  const visibili = esiti.filter(e => !filtro || e.area === filtro);
  const problemi = esiti.filter(e => e.priorita === "problema").length;
  const correzioni = esiti.filter(e => e.correzione).length;
  const attiva = (e: SegnalazioneProgetto) => e.area === evidenziata?.area && e.titolo === evidenziata.titolo &&
    e.posizione?.livelloId === evidenziata.posizione?.livelloId;
  return <section aria-label="Analisi del progetto" className="space-y-3 border-b bg-slate-50/60 p-3 dark:bg-muted/30">
    <div>
      <h3 className="text-sm font-semibold">Analisi del progetto</h3>
      <p className="mt-1 text-xs text-muted-foreground">{anteprima ? "Variante in anteprima" : "Disegno selezionato"} · {esiti.length} segnalazioni, {problemi} {problemi === 1 ? "problema nel disegno" : "problemi nel disegno"}</p>
    </div>
    {onPreparaCorrezioni && correzioni > 0 && <Button type="button" variant="outline" size="sm"
      className="w-full justify-start gap-2" disabled={occupato} onClick={onPreparaCorrezioni}>
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      {correzioni === 1 ? "Prepara la correzione" : `Prepara ${correzioni} correzioni`}
    </Button>}
    <details className="rounded-md border bg-background p-2.5 text-xs">
      <summary className="cursor-pointer font-medium">Dati antincendio dell’edificio</summary>
      <div className="mt-2 grid gap-2">
        <label className="space-y-1">
          <span>Altezza antincendio (m)</span>
          <Input value={altezza} onChange={e => setAltezza(e.target.value)} inputMode="decimal" className="h-8" placeholder="Da pratica o rilievo" />
        </label>
        <label className="space-y-1">
          <span>Autorimessa coperta complessiva (m²)</span>
          <Input value={autorimessa} onChange={e => setAutorimessa(e.target.value)} inputMode="decimal" className="h-8" placeholder="0 se assente" />
        </label>
      </div>
    </details>
    {onEsodo && <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onEsodo}>
      <Route className="h-3.5 w-3.5 text-primary" />Vie d’esodo nel fascicolo
    </Button>}
    <UniformSelect aria-label="Categoria delle segnalazioni" value={filtro} onChange={e => setFiltro(e.target.value)} className="h-8 w-full text-xs">
      <option value="">Tutte le categorie</option>
      {aree.map(area => <option key={area} value={area}>{area}</option>)}
    </UniformSelect>
    <ul aria-label="Segnalazioni" className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {visibili.map((e, i) => {
        const riscontro = e.riscontro;
        return <li key={e.area + "-" + e.titolo + "-" + i} className="space-y-1 rounded-lg border bg-background p-2.5 text-xs">
        <p className={e.priorita === "problema" ? "font-medium text-destructive" : "font-medium text-muted-foreground"}>{e.area} · {NOMI_PRIORITA[e.priorita]}</p>
        <p className="font-semibold">{e.titolo}{e.piano ? <span className="font-normal text-muted-foreground"> · {e.piano}</span> : null}</p>
        <p>{e.descrizione}</p>
        {e.verifica && <p className="text-muted-foreground">{e.verifica}</p>}
        {e.fonte && <a href={e.fonte.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">{e.fonte.nome} <ArrowUpRight className="h-3 w-3" /></a>}
        <div className="flex flex-wrap gap-1">
          {onMostra && e.posizione && <Button variant={attiva(e) ? "secondary" : "outline"} size="sm"
            className="h-7 gap-1 px-1.5 text-xs" aria-pressed={attiva(e)}
            aria-label={`Mostra ${e.posizione.etichetta} sulla tavola`}
            onClick={() => onMostra(attiva(e) ? null : e)}><LocateFixed className="h-3 w-3" />Mostra sulla tavola</Button>}
          {onRiscontro && riscontro && <Button variant="outline" size="sm" className="h-7 px-1.5 text-xs"
            onClick={() => onRiscontro(riscontro)}>Apri nel fascicolo</Button>}
          {onApprofondisci && e.verifica && <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs" disabled={occupato} onClick={() => onApprofondisci(e)}><MessageCircle className="mr-1 h-3 w-3" />Approfondisci con Silvio</Button>}
        </div>
        </li>;
      })}
    </ul>
    {!visibili.length && <p className="text-xs text-muted-foreground">Nessuna segnalazione in questa categoria.</p>}
    <p className="text-xs text-muted-foreground">Per concludere le verifiche servono i dati documentati e i riscontri del tecnico.</p>
  </section>;
}
