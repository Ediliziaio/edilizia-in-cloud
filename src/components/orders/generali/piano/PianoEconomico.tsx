import { UniformSelect } from "@/components/ui/uniform-select";
// src/components/orders/generali/piano/PianoEconomico.tsx
// La scheda «Piano economico» della commessa generale (piano §3.2 F6): il budget
// dell'appalto o il business plan dello sviluppo. Versioni (bozza → approvata → revisione),
// voci previsto · reale · a finire, flusso di cassa e indicatori con gli scenari, costi
// comuni ripartiti sulle commesse dentro, andamento dalle fotografie di fine mese.
// Si usa da tablet e computer (telefono: false).
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardList,
  ClipboardPaste,
  FileSpreadsheet,
  Flag,
  GitBranch,
  History,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { ConfrontoPiano } from "./ConfrontoPiano";
import { AspettoOperativoProvider } from "../design/ContestoOperativo";
import { IntestazioneScheda, FiltroAttivo } from "../design/ElementiScheda";
import { categorieFiltro } from "@/lib/orders/generali/filtriGrafici";
import {
  CATEGORIE_PIANO,
  CHIAVI_REALI,
  type CategoriaPiano,
} from "@/lib/orders/generali/pianoCategorie";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useChiusuraGenerale } from "@/hooks/useCommesseGenerali";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "../design/ContestoOperativo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { Andamento } from "@/components/orders/generali/piano/Andamento";
import { CassaIndicatori } from "@/components/orders/generali/piano/CassaIndicatori";
import { CostiComuni } from "@/components/orders/generali/piano/CostiComuni";
import {
  DettaglioRighe,
  type DettaglioAperto,
} from "@/components/orders/generali/piano/DettaglioRighe";
import { IncollaExcelDialog } from "@/components/orders/generali/piano/IncollaExcelDialog";
import { ImportaBusinessPlanDialog } from "@/components/orders/generali/piano/ImportaBusinessPlanDialog";
import { CalendarioPianoDialog } from "@/components/orders/generali/piano/CalendarioPianoDialog";
import { PrimoPiano } from "@/components/orders/generali/piano/PrimoPiano";
import { TabellaVoci } from "@/components/orders/generali/piano/TabellaVoci";
import {
  dataBreve,
  euro,
  euroSegno,
  nomeMese,
  tonoScostamento,
} from "@/components/orders/generali/piano/formato";
import {
  messaggioPiano,
  useApprovaPiano,
  useEliminaBozzaPiano,
  useGeneralePianoNumeri,
  useNuovaVersionePiano,
} from "@/hooks/useGeneralePiano";
import { meseCorrente } from "@/lib/orders/generali/avvio";
import { avvisoSenzaMese, avvisoStimeMancanti, type RigaReale, type Scenario } from "@/lib/orders/generali/pianoConti";
import type { VersionePiano } from "@/lib/orders/generali/pianoLettura";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { controllaBudget, stimaMancante } from "@/lib/orders/generali/budgetCompletezza";
import { CompletezzaBudget } from "./CompletezzaBudget";
import { StoricoBusinessPlan } from "./StoricoBusinessPlan";
import { CassaScadenze } from "./CassaScadenze";
import { PianoEconomicoMobile } from "./PianoEconomicoMobile";
import { useIsMobile } from "@/hooks/use-mobile";

type Vista = "voci" | "cassa" | "comuni" | "andamento";

const nomeVersione = (v: VersionePiano, tr: ReturnType<typeof useT>) =>
  v.stato === "bozza"
    ? tr("Versione {numero} · bozza", { numero: v.numero })
    : v.stato === "approvata"
      ? v.approvataIl
        ? tr("Versione {numero} · approvata il {data}", { numero: v.numero, data: dataBreve(v.approvataIl) })
        : tr("Versione {numero} · approvata", { numero: v.numero })
      : tr("Versione {numero} · superata", { numero: v.numero });

export function PianoEconomico(props: PropsScheda) {
  const telefono = useIsMobile();
  if (telefono) return <PianoEconomicoMobile {...props} />;
  return (
    <AspettoOperativoProvider
      value={{
        generaleId: props.riepilogo.generale.id,
        codice: props.riepilogo.generale.codice,
      }}
    >
      <ContenutoPianoEconomico {...props} />
    </AspettoOperativoProvider>
  );
}

function ContenutoPianoEconomico({ riepilogo, puoModificare }: PropsScheda) {
  const tr = useT();
  const g = riepilogo.generale;
  const tabellaRef = useRef<HTMLDivElement>(null);
  const [parametri, setParametri] = useSearchParams();
  const versioneId = parametri.get("versione-piano");
  const setVersioneId = (id: string | null) => {
    const p = new URLSearchParams(parametri);
    if (id) p.set("versione-piano", id);
    else p.delete("versione-piano");
    setParametri(p, { replace: true });
  };
  const richiestaVista = parametri.get("vista-piano");
  const vista: Vista = ["voci", "cassa", "comuni", "andamento"].includes(
    richiestaVista ?? "",
  )
    ? (richiestaVista as Vista)
    : "voci";
  const apriCantiere = (vistaCantiere: string) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "cantiere");
    p.set("vista-cantiere", vistaCantiere);
    setParametri(p);
  };
  const apriPrioritaCassa = () => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "cantiere");
    p.set("vista-cantiere", "da-seguire");
    p.set("priorita", "cassa");
    p.delete("priorita-pagina");
    p.delete("fase-cantiere");
    p.delete("rapportino-cantiere");
    setParametri(p);
  };
  const apriInvestitori = (mese?: string) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "investitori");
    p.delete("gruppo-fonti");
    p.delete("fonte-investitori");
    p.set("vista-investitori", mese ? "rendiconti" : "fonti");
    if (mese) {
      p.set("rendiconto-mese", mese);
      p.set("rendiconto-aperto", "1");
    } else {
      p.delete("rendiconto-mese");
      p.delete("rendiconto-aperto");
    }
    setParametri(p);
  };
  const setVista = (x: Vista) => {
    const p = new URLSearchParams(parametri);
    p.set("vista-piano", x);
    setParametri(p, { replace: true });
  };
  const categorie = categorieFiltro(parametri.get("categorie-costo"));
  const rimuoviFiltro = () => {
    const p = new URLSearchParams(parametri);
    p.delete("categorie-costo");
    p.delete("base-costi");
    setParametri(p, { replace: true });
  };
  const [scenario, setScenario] = useState<Scenario>({
    prezzoPct: 0,
    ritardoMesi: 0,
    costiPct: 0,
  });
  const [dettaglio, setDettaglio] = useState<DettaglioAperto | null>(null);
  const [incolla, setIncolla] = useState(false);
  const [importaFile, impostaImportaFile] = useState(
    () => parametri.get("importa") === "1",
  );
  const setImportaFile = (open: boolean) => {
    impostaImportaFile(open);
    if (!open && parametri.has("importa")) {
      const dopo = new URLSearchParams(parametri);
      dopo.delete("importa");
      setParametri(dopo, { replace: true });
    }
  };
  const [approva, setApprova] = useState(false);
  const [calendario, setCalendario] = useState(false);
  const n = useGeneralePianoNumeri(riepilogo, {
    versioneId,
    preferenza: "bozza",
    scenario,
  });
  const nuova = useNuovaVersionePiano(g.id);
  const elimina = useEliminaBozzaPiano(g.id);
  const commesse = useMemo(
    () =>
      new Map(
        riepilogo.figlie.map((f) => [
          f.id,
          f.codice ? `${f.codice} · ${f.nome}` : f.nome,
        ]),
      ),
    [riepilogo.figlie],
  );

  if (!riepilogo.permessi.margini) {
    return (
      <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
        {tr("Il piano economico mostra costi e margini: lo vede chi ha il permesso di vedere i margini. Se ti serve, chiedilo al titolare.")}
      </div>
    );
  }
  if (n.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
      >
        {tr("Non riesco a leggere il piano economico.")}
        <Button size="sm" variant="outline" onClick={n.refetch}>
          {tr("Riprova")}
        </Button>
      </div>
    );
  }
  if (n.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }
  if (n.vuoto) {
    return (
      <>
        <IntestazioneScheda
          icona={ChartNoAxesCombined}
          titolo={tr("Piano economico")}
          descrizione={tr("Imposta il budget dell'intera operazione o importa il business plan.")}
        />
        <PrimoPiano
          riepilogo={riepilogo}
          puoModificare={puoModificare}
          mese={meseCorrente()}
          onImportaFile={() => setImportaFile(true)}
          onCreato={(id, apriIncolla) => {
            setVersioneId(id);
            if (apriIncolla) setIncolla(true);
          }}
        />
        {puoModificare && importaFile && (
          <ImportaBusinessPlanDialog
            open
            onOpenChange={setImportaFile}
            generaleId={g.id}
            versioneId={null}
            onImportato={setVersioneId}
          />
        )}
      </>
    );
  }

  const v = n.inVista;
  const piano = n.piano;
  if (!v || !piano) {
    return <Skeleton className="h-80 w-full rounded-lg" />;
  }

  const modificabile = v.stato === "bozza" && puoModificare;
  const aFinireModificabile = puoModificare && v.stato !== "superata";
  const conApprovato = !!n.approvata && n.approvata.id !== v.id;
  const apriRighe = (titolo: string, righe: RigaReale[]) =>
    setDettaglio({ titolo, righe });
  const t = piano.confronto.totali.margine;
  // Con voci ancora da stimare i numeri si mostrano lo stesso, segnati come provvisori.
  const incompleto = piano.budgetCompleto === false;
  const daStimare = n.voci.filter((x) => stimaMancante(x)).length;
  const apriDati = () => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "dati");
    setParametri(p);
  };
  // Stime e mesi mancanti li dice il riquadro del budget da completare, con la loro azione:
  // qui non si ripetono. Le frasi si riconoscono dalle funzioni che le scrivono.
  const budget = controllaBudget(n.voci);
  const giaNelRiquadro = new Set<string>([
    ...(budget.mancanti.length ? [avvisoStimeMancanti(budget.mancanti.length)] : []),
    ...(n.voci.some((x) => !x.mese && x.importo > 0) ? [avvisoSenzaMese(n.voci.filter((x) => !x.mese && x.importo > 0))] : []),
  ]);
  const avvisiSenzaBudget = piano.avvisi.filter((a) => !giaNelRiquadro.has(a));

  const nuovaRevisione = () =>
    nuova.mutate(null, {
      onSuccess: (id) => {
        setVersioneId(id);
        toast.success(
          tr("Nuova revisione aperta: l'approvato resta in vigore finché non approvi questa"),
        );
      },
      onError: (e) => toast.error(messaggioPiano(e, "la revisione")),
    });

  const spiegazione =
    v.stato === "bozza"
      ? n.approvata
        ? tr("Stai rivedendo il piano: la versione {numero} approvata resta il riferimento finché non approvi questa.", { numero: n.approvata.numero })
        : tr("Bozza: si modifica tutto. «Approva» la blocca e diventa il riferimento per il confronto.")
      : v.stato === "approvata"
        ? tr("Approvata: il previsto è bloccato. Puoi aggiornare l'a finire; per cambiare il previsto apri una nuova revisione.")
        : tr("Versione superata: si guarda soltanto.");

  return (
    <div className="generale-sheet generale-piano space-y-4">
      <h2 className="sr-only">{tr("Piano economico")}</h2>
      <Tabs
        className="space-y-4"
        value={vista}
        onValueChange={(x) => setVista(x as Vista)}
      >
        <div className="commessa-section-toolbar generale-plan-navigation">
        <TabsList
          className="generale-subtabs generale-section-navigation"
          aria-label={tr("Sezioni del piano economico")}
        >
          <TabsTrigger value="voci">
            <ClipboardList aria-hidden="true" />
            {tr("Voci")}
          </TabsTrigger>
          <TabsTrigger value="cassa">
            <Wallet aria-hidden="true" />
            {tr("Cassa e indicatori")}
          </TabsTrigger>
          <TabsTrigger value="comuni">
            <FileSpreadsheet aria-hidden="true" />
            {tr("Costi di commessa")}
          </TabsTrigger>
          <TabsTrigger value="andamento">
            <History aria-hidden="true" />
            {tr("Andamento")}
          </TabsTrigger>
        </TabsList>
        {riepilogo.permessi.costi && <Button variant="ghost" size="sm" onClick={() => apriCantiere("controllo")}><ShieldCheck className="h-4 w-4" /> {tr("Verifica documenti e costi")}</Button>}
        </div>
        {/* Versione e azioni */}
        <div className="generale-version-toolbar flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={v.id} onValueChange={(id) => setVersioneId(id)}>
                <SelectTrigger
                  className="h-9 w-auto min-w-[16rem]"
                  aria-label={tr("Versione del piano")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {n.versioni.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {nomeVersione(x, tr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {v.stato === "approvata" && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Lock className="h-3 w-3" /> {tr("bloccata")}
                </Badge>
              )}
              {v.stato === "bozza" && (
                <Badge variant="outline" className="font-normal">
                  {tr("bozza")}
                </Badge>
              )}
            </div>
            <details className="generale-version-details">
              <summary>{tr("Dettagli e note della versione")}</summary>
              <div><p>{spiegazione}</p>{v.nota && <p className="mt-2">{tr("Nota: {nota}", { nota: v.nota })}</p>}</div>
            </details>
          </div>
          {puoModificare && (
            <div className="flex flex-wrap items-center gap-2">
              {v.stato === "bozza" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImportaFile(true)}
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> {tr("Importa business plan")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIncolla(true)}
                  >
                    <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> {tr("Incolla da Excel")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendario(true)}
                    disabled={n.voci.length === 0}
                  >
                    <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> {tr("Calendario")}
                  </Button>
                  {n.approvata && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={elimina.isPending}
                      onClick={() =>
                        elimina.mutate(v.id, {
                          onSuccess: () => {
                            setVersioneId(null);
                            toast.success(
                              tr("Revisione buttata via: resta l'approvato"),
                            );
                          },
                          onError: (e) =>
                            toast.error(messaggioPiano(e, "la revisione")),
                        })
                      }
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {tr("Butta via la revisione")}
                    </Button>
                  )}
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => setApprova(true)}
                    disabled={!budget.completo}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> {tr("Approva")}
                  </Button>
                </>
              )}
              <ChiusuraOperazione generaleId={g.id} chiusa={!!piano.chiusa} />
              {v.stato !== "bozza" && n.bozza && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVersioneId(n.bozza!.id)}
                >
                  <GitBranch className="mr-1.5 h-3.5 w-3.5" /> {tr("Vai alla revisione in corso")}
                </Button>
              )}
              {v.stato !== "bozza" && !n.bozza && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nuovaRevisione}
                  disabled={nuova.isPending}
                >
                  {nuova.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitBranch className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {tr("Nuova revisione")}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Riepilogo economico; Cassa e Costi hanno i propri indicatori. */}
        {vista === "voci" && <>
          <section className="generale-indicators" aria-label={tr("Indicatori del piano economico")}>
            <Numero
              etichetta={tr("Ricavi stimati")}
              valore={riepilogo.permessi.importi ? euro(piano.confronto.totali.ricavi.stima) : tr("Riservato")}
              nota={riepilogo.permessi.importi ? tr("Previsto {importo}", { importo: euro(piano.confronto.totali.ricavi.previsto) }) : undefined}
            />
            <Numero
              etichetta={tr("Costi finali stimati")}
              provvisorio={incompleto}
              valore={riepilogo.permessi.costi ? euro(piano.confronto.totali.costi.stima) : tr("Riservato")}
              nota={riepilogo.permessi.costi ? <>
                {tr("Registrati {importo}", { importo: euro(piano.confronto.totali.costi.reale) })}
                {incompleto && <> <span aria-hidden="true">·</span> {tr(daStimare === 1 ? "{n} voce da stimare" : "{n} voci da stimare", { n: daStimare })}</>}
              </> : undefined}
            />
            <Numero
              etichetta={tr("Margine stimato a fine lavori")}
              provvisorio={incompleto}
              valore={euro(t.stima)}
              evidenza={incompleto ? undefined : t.stima < 0 ? "rosso" : "verde"}
              nota={incompleto
                ? tr("{quota} sui ricavi, prima delle voci da stimare", { quota: quotaTesto(t.stima, piano.confronto.totali.ricavi.stima) })
                : <><span>{tr("Previsto {importo}", { importo: euro(t.previsto) })}</span>{" · "}<span className={tonoScostamento(t.scostamento, "margine")}>{euroSegno(t.scostamento)}</span></>}
            />
            <Numero
              etichetta={tr("Capitale massimo impegnato")}
              provvisorio={incompleto && budget.calendario.length === 0}
              valore={euro(budget.calendario.length > 0 ? null : piano.capitale.massimoStima)}
              nota={budget.calendario.length > 0
                ? tr("Completa il calendario del piano")
                : piano.capitale.meseMassimoStima ? tr("Picco a {mese}", { mese: nomeMese(piano.capitale.meseMassimoStima) }) : tr("Previsto {importo}", { importo: euro(piano.capitale.massimoPrevisto) })}
            />
          </section>
          <p className="generale-plan-context">
            {tr("Importi del piano al netto dell’IVA")} <span aria-hidden="true">·</span> {tr("Capitale investito a oggi")} <strong>{euro(piano.capitale.investitoOggi)}</strong>
            {conApprovato && t.approvato !== null && <> <span aria-hidden="true">·</span> {tr("Margine approvato {importo}", { importo: euro(t.approvato) })}</>}
            {piano.chiusa && <> <span aria-hidden="true">·</span> <strong>{tr("Operazione chiusa")}</strong>: {tr("la stima finale è il registrato, niente più «a finire»")}</>}
            {!g.inizio && !piano.chiusa && <> <span aria-hidden="true">·</span> {tr("Inizio lavori non indicato, i mesi sono ipotesi")}{" "}
              <button type="button" className="generale-plan-context-link" onClick={apriDati}>{tr("Indicalo")}</button></>}
          </p>
        </>}

        {(avvisiSenzaBudget.length > 0 ||
          (n.reale &&
            (!n.reale.permessi.costi || !n.reale.permessi.importi))) && (
          <section aria-label={tr("Cosa manca")} className="space-y-1.5">
            {n.reale && !n.reale.permessi.costi && (
              <Avviso testo={tr("Non hai il permesso di vedere i costi: la colonna «Reale a oggi» dei costi resta vuota.")} />
            )}
            {n.reale && !n.reale.permessi.importi && (
              <Avviso testo={tr("Non hai il permesso di vedere gli importi delle commesse: le fatture emesse non compaiono nel reale.")} />
            )}
            {avvisiSenzaBudget.map((a) => (
              <Avviso key={a} testo={a} />
            ))}
          </section>
        )}

        <CompletezzaBudget
          generaleId={g.id}
          versioneId={v.id}
          voci={n.voci}
          modificabile={modificabile}
          onCalendario={() => setCalendario(true)}
          stimeAperte={parametri.get("stime") === "1"}
          spesoSenzaPrevisto={riepilogo.permessi.costi ? piano.confronto.costi.flatMap((r) =>
            r.voce && r.previsto < 0.005 && r.reale > 0.005 ? [{ voce: r.voce, reale: r.reale }] : []) : []}
        />
        {/* Si apre anche dalla Panoramica («Completa l'operazione» → ?calendario=1). */}
        {modificabile && (calendario || parametri.get("calendario") === "1") && (
          <CalendarioPianoDialog
            open
            onOpenChange={(aperto) => {
              setCalendario(aperto);
              if (!aperto && parametri.has("calendario")) {
                const p = new URLSearchParams(parametri);
                p.delete("calendario");
                setParametri(p, { replace: true });
              }
            }}
            generaleId={g.id}
            versioneId={v.id}
            modello={g.modello}
            voci={n.voci}
          />
        )}
        {vista === "voci" && (
          <>
            <ConfrontoPiano
              piano={piano}
              permessi={{
                costi:
                  riepilogo.permessi.costi && n.reale?.permessi.costi !== false,
                importi:
                  riepilogo.permessi.importi &&
                  n.reale?.permessi.importi !== false,
              }}
              onApriRighe={apriRighe}
              onCategoria={(categoria, tipo) => {
                const p = new URLSearchParams(parametri);
                p.set("vista-piano", "voci");
                p.delete("base-costi");
                if (tipo === "costo") p.set("categorie-costo", categoria);
                else p.delete("categorie-costo");
                setParametri(p, { replace: true });
                requestAnimationFrame(() =>
                  tabellaRef.current?.scrollIntoView({ block: "start" }),
                );
              }}
            />
          </>
        )}
        <TabsContent value="voci" className="mt-3">
          <div ref={tabellaRef} className="generale-table-toolbar scroll-mt-24">
            <label>
              {tr("Categoria costi")}
              <UniformSelect
                aria-label={tr("Filtra voci per categoria costo")}
                value={categorie.length > 1 ? "__gruppo" : (categorie[0] ?? "")}
                onChange={(e) => {
                  const p = new URLSearchParams(parametri);
                  if (e.target.value) p.set("categorie-costo", e.target.value);
                  else p.delete("categorie-costo");
                  setParametri(p, { replace: true });
                }}
              >
                <option value="">{tr("Tutte le voci del piano")}</option>
                {categorie.length > 1 && (
                  <option value="__gruppo">
                    {tr("Categorie raggruppate dal grafico")}
                  </option>
                )}
                {[
                  ...new Set(piano.confronto.costi.map((r) => r.categoria)),
                ].map((c) => (
                  <option key={c} value={c}>
                    {tr(CATEGORIE_PIANO[c as CategoriaPiano]?.nome ??
                      CHIAVI_REALI[c] ??
                      c)}
                  </option>
                ))}
              </UniformSelect>
            </label>
          </div>
          {categorie.length > 0 && (
            <FiltroAttivo onReset={rimuoviFiltro}>
              {tr("Costi:")}{" "}
              {categorie
                .map(
                  (c) =>
                    tr(CATEGORIE_PIANO[c as CategoriaPiano]?.nome ??
                    CHIAVI_REALI[c] ??
                    c),
                )
                .join(", ")}{" "}
              ·{" "}
              {parametri.get("base-costi") === "stima"
                ? tr("dal grafico della stima finale")
                : parametri.get("base-costi") === "reale"
                  ? tr("dal grafico dei costi registrati")
                  : tr("confronto del piano")}
              . {tr("I totali generali restano nel riepilogo.")}
            </FiltroAttivo>
          )}
          <TabellaVoci
            generaleId={g.id}
            modello={g.modello}
            versioneId={v.id}
            piano={piano}
            categorieFiltrate={categorie}
            modificabile={modificabile}
            aFinireModificabile={aFinireModificabile}
            conApprovato={conApprovato}
            figlie={riepilogo.figlie}
            categorieAzienda={n.reale?.categorie ?? []}
            onApriRighe={apriRighe}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {tr("Importi al netto dell'IVA; l'IVA che non recuperi va nella voce «IVA non detraibile». Il reale viene dalle commesse dentro la generale e dalle spese portate sulla generale: consuntivo, ordini d'acquisto, fatture ricevute, fatture emesse. Caparre e acconti delle unità sono incassi: diventano ricavo con la fattura o con il rogito.")}
          </p>
          <StoricoBusinessPlan generaleId={g.id} versioneId={v.id} />
        </TabsContent>
        <TabsContent value="cassa" className="mt-3 space-y-6">
          {riepilogo.permessi.costi && riepilogo.permessi.importi && (
            <CassaScadenze
              key={`${parametri.get("cassa-base")}:${parametri.get("cassa-periodo")}`}
              riepilogo={riepilogo}
              onInvestitori={() => apriInvestitori()}
              onPagamenti={() => apriCantiere("pagamenti")}
              onPriorita={apriPrioritaCassa}
              baseIniziale={parametri.get("cassa-base") === "attesi" ? "attesi" : "registrati"}
              periodoIniziale={parametri.get("cassa-periodo") === "futuro" ? "futuro" : "tutto"}
            />
          )}
          <IntestazioneScheda
            icona={Wallet}
            titolo={tr("Previsione completa e indicatori del piano")}
            descrizione={tr("Budget e stima finale al netto dell’IVA, inclusi i lavori ancora da ordinare. Il fabbisogno del piano è distinto dal residuo delle sole scadenze aperte.")}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => apriInvestitori()}
            >
              {tr("Verifica copertura con le fonti")}
            </Button>
          </IntestazioneScheda>
          {n.scadenzeCaricamento && <p role="status" className="text-sm text-muted-foreground">{tr("Lettura delle scadenze delle fatture…")}</p>}
          {n.scadenzeErrore && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            {tr("Uso date stimate per le fatture. Le scadenze registrate sono momentaneamente indisponibili.")}
            <Button type="button" variant="outline" size="sm" onClick={() => void n.rileggiScadenze()}>{tr("Riprova")}</Button>
          </div>}
          <CassaIndicatori
            piano={piano}
            scenario={scenario}
            onScenario={setScenario}
            conUnita={n.unita !== null}
          />
        </TabsContent>
        <TabsContent value="comuni" className="mt-3">
          <CostiComuni
            piano={piano}
            riepilogo={riepilogo}
            onApriRighe={apriRighe}
          />
        </TabsContent>
        <TabsContent value="andamento" className="mt-3">
          <Andamento
            generaleId={g.id}
            puoModificare={puoModificare}
            onInvestitori={apriInvestitori}
          />
        </TabsContent>
      </Tabs>

      <DettaglioRighe
        dettaglio={dettaglio}
        onClose={() => setDettaglio(null)}
        commesse={commesse}
        generaleId={g.id}
      />
      {modificabile && (
        <ImportaBusinessPlanDialog
          open={importaFile}
          onOpenChange={setImportaFile}
          generaleId={g.id}
          versioneId={v.id}
          vociEsistenti={n.voci}
        />
      )}
      {modificabile && (
        <IncollaExcelDialog
          open={incolla}
          onOpenChange={setIncolla}
          generaleId={g.id}
          versioneId={v.id}
          figlie={riepilogo.figlie}
          partenza={piano.oggi}
        />
      )}
      {modificabile && approva && (
        <ApprovaDialog
          generaleId={g.id}
          versione={v}
          precedente={n.approvata}
          margine={t.previsto}
          onClose={() => setApprova(false)}
        />
      )}
    </div>
  );
}

/** «Chiudi l'operazione» / «Riapri», con conferma: da chiusa il piano non prevede più nulla «a finire». */
function ChiusuraOperazione({ generaleId, chiusa }: { generaleId: string; chiusa: boolean }) {
  const t = useT();
  const chiusura = useChiusuraGenerale(generaleId);
  const cambia = (valore: boolean) =>
    chiusura.mutate(valore, {
      onSuccess: () => toast.success(valore ? t("Operazione chiusa: la stima finale è il registrato") : t("Operazione riaperta")),
      onError: (e) => toast.error(e instanceof Error ? e.message : t("Non riesco a cambiare lo stato dell'operazione")),
    });
  if (chiusa) {
    return (
      <Button variant="ghost" size="sm" disabled={chiusura.isPending} onClick={() => cambia(false)}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t("Riapri l'operazione")}
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={chiusura.isPending}>
          <Flag className="mr-1.5 h-3.5 w-3.5" /> {t("Chiudi l'operazione")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Chiudere l'operazione?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Il piano smette di prevedere costi e ricavi «a finire»: la stima finale diventa quello che è registrato, e così il margine nel Dossier e nei rendiconti. Si può riaprire in ogni momento.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => cambia(true)}>{t("Chiudi l'operazione")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Numero({
  etichetta,
  valore,
  nota,
  evidenza,
  provvisorio,
}: {
  etichetta: string;
  valore: string;
  nota?: ReactNode;
  evidenza?: "verde" | "rosso";
  /** Il budget ha ancora voci da stimare: il numero c'è, ma può cambiare. */
  provvisorio?: boolean;
}) {
  const t = useT();
  return (
    <div className={cn("generale-indicator", evidenza && `generale-indicator--${evidenza}`, provvisorio && "generale-indicator--provvisorio")}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {etichetta}
        {provvisorio && <span className="generale-indicator-tag">{t("provvisorio")}</span>}
      </p>
      <p
        className="generale-indicator-value font-semibold tabular-nums"
      >
        {valore}
      </p>
      {nota && (
        <p className="generale-indicator-note text-[11px] text-muted-foreground">
          {nota}
        </p>
      )}
    </div>
  );
}

/** «18,2%» del margine sui ricavi; lineetta se i ricavi sono zero. */
function quotaTesto(parte: number, base: number) {
  if (Math.abs(base) < 0.005) return "—";
  return `${((parte / base) * 100).toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}%`;
}

function Avviso({ testo }: { testo: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{testo}</span>
    </div>
  );
}

function ApprovaDialog({
  generaleId,
  versione,
  precedente,
  margine,
  onClose,
}: {
  generaleId: string;
  versione: VersionePiano;
  precedente: VersionePiano | null;
  margine: number;
  onClose: () => void;
}) {
  const t = useT();
  const [nota, setNota] = useState("");
  const approva = useApprovaPiano(generaleId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Approvare la versione {numero}?", { numero: versione.numero })}</DialogTitle>
          <DialogDescription>
            {t("Il previsto si blocca e diventa il riferimento (margine previsto {importo}).", { importo: euro(margine) })}
            {precedente
              ? " " + t("La versione {numero} resta nello storico come superata.", { numero: precedente.numero })
              : ""}{" "}
            {t("Per cambiarlo dopo si apre una nuova revisione.")}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={t("Nota facoltativa: perché cambia, chi l'ha decisa…")}
          aria-label={t("Nota dell'approvazione")}
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Annulla")}
          </Button>
          <Button
            disabled={approva.isPending}
            onClick={() =>
              approva.mutate(
                { versioneId: versione.id, nota: nota.trim() || null },
                {
                  onSuccess: () => {
                    toast.success(t("Versione {numero} approvata", { numero: versione.numero }));
                    onClose();
                  },
                  onError: (e) =>
                    toast.error(messaggioPiano(e, "l'approvazione")),
                },
              )
            }
          >
            {approva.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            {t("Approva e blocca")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
