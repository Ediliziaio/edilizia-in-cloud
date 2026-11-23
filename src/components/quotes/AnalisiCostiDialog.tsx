import { Fragment, lazy, Suspense, useMemo, useRef, useState } from "react";
import { ArrowRight, Calculator, CalendarDays, ChevronDown, Download, Layers, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { downloadQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import {
  analizzaPreventivo, categorieCosto, centesimiCosto, costoCompletoVoce, dettaglioRisorse, euroAnalisi, numeroCosto, prezzoDaCosto, quoteCostiComuni, risorsaVuota, soldi,
  type AnalisiCosti, type PianoTrasferta, type QuotaCostiComuni, type StimaTempiSalvata, type RisorsaCosto, type TipoRisorsaCosto, type VoceAnalisi,
} from "@/lib/preventivi/analisiCosti";
import StimaCostiPanel, { type ContestoStima, type VistaStima } from "./StimaCostiPanel";
import ProposteCostiMultiple, { type RichiestaProposteCosti } from "./ProposteCostiMultiple";
import CalendarioPreventivo from "./CalendarioPreventivo";
import { aggiornaTrasferta, risorseTrasfertaEsistenti } from "@/lib/preventivi/stimaCostiStorici";
import { formatoDataStima, stimaTempiAggiornata } from "@/lib/preventivi/stimaTempistiche";
import { simulaPrezzoConCostiComuni, type ProiezionePrezzoAnalisi } from "@/lib/preventivi/analisiCostiEditor";
import { datiVocePerProposta } from "@/lib/preventivi/proposteAnalisiCosti";
import { applicaModificheAnalisi, type ModificaAnalisiProposta } from "@/lib/preventivi/anteprimaAnalisiCosti";

const ListinoFornitoreAnalisi = lazy(() => import("./ListinoFornitoreAnalisi"));

type Selezione = { tipo: "voce" | "fase" | "generale" | "totale" | "calendario"; id: string };
type RevisioneAnalisi = { id: string; nome: string; analisi: AnalisiCosti; voci: VoceAnalisi[]; imponibile: number };
type Props = {
  title: string; numero: string; revisione: string; azienda?: string;
  open: boolean; onOpenChange: (aperto: boolean) => void; voceIniziale?: string; stimaIniziale?: boolean;
  analisi: AnalisiCosti; voci: VoceAnalisi[]; imponibile: number;
  revisioni?: RevisioneAnalisi[]; erroreRevisioni?: string;
  onSave?: (valore: AnalisiCosti) => Promise<void>; errore?: string; attesa?: boolean;
  onProiettaPrezzo?: (id: string, prezzo: number) => ProiezionePrezzoAnalisi | null;
  decimaliPrezzo?: 2 | 4;
  onPrezzo?: (id: string, prezzo: number) => void;
  onNuovaVoce?: (nome: string, quantita: number, unita: string) => string;
  onScegliAlternativa?: (id: string, alternative: string[]) => void;
  onListino?: (voce: VoceAnalisi) => Promise<RisorsaCosto[]>;
  onScaricaCliente?: () => Promise<void>;
  contestoStima?: ContestoStima;
};

const formato = (n: number | null) => n == null ? "—" : euroAnalisi.format(n);
const euro = (c: number | null) => c == null ? "—" : formato(soldi(c));
const pct = (n: number | null) => n == null ? "—" : n.toLocaleString("it-IT", { maximumFractionDigits: 2 }) + "%";
const tariffa = (prezzo: number | null) => prezzo === null ? "—"
  : prezzo.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: true }) + " €";
function nomeVoce(v: VoceAnalisi) {
  const primaRiga = v.descrizione.trim().split("\n")[0].trim();
  const primaFrase = primaRiga.split(/[.,;]\s/)[0].trim();
  return primaFrase.length >= 24 ? primaFrase : primaRiga || "Lavorazione";
}
const stileSelect = "h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm";

export default function AnalisiCostiDialog(props: Props) {
  const { open, onOpenChange, title } = props;
  const [idRevisione, scegliRevisione] = useState("");
  const archivio = props.revisioni?.find(r => r.id === idRevisione);
  const contenuto = archivio ? { ...props, revisione: archivio.nome, voci: archivio.voci, analisi: archivio.analisi,
    imponibile: archivio.imponibile, onSave: undefined, onNuovaVoce: undefined, onListino: undefined, onProiettaPrezzo: undefined,
    onPrezzo: undefined, onScegliAlternativa: undefined, onScaricaCliente: undefined, contestoStima: undefined, voceIniziale: undefined } : props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(900px,94dvh)] w-[min(1280px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b bg-slate-50 px-4 py-4 pr-12 sm:px-6 sm:pr-12">
          <DialogTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-700" />Analisi costi</DialogTitle>
          <DialogDescription>{[props.numero, title, contenuto.revisione].filter(Boolean).join(" · ")}</DialogDescription>
        </DialogHeader>
        {open && <ContenutoAnalisi key={archivio?.id ?? ""} {...contenuto} versioneSelezionata={archivio?.id ?? ""} onRevisione={scegliRevisione} />}
      </DialogContent>
    </Dialog>
  );
}

function ContenutoAnalisi(props: Props & { versioneSelezionata: string; onRevisione: (id: string) => void }) {
  const { analisi, voci, imponibile, onSave, onProiettaPrezzo, onPrezzo, onScegliAlternativa, onListino, onScaricaCliente, contestoStima } = props;
  const [selezione, seleziona] = useState<Selezione | null>(props.voceIniziale ? { tipo: "voce", id: props.voceIniziale } : null);
  const [scheda, scegliScheda] = useState<"risorse" | "prezzo" | "stima">(props.voceIniziale && props.stimaIniziale && contestoStima ? "stima" : "risorse");
  const [vistaStima, scegliVistaStima] = useState<VistaStima>(props.stimaIniziale ? "rapida" : "costi");
  const titoloDettaglio = useRef<HTMLHeadingElement>(null);
  const origineDettaglio = useRef<HTMLElement | null>(null);
  const ricercaLavorazioni = useRef<HTMLInputElement>(null);
  const [modifiche, aggiorna] = useState<RisorsaCosto[] | null>(null);
  const [trasfertaModificata, modificaTrasferta] = useState<RisorsaCosto[] | null>(null);
  const [risorsaAperta, apriRisorsa] = useState<string | null>(null);
  const [gruppoModificato, cambiaGruppo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ricerca, cerca] = useState("");
  const [soloMancanti, filtra] = useState(false);
  const [soloDaPianificare, filtraTempi] = useState(false);
  const [selezionate, selezionaVoci] = useState<Set<string>>(() => new Set());
  const [richiesta, setRichiesta] = useState<RichiestaProposteCosti | null>(null);
  const [fornitoreAperto, apriFornitore] = useState<string | null>(null);
  const [metodo, cambiaMetodo] = useState<"ricarico" | "margine">("margine");
  const [obiettivo, cambiaObiettivo] = useState("20");
  const [confermaPrezzo, chiediConferma] = useState<number | null>(null);
  const [nuova, setNuova] = useState(false);
  const [nome, setNome] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [unita, setUnita] = useState("a corpo");

  const calcolo = useMemo(() => analizzaPreventivo(analisi, voci, imponibile), [analisi, voci, imponibile]);
  const quote = useMemo(() => quoteCostiComuni(calcolo), [calcolo]);
  const corrente = selezione?.tipo === "voce" ? calcolo.righe.find(r => r.voce.id === selezione.id) : null;
  const quotaCorrente = corrente && quote.get(corrente.voce.id);
  const costoCorrente = corrente ? costoCompletoVoce(corrente, quotaCorrente) : null;
  const risorse = modifiche ?? (selezione?.tipo === "generale" ? analisi.generali
    : selezione?.tipo === "fase" ? analisi.fasi[selezione.id] ?? []
      : selezione ? analisi.voci[selezione.id] ?? [] : []);
  const costiFase = selezione?.tipo === "fase" ? calcolo.fasi.find(f => f.fase === selezione.id) : undefined;
  const ambitoSalvato = corrente?.dettaglio ?? costiFase ?? calcolo.generali;
  const dettaglio = modifiche ? dettaglioRisorse(risorse, corrente?.voce.quantita ?? null, ambitoSalvato.baseEsterna) : ambitoSalvato;
  const gruppo = gruppoModificato ?? (corrente ? analisi.alternative[corrente.voce.id] ?? "" : "");
  const tempiSalvati = corrente ? analisi.tempistiche?.[corrente.voce.id] : undefined;
  const sporco = modifiche !== null || gruppoModificato !== null || trasfertaModificata !== null;
  const mostraTempistiche = scheda === "stima" && vistaStima === "tempi";
  const mostraStimaRapida = scheda === "stima" && vistaStima === "rapida";
  const pannelloAperto = !!selezione;
  const comandiTabellaBloccati = busy || sporco || !!richiesta || !!props.errore;
  const downloadInAttesa = busy || props.attesa;
  const analisiDaSalvare = sporco || !!props.errore;
  const vociConTempi = voci.filter(v => {
    const t = analisi.tempistiche?.[v.id];
    return v.inclusa && t && stimaTempiAggiornata(t, v);
  });
  const ultimaFine = vociConTempi.map(v => analisi.tempistiche![v.id].fine).sort().at(-1);
  const comuni = [...(trasfertaModificata ?? analisi.generali),
    ...(corrente ? analisi.fasi[corrente.voce.fase] ?? [] : [])];
  const percentuale = numeroCosto(obiettivo);
  const obiettivoValido = percentuale !== null && (metodo !== "margine" || percentuale < 100);
  const simulazione = scheda === "prezzo" && !sporco && corrente && onProiettaPrezzo && costoCorrente !== null
    ? simulaPrezzoConCostiComuni(calcolo, corrente.voce.id, percentuale, metodo,
      p => onProiettaPrezzo(corrente.voce.id, p), corrente.voce.quantita === 1 ? 2 : props.decimaliPrezzo)
    : null;
  const anteprimaTotale = calcolo.incompleto || !voci.some(v => v.inclusa) ? null : prezzoDaCosto(soldi(calcolo.costo), percentuale, metodo);
  const gruppoCorrente = corrente && analisi.alternative[corrente.voce.id];
  const altreAlternative = gruppoCorrente ? voci.filter(v => analisi.alternative[v.id] === gruppoCorrente).map(v => v.id) : [];
  const filtro = ricerca.trim().toLocaleLowerCase("it");
  const analizzate = calcolo.righe.filter(r => r.voce.inclusa && !r.incompleto).length;
  const risultati = calcolo.righe.filter(r => (!soloMancanti || r.incompleto || quote.get(r.voce.id)?.parziale) &&
    (!soloDaPianificare || !analisi.tempistiche?.[r.voce.id] || !stimaTempiAggiornata(analisi.tempistiche[r.voce.id], r.voce)) &&
    [r.voce.codice, r.voce.descrizione, r.voce.descrizioneEstesa, r.voce.fase, analisi.alternative[r.voce.id]].filter(Boolean).join(" ").toLocaleLowerCase("it").includes(filtro));
  const gruppi = new Map<string, typeof risultati>();
  for (const r of risultati) {
    const fase = gruppi.get(r.voce.fase);
    if (fase) fase.push(r);
    else gruppi.set(r.voce.fase, [r]);
  }
  const destinazioni = voci.filter(v => selezionate.has(v.id));

  function apri(prossima: Selezione | null, origine?: HTMLElement, vista?: VistaStima) {
    if (origine) origineDettaglio.current = origine;
    seleziona(prossima);
    scegliScheda(vista ? "stima" : prossima?.tipo === "totale" ? "prezzo" : "risorse");
    scegliVistaStima(vista ?? "costi");
    aggiorna(null);
    modificaTrasferta(null);
    apriRisorsa(null);
    cambiaGruppo(null);
    chiediConferma(null);
    requestAnimationFrame(() => (prossima ? titoloDettaglio.current : origineDettaglio.current)?.focus());
  }
  async function esegui(azione: () => Promise<void>) {
    setBusy(true);
    try { await azione(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita."); }
    finally { setBusy(false); }
  }
  function selezionaGruppo(righe: typeof risultati, attive: boolean) {
    selezionaVoci(precedenti => {
      const nuove = new Set(precedenti);
      for (const { voce } of righe) {
        if (attive) nuove.add(voce.id);
        else nuove.delete(voce.id);
      }
      return nuove;
    });
  }
  function statoGruppo(righe: typeof risultati) {
    const scelte = righe.filter(r => selezionate.has(r.voce.id)).length;
    return scelte > 0 && scelte < righe.length ? "indeterminate" : scelte > 0;
  }
  function apriProposte(azione: RichiestaProposteCosti["azione"], fase?: string) {
    const incluse = fase === undefined ? destinazioni : voci.filter(r => r.fase === fase);
    if (!onSave || comandiTabellaBloccati || !incluse.length || (azione === "storico" && !contestoStima)) return;
    setRichiesta({ azione, fase, voci: incluse, tutte: voci, imponibile, analisi, contesto: contestoStima, onListino });
    seleziona(null);
    scegliScheda("risorse");
  }
  function chiudiProposte() {
    setRichiesta(null);
    requestAnimationFrame(() => ricercaLavorazioni.current?.focus());
  }
  function salvaProposte(proposte: ModificaAnalisiProposta[]) {
    if (!richiesta || !onSave || busy || !proposte.length) return;
    void esegui(async () => {
      const cambiata = richiesta.analisi !== analisi || richiesta.imponibile !== imponibile ||
        richiesta.contesto?.companyId !== contestoStima?.companyId || richiesta.contesto?.preventivoId !== contestoStima?.preventivoId ||
        JSON.stringify(richiesta.tutte.map(datiVocePerProposta)) !== JSON.stringify(voci.map(datiVocePerProposta));
      if (cambiata) throw new Error("I dati dell’analisi sono cambiati. Chiudi l’anteprima e ricalcola le proposte.");
      await onSave(applicaModificheAnalisi(analisi, proposte));
      chiudiProposte();
      selezionaVoci(new Set());
      const costi = proposte.some(p => p.risorse?.length);
      const date = proposte.some(p => p.tempistiche);
      if (costi && date) toast.success("Costi e date salvati");
      else if (date) toast.success("Date salvate");
      else toast.success(proposte.length === 1 ? "Costo salvato" : `Costi salvati per ${proposte.length} voci`);
    });
  }
  async function scaricaAnalisi() {
    const { pdfAnalisiCosti } = await import("@/lib/preventivi/pdfAnalisiCosti");
    downloadQuotePdf(pdfAnalisiCosti({ titolo: props.title, numero: props.numero, revisione: props.revisione, azienda: props.azienda }, calcolo, analisi.tempistiche),
      "analisi-costi-" + (props.numero || "bozza").replace(/[^a-zA-Z0-9-]/g, "-") + ".pdf");
  }
  async function salva() {
    if (!selezione || !onSave) return;
    const prossimo = { ...analisi, generali: trasfertaModificata ?? analisi.generali };
    if (selezione.tipo === "generale") prossimo.generali = risorse;
    if (selezione.tipo === "fase") prossimo.fasi = { ...analisi.fasi, [selezione.id]: risorse };
    if (selezione.tipo === "voce") {
      prossimo.voci = { ...analisi.voci, [selezione.id]: risorse };
      prossimo.alternative = { ...analisi.alternative, [selezione.id]: gruppo.trim() };
    }
    await onSave(prossimo);
    aggiorna(null);
    modificaTrasferta(null);
    apriRisorsa(null);
    cambiaGruppo(null);
    toast.success("Analisi salvata");
  }
  function salvaTempistiche(stima: StimaTempiSalvata) {
    if (!corrente || !onSave || busy) return;
    const id = corrente.voce.id;
    void esegui(async () => {
      await onSave({ ...analisi, tempistiche: { ...analisi.tempistiche, [id]: stima } });
      toast.success("Tempistiche salvate");
    });
  }
  function valutaStima(righe: RisorsaCosto[], piano: PianoTrasferta, calcolaPrezzo = true) {
    if (!corrente) return null;
    const id = corrente.voce.id;
    const proiezione = analizzaPreventivo({
      ...analisi,
      generali: aggiornaTrasferta(trasfertaModificata ?? analisi.generali, piano, true),
      voci: { ...analisi.voci, [id]: righe },
    }, voci, imponibile);
    const riga = proiezione.righe.find(r => r.voce.id === id);
    const costo = riga ? costoCompletoVoce(riga, quoteCostiComuni(proiezione).get(id)) : null;
    if (costo === null) return null;
    const venditaSuggerita = calcolaPrezzo && onProiettaPrezzo
      ? simulaPrezzoConCostiComuni(proiezione, id, percentuale, metodo, p => onProiettaPrezzo(id, p),
        corrente.voce.quantita === 1 ? 2 : props.decimaliPrezzo)?.netto ?? null
      : null;
    return { costo, margine: corrente.voce.vendita === null ? null : centesimiCosto(corrente.voce.vendita) - costo,
      venditaSuggerita, obiettivo: `${pct(percentuale)} di ${metodo}` };
  }
  function proponiStima(verso: RisorsaCosto[] | null, piano: PianoTrasferta) {
    if (verso) aggiorna(verso);
    if (piano.metodo !== "comuni") {
      modificaTrasferta(aggiornaTrasferta(trasfertaModificata ?? analisi.generali, piano));
    }
    scegliScheda("risorse");
    apriRisorsa(null);
  }
  function aggiungiRisorsa(risorsa: RisorsaCosto) {
    aggiorna([...risorse, risorsa]);
    apriRisorsa(risorsa.id);
    requestAnimationFrame(() => document.getElementById(`analisi-risorsa-${risorsa.id}`)?.scrollIntoView({ block: "nearest" }));
  }

  const riepilogo = [
    ["Costo stimato", euro(calcolo.costo)], ["Vendita netta", formato(imponibile)],
    ["Margine previsto", calcolo.incompleto ? "Parziale" : euro(calcolo.margine)],
    ["Margine sulla vendita", calcolo.incompleto ? "—" : pct(calcolo.percentuale)],
  ];
  const titoloPannello = corrente ? nomeVoce(corrente.voce) : selezione?.tipo === "fase" ? selezione.id
    : selezione?.tipo === "totale" ? "Simula il prezzo del preventivo" : selezione?.tipo === "calendario" ? "Calendario del preventivo" : "Costi dell’intero preventivo";
  const costoPannello = corrente ? costoCorrente : selezione?.tipo === "fase"
    ? costiFase?.costo ?? 0 : calcolo.generali.costo;
  const descrizioneCompleta = corrente?.voce.descrizioneEstesa?.trim() || corrente?.voce.descrizione.trim() || "";

  return <>
    <div className="flex min-h-0 flex-1 flex-col">
      {props.errore && <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{props.errore}</p>}
      {props.erroreRevisioni && <p role="status" className="mx-4 mt-3 text-sm text-slate-600">{props.erroreRevisioni}</p>}
      {props.attesa ? <p role="status" className="p-4 text-sm">Caricamento analisi…</p> : richiesta
        ? <ProposteCostiMultiple richiesta={richiesta} busy={busy} applica={salvaProposte} chiudi={chiudiProposte} /> : <>
        <div className={`shrink-0 space-y-2 border-b px-3 pb-3 pt-3 sm:px-5 ${pannelloAperto ? "max-lg:hidden" : ""}`}>
          {!!props.revisioni?.length && <label className="flex flex-wrap items-center gap-2 text-xs">
            Versione dell’analisi
            <select className={stileSelect} value={props.versioneSelezionata} disabled={comandiTabellaBloccati} onChange={e => props.onRevisione(e.target.value)}>
              <option value="">Preventivo corrente</option>
              {props.revisioni.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>}
          <dl className="grid grid-cols-2 overflow-hidden rounded-xl border bg-slate-50 sm:grid-cols-4">
            {riepilogo.map(([nome, valore]) => <div key={nome} className="px-3 py-2 odd:border-r [&:nth-child(-n+2)]:border-b sm:border-b-0 sm:border-r sm:last:border-r-0 sm:[&:nth-child(-n+2)]:border-b-0">
              <dt className="text-xs font-medium text-slate-600">{nome}</dt><dd className="mt-0.5 font-semibold tabular-nums sm:text-lg">{valore}</dd>
            </div>)}
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">
              {analizzate === 1 ? "1 voce analizzata" : `${analizzate} voci analizzate`} · {calcolo.mancanti} da completare
              {!calcolo.incompleto && calcolo.ricarico !== null && <> · Ricarico {pct(calcolo.ricarico)}</>}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={comandiTabellaBloccati}>
                    <Layers className="h-4 w-4" />Costi comuni <span className="hidden sm:inline">{euro(calcolo.comuni)}</span><ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-[85vw]">
                  <DropdownMenuItem onSelect={() => apri({ tipo: "generale", id: "" })}>Intero preventivo · {euro(calcolo.generali.costo)}</DropdownMenuItem>
                  {calcolo.fasi.map(f => <DropdownMenuItem key={f.fase} onSelect={() => apri({ tipo: "fase", id: f.fase })}>{f.fase} · {euro(f.costo)}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" size="sm" className="h-8" disabled={comandiTabellaBloccati} onClick={e => apri({ tipo: "totale", id: "" }, e.currentTarget)}>Simula totale</Button>
              {(contestoStima || ultimaFine) && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5"
                disabled={comandiTabellaBloccati} onClick={e => apri({ tipo: "calendario", id: "" }, e.currentTarget)}>
                <CalendarDays className="h-4 w-4" aria-hidden="true" />Calendario
              </Button>}
              {props.onNuovaVoce && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={comandiTabellaBloccati} onClick={() => setNuova(!nuova)}>
                <Plus className="h-4 w-4" />Nuova lavorazione dai costi
              </Button>}
            </div>
          </div>
          {ultimaFine && <p className="text-xs text-slate-600">
            Tempistiche salvate per {vociConTempi.length} di {voci.filter(v => v.inclusa).length} lavorazioni incluse · ultima fine stimata {formatoDataStima(ultimaFine)}
          </p>}
          {nuova && props.onNuovaVoce && <form className="flex flex-wrap items-end gap-2 rounded-lg border bg-slate-50 p-2.5" onSubmit={e => {
            e.preventDefault(); const q = numeroCosto(quantita);
            if (q === null || q <= 0 || !nome.trim() || !props.onNuovaVoce) return;
            apri({ tipo: "voce", id: props.onNuovaVoce(nome.trim(), q, unita.trim()) });
            setNuova(false); setNome("");
          }}>
              <label className="grid grow gap-1 text-xs">Lavorazione<Input value={nome} maxLength={500} onChange={e => setNome(e.target.value)} required /></label>
              <label className="grid w-20 gap-1 text-xs">Quantità<Input value={quantita} onChange={e => setQuantita(e.target.value)} inputMode="decimal" required /></label>
              <label className="grid w-24 gap-1 text-xs">Unità<Input value={unita} maxLength={32} onChange={e => setUnita(e.target.value)} required /></label>
              <Button type="submit" size="sm">Componi costo</Button>
            </form>}
        </div>
        <div className="relative flex min-h-0 flex-1">
          <section className={`flex min-w-0 flex-1 flex-col ${pannelloAperto ? "max-lg:invisible" : ""}`} aria-label="Lavorazioni analizzate">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-5">
              <Input ref={ricercaLavorazioni} type="search" aria-label="Cerca lavorazione" placeholder="Cerca lavorazione…" value={ricerca} onChange={e => cerca(e.target.value)} className="h-8 min-w-32 flex-1 sm:max-w-xs" />
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={soloMancanti} onChange={e => filtra(e.target.checked)} />Da completare</label>
              {contestoStima && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={soloDaPianificare}
                onChange={e => filtraTempi(e.target.checked)} />Da pianificare</label>}
              <span className="ml-auto text-xs tabular-nums text-slate-600">{risultati.length === 1 ? "1 lavorazione" : `${risultati.length} lavorazioni`}</span>
            </div>
            {onSave && !!destinazioni.length && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-3 py-2 sm:px-5">
              <span className="text-xs font-semibold text-blue-950">{destinazioni.length === 1 ? "1 voce selezionata" : `${destinazioni.length} voci selezionate`}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" size="sm" className="h-8" disabled={comandiTabellaBloccati}>
                  Azioni sulle voci<ChevronDown aria-hidden="true" />
                </Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {contestoStima && <DropdownMenuItem onSelect={() => apriProposte("storico")}>Proponi costi dai consuntivi</DropdownMenuItem>}
                  <DropdownMenuItem onSelect={() => apriProposte("copia")}>Copia composizione costi</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" size="sm" variant="ghost" className="h-8" disabled={comandiTabellaBloccati} onClick={() => selezionaVoci(new Set())}>Deseleziona</Button>
            </div>}
            {!risultati.length && <p className="p-4 text-sm text-slate-600">Nessuna lavorazione da mostrare.</p>}
            {!!risultati.length && <div className="min-h-0 overflow-auto">
              <table className="w-full table-fixed text-left text-xs sm:min-w-[550px] sm:table-auto sm:text-sm">
                <thead className="sticky top-0 z-[1] bg-slate-50 text-xs text-slate-600"><tr>
                  <th scope="col" className="w-[40%] py-2 pl-3 font-medium sm:w-[38%] sm:pl-5">
                    <span className="flex items-center gap-2">{onSave && <Checkbox aria-label="Seleziona tutte le voci visibili" checked={statoGruppo(risultati)}
                      disabled={comandiTabellaBloccati} onCheckedChange={attivo => selezionaGruppo(risultati, attivo === true)} />}Lavorazione</span>
                  </th>
                  <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">Quantità</th>
                  <th scope="col" className="px-1 py-2 font-medium sm:px-2">Costo<span className="hidden sm:inline"> completo</span></th>
                  <th scope="col" className="px-1 py-2 font-medium sm:px-2">Vendita<span className="hidden sm:inline"> netta</span></th>
                  <th scope="col" className="px-1 py-2 font-medium sm:px-2">Margine</th>
                  <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">Stato</th>
                </tr></thead>
                <tbody className="divide-y">{[...gruppi].map(([fase, righe]) => <Fragment key={fase}>
                  {fase && <tr className="bg-slate-100/80"><td colSpan={6} className="px-3 py-1.5 sm:px-5">
                    <div className="flex items-center gap-2">
                      {onSave && <Checkbox aria-label={`Seleziona fase ${fase}`} checked={statoGruppo(righe)} disabled={comandiTabellaBloccati}
                        onCheckedChange={attivo => selezionaGruppo(righe, attivo === true)} />}
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{fase} <span className="ml-1 font-normal text-slate-500">{righe.length}</span></span>
                      {onSave && contestoStima && <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-1.5 text-xs text-blue-800"
                        aria-label={`Stima fase ${fase}`} disabled={comandiTabellaBloccati} onClick={() => apriProposte("storico", fase)}>
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Stima fase
                      </Button>}
                      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-1.5 text-xs" aria-label={`Costi della fase ${fase}`}
                        disabled={comandiTabellaBloccati} onClick={e => apri({ tipo: "fase", id: fase }, e.currentTarget)}>Costi fase</Button>
                    </div>
                  </td></tr>}
                {righe.map(r => {
                  const quota = quote.get(r.voce.id);
                  const attiva = corrente?.voce.id === r.voce.id;
                  const tempistiche = analisi.tempistiche?.[r.voce.id];
                  const pieno = costoCompletoVoce(r, quota);
                  const margine = pieno === null || r.voce.vendita == null ? null : centesimiCosto(r.voce.vendita) - pieno;
                  return <tr key={r.voce.id} className={attiva ? "bg-blue-50" : "hover:bg-slate-50"}>
                    <td className="max-w-[15rem] px-3 py-2 sm:pl-5">
                      <div className="flex min-w-0 items-start gap-2">
                      {onSave && <Checkbox aria-label={`Seleziona ${nomeVoce(r.voce)}`} className="mt-0.5" checked={selezionate.has(r.voce.id)}
                        disabled={comandiTabellaBloccati} onCheckedChange={attivo => selezionaGruppo([r], attivo === true)} />}
                      <div className="min-w-0 flex-1">
                      <button type="button" className="block w-full text-left font-medium text-blue-800 hover:underline disabled:opacity-60"
                        title={r.voce.descrizione} aria-expanded={attiva} disabled={comandiTabellaBloccati}
                        onClick={e => apri({ tipo: "voce", id: r.voce.id }, e.currentTarget)}>
                        <span className="line-clamp-2 break-words">
                          {r.voce.codice && <><span className="mr-1 inline-block rounded bg-slate-100 px-1.5 text-[10px] font-semibold tracking-wide text-slate-700">{r.voce.codice}</span>{" "}</>}
                          {nomeVoce(r.voce)}
                        </span>
                      </button>
                      {analisi.alternative[r.voce.id] && <p className="truncate text-xs text-slate-600">{analisi.alternative[r.voce.id]}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {contestoStima && <button type="button" className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 focus-visible:ring-2"
                        aria-label={`Stima per ${nomeVoce(r.voce)}`} disabled={comandiTabellaBloccati}
                        onClick={e => apri({ tipo: "voce", id: r.voce.id }, e.currentTarget, "rapida")}>
                        <Sparkles className="h-3 w-3" aria-hidden="true" />Stima
                      </button>}
                      {tempistiche && contestoStima && <button type="button"
                        className="inline-flex max-w-full items-center gap-1 rounded text-xs text-slate-600 hover:text-blue-800 hover:underline"
                        disabled={comandiTabellaBloccati} aria-label={`Tempistiche di ${nomeVoce(r.voce)}`}
                        onClick={e => apri({ tipo: "voce", id: r.voce.id }, e.currentTarget, "tempi")}>
                        <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">
                          {stimaTempiAggiornata(tempistiche, r.voce) ? `Fine ${formatoDataStima(tempistiche.fine)}` : "Tempistiche da ricalcolare"}
                        </span>
                      </button>}
                      </div>
                      {(!r.voce.inclusa || pieno === null) && <p className="truncate text-xs text-slate-600 sm:hidden">{!r.voce.inclusa ? "Fuori dal totale" : "Da completare"}</p>}
                      </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 sm:table-cell">{r.voce.quantita ?? "—"} {r.voce.unita}</td>
                    <td className="whitespace-nowrap px-1 py-2 tabular-nums sm:px-2">{euro(pieno)}</td>
                    <td className="whitespace-nowrap px-1 py-2 tabular-nums sm:px-2">{formato(r.voce.vendita)}</td>
                    <td className={`whitespace-nowrap px-1 py-2 tabular-nums sm:px-2 ${(margine ?? 0) < 0 ? "font-semibold text-red-700" : ""}`}>{euro(margine)}</td>
                    <td className="hidden whitespace-nowrap px-2 py-2 sm:table-cell"><Badge variant={r.incompleto || quota?.parziale ? "outline" : "secondary"}>
                      {!r.voce.inclusa ? "Fuori dal totale" : r.incompleto ? "Da completare" : quota?.parziale ? "Costi parziali" : "Analizzata"}
                    </Badge></td>
                  </tr>;
                })}</Fragment>)}</tbody>
              </table>
            </div>}
          </section>
          {selezione && <section aria-label="Dettaglio costi" className="flex min-h-0 min-w-0 flex-col border-t bg-white max-lg:absolute max-lg:inset-0 max-lg:z-10 lg:w-[44%] lg:max-w-[34rem] lg:border-l lg:border-t-0 xl:w-[46%] xl:max-w-[37rem]">
            <header className="shrink-0 border-b bg-slate-50 px-3 py-2.5 sm:px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {corrente && (corrente.voce.codice || corrente.voce.fase) && <p className="mb-0.5 truncate text-xs text-slate-600">
                    {[corrente.voce.codice, corrente.voce.fase].filter(Boolean).join(" · ")}
                  </p>}
                  <h3 tabIndex={-1} ref={titoloDettaglio} className="line-clamp-2 break-words text-sm font-semibold">{titoloPannello}</h3>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={sporco ? "Annulla modifiche" : "Chiudi dettaglio"} disabled={busy} onClick={() => apri(null)}><X className="h-4 w-4" /></Button>
              </div>
              {corrente && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Sezioni della lavorazione">
                <Button type="button" size="sm" variant={scheda === "risorse" ? "secondary" : "ghost"} className="h-7" aria-pressed={scheda === "risorse"} onClick={() => { scegliScheda("risorse"); chiediConferma(null); }}>Risorse</Button>
                {contestoStima && <Button type="button" size="sm" variant={scheda === "stima" ? "secondary" : "ghost"} className="h-7"
                  aria-pressed={scheda === "stima"} onClick={() => { scegliScheda("stima"); chiediConferma(null); }}>Da commesse simili</Button>}
                <Button type="button" size="sm" variant={scheda === "prezzo" ? "secondary" : "ghost"} className="h-7" aria-pressed={scheda === "prezzo"} onClick={() => scegliScheda("prezzo")}>Simula prezzo</Button>
              </div>}
            </header>
            <div className={scheda === "stima" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4"} key={`${selezione.tipo}:${selezione.id}:${scheda}`}>
              {selezione.tipo === "calendario" ? <CalendarioPreventivo voci={voci} tempistiche={analisi.tempistiche}
                onApri={contestoStima ? id => apri({ tipo: "voce", id }, undefined, "tempi") : undefined} />
              : scheda === "risorse" ? <>
                {descrizioneCompleta && descrizioneCompleta !== titoloPannello && <details className="rounded-lg border bg-white px-2.5 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-slate-700">Descrizione completa</summary>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-slate-600">{descrizioneCompleta}</p>
                </details>}
                <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-slate-50 p-2.5 text-sm">
                  {corrente && <><DatoCosto nome="Costi propri" valore={euro(modifiche ? dettaglio.costo : corrente.costo)} />
                    <DatoCosto nome="Quota di fase" valore={euro(quotaCorrente?.fase ?? 0)} />
                    <DatoCosto nome="Quota del preventivo" valore={euro(quotaCorrente?.preventivo ?? 0)} /></>}
                  <DatoCosto nome={corrente ? "Costo completo" : "Costo comune"} valore={euro(costoPannello)} />
                </dl>
                {trasfertaModificata && <p role="status" className="rounded-md bg-blue-50 px-2.5 py-2 text-xs text-blue-900">
                  Trasferta dell’intero preventivo da salvare · {euro(dettaglioRisorse(trasfertaModificata.filter(r => r.stima?.origine === "trasferta"), null).costo)}
                </p>}
                {tempiSalvati && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-2 text-xs text-blue-900">
                  <span>Tempistiche salvate · {formatoDataStima(tempiSalvati.inizio)} – {formatoDataStima(tempiSalvati.fine)}
                    {corrente && !stimaTempiAggiornata(tempiSalvati, corrente.voce) && " · Da ricalcolare"}</span>
                  {contestoStima && <Button type="button" size="sm" variant="outline" className="h-7"
                    onClick={() => { scegliVistaStima("tempi"); scegliScheda("stima"); }}>Apri tempistiche</Button>}
                </div>}
                {quotaCorrente?.parziale && <p className="text-xs text-amber-800">Completa i costi da cui dipendono le quote comuni.</p>}
                {onSave && <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy || risorse.length >= 120}
                    onClick={() => aggiungiRisorsa(risorsaVuota())}><Plus className="mr-1 h-4 w-4" />Aggiungi risorsa</Button>
                  {corrente && contestoStima && <Button type="button" variant="outline" size="sm" disabled={busy || risorse.length >= 120}
                    aria-expanded={fornitoreAperto === corrente.voce.id}
                    onClick={() => apriFornitore(fornitoreAperto === corrente.voce.id ? null : corrente.voce.id)}>Dal listino fornitore</Button>}
                  {corrente && !risorse.length && <>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => aggiungiRisorsa({ ...risorsaVuota("altro"), nome: "Costo a corpo", unita: "corpo" })}>Inserisci costo a corpo</Button>
                    {onListino && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void esegui(async () => aggiorna(await onListino(corrente.voce)))}>Usa costo dal listino</Button>}
                  </>}
                </div>}
                {onSave && corrente && contestoStima && fornitoreAperto === corrente.voce.id && <Suspense fallback={<p role="status" className="text-xs">Apro i fornitori…</p>}>
                  <ListinoFornitoreAnalisi companyId={contestoStima.companyId} onAggiungi={risorsa => {
                    if (busy || risorse.length >= 120) return;
                    aggiungiRisorsa(risorsa);
                    apriFornitore(null);
                  }} />
                </Suspense>}
                {!!risorse.length && <ul className="divide-y overflow-hidden rounded-lg border" aria-label="Risorse della lavorazione">
                  {dettaglio.righe.map(({ risorsa: r, importo, prezzo }, index) => <li key={r.id}>
                    <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-slate-50 aria-expanded:bg-blue-50"
                      aria-expanded={risorsaAperta === r.id} aria-controls={`analisi-risorsa-${r.id}`} disabled={busy}
                      onClick={() => apriRisorsa(risorsaAperta === r.id ? null : r.id)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.nome.trim() || "Nuova risorsa"}</span>
                        <span className="block break-words text-xs text-slate-600">{formulaRisorsa(r, prezzo)}</span>
                      </span>
                      <span className={`shrink-0 text-xs font-semibold tabular-nums sm:text-sm ${importo === null ? "text-amber-800" : ""}`}>
                        {importo === null || !r.nome.trim() ? "Da completare" : euro(importo)}
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 ${risorsaAperta === r.id ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    <div id={`analisi-risorsa-${r.id}`} hidden={risorsaAperta !== r.id}>
                      {risorsaAperta === r.id && <RigaRisorsa r={r} indice={index + 1} leggi={!onSave || busy} unitaria={selezione.tipo === "voce"}
                        onChange={patch => aggiorna(risorse.map(x => {
                          const prossima = x.id === r.id ? { ...x, ...patch } : x;
                          return r.stima?.origine === "trasferta" && prossima.stima?.piano
                            ? { ...prossima, stima: { ...prossima.stima, piano: undefined } } : prossima;
                        }))}
                        onRemove={() => { aggiorna(risorse.filter(x => x.id !== r.id)); apriRisorsa(null); }} />}
                    </div>
                  </li>)}
                </ul>}
                {corrente && onScegliAlternativa && <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                  <label className="grid grow gap-1 text-xs">Gruppo di alternative<Input value={gruppo} maxLength={120} placeholder="Es. Soluzione pavimentazione"
                    disabled={!onSave || busy} onChange={e => cambiaGruppo(e.target.value)} /></label>
                  {altreAlternative.length > 1 && <Button type="button" size="sm" variant="outline" disabled={sporco || busy}
                    onClick={() => onScegliAlternativa(corrente.voce.id, altreAlternative)}>Scegli questa soluzione</Button>}
                </div>}
              </> : scheda === "stima" && corrente && contestoStima ?
                <StimaCostiPanel voce={corrente.voce} contesto={contestoStima} risorse={risorse} busy={busy}
                  aggregati={{
                    comuni: risorseTrasfertaEsistenti(comuni),
                    importo: dettaglioRisorse(comuni.filter(r => r.tipo === "logistica" && r.stima?.origine !== "trasferta"), null).costo,
                    piano: comuni.find(r => r.stima?.piano)?.stima?.piano,
                  }}
                  tempistiche={tempiSalvati} scheda={vistaStima} onScheda={scegliVistaStima}
                  onRisorse={() => scegliScheda("risorse")}
                  onSalvaTempi={onSave ? salvaTempistiche : undefined} costiInBozza={sporco}
                  valuta={valutaStima} onProponi={onSave ? proponiStima : undefined}
                /> : <section className="space-y-3" aria-label="Simulazione del prezzo">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid grow gap-1 text-xs">Metodo<select className={stileSelect} value={metodo} onChange={e => { cambiaMetodo(e.target.value === "margine" ? "margine" : "ricarico"); chiediConferma(null); }}>
                    <option value="margine">Margine sulla vendita</option><option value="ricarico">Ricarico sul costo</option>
                  </select></label>
                  <label className="grid w-24 gap-1 text-xs">Percentuale<Input value={obiettivo} inputMode="decimal" aria-invalid={!obiettivoValido} onChange={e => { cambiaObiettivo(e.target.value); chiediConferma(null); }} /></label>
                </div>
                {!obiettivoValido && <p role="status" className="text-xs text-amber-800">{metodo === "margine" ? "Inserisci un margine da 0% a meno del 100%." : "Inserisci un ricarico pari o superiore a zero."}</p>}
                {selezione.tipo === "totale" && <>
                  <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 text-sm">
                    <DatoCosto nome="Vendita netta attuale" valore={formato(imponibile)} />
                    <DatoCosto nome="Vendita netta obiettivo" valore={formato(anteprimaTotale)} />
                    <DatoCosto nome="Costo completo" valore={euro(calcolo.costo)} />
                    <DatoCosto nome="Margine all’obiettivo" valore={anteprimaTotale === null ? "—" : euro(centesimiCosto(anteprimaTotale) - calcolo.costo)} />
                  </dl>
                  {calcolo.incompleto && <p className="text-xs text-amber-800">Completa i costi delle lavorazioni incluse per calcolare l’obiettivo.</p>}
                </>}
                {corrente && <>
                  {corrente.voce.inclusa ? <p className="text-xs text-slate-600">Le quote dei costi comuni seguono il ricavo netto di ogni voce e si aggiornano con il prezzo simulato.</p>
                    : <p className="text-xs text-slate-600">Voce fuori dal totale. I costi comuni sono ripartiti tra le lavorazioni incluse.</p>}
                  <ConfrontoPrezzo attuale={corrente.voce} costoAttuale={costoCorrente} quotaAttuale={quotaCorrente} simulazione={simulazione} />
                  {sporco && <p className="text-xs text-amber-800">Salva le risorse modificate per aggiornare la simulazione.</p>}
                  {!sporco && costoCorrente === null && <p className="text-xs text-amber-800">Completa i costi della voce e le quote comuni per trovare il prezzo.</p>}
                  {!sporco && obiettivoValido && costoCorrente !== null && onProiettaPrezzo && !simulazione && <p className="text-xs text-amber-800">La voce non ha un prezzo unitario simulabile con questo obiettivo.</p>}
                  {simulazione && <p className="text-xs text-slate-600">Vendita netta del preventivo {formato(imponibile)} → <strong>{formato(simulazione.imponibile)}</strong></p>}
                </>}
              </section>}
            </div>
            {corrente && simulazione && onPrezzo && !sporco && <div className="shrink-0 border-t px-3 py-2 sm:px-4">
              {confermaPrezzo === simulazione.prezzo ? <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>Confermi <strong>{formato(simulazione.netto)}</strong> netti?</p>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => chiediConferma(null)}>Annulla</Button>
                  <Button type="button" size="sm" disabled={busy} onClick={() => { onPrezzo(corrente.voce.id, simulazione.prezzo); chiediConferma(null); }}>Conferma prezzo</Button>
                </div>
              </div> : <div className="flex justify-end">
                <Button type="button" size="sm" disabled={busy} onClick={() => chiediConferma(simulazione.prezzo)}>Applica al preventivo</Button>
              </div>}
            </div>}
            {sporco && !mostraTempistiche && <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-3 py-2 sm:px-4">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { aggiorna(null); modificaTrasferta(null); cambiaGruppo(null); apriRisorsa(null); }}>Annulla modifiche</Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void esegui(salva)}>Salva analisi</Button>
            </div>}
          </section>}
        </div>
      </>}
    </div>
    {!richiesta && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      {(mostraTempistiche || mostraStimaRapida) && onScaricaCliente ? <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={downloadInAttesa}>
            <Download aria-hidden="true" />Scarica PDF<ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void esegui(onScaricaCliente)}>Offerta cliente</DropdownMenuItem>
          <DropdownMenuItem disabled={analisiDaSalvare} onSelect={() => void esegui(scaricaAnalisi)}>Analisi costi interna</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : <>
        {onScaricaCliente && <Button type="button" size="sm" variant="outline" disabled={downloadInAttesa} onClick={() => void esegui(onScaricaCliente)}>
          <Download className="mr-1 h-4 w-4" />Scarica offerta cliente (PDF)
        </Button>}
        <Button type="button" size="sm" variant={mostraTempistiche ? "outline" : "default"} disabled={downloadInAttesa || analisiDaSalvare}
          onClick={() => void esegui(scaricaAnalisi)}><Download className="mr-1 h-4 w-4" />Scarica analisi costi (PDF)</Button>
      </>}
    </footer>}
  </>;
}

function DatoCosto({ nome, valore }: { nome: string; valore: string }) {
  return <div>
    <dt className="text-xs text-slate-600">{nome}</dt>
    <dd className="font-semibold tabular-nums">{valore}</dd>
  </div>;
}

function formulaRisorsa(r: RisorsaCosto, prezzo: number | null) {
  if (r.base === "percentuale") return prezzo === null ? "Percentuale sui costi diretti" : pct(prezzo) + " dei costi diretti";

  const numero = (valore: string) => numeroCosto(valore)?.toLocaleString("it-IT", { maximumFractionDigits: 4 }) ?? "—";
  const unita = r.unita.trim() || (r.tipo === "manodopera" ? "h" : "");
  const quantita = [numero(r.quantita), unita].filter(Boolean).join(" ");
  const costo = tariffa(prezzo);
  const parti = r.tipo === "manodopera"
    ? [numero(r.fattore) + (numeroCosto(r.fattore) === 1 ? " persona" : " persone"), quantita, prezzo === null ? costo : costo + "/" + unita]
    : [quantita, numeroCosto(r.fattore) === 1 ? "" : numero(r.fattore), costo];
  return parti.filter(Boolean).join(" × ") + (r.base === "unitaria" ? " · per unità di lavoro" : "");
}

function ConfrontoPrezzo({ attuale, costoAttuale, quotaAttuale, simulazione }: {
  attuale: VoceAnalisi;
  costoAttuale: number | null;
  quotaAttuale: QuotaCostiComuni | undefined | null;
  simulazione: ReturnType<typeof simulaPrezzoConCostiComuni>;
}) {
  const sconto = (voce: VoceAnalisi | undefined) => voce?.venditaLorda == null || voce.vendita == null ? "—"
    : euro(centesimiCosto(voce.venditaLorda) - centesimiCosto(voce.vendita));
  const margine = (netto: number | null | undefined, costo: number | null) => netto == null || costo === null ? null : centesimiCosto(netto) - costo;
  const margineAttuale = margine(attuale.vendita, costoAttuale);
  const margineProposto = margine(simulazione?.netto, simulazione?.costo ?? null);
  const differenzaMargine = margineAttuale === null || margineProposto === null ? 0 : margineProposto - margineAttuale;
  const righe = [
    ["Prezzo unitario", tariffa(attuale.prezzo), tariffa(simulazione?.prezzo ?? null)],
    ["Vendita lorda", formato(attuale.venditaLorda ?? null), formato(simulazione?.voce.venditaLorda ?? null)],
    ["Sconti e rettifiche", sconto(attuale), sconto(simulazione?.voce)],
    ["Quota di fase", euro(quotaAttuale?.parziale ? null : quotaAttuale?.fase ?? 0), euro(simulazione ? simulazione.quota?.fase ?? 0 : null)],
    ["Quota del preventivo", euro(quotaAttuale?.parziale ? null : quotaAttuale?.preventivo ?? 0), euro(simulazione ? simulazione.quota?.preventivo ?? 0 : null)],
    ["Costo completo", euro(costoAttuale), euro(simulazione?.costo ?? null)],
  ];
  return <>
    <section aria-label="Confronto del margine">
      <div className="grid grid-cols-2 gap-2">
        <SchedaMargine netti={attuale.vendita} margine={margineAttuale} />
        <SchedaMargine netti={simulazione?.netto ?? null} margine={margineProposto} proposta />
      </div>
      {differenzaMargine !== 0 && <p className="mt-2 text-xs text-slate-700">
        Variazione del margine <strong className={differenzaMargine > 0 ? "text-emerald-800" : "text-red-800"}>
          {differenzaMargine > 0 && "+"}{euro(differenzaMargine)}
        </strong>
      </p>}
    </section>
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-xs tabular-nums sm:text-sm" aria-label="Dettaglio del calcolo">
        <thead className="bg-slate-50 text-slate-600">
          <tr><th scope="col" className="px-2 py-1.5 text-left font-medium">Voce</th><th scope="col" className="px-2 py-1.5 text-right font-medium">Attuale</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Proposta</th></tr>
        </thead>
        <tbody className="divide-y">{righe.map(([nome, prima, dopo]) => <tr key={nome}>
          <th scope="row" className="px-2 py-1.5 text-left font-medium">{nome}</th>
          <td className="px-2 py-1.5 text-right">{prima}</td>
          <td className="px-2 py-1.5 text-right">{dopo}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {simulazione && simulazione.netto !== simulazione.obiettivo && <p className="text-xs text-slate-600">
      Obiettivo netto {formato(simulazione.obiettivo)} · Netto applicabile {formato(simulazione.netto)} con la precisione del prezzo unitario.
    </p>}
  </>;
}

function SchedaMargine({ netti, margine, proposta = false }: { netti: number | null; margine: number | null; proposta?: boolean }) {
  const percentuale = margine !== null && netti !== null && netti > 0 ? pct(soldi(margine) / netti * 100) : null;
  const perdita = margine !== null && margine < 0;
  return <div className={`min-w-0 rounded-xl border px-2.5 py-2.5 sm:px-3 ${proposta ? "border-blue-200 bg-blue-50/80" : "bg-slate-50"}`}>
    <h4 className={`flex items-center gap-1.5 text-xs font-semibold ${proposta ? "text-blue-800" : "text-slate-700"}`}>
      {proposta && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}{proposta ? "Proposta" : "Attuale"}
    </h4>
    <dl className="mt-2 space-y-2 tabular-nums">
      <div>
        <dt className="text-xs text-slate-600">Vendita netta</dt>
        <dd className="break-words text-base font-semibold">{formato(netti)}</dd>
      </div>
      <div className="border-t border-slate-200/80 pt-1.5">
        <dt className="text-xs text-slate-600">Margine effettivo</dt>
        <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm font-semibold">
          <span className={perdita ? "text-red-800" : undefined}>{euro(margine)}</span>
          {percentuale && <span className={`rounded px-1.5 py-0.5 text-xs leading-4 ${perdita ? "bg-red-100 text-red-800" : "bg-white text-slate-700"}`}>{percentuale}</span>}
          {perdita && <span className="w-full text-xs font-medium text-red-800">In perdita</span>}
        </dd>
      </div>
    </dl>
  </div>;
}

function RigaRisorsa({ r, indice, leggi, unitaria, onChange, onRemove }: {
  r: RisorsaCosto; indice: number; leggi: boolean; unitaria: boolean;
  onChange: (patch: Partial<RisorsaCosto>) => void; onRemove: () => void;
}) {
  const campo = (label: string, key: "nome" | "fonte" | "quantita" | "fattore" | "prezzo" | "unita", numerico = false) =>
    <label className="grid min-w-0 gap-1 text-xs">{label}<Input className="h-9" aria-label={key === "nome" ? `Risorsa ${indice}` : `${label} risorsa ${indice}`}
      value={r[key]} maxLength={numerico ? 32 : key === "unita" ? 32 : 500} inputMode={numerico ? "decimal" : "text"}
      disabled={leggi} onChange={e => onChange({ [key]: e.target.value })} /></label>;
  return <div className="border-t bg-slate-50/80 p-2.5">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      {campo("Risorsa", "nome")}
      {!leggi && <Button type="button" variant="ghost" size="icon" className="mt-auto h-9 w-9 text-red-700 hover:text-red-800" aria-label={`Togli risorsa ${indice}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-xs">Tipo<select className={stileSelect} aria-label={`Tipo risorsa ${indice}`} value={r.tipo} disabled={leggi}
        onChange={e => onChange({ tipo: e.target.value as TipoRisorsaCosto })}>{Object.entries(categorieCosto).map(([key, nome]) => <option key={key} value={key}>{nome}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Base<select className={stileSelect} aria-label={`Base risorsa ${indice}`} value={r.base} disabled={leggi}
        onChange={e => onChange({ base: e.target.value as RisorsaCosto["base"] })}>
        <option value="totale">Totale</option>{unitaria && <option value="unitaria">Per unità di lavoro</option>}<option value="percentuale">% dei costi diretti</option>
      </select></label>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2">
      {r.base !== "percentuale" && <>
        {campo(r.tipo === "manodopera" ? "Ore per persona" : "Quantità", "quantita", true)}
        {campo(r.tipo === "manodopera" ? "Persone" : r.tipo === "nolo" ? "Durata" : "Fattore", "fattore", true)}
        {campo("Unità", "unita")}
      </>}
      {campo(r.base === "percentuale" ? "Percentuale" : "Costo unitario €", "prezzo", true)}
    </div>
    <div className="mt-2">{campo("Fonte costo", "fonte")}</div>
  </div>;
}
