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
  GitBranch,
  History,
  Loader2,
  Lock,
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
import { controllaBudget } from "@/lib/orders/generali/budgetCompletezza";
import { CompletezzaBudget } from "./CompletezzaBudget";
import { StoricoBusinessPlan } from "./StoricoBusinessPlan";
import { CassaScadenze } from "./CassaScadenze";

type Vista = "voci" | "cassa" | "comuni" | "andamento";

const nomeVersione = (v: VersionePiano) =>
  `Versione ${v.numero} · ${v.stato === "bozza" ? "bozza" : v.stato === "approvata" ? `approvata${v.approvataIl ? ` il ${dataBreve(v.approvataIl)}` : ""}` : "superata"}`;

export function PianoEconomico(props: PropsScheda) {
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
  const apriInvestitori = (mese?: string) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "investitori");
    p.delete("gruppo-fonti");
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
        Il piano economico mostra costi e margini: lo vede chi ha il permesso di
        vedere i margini. Se ti serve, chiedilo al titolare.
      </div>
    );
  }
  if (n.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
      >
        Non riesco a leggere il piano economico.
        <Button size="sm" variant="outline" onClick={n.refetch}>
          Riprova
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
          titolo="Piano economico"
          descrizione="Imposta il budget dell'intera operazione o importa il business plan."
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
            vociEsistenti={0}
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
          "Nuova revisione aperta: l'approvato resta in vigore finché non approvi questa",
        );
      },
      onError: (e) => toast.error(messaggioPiano(e, "la revisione")),
    });

  const spiegazione =
    v.stato === "bozza"
      ? n.approvata
        ? `Stai rivedendo il piano: la versione ${n.approvata.numero} approvata resta il riferimento finché non approvi questa.`
        : "Bozza: si modifica tutto. «Approva» la blocca e diventa il riferimento per il confronto."
      : v.stato === "approvata"
        ? "Approvata: il previsto è bloccato. Puoi aggiornare l'a finire; per cambiare il previsto apri una nuova revisione."
        : "Versione superata: si guarda soltanto.";

  return (
    <div className="generale-sheet generale-piano space-y-4">
      <h2 className="sr-only">Piano economico</h2>
      <Tabs
        className="space-y-4"
        value={vista}
        onValueChange={(x) => setVista(x as Vista)}
      >
        <div className="commessa-section-toolbar generale-plan-navigation">
        <TabsList
          className="generale-subtabs generale-section-navigation"
          aria-label="Sezioni del piano economico"
        >
          <TabsTrigger value="voci">
            <ClipboardList aria-hidden="true" />
            Voci
          </TabsTrigger>
          <TabsTrigger value="cassa">
            <Wallet aria-hidden="true" />
            Cassa e indicatori
          </TabsTrigger>
          <TabsTrigger value="comuni">
            <FileSpreadsheet aria-hidden="true" />
            Costi di commessa
          </TabsTrigger>
          <TabsTrigger value="andamento">
            <History aria-hidden="true" />
            Andamento
          </TabsTrigger>
        </TabsList>
        {riepilogo.permessi.costi && <Button variant="ghost" size="sm" onClick={() => apriCantiere("controllo")}><ShieldCheck className="h-4 w-4" /> Verifica documenti e costi</Button>}
        </div>
        {/* Versione e azioni */}
        <div className="generale-version-toolbar flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={v.id} onValueChange={(id) => setVersioneId(id)}>
                <SelectTrigger
                  className="h-9 w-auto min-w-[16rem]"
                  aria-label="Versione del piano"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {n.versioni.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {nomeVersione(x)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {v.stato === "approvata" && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Lock className="h-3 w-3" /> bloccata
                </Badge>
              )}
              {v.stato === "bozza" && (
                <Badge variant="outline" className="font-normal">
                  bozza
                </Badge>
              )}
            </div>
            <details className="generale-version-details">
              <summary>Dettagli e note della versione</summary>
              <div><p>{spiegazione}</p>{v.nota && <p className="mt-2">Nota: {v.nota}</p>}</div>
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
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Importa
                    business plan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIncolla(true)}
                  >
                    <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Incolla da
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendario(true)}
                    disabled={n.voci.length === 0}
                  >
                    <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Calendario
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
                              "Revisione buttata via: resta l'approvato",
                            );
                          },
                          onError: (e) =>
                            toast.error(messaggioPiano(e, "la revisione")),
                        })
                      }
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Butta via la
                      revisione
                    </Button>
                  )}
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => setApprova(true)}
                    disabled={!budget.completo}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approva
                  </Button>
                </>
              )}
              {v.stato !== "bozza" && n.bozza && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVersioneId(n.bozza!.id)}
                >
                  <GitBranch className="mr-1.5 h-3.5 w-3.5" /> Vai alla
                  revisione in corso
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
                  Nuova revisione
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Riepilogo economico; Cassa e Costi hanno i propri indicatori. */}
        {vista === "voci" && <>
          <section className="generale-indicators" aria-label="Indicatori del piano economico">
            <Numero
              etichetta="Ricavi stimati"
              valore={riepilogo.permessi.importi ? euro(piano.budgetCompleto === false ? null : piano.confronto.totali.ricavi.stima) : "Riservato"}
              nota={riepilogo.permessi.importi ? `Previsto ${euro(piano.confronto.totali.ricavi.previsto)}` : undefined}
            />
            <Numero
              etichetta="Costi finali stimati"
              valore={riepilogo.permessi.costi ? euro(piano.budgetCompleto === false ? null : piano.confronto.totali.costi.stima) : "Riservato"}
              nota={riepilogo.permessi.costi ? `Registrati ${euro(piano.confronto.totali.costi.reale)}` : undefined}
            />
            <Numero
              etichetta="Margine stimato a fine lavori"
              valore={euro(piano.budgetCompleto === false ? null : t.stima)}
              evidenza={piano.budgetCompleto === false ? undefined : t.stima < 0 ? "rosso" : "verde"}
              nota={piano.budgetCompleto === false ? "Completa le stime prima di confrontare" : <>
                <span>Previsto {euro(t.previsto)}</span>{" · "}<span className={tonoScostamento(t.scostamento, "margine")}>{euroSegno(t.scostamento)}</span>
              </>}
            />
            <Numero
              etichetta="Capitale massimo impegnato"
              valore={euro(piano.calendarioCompleto === false ? null : piano.capitale.massimoStima)}
              nota={piano.calendarioCompleto === false ? (budget.calendario.length === 0 ? "Completa prima le stime" : piano.budgetCompleto === false ? "Completa stime e calendario" : "Completa il calendario del piano") : piano.capitale.meseMassimoStima ? `Picco a ${nomeMese(piano.capitale.meseMassimoStima)}` : `Previsto ${euro(piano.capitale.massimoPrevisto)}`}
            />
          </section>
          <p className="generale-plan-context">Importi del piano al netto dell’IVA <span aria-hidden="true">·</span> Capitale investito a oggi <strong>{euro(piano.capitale.investitoOggi)}</strong>{conApprovato && t.approvato !== null && <> <span aria-hidden="true">·</span> Margine approvato {euro(t.approvato)}</>}</p>
        </>}

        {(avvisiSenzaBudget.length > 0 ||
          (n.reale &&
            (!n.reale.permessi.costi || !n.reale.permessi.importi))) && (
          <section aria-label="Cosa manca" className="space-y-1.5">
            {n.reale && !n.reale.permessi.costi && (
              <Avviso testo="Non hai il permesso di vedere i costi: la colonna «Reale a oggi» dei costi resta vuota." />
            )}
            {n.reale && !n.reale.permessi.importi && (
              <Avviso testo="Non hai il permesso di vedere gli importi delle commesse: le fatture emesse non compaiono nel reale." />
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
            {riepilogo.permessi.costi && (
              <nav
                className="generale-plan-workflow"
                aria-label="Dal piano ai documenti"
              >
                <span>Controlla i documenti dell’operazione</span>
                <button type="button" onClick={() => apriCantiere("forniture")}>
                  Ordini e DDT
                </button>
                <button type="button" onClick={() => apriCantiere("fatture")}>
                  Fatture e costi
                </button>
                <button type="button" onClick={() => apriCantiere("pagamenti")}>
                  Pagamenti · IVA inclusa
                </button>
              </nav>
            )}
          </>
        )}
        <TabsContent value="voci" className="mt-3">
          <div ref={tabellaRef} className="generale-table-toolbar scroll-mt-24">
            <label>
              Categoria costi
              <select
                aria-label="Filtra voci per categoria costo"
                value={categorie.length > 1 ? "__gruppo" : (categorie[0] ?? "")}
                onChange={(e) => {
                  const p = new URLSearchParams(parametri);
                  if (e.target.value) p.set("categorie-costo", e.target.value);
                  else p.delete("categorie-costo");
                  setParametri(p, { replace: true });
                }}
              >
                <option value="">Tutte le voci del piano</option>
                {categorie.length > 1 && (
                  <option value="__gruppo">
                    Categorie raggruppate dal grafico
                  </option>
                )}
                {[
                  ...new Set(piano.confronto.costi.map((r) => r.categoria)),
                ].map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIE_PIANO[c as CategoriaPiano]?.nome ??
                      CHIAVI_REALI[c] ??
                      c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {categorie.length > 0 && (
            <FiltroAttivo onReset={rimuoviFiltro}>
              Costi:{" "}
              {categorie
                .map(
                  (c) =>
                    CATEGORIE_PIANO[c as CategoriaPiano]?.nome ??
                    CHIAVI_REALI[c] ??
                    c,
                )
                .join(", ")}{" "}
              ·{" "}
              {parametri.get("base-costi") === "stima"
                ? "dal grafico della stima finale"
                : parametri.get("base-costi") === "reale"
                  ? "dal grafico dei costi registrati"
                  : "confronto del piano"}
              . I totali generali restano nel riepilogo.
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
            Importi al netto dell'IVA; l'IVA che non recuperi va nella voce «IVA
            non detraibile». Il reale viene dalle commesse dentro la generale e
            dalle spese portate sulla generale: consuntivo, ordini d'acquisto,
            fatture ricevute, fatture emesse.
          </p>
          <StoricoBusinessPlan generaleId={g.id} versioneId={v.id} />
        </TabsContent>
        <TabsContent value="cassa" className="mt-3 space-y-6">
          {riepilogo.permessi.costi && riepilogo.permessi.importi && (
            <CassaScadenze
              riepilogo={riepilogo}
              onInvestitori={() => apriInvestitori()}
              onPagamenti={() => apriCantiere("pagamenti")}
            />
          )}
          <IntestazioneScheda
            icona={Wallet}
            titolo="Previsione completa e indicatori del piano"
            descrizione="Budget e stima finale al netto dell’IVA, inclusi i lavori ancora da ordinare. Il fabbisogno del piano è distinto dal residuo delle sole scadenze aperte."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => apriInvestitori()}
            >
              Verifica copertura con le fonti
            </Button>
          </IntestazioneScheda>
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
          vociEsistenti={n.voci.length}
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

function Numero({
  etichetta,
  valore,
  nota,
  evidenza,
}: {
  etichetta: string;
  valore: string;
  nota?: ReactNode;
  evidenza?: "verde" | "rosso";
}) {
  return (
    <div className={cn("generale-indicator", evidenza && `generale-indicator--${evidenza}`)}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {etichetta}
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
  const [nota, setNota] = useState("");
  const approva = useApprovaPiano(generaleId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approvare la versione {versione.numero}?</DialogTitle>
          <DialogDescription>
            Il previsto si blocca e diventa il riferimento (margine previsto{" "}
            {euro(margine)}).
            {precedente
              ? ` La versione ${precedente.numero} resta nello storico come superata.`
              : ""}{" "}
            Per cambiarlo dopo si apre una nuova revisione.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota facoltativa: perché cambia, chi l'ha decisa…"
          aria-label="Nota dell'approvazione"
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            disabled={approva.isPending}
            onClick={() =>
              approva.mutate(
                { versioneId: versione.id, nota: nota.trim() || null },
                {
                  onSuccess: () => {
                    toast.success(`Versione ${versione.numero} approvata`);
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
            Approva e blocca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
