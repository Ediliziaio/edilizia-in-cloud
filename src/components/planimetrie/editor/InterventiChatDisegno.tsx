import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";
import { Focus, MapPin, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { numeroEditor } from "@/lib/computo/editorNativo";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import { differenzeLavorazioni, studioVariante, type RigaStudio } from "@/lib/planimetrie/studioImmobiliare";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { messaggioListino, salvaPrezzoNelListino } from "@/lib/planimetrie/salvaNelListino";
import { useFontiPrezzi } from "@/lib/planimetrie/fontiPrezzi";
import { conPrezziProposti, tipiDaCercare } from "@/lib/planimetrie/prezziProposti";
import type { PrezzoVocePlanimetria } from "../../../../shared/planimetrie/modello.ts";
import { aPlanimetria, ID_PROPOSTA, type Pianta, type Punto } from "./adattatore";
import type { Vista } from "./comandi";
import type { ContestoChatDisegno, PassoChatDisegno } from "./comandiChat";
import { cercaQuoteLibere, modificaIntervento, selezionatiInterventi, type InterventoChat, type RevisioneInterventi } from "./interventiChat";
import { leggiMisura } from "./misure";
import type { Selezione } from "./TelaPlanimetria";

const AddVocePicker = lazy(() => import("@/components/ristrutturazione/ComputoEditor/AddVocePicker"));
const numero = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const deltaEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", signDisplay: "exceptZero" });

type Modifica = (revisione: RevisioneInterventi) => void;

export function InterventiChatDisegno({ proposta, revisione, vista, contesto, consentiListino, onModifica, onPosizione, onEvidenzia }: {
  proposta: PassoChatDisegno;
  revisione: RevisioneInterventi;
  vista: Vista;
  contesto: ContestoChatDisegno;
  consentiListino: boolean;
  onModifica: Modifica;
  onPosizione: (punto: Punto) => void;
  onEvidenzia: (selezione: Selezione) => void;
}) {
  const insieme = selezionatiInterventi(revisione);
  const cambiaQuota = (i: InterventoChat, cm: number) => {
    const s = i.ultimoSpostamento;
    if (!s) return;
    onModifica(modificaIntervento(revisione, vista, contesto, i.richiesta.id, {
      frase: `Sposta il tramezzo di ${cm} cm verso ${s.ambiente}`, riferimento: { tipo: "muro", id: s.prima.id },
    }));
  };
  const elenco = <section aria-label="Interventi" className="space-y-1 text-xs">
    <p className="text-muted-foreground">{insieme.length} di {revisione.interventi.length} interventi selezionati</p>
    <ul className="divide-y" aria-label="Proposte di modifica">
      {revisione.interventi.map(i => {
        const { richiesta, passo, errore } = i;
        const e = passo?.evidenza;
        const problemi = passo?.confrontoTramezzo?.interferenze ?? [];
        return <li key={richiesta.id} className="space-y-1.5 py-2">
          <div className="flex items-start gap-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={richiesta.selezionata} aria-label={`Includi ${richiesta.frase}`}
                onChange={event => onModifica(modificaIntervento(revisione, vista, contesto, richiesta.id, { selezionata: event.target.checked }))} />
              <span className="min-w-0 break-words font-medium">{richiesta.frase}</span>
            </label>
            {e && richiesta.selezionata && !problemi.length && <Button variant="ghost" size="icon" type="button" className="size-7 shrink-0" aria-label={`Inquadra ${richiesta.frase}`}
              title="Inquadra sulla pianta" onClick={() => onEvidenzia(e)}><Focus className="size-3.5" /></Button>}
          </div>
          {errore && <p className="flex items-start gap-1.5 rounded bg-amber-50 p-2 text-amber-950" role="status">
            <TriangleAlert className="size-3.5 shrink-0" />{errore}
          </p>}
          {errore && !i.ultimoSpostamento && <CorreggiRichiesta key={richiesta.frase} frase={richiesta.frase}
            onProva={frase => onModifica(modificaIntervento(revisione, vista, contesto, richiesta.id, { frase, selezionata: true }))} />}
          {richiesta.selezionata && problemi.length > 0 && <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-950">
            {problemi.map((problema, n) => <button type="button" key={`${problema.punto.x}:${problema.punto.y}:${n}`} className="flex w-full items-start gap-1.5 text-left underline decoration-amber-600/65 underline-offset-2"
              onClick={() => onPosizione(problema.punto)}><MapPin className="size-3.5 shrink-0" /><span>{problema.testo}<span className="sr-only"> Inquadra l’interferenza</span></span></button>)}
          </div>}
          {richiesta.selezionata && i.ultimoSpostamento && <CorreggiSpostamento key={`${richiesta.id}:${richiesta.frase}`} intervento={i} onProva={cm => cambiaQuota(i, cm)} />}
        </li>;
      })}
    </ul>
  </section>;
  if (vista !== "progetto") return <div className="min-h-0 overflow-y-auto overscroll-contain rounded-lg border bg-background p-2.5">{elenco}</div>;
  return <Tabs defaultValue="interventi" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
    <TabsList aria-label="Riepilogo della proposta" className="grid h-auto shrink-0 grid-cols-2 rounded-none border-b bg-muted/55 max-md:min-h-0">
      <TabsTrigger value="interventi" className="px-2 py-1 text-xs">Interventi</TabsTrigger>
      <TabsTrigger value="computo" className="px-2 py-1 text-xs">Computo</TabsTrigger>
    </TabsList>
    <TabsContent value="interventi" className="mt-0 min-h-0 overflow-y-auto overscroll-contain p-2.5 motion-reduce:animate-none">{elenco}</TabsContent>
    <TabsContent value="computo" className="mt-0 min-h-0 overflow-y-auto overscroll-contain p-2.5 text-xs motion-reduce:animate-none">
      <CostiInterventi proposta={proposta} revisione={revisione} contesto={contesto}
        consentiListino={consentiListino} onModifica={onModifica} onEvidenzia={onEvidenzia} />
    </TabsContent>
  </Tabs>;
}

function CorreggiRichiesta({ frase, onProva }: { frase: string; onProva: (frase: string) => void }) {
  const [aperta, setAperta] = useState(false);
  const [testo, setTesto] = useState(frase);
  return <div className="space-y-1.5">
    <Button type="button" size="sm" variant="ghost" aria-expanded={aperta} className="h-7 px-1.5 text-xs" onClick={() => setAperta(v => !v)}>
      {aperta ? "Chiudi correzione" : "Modifica richiesta"}
    </Button>
    {aperta && <form className="space-y-1.5" onSubmit={e => { e.preventDefault(); if (testo.trim()) onProva(testo.trim()); }}>
      <Input autoFocus aria-label="Richiesta corretta" value={testo} maxLength={2200} onChange={e => setTesto(e.target.value)} />
      <Button type="submit" size="sm" variant="outline" className="h-7" disabled={!testo.trim()}>Prova la richiesta</Button>
    </form>}
  </div>;
}

function CorreggiSpostamento({ intervento, onProva }: { intervento: InterventoChat; onProva: (cm: number) => void }) {
  const idQuota = useId();
  const s = intervento.ultimoSpostamento!;
  const [quota, setQuota] = useState(intervento.richiesta.frase.match(/di ([\d.,]+) cm verso /)?.[1]?.replace(".", ",") ?? String(s.distanzaCm).replace(".", ","));
  const [risultato, setRisultato] = useState<ReturnType<typeof cercaQuoteLibere> | null>(null);
  const cm = leggiMisura(`${quota.trim()} cm`);
  const valida = cm !== null && cm > 0 && cm <= 20_000;
  return <div className="space-y-1.5 rounded-md bg-muted/45 p-2">
    <label htmlFor={idQuota} className="block font-medium">Spostamento verso {s.ambiente}</label>
    <div className="mt-1 flex items-center gap-1.5">
      <Input id={idQuota} aria-label="Spostamento in centimetri" inputMode="decimal" value={quota} onChange={e => { setQuota(e.target.value); setRisultato(null); }} className="h-7 w-20 bg-background" />
      <span className="text-muted-foreground">cm</span>
      <Button size="sm" type="button" className="ml-auto h-7" variant="outline" disabled={!valida} onClick={() => onProva(cm!)}>Prova la quota</Button>
    </div>
    {(intervento.errore || s.interferenze.length > 0) && <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" disabled={!valida}
      onClick={() => setRisultato(cercaQuoteLibere(intervento, cm!))}>Cerca quote libere</Button>}
    {risultato && <div role="status" className="space-y-1 text-muted-foreground">
      {risultato.quote.length ? <div className="flex flex-wrap gap-1">
        {risultato.quote.map(q => <Button key={q} type="button" size="sm" variant="outline" className="h-7" onClick={() => onProva(q)}>Prova {numero.format(q)} cm</Button>)}
      </div> : <p>Nessuna quota libera fra {numero.format(risultato.da)} e {numero.format(risultato.a)} cm, provando ogni 5 cm. Verifica il varco e gli appoggi sulla tavola.</p>}
    </div>}
  </div>;
}

function CostiInterventi({ proposta, revisione, contesto, consentiListino, onModifica, onEvidenzia }: {
  proposta: PassoChatDisegno; revisione: RevisioneInterventi; contesto: ContestoChatDisegno; consentiListino: boolean;
  onModifica: Modifica; onEvidenzia: (s: Selezione) => void;
}) {
  const [rigaAttiva, setRigaAttiva] = useState<string | null>(null);
  const [manuale, setManuale] = useState("");
  const [nelListino, setNelListino] = useState(true);
  const qc = useQueryClient();
  const [daListino, setDaListino] = useState(false);
  const [errore, setErrore] = useState("");
  const titolo = useRef<HTMLHeadingElement>(null);
  const { documento, livelloId, propostaId = ID_PROPOSTA } = contesto;
  const muroInConfronto = proposta.confrontoTramezzo?.prima.id;
  const { effectiveCompany } = useAuth();
  const grezze = useMemo(() => {
    const piano = livelloId ?? documento.livelli[0].id;
    const voci = (p: Pianta) => studioVariante(aPlanimetria(p, documento, livelloId, propostaId), propostaId).righe.filter(r => r.livelloId === piano);
    return { prima: voci(revisione.base),
      dopo: voci(revisione.prezzi ? { ...proposta.pianta, prezziProgetto: { ...proposta.pianta.prezziProgetto, ...revisione.prezzi } } : proposta.pianta) };
  }, [documento, livelloId, propostaId, revisione.base, revisione.prezzi, proposta.pianta]);
  // Le voci senza prezzo nascono quotate (listino, prezzario di zona, indicativo): «Cambia prezzo» le corregge.
  const tipi = useMemo(() => tipiDaCercare([...grezze.prima, ...grezze.dopo]), [grezze]);
  const { fonti: fontiPrezzi } = useFontiPrezzi(effectiveCompany?.id, tipi, consentiListino);
  const righe = useMemo(() => {
    const prima = consentiListino ? conPrezziProposti(grezze.prima, fontiPrezzi) : grezze.prima;
    const dopo = consentiListino ? conPrezziProposti(grezze.dopo, fontiPrezzi) : grezze.dopo;
    const differenze = differenzeLavorazioni(prima, dopo);
    if (muroInConfronto && !differenze.some(d => (d.dopo ?? d.prima)?.id === muroInConfronto)) {
      const a = prima.find(r => r.id === muroInConfronto), b = dopo.find(r => r.id === muroInConfronto);
      if (a && b) differenze.unshift({ prima: a, dopo: b, delta: 0 });
    }
    return differenze;
  }, [grezze, muroInConfronto, consentiListino, fontiPrezzi]);
  if (!righe.length) return <p className="py-1 text-muted-foreground">Gli interventi selezionati non cambiano le quantità del computo.</p>;
  const attiva = righe.find(r => r.dopo?.id === rigaAttiva)?.dopo;
  const assegna = (r: RigaStudio, prezzo: PrezzoVocePlanimetria) => {
    onModifica({ ...revisione, prezzi: { ...revisione.prezzi, [r.id]: prezzo } });
    setRigaAttiva(null);
    setDaListino(false);
    setErrore("");
    requestAnimationFrame(() => titolo.current?.focus());
  };
  const valori = righe.map(({ prima, dopo }) => {
    const prezzo = dopo?.prezzo ?? prima?.prezzo;
    const p1 = prima ? prima.quantita : 0, p2 = dopo ? dopo.quantita : 0;
    const compatibile = !prima || !dopo || prima.unita === dopo.unita;
    const differenza = prezzo && p1 !== null && p2 !== null && compatibile
      ? (Math.round(p2 * prezzo.importo * 100) - Math.round(p1 * prezzo.importo * 100)) / 100 : null;
    return { prima, dopo, prezzo, differenza };
  });
  const incomplete = valori.filter(v => v.differenza === null).length;
  const somme = valori.flatMap(v => v.differenza !== null ? [v.differenza] : []);
  const quantita = (r?: RigaStudio) => !r ? "—" : r.quantita === null ? "Da misurare" : numero.format(r.quantita);
  return <div className="space-y-2">
    <h4 ref={titolo} tabIndex={-1} className="text-sm font-semibold focus-visible:outline-primary">Effetto sul computo</h4>
    <div className="flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground">
      {!!somme.length && <strong className="font-medium text-foreground">{deltaEuro.format(somme.reduce((a, b) => a + b, 0))} {incomplete ? "parziali" : "di differenza"}</strong>}
      {!!incomplete && <span>{incomplete} {incomplete === 1 ? "voce da completare" : "voci da completare"}</span>}
      {!!proposta.confrontoTramezzo?.interferenze.length && <span>Quantità simulate</span>}
    </div>
    <table className="w-full" aria-label="Quantità del computo prima e dopo">
      <thead><tr className="text-left text-muted-foreground"><th className="font-medium">Lavorazione</th><th className="px-1 font-medium">Prima</th><th className="font-medium">Dopo</th></tr></thead>
      <tbody className="divide-y">
        {valori.map(({ prima, dopo, prezzo, differenza }) => {
          const r = (dopo ?? prima)!;
          const ref = dopo?.riferimento;
          return <tr key={r.id} className="align-top">
            <th scope="row" className="space-y-0.5 py-1.5 pr-1 text-left font-normal">
              <div>{ref ? <button type="button" className="text-left text-primary hover:underline" onClick={() => onEvidenzia({ tipo: ref.tipo, id: ref.id })}>{r.descrizione}</button> : r.descrizione} · {r.unita}</div>
              {prezzo && <div className="text-muted-foreground">{euro.format(prezzo.importo)}/{r.unita}{differenza !== null ? ` · ${deltaEuro.format(differenza)}` : ""}<br />{prezzo.fonte}{prezzo.tariffa ? ` · ${prezzo.tariffa}` : ""}</div>}
              {dopo && <button type="button" className="text-[11px] text-primary underline-offset-2 hover:underline" aria-label={`Prezzo per ${r.descrizione}`}
                onClick={() => { setRigaAttiva(dopo.id); setManuale(dopo.prezzo ? String(dopo.prezzo.importo).replace(".", ",") : ""); setErrore(""); }}>
                {prezzo ? "Cambia prezzo" : "Da quotare"}
              </button>}
            </th>
            <td className="py-1.5 pr-1 tabular-nums">{quantita(prima)}</td><td className="py-1.5 font-medium tabular-nums">{quantita(dopo)}</td>
          </tr>;
        })}
      </tbody>
    </table>
    {attiva && <div className="space-y-1.5 rounded-md bg-muted/50 p-2">
      <p className="font-medium">{attiva.descrizione}</p>
      {consentiListino && <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-0.5 size-3.5 shrink-0 accent-primary" checked={nelListino}
        onChange={e => setNelListino(e.target.checked)} />Salvalo anche nel listino dell’azienda, così vale per le altre piante e per i preventivi</label>}
      <label className="block">Prezzo unitario in €/{attiva.unita}<Input aria-label="Prezzo unitario" type="text" inputMode="decimal" value={manuale} autoFocus
        onChange={e => { setManuale(e.target.value); setErrore(""); }} className="mt-1 h-7 bg-background" /></label>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" className="h-7" variant="outline" onClick={() => {
          const importo = numeroEditor(manuale);
          if (importo === null || importo < 0) return setErrore("Inserisci un prezzo unitario valido.");
          // Il prezzo corretto a mano vale per tutta l'azienda: va nel listino, non solo in questa variante.
          if (nelListino && effectiveCompany?.id) {
            salvaPrezzoNelListino(effectiveCompany.id, { descrizione: attiva.descrizione, unita: attiva.unita, importo, riga: attiva })
              .then(esito => { void qc.invalidateQueries({ queryKey: ["planimetrie", "fonti-prezzi"] }); toast.success(messaggioListino(esito, attiva.descrizione)); },
                (e: unknown) => toast.error(e instanceof Error ? e.message : "Prezzo non salvato nel listino."));
          }
          assegna(attiva, { importo, unita: attiva.unita, fonte: nelListino ? "Listino aziendale" : "Prezzo inserito", tariffa: "" });
        }}>Usa prezzo</Button>
        {consentiListino && <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => { setErrore(""); setDaListino(true); }}>Scegli dal listino</Button>}
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => { setRigaAttiva(null); setErrore(""); }}>Chiudi</Button>
      </div>
      {errore && <p role="alert" className="text-destructive">{errore}</p>}
      {daListino && <Suspense fallback={<p role="status">Apro il listino…</p>}><AddVocePicker open unitaPrezzo={attiva.unita} onOpenChange={open => { if (!open) setDaListino(false); }}
        onPick={voci => {
          const v = voci[0];
          const unita = v && (v.sourceUnit?.trim() || v.unita_originale);
          if (voci.length !== 1 || !unitaCompatibili(unita,attiva.unita) || !Number.isFinite(v.prezzo_unitario) || v.prezzo_unitario <= 0) {
            setErrore(`Scegli una voce con prezzo unitario in ${attiva.unita}.`);
            setDaListino(false);
            return false;
          }
          assegna(attiva, { importo: v.prezzo_unitario, unita: attiva.unita, fonte: (v.fonte?.trim() || "Listino").slice(0, 300), tariffa: (v.codice_tariffa || "").slice(0, 120) });
        }} /></Suspense>}
    </div>}
  </div>;
}
