import { AttrezzatureCommessa } from "./AttrezzatureCommessa";
import { QuadroDocumentaleCommessa } from "./QuadroDocumentaleCommessa";
import {
  quadroDocumentale,
  riepilogoQuadro,
  type RigaQuadroDocumentale,
} from "@/lib/sicurezza/quadroDocumentale";
import { RequisitiAddettiCommessa } from "./RequisitiAddettiCommessa";
import { evidenzaPertinente, nelPeriodo } from "@/lib/sicurezza/fascicolo";
import { IncarichiCantiere } from "./IncarichiCantiere";
import { ProdottiSdsCommessa } from "./ProdottiSdsCommessa";
import { DpiCommessa } from "./DpiCommessa";
import { ImpreseCommessa } from "./ImpreseCommessa";
import { PulsanteProfiliRequisiti } from "./ProfiliRequisitiDialog";
import { FascicoloDocumenti } from "./FascicoloDocumenti";
import {
  useImpreseCommessa,
  useEvidenzeFascicolo,
  useFasiFascicolo,
} from "@/hooks/useFascicoloCantiere";
/**
 * Riepilogo della sicurezza con dettagli su richiesta. Le fonti e i permessi
 * restano quelli dei moduli esistenti; la creazione POS conferma prima di aprire la scheda interna.
 */
import { useRef, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowRight, FileText, Users, Wrench, FolderOpen } from "lucide-react";
import { SchedaCommessaDialog } from "./SchedaCommessaDialog";
import { intercettaScheda, type DestinazioneScheda } from "./ContestoSchedaCommessa";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileUp,
  HardHat,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreaPos, usePosElenco } from "@/hooks/usePos";
import { useDocumentiSicurezza } from "@/hooks/useDocumentiSicurezza";
import {
  daSistemare,
  listaControlloCommessa,
  documentoDaEvidenza,
  type VoceControllo,
} from "@/lib/sicurezza/documentiSicurezza";
import { verificaIterNegativa } from "@/lib/sicurezza/posIter";
import {
  CaricaDocumentoSicurezzaDialog,
  DocumentiSicurezza,
  type PresetCaricamento,
} from "./DocumentiSicurezza";

const oggiRoma = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

const STILE: Record<
  VoceControllo["stato"],
  { icona: typeof CheckCircle2; cls: string; testo: string }
> = {
  ok: {
    icona: CheckCircle2,
    cls: "text-green-600",
    testo: "Verifica registrata",
  },
  manca: { icona: AlertTriangle, cls: "text-red-600", testo: "Manca" },
  scaduto: { icona: AlertTriangle, cls: "text-red-600", testo: "Scaduto" },
  in_scadenza: { icona: Clock, cls: "text-amber-600", testo: "In scadenza" },
  in_corso: { icona: Clock, cls: "text-amber-600", testo: "Da completare" },
};

export function SicurezzaCommessa({
  companyId,
  orderId,
}: {
  companyId: string;
  orderId: string;
}) {
  const [scheda, setScheda] = useState<DestinazioneScheda | null>(null);
  const navigate = (to: string, opzioni?: { state?: unknown }) => {
    setPosCreato(null);
    setScheda({ to, state: opzioni?.state });
  };
  const permessi = usePermissions();
  const [vista, setVista] = useState<string | null>(null);
  const [posCreato, setPosCreato] = useState<{
    pos_id: string;
    avvisi: string[];
  } | null>(null);
  const [erroreCreazione, setErroreCreazione] = useState("");
  const inCreazione = useRef(false);
  const scrive = permessi.canViewSicurezzaCantiere && !permessi.solaLettura;
  const [documentoSelezionato, setDocumentoSelezionato] = useState<
    string | null
  >(null);
  const [dataRiferimento, setDataRiferimento] = useState(oggiRoma);
  const [faseScelta, setFaseScelta] = useState("");
  const oggi = dataRiferimento || oggiRoma();
  const fasi = useFasiFascicolo(companyId, orderId);
  const faseAttiva = fasi.data?.some((f) => f.id === faseScelta)
    ? faseScelta
    : "";
  const posQuery = usePosElenco();
  const { data: tuttiPos = [], isLoading: caricoPos } = posQuery;
  const pos = tuttiPos.filter(
    (p) => p.order_id === orderId && p.company_id === companyId,
  );
  const creaPos = useCreaPos();
  const documentiQuery = useDocumentiSicurezza(companyId, orderId);
  const { data: documenti = [], isLoading: caricoDoc } = documentiQuery;
  const [preset, setPreset] = useState<PresetCaricamento | null>(null);

  const imprese = useImpreseCommessa(companyId, orderId);
  const evidenze = useEvidenzeFascicolo({ companyId, orderId });
  const subappaltatori = imprese.data?.imprese ?? [];
  const caricoSub = imprese.isLoading;

  // Ponteggi montati adesso sul cantiere: servono il PiMUS.
  const ponteggiQuery = useQuery({
    queryKey: ["sicurezza-commessa-ponteggi", companyId, orderId, oggi],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mezzi_allocazioni")
        .select(
          "dal, al, mezzo:mezzi!mezzi_allocazioni_mezzo_id_fkey(nome, tipo, deleted_at)",
        )
        .eq("company_id", companyId)
        .eq("order_id", orderId);
      if (error) throw error;
      return (
        (data ?? []) as Array<{
          dal: string | null;
          al: string | null;
          mezzo: {
            nome: string | null;
            tipo: string | null;
            deleted_at: string | null;
          } | null;
        }>
      ).some(
        (a) =>
          a.mezzo &&
          !a.mezzo.deleted_at &&
          (!a.dal || a.dal <= oggi) &&
          (!a.al || a.al >= oggi) &&
          /ponteg/i.test(`${a.mezzo.nome ?? ""} ${a.mezzo.tipo ?? ""}`),
      );
    },
  });

  const verbaliQuery = useQuery({
    queryKey: ["sicurezza-commessa-verbali", companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verbali_sicurezza")
        .select("id, data, tipo, esito, redatto_da")
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .order("data", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const verbali = verbaliQuery.data ?? [];
  const ponteggiMontati = ponteggiQuery.data ?? false;
  const fontiParziali =
    posQuery.isError ||
    documentiQuery.isError ||
    imprese.isError ||
    evidenze.isError ||
    ponteggiQuery.isError ||
    fasi.isError;
  const caricamento =
    caricoPos ||
    caricoDoc ||
    caricoSub ||
    evidenze.isLoading ||
    ponteggiQuery.isLoading ||
    fasi.isLoading;
  const addettiIds = (imprese.data?.assegnazioni ?? [])
    .filter(
      (a) =>
        nelPeriodo(a.dal, a.al, oggi) &&
        (!faseAttiva || !a.fase_id || a.fase_id === faseAttiva),
    )
    .map((a) => a.operaio_id);
  const perId = new Map(
    [...(evidenze.data ?? []), ...(imprese.data?.evidenze ?? [])].map((e) => [
      e.id,
      e,
    ]),
  );
  const native = [...perId.values()]
    .filter((e) =>
      evidenzaPertinente(e, orderId, addettiIds, {
        data: oggi,
        faseId: faseAttiva,
      }),
    )
    .map(documentoDaEvidenza)
    .filter((d): d is NonNullable<typeof d> => !!d);
  const voci = listaControlloCommessa({
    orderId,
    oggi,
    documenti: [...documenti, ...native],
    pos: pos.map((p) => ({ status: p.status, verificaNegativa: verificaIterNegativa(p.contenuto, p.iter) })),
    subappaltatori,
    ponteggiMontati,
  });
  const aperte = daSistemare(voci);
  const quadro = quadroDocumentale(
    {
      companyId,
      orderId,
      oggi,
      faseId: faseAttiva,
      operaiIds: addettiIds,
      impreseIds: subappaltatori.map((s) => s.id),
    },
    [...perId.values()],
    documenti,
  );
  const scorriFascicolo = () => setVista("fascicolo");
  const apriRiga = (r: RigaQuadroDocumentale) => {
    if (r.origine === "archivio")
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setVista("archivio")}
        >
          Consulta archivio
        </Button>
      );
    if (r.ordineFonte !== orderId && r.subId)
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/azienda/subappaltatori/${r.subId}`)}
        >
          Scheda impresa
        </Button>
      );
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setDocumentoSelezionato(r.id);
          scorriFascicolo();
        }}
      >
        Consulta nel fascicolo
      </Button>
    );
  };

  const preparaPos = async () => {
    if (!scrive || inCreazione.current) return;
    inCreazione.current = true;
    setErroreCreazione("");
    try {
      const r = await creaPos.mutateAsync({
        orderId,
        ruoloImpresa: "affidataria_esecutrice",
      });
      if (!r?.pos_id)
        throw new Error(
          "Creazione non confermata. Aggiorna l’elenco prima di riprovare.",
        );
      setVista(null);
      setPosCreato(r);
    } catch (e) {
      setErroreCreazione(
        e instanceof Error
          ? e.message
          : "POS non creato. Riprova dopo aver verificato i dati.",
      );
    } finally {
      inCreazione.current = false;
    }
  };

  const azione = (v: VoceControllo) => {
    if (v.chiave.startsWith("itp-"))
      return (
        <Button size="sm" variant="outline" onClick={() => setVista("imprese")}>
          Consulta verifica ITP
        </Button>
      );
    if (v.nelPos) {
      return pos[0] ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setVista("pos")}
        >
          Apri il POS
        </Button>
      ) : scrive ? (
        <Button
          size="sm"
          className="h-8"
          onClick={preparaPos}
          disabled={creaPos.isPending}
        >
          {creaPos.isPending && (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          )}
          Prepara il POS
        </Button>
      ) : null;
    }
    if (v.stato === "ok" || !scrive) return null;
    return (
      <Button
        size="sm"
        variant={v.stato === "manca" ? "default" : "outline"}
        className="h-8 gap-1"
        onClick={() =>
          setPreset({
            tipo: v.tipo,
            subappaltatoreId: v.subappaltatoreId ?? null,
          })
        }
      >
        <FileUp className="h-3.5 w-3.5" />
        {v.stato === "manca" ? "Carica" : "Aggiorna"}
      </Button>
    );
  };

  const sezioni = [
    { id: "quadro", gruppo: "Documenti", titolo: "Quadro documentale" },
    { id: "fascicolo", gruppo: "Documenti", titolo: "Documenti e richieste" },
    { id: "archivio", gruppo: "Documenti", titolo: "Archivio precedente" },
    {
      id: "incarichi",
      gruppo: "Persone e imprese",
      titolo: "Figure e responsabilità",
    },
    {
      id: "imprese",
      gruppo: "Persone e imprese",
      titolo: "Imprese e operai esterni",
    },
    {
      id: "qualifiche",
      gruppo: "Persone e imprese",
      titolo: "Qualifiche degli addetti",
    },
    { id: "dpi", gruppo: "Persone e imprese", titolo: "DPI e consegne" },
    {
      id: "attrezzature",
      gruppo: "Mezzi e prodotti",
      titolo: "Mezzi e attrezzature",
    },
    { id: "prodotti", gruppo: "Mezzi e prodotti", titolo: "Prodotti e SDS" },
    {
      id: "promemoria",
      gruppo: "Controlli e verbali",
      titolo: "Promemoria da valutare",
    },
    { id: "verbali", gruppo: "Controlli e verbali", titolo: "Verbali" },
    { id: "pos", gruppo: "POS", titolo: "POS della commessa" },
  ];
  const attiva = sezioni.find((s) => s.id === vista);
  const contestoParziale = fasi.isLoading || fasi.isError;
  const conta = riepilogoQuadro(quadro);
  const aree = [
    {
      id: "quadro",
      titolo: "Documenti",
      icona: FolderOpen,
      descrizione: "Richieste, originali e documenti da verificare.",
      dettaglio: caricamento
        ? "Caricamento…"
        : fontiParziali
          ? "Fonti da controllare"
          : `${conta.registrati} requisiti registrati · ${conta.daVerificare} verifiche / integrazioni`,
    },
    {
      id: "incarichi",
      titolo: "Persone e imprese",
      icona: Users,
      descrizione: "Responsabili, imprese esterne, qualifiche e DPI.",
      dettaglio: caricoSub
        ? "Caricamento…"
        : imprese.isError
          ? "Imprese non disponibili"
          : `${subappaltatori.length} ${subappaltatori.length === 1 ? "impresa collegata" : "imprese collegate"} · ${new Set(addettiIds).size} addetti esterni nel periodo`,
    },
    {
      id: "attrezzature",
      titolo: "Mezzi e prodotti",
      icona: Wrench,
      descrizione: "Attrezzature, manutenzioni e schede di sicurezza.",
      dettaglio: "Dati collegati all’inventario e al POS",
    },
    {
      id: "promemoria",
      titolo: "Controlli e verbali",
      icona: ClipboardList,
      descrizione: "Promemoria da valutare e verbali della commessa.",
      dettaglio: verbaliQuery.isError
        ? "Verbali non disponibili: riprova dal dettaglio"
        : "Applicabilità da confermare per il cantiere",
    },
  ];
  return (
    <div className="space-y-4" onClickCapture={e => { if (!scheda) intercettaScheda(e, d => {
      if (d.to.split(/[?#]/)[0] === `/azienda/ordini/${orderId}`) setVista(null);
      else setScheda(d);
    }); }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Sicurezza della commessa</h3>
          <p className="text-sm text-muted-foreground">
            Parti dal POS o scegli un’area. I dettagli si aprono senza lasciare
            la commessa.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Data di applicabilità
            <input
              type="date"
              className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm text-foreground"
              value={oggi}
              onChange={(e) => {
                setDataRiferimento(e.target.value || oggiRoma());
                setDocumentoSelezionato(null);
              }}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Fase
            <select
              className="mt-1 block h-9 max-w-64 rounded-md border bg-background px-2 text-sm text-foreground"
              value={faseAttiva}
              onChange={(e) => {
                setFaseScelta(e.target.value);
                setDocumentoSelezionato(null);
              }}
            >
              <option value="">Tutte le fasi</option>
              {fasi.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {fasi.isError && (
        <p
          role="alert"
          className="rounded-md border border-amber-300 p-3 text-sm text-amber-900"
        >
          Fasi non disponibili: il contesto è parziale.
        </p>
      )}
      {fontiParziali && (
        <p role="alert" className="text-sm text-amber-900">
          Alcune fonti non sono disponibili: i riepiloghi non confermano la
          completezza.
        </p>
      )}
      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border bg-background p-3 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-semibold">Il POS della commessa</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {caricoPos
                  ? "Caricamento dei POS…"
                  : posQuery.isError
                    ? "Elenco POS non disponibile. Riprova prima di crearne uno."
                    : pos.length
                      ? `${pos.length} ${pos.length === 1 ? "documento presente" : "documenti presenti"} · consulta bozze e revisioni`
                      : "Prepara la bozza con i dati della commessa, poi completa e verifica il documento."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pos.length > 0 && (
              <Button
                onClick={() => setVista("pos")}
                disabled={caricoPos || posQuery.isError}
              >
                Gestisci POS <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {!pos.length && scrive && (
              <Button
                onClick={() => void preparaPos()}
                disabled={caricoPos || posQuery.isError || creaPos.isPending}
              >
                {creaPos.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Prepara il POS
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      {erroreCreazione && (
        <p role="alert" className="text-sm text-destructive">
          {erroreCreazione}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {aree.map((a) => (
          <button
            type="button"
            key={a.id}
            aria-label={`Apri ${a.titolo}`}
            onClick={() => setVista(a.id)}
            className="group flex items-start gap-4 rounded-xl border bg-background p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
              <a.icona className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{a.titolo}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {a.descrizione}
              </span>
              <span className="mt-3 block text-xs text-muted-foreground">
                {a.dettaglio}
              </span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          </button>
        ))}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Come leggere questo riepilogo
        </summary>
        <p className="mt-2 max-w-3xl">
          La data filtra requisiti, incarichi, assegnazioni note e attrezzature
          pianificate; la fase limita le evidenze specifiche. Sono inclusi i
          documenti non limitati alla fase. Gli esiti e i POS mostrati sono
          quelli attuali: questa vista non ricostruisce uno stato storico. I
          conteggi non attestano completezza, idoneità o autorizzazione
          all’ingresso.
        </p>
      </details>
      <Dialog
        open={!!attiva}
        onOpenChange={(o) => {
          if (!o && !creaPos.isPending) setVista(null);
        }}
      >
        <DialogContent
          className="flex max-w-6xl flex-col gap-0 overflow-hidden p-0 max-h-[88dvh]"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b p-5 pr-12">
            <DialogTitle>{attiva?.gruppo}</DialogTitle>
            <DialogDescription>
              Gestisci i dettagli di questa commessa ·{" "}
              {oggi.split("-").reverse().join("/")}
              {faseAttiva
                ? ` · ${fasi.data?.find((f) => f.id === faseAttiva)?.name}`
                : " · tutte le fasi"}
            </DialogDescription>
          </DialogHeader>
          {attiva?.gruppo !== "POS" && (
            <nav
              aria-label="Sezioni del popup sicurezza"
              className="flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/30 px-4 py-2"
            >
              {sezioni
                .filter((s) => s.gruppo === attiva?.gruppo)
                .map((s) => (
                  <Button
                    key={s.id}
                    variant={vista === s.id ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={vista === s.id}
                    className="shrink-0"
                    onClick={() => {
                      setVista(s.id);
                      setDocumentoSelezionato(null);
                    }}
                  >
                    {s.titolo}
                  </Button>
                ))}
            </nav>
          )}
          <div
            key={vista}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
          >
            {vista === "quadro" && (
              <QuadroDocumentaleCommessa
                filtroIniziale={conta.registrati ? "registrati" : "tutti"}
                righe={quadro}
                caricamento={caricamento}
                parziale={fontiParziali}
                imprese={Object.fromEntries(
                  subappaltatori.map((s) => [
                    s.id,
                    s.ragione_sociale || "Impresa collegata",
                  ]),
                )}
                persone={Object.fromEntries(
                  (imprese.data?.operai ?? []).map((o) => [
                    o.id,
                    `${o.nome} ${o.cognome}`,
                  ]),
                )}
                fasi={Object.fromEntries(
                  (fasi.data ?? []).map((f) => [f.id, f.name]),
                )}
                azione={apriRiga}
                onFascicolo={scorriFascicolo}
              />
            )}
            {vista === "fascicolo" && (
              <FascicoloDocumenti
                companyId={companyId}
                orderId={orderId}
                dataRiferimento={oggi}
                faseRiferimento={faseAttiva}
                documentoSelezionato={documentoSelezionato}
                onDeseleziona={() => setDocumentoSelezionato(null)}
              />
            )}
            {vista === "incarichi" && (
              <IncarichiCantiere
                companyId={companyId}
                orderId={orderId}
                dataRiferimento={oggi}
              />
            )}
            {vista === "imprese" && (
              <ImpreseCommessa
                companyId={companyId}
                orderId={orderId}
                dataRiferimento={oggi}
                faseRiferimento={faseAttiva}
                contestoNonDisponibile={contestoParziale}
              />
            )}
            {vista === "prodotti" && (
              <ProdottiSdsCommessa
                inizialmenteAperto
                companyId={companyId}
                orderId={orderId}
                dataRiferimento={oggi}
                faseRiferimento={faseAttiva}
                fasi={fasi.data ?? []}
                contestoNonDisponibile={contestoParziale}
              />
            )}
            {vista === "attrezzature" && (
              <AttrezzatureCommessa
                inizialmenteAperto
                companyId={companyId}
                orderId={orderId}
                dataRiferimento={oggi}
                faseRiferimento={faseAttiva}
                contestoNonDisponibile={contestoParziale}
              />
            )}
            {vista === "qualifiche" && (
              <RequisitiAddettiCommessa
                inizialmenteAperto
                companyId={companyId}
                orderId={orderId}
                dataRiferimento={oggi}
                faseRiferimento={faseAttiva}
                contestoNonDisponibile={contestoParziale}
              />
            )}
            {vista === "dpi" && (
              <DpiCommessa
                companyId={companyId}
                orderId={orderId}
                dataRiferimento={oggi}
                faseRiferimento={faseAttiva}
                pos={pos}
                posNonDisponibili={posQuery.isError || caricoPos}
                contestoNonDisponibile={contestoParziale}
              />
            )}
            {vista === "promemoria" && (
              <>
                <PulsanteProfiliRequisiti companyId={companyId} />
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      Promemoria orientativi da valutare
                      {!caricamento &&
                        !fontiParziali &&
                        (aperte ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            {aperte} da sistemare
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            Controlli documentali registrati
                          </Badge>
                        ))}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Promemoria orientativi: conferma nel fascicolo quali
                      requisiti si applicano. La lista non attesta idoneità
                      dell’impresa o autorizzazione all’ingresso.{" "}
                      {subappaltatori.length
                        ? `Ci sono ${subappaltatori.length} imprese collegate. Verifica l’applicabilità dei requisiti e i documenti di ogni impresa.`
                        : "Nessuna impresa esterna collegata. La lista documentale non sostituisce la verifica tecnica del cantiere."}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {caricamento ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="divide-y rounded-lg border">
                        {voci.map((v) => {
                          const s = STILE[v.stato];
                          const Icona = s.icona;
                          return (
                            <div
                              key={v.chiave}
                              className="flex items-center gap-3 px-3 py-2.5"
                            >
                              <Icona
                                className={cn("h-5 w-5 shrink-0", s.cls)}
                                aria-label={s.testo}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">
                                  {v.titolo}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {v.dettaglio ? `${v.dettaglio} · ` : ""}
                                  {v.perche}
                                </p>
                              </div>
                              {azione(v)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
            {vista === "archivio" && (
              <>
                <Card id={`archivio-documenti-${orderId}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HardHat className="h-5 w-5 text-primary" />
                      Archivio documenti
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Quelli di questa commessa e quelli che valgono per tutta
                      l'azienda.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <DocumentiSicurezza
                      companyId={companyId}
                      orderId={orderId}
                    />
                  </CardContent>
                </Card>
              </>
            )}
            {vista === "verbali" && (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ClipboardList className="h-5 w-5 text-primary" />
                      Verbali di sicurezza
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {verbaliQuery.isLoading ? (
                      <p role="status">Caricamento verbali…</p>
                    ) : verbaliQuery.isError ? (
                      <p role="alert">
                        Verbali non disponibili. Riprova il caricamento prima di
                        considerarli assenti.{" "}
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => void verbaliQuery.refetch()}
                        >
                          Riprova
                        </Button>
                      </p>
                    ) : verbali.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nessun verbale per questa commessa.
                      </p>
                    ) : (
                      verbali.map((v) => (
                        <div
                          key={v.id}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span className="font-medium">
                            {v.data
                              ? v.data.split("-").reverse().join("/")
                              : "—"}
                          </span>
                          <Badge variant="outline" className="capitalize">
                            {(v.tipo ?? "verbale").replace(/_/g, " ")}
                          </Badge>
                          {v.esito && (
                            <span className="text-muted-foreground">
                              {v.esito}
                            </span>
                          )}
                          {v.redatto_da && (
                            <span className="text-xs text-muted-foreground">
                              · {v.redatto_da}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() =>
                        navigate("/azienda/sicurezza-cantiere?tab=verbali")
                      }
                    >
                      Tutti i verbali e le scadenze
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
            {vista === "pos" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-semibold">Bozze e revisioni del POS</h4>
                  {scrive && (
                    <Button
                      variant="outline"
                      onClick={() => void preparaPos()}
                      disabled={creaPos.isPending}
                    >
                      {creaPos.isPending ? "Preparazione…" : "Nuova bozza POS"}
                    </Button>
                  )}
                </div>
                {pos.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          POS · Revisione {p.revisione}
                        </p>
                        {i === 0 && (
                          <Badge variant="outline">Più recente</Badge>
                        )}
                        <Badge variant="secondary">
                          {p.status === "bozza"
                            ? "Bozza da completare"
                            : p.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Creato il{" "}
                        {new Date(p.created_at).toLocaleString("it-IT", {
                          timeZone: "Europe/Rome",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}{" "}
                        · Rif. {p.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate(`/azienda/sicurezza-cantiere/pos/${p.id}`)
                      }
                    >
                      Apri scheda POS <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {!pos.length && (
                  <p className="text-sm text-muted-foreground">
                    Nessun POS presente.
                  </p>
                )}
                {erroreCreazione && (
                  <p role="alert" className="text-sm text-destructive">
                    {erroreCreazione}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 justify-end border-t p-3">
            <Button
              variant="outline"
              disabled={creaPos.isPending}
              onClick={() => setVista(null)}
            >
              Torna al riepilogo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!posCreato}
        onOpenChange={(o) => {
          if (!o) setPosCreato(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bozza POS creata</DialogTitle>
            <DialogDescription>
              Il documento è stato preparato con i dati disponibili della
              commessa. Apri la scheda per completarlo e verificarlo.
            </DialogDescription>
          </DialogHeader>
          {!!posCreato?.avvisi.length && (
            <div className="max-h-52 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Da controllare nella scheda</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {posCreato.avvisi.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            La bozza non è approvata, firmata o pronta per l’utilizzo.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPosCreato(null)}>
              Resta nella commessa
            </Button>
            <Button
              onClick={() => {
                if (posCreato)
                  navigate(
                    `/azienda/sicurezza-cantiere/pos/${posCreato.pos_id}`,
                    { state: { avvisi: posCreato.avvisi } },
                  );
              }}
            >
              Apri scheda POS <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {scheda && <SchedaCommessaDialog destinazione={scheda} companyId={companyId} orderId={orderId} onClose={() => setScheda(null)} />}
      <CaricaDocumentoSicurezzaDialog
        companyId={companyId}
        orderId={orderId}
        open={!!preset}
        onOpenChange={(v) => {
          if (!v) setPreset(null);
        }}
        preset={preset ?? undefined}
      />
    </div>
  );
}
