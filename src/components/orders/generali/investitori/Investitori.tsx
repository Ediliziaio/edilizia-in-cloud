import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams, type To } from "react-router-dom";
import { FiltroAttivo, IndicatoreScheda } from "../design/ElementiScheda";
import { GraficoFonti } from "./GraficoFonti";
import { gruppoFonte } from "@/lib/orders/generali/filtriGrafici";
import { NOMI_GRUPPO, type GruppoFonte } from "@/lib/orders/generali/investitoriConti";
import {
  AlertTriangle, ArrowUpRight, Building2, ChartNoAxesCombined, ChevronDown, ChevronRight, ClipboardList,
  CreditCard, FileText, Landmark, Pencil, Plus, Search, Trash2, User, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { TONI, dataBreve, euro, nomeMese, nomePiano, percento } from "@/components/orders/generali/piano/formato";
import { FonteDialog } from "@/components/orders/generali/investitori/FonteDialog";
import { MovimentoDialog } from "@/components/orders/generali/investitori/MovimentoDialog";
import { RendicontoDialog } from "@/components/orders/generali/investitori/RendicontoDialog";
import { RendimentoLeva } from "@/components/orders/generali/investitori/RendimentoLeva";
import { RendicontiInvestitori } from "./RendicontiInvestitori";
import { MovimentoPrevistoDialog } from "./MovimentoPrevistoDialog";
import { CoperturaMensileInvestitori } from "./CoperturaMensileInvestitori";
import { ScenarioFinanziamenti } from "./ScenarioFinanziamenti";
import { MovimentiOperazioneInvestitori } from "./MovimentiOperazioneInvestitori";
import { notaMovimento } from "@/lib/orders/generali/movimentiFonti";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import {
  messaggioInvestitori, useEliminaFonte, useEliminaMovimento, useGeneraleInvestitori,
  useVenditeGenerale, type AzioneMovimentoPrevisto,
} from "@/hooks/useGeneraleInvestitori";
import {
  NOMI_FONTE, NOMI_FORMA, NOMI_MOVIMENTO, NOMI_RIMBORSO, aCapitale, aDebito, nomeVersamento, spiegaRegola,
  aPrestito, calcolaInvestitori, type Colonne, type ContiInvestitori, type ContoFonte,
  type Fonte, type Movimento, type ScenarioDebito, type TipoFonte,
} from "@/lib/orders/generali/investitoriConti";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const ICONE: Record<TipoFonte, typeof User> = { propri: Wallet, capitale: User, prestito: User, banca: Landmark, finanziamento: CreditCard };
const COLORI_GRUPPO = { propri: "bg-slate-500", investitori: "bg-sky-600", debito: "bg-amber-500" } as const;
const VISTE = [
  { id: "fonti", nome: "Fonti", Icona: Landmark },
  { id: "movimenti", nome: "Movimenti", Icona: ClipboardList },
  { id: "analisi", nome: "Analisi", Icona: ChartNoAxesCombined },
  { id: "rendiconti", nome: "Rendiconti", Icona: FileText },
] as const;
type Vista = (typeof VISTE)[number]["id"];
const SCENARIO_BASE: ScenarioDebito = { tassoPunti: 0, debitoPct: 0 };

export function Investitori({ riepilogo, puoModificare }: PropsScheda) {
  const t = useT();
  const [parametri, setParametri] = useSearchParams();
  const vista = parametri.get("rendiconto-aperto") === "1" ? "rendiconti"
    : VISTE.find(v => v.id === parametri.get("vista-investitori"))?.id ?? "fonti";
  const gruppo = parametri.get("gruppo-fonti");
  const filtro = gruppo === "propri" || gruppo === "investitori" || gruppo === "debito" ? gruppo : null;
  const aperta = parametri.get("fonte-investitori");
  const [ricerca, setRicerca] = useState("");
  const [chiaveRegistro, setChiaveRegistro] = useState(0);
  const [modifica, setModifica] = useState<{ fonte: Fonte | null; tipo?: TipoFonte } | null>(null);
  const [movimentoPer, setMovimentoPer] = useState<Fonte | null>(null);
  const [rendicontoPer, setRendicontoPer] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<Fonte | null>(null);
  const [ipotesi, setIpotesi] = useState<{ generaleId: string; valori: ScenarioDebito }>();
  const areaCopertura = useRef<HTMLElement>(null);
  const g = riepilogo.generale;
  const inv = useGeneraleInvestitori(riepilogo);
  const { fonti, movimenti, numeri, oggi, conti } = inv;
  const haTassi = fonti.some(f => aPrestito(f.tipo) && f.tassoPct !== null);
  const haBanca = fonti.some(f => aDebito(f.tipo));
  const ipotesiScelta = ipotesi?.generaleId === g.id ? ipotesi.valori : SCENARIO_BASE;
  const tassoPunti = haTassi ? ipotesiScelta.tassoPunti : 0;
  const debitoPct = haBanca ? ipotesiScelta.debitoPct : 0;
  const costoDebitoBase = conti.costoDebito.totale;
  const contiScenario = useMemo(() => vista === "analisi" && (tassoPunti || debitoPct)
    ? calcolaInvestitori({ fonti, movimenti, numeri, oggi, scenario: { tassoPunti, debitoPct }, costoDebitoBase })
    : null, [vista, tassoPunti, debitoPct, fonti, movimenti, numeri, oggi, costoDebitoBase]);
  const figlieIds = useMemo(() => riepilogo.figlie.map(f => f.id), [riepilogo.figlie]);
  const vendite = useVenditeGenerale(g.id, figlieIds, !!rendicontoPer && riepilogo.permessi.margini);
  const eliminaFonte = useEliminaFonte(g.id);

  const parametriVista = (v: Vista) => {
    const p = new URLSearchParams(parametri);
    p.set("vista-investitori", v);
    if (v !== "rendiconti") p.delete("rendiconto-aperto");
    return p;
  };
  const cambiaVista = (v: Vista) => setParametri(parametriVista(v), { replace: true });
  const filtra = (id: GruppoFonte | null, daGrafico = false) => {
    const p = new URLSearchParams(parametri);
    if (id) p.set("gruppo-fonti", id);
    else p.delete("gruppo-fonti");
    if (daGrafico) {
      p.set("vista-investitori", "fonti");
      setRicerca("");
    }
    setParametri(p, { replace: true });
  };
  const apriFonte = (id: string, dalRegistro = false) => {
    const p = new URLSearchParams(parametri);
    if (dalRegistro) {
      p.set("vista-investitori", "fonti");
      p.delete("gruppo-fonti");
      p.delete("rendiconto-aperto");
      setRicerca("");
    }
    if (!dalRegistro && aperta === id) p.delete("fonte-investitori");
    else p.set("fonte-investitori", id);
    setParametri(p, { replace: true });
  };

  if (!riepilogo.permessi.margini) {
    return <div className="generale-panel px-4 py-4 text-sm text-muted-foreground">
      {t("I dati degli investitori li vede chi ha il permesso di vedere i margini.")}
    </div>;
  }
  if (inv.isError) {
    return <div role="alert" className="generale-panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      {t("Non riesco a leggere le fonti di finanziamento.")}
      <Button size="sm" variant="outline" onClick={inv.refetch}>{t("Riprova")}</Button>
    </div>;
  }
  if (inv.isLoading) return <div className="space-y-3" aria-busy="true">
    <Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" />
  </div>;

  const impegniRegistrati = conti.fonti.reduce((n, c) => n + c.fonte.impegno, 0);
  const scopertoDaDate = conti.scopertoCalendario.importo > conti.scopertoImpegni ? conti.scopertoCalendario.mese : null;
  const datePiano = new Set(inv.numeri?.fabbisogno?.map(m => m.mese.slice(0, 7)));
  const mesiCopertura = conti.composizione.filter(m => datePiano.has(m.mese));
  const meseCopertura = mesiCopertura.find(m => m.mese === parametri.get("mese-copertura-investitori"))
    ?? mesiCopertura.find(m => m.mese === conti.scopertoCalendario.mese)
    ?? mesiCopertura.find(m => !m.reale)
    ?? mesiCopertura.at(-1);
  const meseIpotesi = meseCopertura && !meseCopertura.reale
    ? contiScenario?.composizione.find(m => m.mese === meseCopertura.mese) : undefined;
  const parametriAnalisi = (mese: string) => {
    const p = parametriVista("analisi");
    p.set("mese-copertura-investitori", mese);
    return p;
  };
  const cambiaMeseCopertura = (mese: string) => setParametri(parametriAnalisi(mese), { replace: true });
  const parametriRegistro = () => {
    const p = parametriVista("movimenti");
    p.delete("fonte-movimenti-investitori");
    p.delete("mese-movimenti-investitori");
    p.delete("stato-movimenti-investitori");
    return p;
  };
  const registroDelMese = (mese: string) => {
    const p = parametriRegistro();
    p.set("mese-movimenti-investitori", mese);
    return { search: p.toString() };
  };
  const registroDellaFonte = (id: string, previsti = false) => {
    const p = parametriRegistro();
    p.set("fonte-movimenti-investitori", id);
    if (previsti) p.set("stato-movimenti-investitori", "programmati");
    return { search: p.toString() };
  };
  const rendicontiDellaFonte = (id: string) => {
    const p = parametriVista("rendiconti");
    p.delete("rendiconto-aperto");
    p.set("sezione-rendiconti", "pdf");
    p.set("fonte-rendiconto", id);
    return { search: p.toString() };
  };
  const registroDaConfermare = parametriRegistro();
  registroDaConfermare.set("stato-movimenti-investitori", "da_confermare");
  const notaScoperto = scopertoDaDate ? t("Calendario · {mese}", { mese: nomeMese(scopertoDaDate) })
    : inv.numeri ? conti.scopertoImpegni > 0 ? t("Impegni al picco del piano") : t("Copertura del piano")
    : t("Serve un calendario di cassa");
  const fontiInVista = conti.fonti.filter(c => (!filtro || gruppoFonte(c.fonte.tipo) === filtro)
    && cercaNellOperazione(ricerca, [c.fonte.nome, descrizioneFonte(c.fonte, t)]));
  const daConfermare = conti.fonti.reduce((totale, c) => totale + (c.programmati ?? []).filter(m => m.data <= inv.oggi).length, 0);
  const nuova = (tipo?: TipoFonte) => setModifica({ fonte: null, tipo });
  const dettaglio = (c: ContoFonte) => <DettaglioFonte
    c={c} generaleId={g.id} oggi={inv.oggi} puoModificare={puoModificare}
    registro={registroDellaFonte(c.fonte.id)}
    storico={rendicontiDellaFonte(c.fonte.id)}
    onMovimento={() => setMovimentoPer(c.fonte)}
    onRendiconto={() => setRendicontoPer(c.fonte.id)}
    onModifica={() => setModifica({ fonte: c.fonte })}
    onElimina={() => setDaEliminare(c.fonte)} />;

  return <div className="generale-sheet generale-investitori min-w-0 space-y-2.5">
    <section aria-label={t("Quadro degli investitori")} className="generale-panel">
      <header className="generale-registro-header flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Landmark className="size-4 text-primary" aria-hidden="true" /> {t("Fonti e investitori")}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => {
            const p = new URLSearchParams(parametri);
            p.set("scheda", "piano"); p.set("vista-piano", "cassa"); setParametri(p);
          }}>{t("Cassa e fabbisogno")} <ArrowUpRight className="size-3.5" aria-hidden="true" /></Button>
          {puoModificare && <Button type="button" size="sm" className="h-8 gap-1.5" onClick={() => nuova()}>
            <Plus className="size-4" aria-hidden="true" /> {t("Aggiungi fonte")}
          </Button>}
        </div>
      </header>
      <div className="generale-indicators generale-investitori-indicators border-t bg-muted/20 p-2">
        <IndicatoreScheda titolo={t("Impegni")} valore={euro(impegniRegistrati)} nota={t("Dagli accordi con le fonti")} />
        <IndicatoreScheda titolo={t("Capitale in operazione")} valore={euro(conti.totali.dentro)} nota={t("Versato al netto dei rientri")} tono="verde" />
        <IndicatoreScheda titolo={t("Da versare")} valore={euro(conti.totali.daVersare)} nota={t("Impegni ancora da incassare")} tono="ambra" />
        <IndicatoreScheda titolo={t("Da coprire nel piano")} valore={inv.numeri ? euro(conti.scoperto) : "—"}
          nota={scopertoDaDate && datePiano.has(scopertoDaDate) ? <Link className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            aria-label={t("Analizza lo scoperto di {scopertoDaDate}", { scopertoDaDate: String(nomeMese(scopertoDaDate)) })}
            to={{ search: parametriAnalisi(scopertoDaDate).toString() }}>
            {notaScoperto} <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link> : notaScoperto}
          tono={conti.scoperto > 0 ? "rosso" : "blu"} />
      </div>
    </section>

    <div className="generale-panel flex flex-wrap gap-1 p-1.5" role="group" aria-label={t("Viste investitori")}>
      {VISTE.map(({ id, nome, Icona }) => <Button type="button" key={id} size="sm" variant={vista === id ? "secondary" : "ghost"}
        className="h-8 gap-1.5" aria-pressed={vista === id} onClick={() => cambiaVista(id)}>
        <Icona className="size-4" aria-hidden="true" /> {t(nome)}
      </Button>)}
      {daConfermare > 0 && <Button size="sm" variant="outline" asChild
        className="ml-auto h-8 gap-1.5 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <Link to={{ search: registroDaConfermare.toString() }} onClick={() => setChiaveRegistro(n => n + 1)}>
          <ClipboardList className="size-4" aria-hidden="true" /> {t("Da confermare")} <span className="tabular-nums">{daConfermare}</span>
        </Link>
      </Button>}
    </div>

    {(inv.pianoVuoto || inv.pianoInBozza) && <p className="rounded-md border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
      {inv.pianoVuoto ? t("Completa {modello} per vedere fabbisogno e rientri stimati.", { modello: String(nomePiano(g.modello) ?? "") }) : t("Le stime usano una versione del piano in bozza.")}
    </p>}
    {(vista === "fonti" || vista === "analisi") && conti.avvisi.length > 0 && <div role="alert"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="flex items-start gap-2"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" />{conti.avvisi[0]}</p>
      {conti.avvisi.length > 1 && <details className="ml-6 mt-1">
        <summary className="cursor-pointer font-medium">{t("Altre verifiche ({n})", { n: conti.avvisi.length - 1 })}</summary>
        <ul className="mt-1 space-y-1">{conti.avvisi.slice(1).map(a => <li key={a}>{a}</li>)}</ul>
      </details>}
    </div>}

    {vista === "fonti" && (conti.fonti.length === 0 ? <PrimoPasso puoModificare={puoModificare} onNuova={nuova} /> : <>
      <div className="generale-panel generale-registro-strumenti flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[12rem] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={ricerca} onChange={e => setRicerca(e.target.value)}
            aria-label={t("Cerca fonte di capitale")} placeholder={t("Nome o tipo di fonte…")} className="h-9 pl-8 text-sm" />
        </div>
        <OfficeSelect label={t("Filtra fonti per gruppo")} value={filtro ?? ""} onValueChange={v => filtra(v ? v as GruppoFonte : null)}
          className="h-9 w-52 max-w-full text-xs" options={[{ value: "", label: t("Tutte le fonti") }, ...Object.entries(NOMI_GRUPPO).map(([value, label]) => ({ value, label: t(label) }))]} />
        <span className="ml-auto px-1 text-xs text-muted-foreground">{t("{n} di {totale} fonti", { n: fontiInVista.length, totale: conti.fonti.length })}</span>
      </div>
      {(filtro || ricerca.trim()) && <FiltroAttivo onReset={() => { filtra(null); setRicerca(""); }}>
        {[filtro ? t(NOMI_GRUPPO[filtro]) : null, ricerca.trim()].filter(Boolean).join(" · ")}
      </FiltroAttivo>}
      <TabellaFonti fonti={fontiInVista} haPiano={!!inv.numeri} aperta={aperta} apri={apriFonte}
        dettaglio={dettaglio} filtrata={!!filtro || !!ricerca.trim()} oggi={inv.oggi} registro={registroDellaFonte} />
    </>)}

    {vista === "movimenti" && <MovimentiOperazioneInvestitori key={chiaveRegistro} generaleId={g.id} fonti={conti.fonti} oggi={inv.oggi}
      figlie={riepilogo.figlie} puoModificare={puoModificare}
      apriFonte={id => apriFonte(id, true)} registra={setMovimentoPer} />}

    {vista === "analisi" && <>
      {(haTassi || haBanca) && <ScenarioFinanziamenti valore={{ tassoPunti, debitoPct }}
        cambia={valori => setIpotesi({ generaleId: g.id, valori })} base={conti} ipotesi={contiScenario}
        haTassi={haTassi} haBanca={haBanca} apriMese={mese => { cambiaMeseCopertura(mese); areaCopertura.current?.focus(); }} />}
      {meseCopertura && <CoperturaMensileInvestitori mesi={mesiCopertura} mese={meseCopertura} ipotesi={meseIpotesi}
        cambiaMese={cambiaMeseCopertura} refArea={areaCopertura}
        registro={registroDelMese(meseCopertura.mese)} />}
      {conti.fonti.length > 0 ? <>
        <div className="generale-chart-grid">
          <GraficoFonti conti={conti} onFiltra={id => filtra(id, true)} />
          <CoperturaCapitale conti={conti} capitaleMassimo={inv.numeri?.capitaleMassimo ?? null}
            meseMassimo={inv.numeri?.meseCapitaleMassimo ?? null} investitoOggi={inv.numeri?.capitaleInvestitoOggi ?? null} />
        </div>
        <RegolaUtile conti={conti} haPiano={!!inv.numeri} />
        <RendimentoLeva conti={conti} numeri={numeri} conScenario={contiScenario} />
        <TabellaFonti fonti={conti.fonti} haPiano={!!inv.numeri} aperta={aperta} apri={apriFonte} dettaglio={dettaglio}
          analitica oggi={inv.oggi} registro={registroDellaFonte} />
      </> : <p role="status" className="generale-panel p-4 text-sm text-muted-foreground">{t("Aggiungi una fonte per stimare versamenti e rientri.")}</p>}
    </>}

    {vista === "rendiconti" && <RendicontiInvestitori riepilogo={riepilogo} fonti={conti.fonti.map(c => c.fonte)}
      prepara={setRendicontoPer} apriFonte={id => apriFonte(id, true)} />}

    <FonteDialog open={!!modifica} onOpenChange={o => !o && setModifica(null)} generaleId={g.id}
      fonte={modifica?.fonte ?? null} tipoIniziale={modifica?.tipo} />
    {movimentoPer && <MovimentoDialog
      open onOpenChange={o => !o && setMovimentoPer(null)} generaleId={g.id} fonte={movimentoPer} oggi={inv.oggi}
      unita={riepilogo.figlie.map(f => ({ id: f.id, nome: f.codice ? `${f.codice} · ${f.nome}` : f.nome }))} />}
    {rendicontoPer && <RendicontoDialog open onOpenChange={o => !o && setRendicontoPer(null)}
      riepilogo={riepilogo} fonteId={rendicontoPer} conti={conti} numeriPiano={inv.numeriPiano}
      vendite={vendite.data ?? null} oggi={inv.oggi} puoInviare={puoModificare} />}
    <AlertDialog open={!!daEliminare} onOpenChange={o => !o && setDaEliminare(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Eliminare {nome}?", { nome: daEliminare?.nome ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("L’eliminazione rimuove anche i movimenti associati. I rendiconti già inviati restano nello storico.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
            if (!daEliminare) return;
            eliminaFonte.mutate(daEliminare.id, {
              onSuccess: () => toast.success(t("Fonte eliminata")),
              onError: e => toast.error(messaggioInvestitori(e, "la fonte")),
            });
          }}>{t("Elimina")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function TabellaFonti({ fonti, haPiano, aperta, apri, dettaglio, analitica = false, filtrata = false, oggi, registro }: {
  fonti: ContoFonte[];
  haPiano: boolean;
  aperta: string | null;
  apri: (id: string) => void;
  dettaglio: (c: ContoFonte) => ReactNode;
  analitica?: boolean;
  filtrata?: boolean;
  oggi: string;
  registro: (id: string, previsti?: boolean) => To;
}) {
  const t = useT();
  if (!fonti.length) return <p role="status" className="generale-panel p-4 text-sm text-muted-foreground">{t("Nessuna fonte corrisponde ai filtri.")}</p>;
  const totale = (voce: "versato" | "daVersare" | "capitaleDentro" | "spettaAFine") => euro(fonti.reduce((n, c) => n + c[voce], 0));
  return <section aria-label={analitica ? t("Dettaglio economico delle fonti") : t("Le fonti")} className="generale-panel min-w-0">
    {analitica && <h3 className="border-b px-3 py-2 text-sm font-semibold">{t("Dettaglio economico delle fonti")}</h3>}
    <div className="overflow-x-auto">
      <table aria-label={analitica ? t("Previsione delle fonti") : t("Fonti di capitale")}
        className={cn("generale-registro-tabella", analitica ? "min-w-[52rem]" : "min-w-[48rem]")}>
        <thead className="bg-muted/40">
          {analitica ? <>
            <tr>
              <th scope="col" rowSpan={2}>{t("Fonte")}</th>
              <th scope="colgroup" colSpan={3} className="border-l text-center">{t("Capitale")}</th>
              <th scope="colgroup" colSpan={3} className="border-l text-center">{t("Utile o interessi")}</th>
              <th scope="col" rowSpan={2} className="border-l text-right">{t("Rientro stimato")}</th>
            </tr>
            <tr>{[0, 1].map(i => <Fragment key={i}>
              <Intestazione tono="previsto" bordo>{t("Previsto")}</Intestazione>
              <Intestazione tono="reale">{t("Ad oggi")}</Intestazione>
              <Intestazione tono="aFinire">{t("A finire")}</Intestazione>
            </Fragment>)}</tr>
          </> : <tr>
            <th scope="col">{t("Fonte")}</th><th scope="col" className="text-right">{t("Impegno")}</th>
            <th scope="col" className="text-right">{t("Versato")}</th><th scope="col" className="text-right">{t("Da versare")}</th>
            <th scope="col" className="text-right">{t("Capitale in essere")}</th><th scope="col" className="text-right">{t("Rientro stimato")}</th>
            <th scope="col">{t("Primo movimento previsto")}</th>
          </tr>}
        </thead>
        <tbody>{fonti.map(c => <RigaFonte key={c.fonte.id} c={c} analitica={analitica} haPiano={haPiano}
          aperta={aperta === c.fonte.id} onApri={() => apri(c.fonte.id)} oggi={oggi}
          movimentiPrevisti={registro(c.fonte.id, true)}>
          {aperta === c.fonte.id ? dettaglio(c) : null}
        </RigaFonte>)}</tbody>
        <tfoot className="border-t font-medium"><tr>
          <td>{filtrata ? t("Totale filtrato") : t("Totale")}</td>
          {analitica ? <>
            <Cifre col={somma(fonti.map(c => c.capitale))} bordo />
            <Cifre col={somma(fonti.map(c => c.rendimento))} bordo />
          </> : <>
            <td className="text-right tabular-nums">{euro(fonti.reduce((n, c) => n + c.fonte.impegno, 0))}</td>
            <td className="text-right tabular-nums">{totale("versato")}</td>
            <td className="text-right tabular-nums">{totale("daVersare")}</td>
            <td className="text-right tabular-nums">{totale("capitaleDentro")}</td>
          </>}
          <td className={cn("text-right tabular-nums", analitica && "border-l")}>{haPiano ? totale("spettaAFine") : "—"}</td>
          {!analitica && <td />}
        </tr></tfoot>
      </table>
    </div>
    {analitica && <p className="border-t px-3 py-2 text-xs text-muted-foreground">
      {t("Il capitale a finire indica quanto servirà secondo il piano. Il rientro stimato include capitale da restituire e rendimento residuo.")}
    </p>}
  </section>;
}

const somma = (c: Colonne[]): Colonne => ({
  previsto: c.reduce((t, x) => t + x.previsto, 0),
  adOggi: c.reduce((t, x) => t + x.adOggi, 0),
  aFinire: c.reduce((t, x) => t + x.aFinire, 0),
  stima: c.reduce((t, x) => t + x.stima, 0),
});

function Intestazione({ tono, bordo, children }: { tono: keyof typeof TONI; bordo?: boolean; children: ReactNode }) {
  return (
    <th className={cn("px-3 pb-2 text-right font-normal", bordo && "border-l")}>
      <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", TONI[tono].punto)} />{children}</span>
    </th>
  );
}

function Cifre({ col, bordo }: { col: Colonne; bordo?: boolean }) {
  return (
    <>
      <td className={cn("px-3 py-2 text-right tabular-nums", bordo && "border-l")}>{euro(col.previsto)}</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", TONI.reale.testo)}>{euro(col.adOggi)}</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", TONI.aFinire.testo, col.aFinire < 0 && "text-destructive")}>{euro(col.aFinire)}</td>
    </>
  );
}

function descrizioneFonte(f: Fonte, t: ReturnType<typeof useT>): string {
  const parti: string[] = [aDebito(f.tipo) && f.forma ? NOMI_FORMA[f.forma] : NOMI_FONTE[f.tipo].nome];
  if (aCapitale(f.tipo)) parti.push(f.quotaUtilePct !== null ? t("quota fissa {perc}", { perc: percento(f.quotaUtilePct / 100, 2) }) : t("pro quota"));
  else {
    if (f.tassoPct !== null) parti.push(t("{perc} annuo", { perc: percento(f.tassoPct / 100, 2) }));
    if (f.rimborso && f.rimborso !== "scadenza") parti.push(NOMI_RIMBORSO[f.rimborso].nome.toLowerCase());
    if (f.scadenza) parti.push(t("scade il {data}", { data: dataBreve(f.scadenza) }));
  }
  return parti.join(" · ");
}

function RigaFonte({ c, aperta, onApri, children, analitica, haPiano, oggi, movimentiPrevisti }: {
  c: ContoFonte;
  aperta: boolean;
  onApri: () => void;
  children: ReactNode;
  analitica: boolean;
  haPiano: boolean;
  oggi: string;
  movimentiPrevisti: To;
}) {
  const t = useT();
  const Icona = c.fonte.soggetto === "societa" && c.fonte.tipo !== "banca" && c.fonte.tipo !== "propri" ? Building2 : ICONE[c.fonte.tipo];
  const primoPrevisto = c.programmati?.[0];
  return (
    <>
      <tr className={cn("border-b last:border-b-0 hover:bg-muted/40", aperta && "bg-muted/40")}>
        <td className="px-3 py-2">
          <button type="button" onClick={onApri} aria-expanded={aperta} className="flex w-full items-start gap-2 text-left">
            {aperta ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
            <Icona className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{c.fonte.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">{descrizioneFonte(c.fonte, t)}</span>
            </span>
          </button>
        </td>
        {analitica ? <>
          <Cifre col={c.capitale} bordo />
          <Cifre col={c.rendimento} bordo />
        </> : <>
          <td className="text-right tabular-nums">{euro(c.fonte.impegno)}</td>
          <td className="text-right tabular-nums">{euro(c.versato)}</td>
          <td className="text-right tabular-nums">{euro(c.daVersare)}</td>
          <td className="text-right font-medium tabular-nums">{euro(c.capitaleDentro)}</td>
        </>}
        <td className={cn("text-right", analitica && "border-l")}>
          <span className="block font-semibold tabular-nums">{haPiano ? euro(c.spettaAFine) : "—"}</span>
          {analitica && c.rendimentoPct !== null && (
            <span className={cn("block text-xs", c.rendimentoPct < 0 ? "text-destructive" : "text-muted-foreground")}>
              {t("rendimento {perc}", { perc: percento(c.rendimentoPct) })}
            </span>
          )}
          {analitica && c.tir !== null && <span className="block text-xs text-muted-foreground">{t("TIR {perc} l'anno", { perc: String(percento(c.tir) ?? "") })}</span>}
        </td>
        {!analitica && <td>{primoPrevisto ? <Link to={movimentiPrevisti} className="block text-primary hover:underline"
          aria-label={t("Movimenti previsti di {nome}", { nome: String(c.fonte.nome ?? "") })}>
          <span className="block font-medium tabular-nums">{dataBreve(primoPrevisto.data)} · {euro(primoPrevisto.importo)}</span>
          {primoPrevisto.data <= oggi && <span className="text-xs text-destructive">{primoPrevisto.data < oggi ? t("In ritardo") : t("Da confermare")}</span>}
        </Link> : <span className="text-muted-foreground">—</span>}</td>}
      </tr>
      {aperta && (
        <tr className="border-b bg-muted/20">
          <td colSpan={analitica ? 8 : 7} className="!whitespace-normal !p-3">{children}</td>
        </tr>
      )}
    </>
  );
}

function DettaglioFonte({
  c, generaleId, oggi, puoModificare, registro, storico, onMovimento, onRendiconto, onModifica, onElimina,
}: {
  c: ContoFonte; generaleId: string; oggi: string; puoModificare: boolean;
  registro: To; storico: To;
  onMovimento: () => void; onRendiconto: () => void; onModifica: () => void; onElimina: () => void;
}) {
  const tr = useT();
  const elimina = useEliminaMovimento(generaleId);
  const [modifica, setModifica] = useState<{ movimento: Movimento; azione: AzioneMovimentoPrevisto }>();
  const [mostraTutti, setMostraTutti] = useState(false);
  const limite = 6;
  const movimenti = [
    ...(c.programmati ?? []).map(m => ({ m, previsto: true })),
    ...[...c.movimenti].reverse().map(m => ({ m, previsto: false })),
  ];
  const nome = (t: string) => tr(t === "versamento" ? nomeVersamento(c.fonte.tipo) : NOMI_MOVIMENTO[t as keyof typeof NOMI_MOVIMENTO]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {modifica && puoModificare && <MovimentoPrevistoDialog generaleId={generaleId} fonte={c.fonte.nome} oggi={oggi}
        {...modifica} onClose={() => setModifica(undefined)} />}
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{tr("Movimenti")}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 gap-1" asChild>
              <Link to={registro}>{tr("Apri registro")} <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
            </Button>
            {puoModificare && <Button size="sm" variant="outline" className="h-7 gap-1" onClick={onMovimento}>
              <Plus className="size-3.5" aria-hidden="true" /> {tr("Registra movimento")}
            </Button>}
          </div>
        </div>
        {movimenti.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {aCapitale(c.fonte.tipo) ? tr("Nessun movimento. Registra il primo {cosa} con la data: da lì contano il capitale e il tempo.", { cosa: tr(nomeVersamento(c.fonte.tipo)).toLowerCase() }) : tr("Nessun movimento. Registra il primo {cosa} con la data: da lì contano il capitale e gli interessi.", { cosa: tr(nomeVersamento(c.fonte.tipo)).toLowerCase() })}
          </p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-24" /><col /><col className="w-28" />
              {puoModificare && <col className="w-9" />}
            </colgroup>
            <tbody>
              {(mostraTutti ? movimenti : movimenti.slice(0, limite)).map(({ m, previsto }) => (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="py-1.5 pr-3 tabular-nums">
                    {dataBreve(m.data)}
                    {previsto && <span className="block text-xs text-amber-700">{tr("Previsto")}</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    <p className="truncate" title={[nome(m.tipo), notaMovimento(m.nota)].filter(Boolean).join(" · ")}>
                      {nome(m.tipo)}{notaMovimento(m.nota) && <span className="text-muted-foreground"> · {notaMovimento(m.nota)}</span>}
                    </p>
                    {puoModificare && previsto && <div className="flex flex-wrap gap-1">
                      <Button variant="link" size="sm" className="h-6 px-1" onClick={() => setModifica({ movimento: m, azione: "riprogramma" })}>{tr("Sposta")}</Button>
                      <Button variant="link" size="sm" className="h-6 px-1" onClick={() => setModifica({ movimento: m, azione: "conferma" })}>{tr("Conferma effettuato")}</Button>
                    </div>}
                  </td>
                  <td className={cn("py-1.5 pr-3 text-right tabular-nums", m.tipo === "versamento" ? "" : "text-emerald-700 dark:text-emerald-400")}>
                    {m.tipo === "versamento" ? "" : "− "}{euro(m.importo)}
                  </td>
                  {puoModificare && (
                    <td className="w-8 py-1.5 text-right">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7" aria-label={tr("Elimina {cosa} del {data}", { cosa: nome(m.tipo).toLowerCase(), data: dataBreve(m.data) })}
                        disabled={elimina.isPending}
                        onClick={() => elimina.mutate(m.id, { onError: (e) => toast.error(messaggioInvestitori(e, "il movimento")) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {movimenti.length > limite && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-expanded={mostraTutti}
          onClick={() => setMostraTutti(v => !v)}>{mostraTutti ? tr("Mostra meno") : tr("Mostra tutti i movimenti ({n})", { n: movimenti.length })}</Button>}
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{c.regola}</p>
        {c.interessiMaturati !== null && (
          <p>{tr("Interessi maturati fino a oggi:")} <span className="font-medium tabular-nums">{euro(c.interessiMaturati)}</span></p>
        )}
        {c.spese && c.spese.stima > 0 && (
          <p>{tr("Spese:")} <span className="font-medium tabular-nums">{euro(c.spese.stima)}</span>{c.spese.aFinire > 0 && <span className="text-muted-foreground"> {tr("(da pagare {importo})", { importo: euro(c.spese.aFinire) })}</span>}</p>
        )}
        {c.costoAnnuo !== null && <p>{tr("Costo effettivo, interessi e spese:")} <span className="font-medium tabular-nums">{tr("{perc} l'anno", { perc: percento(c.costoAnnuo) })}</span></p>}
        {c.daVersare - c.daUsare >= 1 && (
          <p className="text-muted-foreground">{tr("Secondo il piano dell'impegno serviranno {usare} su {versare} ancora da versare.", { usare: euro(c.daUsare), versare: euro(c.daVersare) })}</p>
        )}
        {c.fonte.email && <p className="truncate text-muted-foreground">{tr("Rendiconti a {email}", { email: c.fonte.email })}</p>}
        {c.fonte.nota && <p className="whitespace-pre-wrap text-muted-foreground">{c.fonte.nota}</p>}
        <div className="flex flex-wrap gap-2">
          {c.fonte.tipo !== "propri" && (
            <>
              <Button size="sm" onClick={onRendiconto}><FileText className="mr-1.5 h-3.5 w-3.5" /> {tr("Rendiconto")}</Button>
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link to={storico}>{tr("Storico PDF")} <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
              </Button>
            </>
          )}
          {puoModificare && <Button size="sm" variant="outline" onClick={onModifica}><Pencil className="mr-1.5 h-3.5 w-3.5" /> {tr("Modifica")}</Button>}
          {puoModificare && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onElimina}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> {tr("Elimina")}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PrimoPasso({ puoModificare, onNuova }: { puoModificare: boolean; onNuova: (t: TipoFonte) => void }) {
  const t = useT();
  return (
    <div className="rounded-lg border border-dashed bg-card px-4 py-6">
      <p className="font-medium">{t("Da dove arrivano i soldi dell'operazione?")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Aggiungi una fonte per calcolare quanto del fabbisogno è coperto.")}
      </p>
      {puoModificare ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onNuova("propri")}><Wallet className="mr-1.5 h-4 w-4" /> {t("Mezzi propri")}</Button>
          <Button size="sm" variant="outline" onClick={() => onNuova("capitale")}><User className="mr-1.5 h-4 w-4" /> {t("Investitore")}</Button>
          <Button size="sm" variant="outline" onClick={() => onNuova("banca")}><Landmark className="mr-1.5 h-4 w-4" /> {t("Banca o mutuo")}</Button>
          <Button size="sm" variant="outline" onClick={() => onNuova("finanziamento")}><CreditCard className="mr-1.5 h-4 w-4" /> {t("Fido, prestito soci, leasing")}</Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("Le fonti le aggiunge chi può modificare la commessa.")}</p>
      )}
    </div>
  );
}

/** Capitale per fonte (propri · investitori · banca) contro il capitale massimo impegnato del piano. */
export function CoperturaCapitale({ conti, capitaleMassimo, meseMassimo, investitoOggi }: {
  conti: ContiInvestitori; capitaleMassimo: number | null; meseMassimo: string | null; investitoOggi: number | null;
}) {
  const t = useT();
  const scala = Math.max(capitaleMassimo ?? 0, conti.totali.impegno, 1);
  const coperto = capitaleMassimo === null || conti.scopertoImpegni < 1;
  const { mese, importo } = conti.scopertoCalendario;
  return (
    <section aria-label={t("Capitale per fonte")} className="rounded-lg border bg-card px-4 py-3">
      <h3 className="text-sm font-semibold">{t("Capitale per fonte")}</h3>
      <p className="text-xs text-muted-foreground">
        {capitaleMassimo === null
          ? t("Impegni delle fonti. Con il piano economico vedrai il capitale massimo da coprire.")
          : meseMassimo ? t("Impegni delle fonti contro il capitale massimo impegnato, a {mese}.", { mese: nomeMese(meseMassimo) }) : t("Impegni delle fonti contro il capitale massimo impegnato.")}
      </p>
      <div className="relative mt-3 h-4 w-full overflow-hidden rounded bg-muted" role="img" aria-label={capitaleMassimo !== null ? t("Impegni {impegno} su {massimo}", { impegno: euro(conti.totali.impegno), massimo: euro(capitaleMassimo) }) : t("Impegni {impegno}", { impegno: euro(conti.totali.impegno) })}>
        <div className="flex h-full">
          {conti.copertura.map((g) => (
            <div key={g.gruppo} className={cn("h-full", COLORI_GRUPPO[g.gruppo])} style={{ width: `${(g.impegno / scala) * 100}%` }} />
          ))}
        </div>
        {capitaleMassimo !== null && capitaleMassimo > 0 && (
          <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `calc(${Math.min(100, (capitaleMassimo / scala) * 100)}% - 1px)` }} title={t("Capitale massimo impegnato")} />
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {conti.copertura.map((g) => (
          <div key={g.gruppo} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("h-2 w-2 rounded-full", COLORI_GRUPPO[g.gruppo])} />{t(g.nome)}</dt>
            <dd className="font-medium tabular-nums">{euro(g.impegno)}</dd>
            <dd className="text-xs text-muted-foreground tabular-nums">{t("capitale dentro {importo}", { importo: euro(g.dentro) })}</dd>
          </div>
        ))}
      </dl>
      {capitaleMassimo !== null && (
        <p className={cn("mt-2 text-sm", coperto ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
          {coperto
            ? t("Gli impegni coprono il picco di {capitaleMassimo}.", { capitaleMassimo: euro(capitaleMassimo) })
            : t("Mancano {mancano} per coprire il picco di {importo}.", { mancano: euro(conti.scopertoImpegni), importo: euro(capitaleMassimo) })}
          {investitoOggi !== null && <span className="text-muted-foreground"> {t("A oggi l'operazione ha assorbito {importo}.", { importo: euro(investitoOggi) })}</span>}
        </p>
      )}
      {mese && importo > conti.scopertoImpegni && <p className="mt-1 text-sm text-destructive">{t("Nel calendario mancano {importo} a {mese}.", { importo: euro(importo), mese: String(nomeMese(mese)) })}</p>}
    </section>
  );
}

function RegolaUtile({ conti, haPiano }: { conti: ContiInvestitori; haPiano: boolean }) {
  const t = useT();
  return (
    <section aria-label={t("Come si divide l'utile")} className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("Come si divide l'utile")}</h3>
        {haPiano && (
          <p className="text-sm">
            {t("Utile da dividere:")} <span className="font-medium tabular-nums">{euro(conti.utile.stima)}</span>
            <span className="text-xs text-muted-foreground"> {t("(previsto {importo})", { importo: euro(conti.utile.previsto) })}</span>
          </p>
        )}
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {spiegaRegola(conti).map((r) => <li key={r}>{r}</li>)}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t("La regola di ogni fonte (pro quota o quota fissa) si sceglie in «Modifica».")}</p>
    </section>
  );
}
