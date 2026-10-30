import { MezziFaseCantiere } from "@/components/mezzi/PianoMezziCantiere";
import { NewPhaseMaterial } from "./NewPhaseMaterial";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  HardHat,
  Plus,
  Loader2,
  Pencil,
  Check,
  Trash2,
  Truck,
  AlertTriangle,
  X,
  ListPlus,
  ChevronDown,
  Split,
  Search,
  CalendarDays,
  MessageSquare,
  MoreHorizontal,
  UsersRound,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { matchesWorkFilter, summarizeWork, parseWorkAmount, validWorkDates, wouldDuplicateAssignment, phasePlanningIssues, type PlanningSection, type WorkFilter } from "@/lib/orders/workPlanning";
import { ElencoAssegnazioni, WorkAssignmentRow as AssignmentRow, type AssignmentPatch } from "./WorkAssignmentRow";
import { economiaFasi, type EconomiaFase } from "@/lib/orders/economiaFasi";
import { useCostiMaterialiFasi } from "@/hooks/useCostiMaterialiFasi";
import { posaPerFaseDi } from "@/lib/distinta/consumiMateriali";
import { useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { EconomiaFaseRiga, costoSforato } from "./EconomiaFaseRiga";
import { RiepilogoEconomicoFasi } from "./RiepilogoEconomicoFasi";
import { AlertScostamentoSal } from "./AlertScostamentoSal";
import { useCronoprogramma } from "@/hooks/useCronoprogramma";
import { useSottofasi } from "@/hooks/useSottofasi";
import { useAvanzamentoCommessa } from "@/hooks/useAvanzamentoCommessa";
import { SottofasiFase, type PianoSottofase } from "./SottofasiFase";
import { ModelliFasiPicker } from "./ModelliFasiPicker";
import { SalvaFasiComeModello } from "./SalvaFasiComeModello";
import { faseHaSottofasi, fineDaGiorni, type Sottofase } from "@/lib/orders/sottofasi";
import { useCalendarioCantiere, type CalendarioCantiere } from "@/hooks/useCalendarioCantiere";
import { avanzamentoFase, fasiCronoprogramma, giornoLocale, lavoroRealeFasi, type FaseCrono } from "@/lib/orders/cronoprogramma";
import { TempiFase, testoTempi, ritardoBreve } from "./TempiFase";
import { useIsMobile } from "@/hooks/use-mobile";
import { CercaConFiltri, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";

import {
  useOrderWorkPhases,
  type WorkPhase,
  type PhaseAssignment,
  type PhaseMaterial,
  type PhaseStatus,
  type ExecutorOption,
  type AssignmentSource,
  type AddAssignmentPayload,
} from "@/hooks/useOrderWorkPhases";
import {
  useOrderScheduleHealth,
  type SchedulePhaseHealth,
} from "@/hooks/useOrderScheduleHealth";
import { cn } from "@/lib/utils";
import { assignmentName, generalCrewsForPhase } from "@/lib/orders/teamWorkPlan";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { OrderLaborCosts } from "@/components/orders/OrderLaborCosts";
import { AppCantiere } from "@/components/orders/AppCantiere";
import { CantiereLogistica } from "@/components/orders/CantiereLogistica";
import { useMezziLavoro, type MezzoDellaPersona } from "@/hooks/useCantiereLogistica";
import { AZIONE_PIENA, AZIONE_TENUE } from "@/lib/manodopera/colori";
import { CreatePurchaseOrderButton } from "@/components/orders/CreatePurchaseOrderButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InternalTeamShifts, internalTeamShiftsEnabled } from "./InternalTeamShifts";
import { AddAssignmentDialog } from "./AddAssignmentDialog";
import { SquadreCommessa, SquadreFase } from "@/components/manodopera/SquadreCommessa";
import { NoteCantiere } from "@/components/manodopera/NoteCantiere";
import { useNoteCantiere, useSquadreCommessa, type NotaCantiere, type SquadraInCommessa } from "@/hooks/useOperai";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true });

const STATUS_OPTIONS: { value: PhaseStatus; label: string; dot: string; badge: string }[] = [
  {
    value: "da_iniziare",
    label: "Da iniziare",
    dot: "bg-slate-400",
    badge: "border-slate-300 bg-slate-100 text-slate-700",
  },
  {
    value: "in_corso",
    label: "In corso",
    dot: "bg-amber-500",
    badge: "border-amber-300 bg-amber-100 text-amber-800",
  },
  {
    value: "completata",
    label: "Completata",
    dot: "bg-emerald-500",
    badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
  },
];

function statusMeta(status: PhaseStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

interface OrderWorkPhasesProps {
  orderId: string;
  orderCode?: string | null;
  onOpenReports?: () => void;
  view?: "lavorazioni";
  /** Valore del contratto (imponibile, varianti approvate comprese): quanto resta da ripartire sulle lavorazioni. */
  importoContratto?: number | null;
  /** Le figure della commessa condividono l'organizzazione, senza duplicare anagrafiche o permessi. */
  organizationContent?: ReactNode;
}

export function OrderWorkPhases({ orderId, orderCode, onOpenReports, view, importoContratto, organizationContent }: OrderWorkPhasesProps) {
  const showWork = true;
  const showTeam = showWork;
  const { canEditOrders, canViewCosts, canEditOperai, canViewOrderAmounts, canViewMargins, canEditSettingsOrders } = usePermissions();
  const { role } = useAuth();
  const puoModelli = role === "company_admin" || role === "super_admin" || !!canEditSettingsOrders;
  // Squadre: le mette sulla commessa chi modifica le commesse o gli operai.
  const puoSquadre = canEditOrders || canEditOperai;
  const [aggiungiSquadra, setAggiungiSquadra] = useState(false);
  const [assegnaPersona, setAssegnaPersona] = useState(false);
  const [organizzazioneOrdine, setOrganizzazioneOrdine] = useState<string | null>(null);
  const organizzazioneAperta = organizzazioneOrdine === orderId;
  const [turniOrdine, setTurniOrdine] = useState<string | null>(null);
  const organizationRef = useRef<HTMLElement>(null);
  const squadreQuery = useSquadreCommessa(orderId);
  const { data: squadre = [] } = squadreQuery;
  const { data: note = [] } = useNoteCantiere(orderId);
  const squadreCoinvolte = [...new Map(squadre.map(x => [x.squadra_id, x])).values()];
  const squadreAttive = squadreCoinvolte.filter(x => x.attiva && !x.finita);
  const operaiInSquadra = new Set(squadreAttive.flatMap((x) => x.componenti.map((c) => c.id))).size;
  const squadreGenerali = squadre.filter((x) => !x.phase_id);
  const nomiSquadre = useMemo(() => new Map(squadre.map((x) => [x.squadra_id, x.nome])), [squadre]);
  // I mezzi di chi lavora su una fase stanno dentro la fase.
  const { data: mezziLavoro } = useMezziLavoro(orderId);
  const mezziPerFase = useMemo(() => {
    const m = new Map<string, MezzoDellaPersona[]>();
    for (const x of mezziLavoro?.con_le_persone ?? []) {
      for (const f of x.fasi ?? []) m.set(f, [...(m.get(f) ?? []), x]);
    }
    return m;
  }, [mezziLavoro]);
  // Per ogni fase: le sue squadre e le sue note (una lettura sola per tutte le fasi).
  const squadrePerFase = useMemo(() => {
    const m = new Map<string, SquadraInCommessa[]>();
    for (const x of squadre) if (x.phase_id) m.set(x.phase_id, [...(m.get(x.phase_id) ?? []), x]);
    return m;
  }, [squadre]);
  const notePerFase = useMemo(() => {
    const m = new Map<string, NotaCantiere[]>();
    for (const n of note) if (n.phase_id) m.set(n.phase_id, [...(m.get(n.phase_id) ?? []), n]);
    return m;
  }, [note]);
  const {
    phases,
    unassigned,
    isLoading,
    isError,
    refetch,
    employees,
    externalTeams,
    addPhase,
    applyTemplate,
    updatePhase,
    deletePhase,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    materialsByPhase,
    unassignedMaterials,
    materials = [],
    allAssignments = [],
    setMaterialPhase,
    splitMaterial,
  } = useOrderWorkPhases(orderId);
  const { perFase: sottofasiDi, segna: segnaSottofase, aggiungi: aggiungiSottofase, rinomina: rinominaSottofase, pianifica: pianificaSottofase, pianificaTutte: pianificaSottofasi, riordina: riordinaSottofasi, parallelo: paralleloSottofase, pesa: pesaSottofasi, elimina: eliminaSottofase } = useSottofasi(orderId);

  // Economia delle lavorazioni (06/10/2026): venduto, costo previsto e costo
  // consuntivo per fase. I costi sostenuti dei materiali si leggono solo con
  // il permesso sui costi.
  // Anche per chi vede i margini ma non i costi: senza acquisti e magazzino il
  // margine sul consuntivo uscirebbe più alto del vero.
  const { data: costiMateriali } = useCostiMaterialiFasi(orderId, canViewCosts || canViewMargins);
  // Lo stesso articolo si usa su più fasi: il costo va a ognuna per quanto il cantiere ci ha posato.
  const posaPerFase = useMemo(() => posaPerFaseDi(costiMateriali?.rapportini, materials), [costiMateriali, materials]);
  // Le voci del preventivo da cui sono nate le fasi: il previsto dove nessuno l'ha scritto.
  const { data: vociPreviste } = useVociPrevisteFasi(orderId, canViewCosts);
  const economia = useMemo(
    () => economiaFasi({
      fasi: phases,
      righe: materials,
      assegnazioni: allAssignments,
      acquisti: costiMateriali?.acquisti,
      movimenti: costiMateriali?.movimenti,
      posaPerFase,
      vociPreviste,
    }),
    [phases, materials, allAssignments, costiMateriali, posaPerFase, vociPreviste],
  );

  // Avanzamento fisico medio della commessa, per l'alert di scostamento SAL: lo
  // confronta coi costi già consumati. Una fase chiusa conta 100 anche se la %
  // salvata è a 0 (stessa regola del Cronoprogramma e del trigger del database).
  const avanzamentoMedio = useMemo(() => {
    if (phases.length === 0) return null;
    const somma = phases.reduce((s, p) => s + avanzamentoFase(p), 0);
    return Math.round(somma / phases.length);
  }, [phases]);
  const { daMostrare: avanzamentoDellaCommessa } = useAvanzamentoCommessa(orderId);

  // Tempi previsti e reali di ogni fase (06/10/2026), per il paragone nella
  // riga «Quando»: date reali dai rapportini e dalla chiusura, come nel
  // Cronoprogramma. Se i rapportini non si leggono, restano le chiusure.
  const { rapportini } = useCronoprogramma(orderId, null);
  const oggi = giornoLocale(new Date().toISOString());
  const calendario = useCalendarioCantiere();
  const tempiFasi = useMemo(
    () => new Map(fasiCronoprogramma(
      phases.map((p) => ({ id: p.id, name: p.name, status: p.status, percentuale: p.percentuale, start_date: p.start_date, end_date: p.end_date, completata_il: p.completata_il ?? null })),
      lavoroRealeFasi(rapportini ?? []),
      oggi,
    ).map((f) => [f.id, f])),
    [phases, rapportini, oggi],
  );

  // Semaforo tempi: atteso vs reale per le fasi con date (match per id fase)
  const { data: scheduleHealth } = useOrderScheduleHealth(orderId);
  const healthByPhaseId = useMemo(() => {
    const map = new Map<string, SchedulePhaseHealth>();
    for (const f of scheduleHealth?.fasi ?? []) map.set(f.id, f);
    return map;
  }, [scheduleHealth]);

  const [newPhaseOpen, setNewPhaseOpen] = useState(false);
  const [phaseCreationMode, setPhaseCreationMode] = useState<"manuale" | "modello">("manuale");
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [search, setSearch] = useState("");
  const [completedVisibility, setCompletedVisibility] = useState<{orderId: string; value: boolean} | null>(null);
  const phaseList = useRef<HTMLDivElement>(null);
  // Telefono (06/10/2026): in Lavorazioni conteggio e «Aggiungi fasi» su una
  // riga, ricerca col bottone dei filtri (pannello dal basso), le fasi come
  // righe e le completate in fondo. Sotto i 768px, come il resto della commessa.
  const isMobile = useIsMobile();
  const telefono = isMobile && view === "lavorazioni";
  const [filtriAperti, setFiltriAperti] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const squadreGeneraliPerFase = useMemo(() => new Map(phases.map(p => [p.id, generalCrewsForPhase(p, squadre)])), [phases, squadre]);
  const fasiConSquadra = useMemo(() => new Set([...squadre.filter((x) => x.phase_id).map((x) => x.phase_id as string), ...phases.filter(p => (squadreGeneraliPerFase.get(p.id)?.length ?? 0) > 0).map(p => p.id)]), [squadre, phases, squadreGeneraliPerFase]);
  const summary = summarizeWork(phases, unassigned, today, fasiConSquadra);
  const matchesFilter = (p: WorkPhase, value: WorkFilter) => matchesWorkFilter(p, value, today, fasiConSquadra) || (value === "attention" &&
    phasePlanningIssues(p, fasiConSquadra.has(p.id), (materialsByPhase.get(p.id) ?? []).filter(m => m.readiness === "da_ordinare").length).length > 0);
  const attentionCount = phases.filter(p => matchesFilter(p, "attention")).length;
  const phaseOptions = phases.map(p => ({ id: p.id, name: p.name }));
  const completedCount = phases.filter(p => p.status === "completata").length;
  const showCompleted = completedVisibility?.orderId === orderId ? completedVisibility.value
    : false;
  const setShowCompleted = (toggle: (value: boolean) => boolean) => setCompletedVisibility({orderId, value: toggle(showCompleted)});
  const groupCompleted = filter === "all" && !search.trim();
  // Filtri e ricerca servono con tante fasi, o se sono già in uso.
  const mostraFiltri = phases.length > 6 || filter !== "all" || !!search.trim();
  const visiblePhases = phases.filter(p => matchesFilter(p, filter) && p.name.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")) && (!view || !groupCompleted || showCompleted || p.status !== "completata"));
  const [newPhaseName, setNewPhaseName] = useState("");

  const closePhaseDialog = () => {
    setNewPhaseOpen(false);
    setNewPhaseName("");
    setPhaseCreationMode("manuale");
  };

  const handleAddPhase = () => {
    if (!canEditOrders || addPhase.isPending || applyTemplate.isPending) return;
    const name = newPhaseName.trim();
    if (!name) {
      toast.error("Inserisci il nome della fase");
      return;
    }
    addPhase.mutate(name, {
      onSuccess: () => {
        closePhaseDialog();
        toast.success("Fase aggiunta");
      },
    });
  };

  const saveAssignment = async (id: string, source: AssignmentSource, patch: AssignmentPatch) => {
    const all = [...unassigned, ...phases.flatMap(p => p.assignments)];
    const current = all.find(a => a.id === id && a.source === source);
    if (current && patch.phase_id !== undefined && wouldDuplicateAssignment(all, current, patch.phase_id)) {
      const message = "Questa persona o squadra è già assegnata alla lavorazione scelta. Gestisci la riga esistente.";
      toast.error(message);
      throw new Error(message);
    }
    return updateAssignment.mutateAsync({ id, source, patch });
  };

  // Le azioni della scheda: in cima da sole fuori dalla commessa, sulla riga
  // del riepilogo dentro la commessa (06/10/2026: prima una riga intera vuota
  // col solo «Aggiungi fasi»).
  const azioniCommessa = (canEditOrders || puoSquadre) ? (
          <>
            {/* Tre cose sole, sempre nello stesso ordine: le fasi, chi lavora,
                e (a parte) persone e ditte con i costi. */}
            {canEditOrders && showWork && (
              <Button size="sm" className={cn("border border-orange-700 bg-orange-700 px-4 font-semibold text-white shadow-sm hover:bg-orange-800 max-sm:flex-1", telefono ? "tap-compact h-9" : "max-sm:min-h-11")} onClick={() => setNewPhaseOpen(true)}>
                <ListPlus className="mr-1 h-4 w-4" />Aggiungi fasi
              </Button>
            )}
            {showTeam && (canEditOrders || puoSquadre) && <>
              <Button size="sm" variant="outline" className="min-h-9 font-semibold" onClick={() => setAssegnaPersona(true)}><UsersRound className="mr-1 h-4 w-4" />Assegna</Button>
              <AddAssignmentDialog orderId={orderId}
              aperto={assegnaPersona} onAperto={setAssegnaPersona}
              phaseId={null}
              employees={employees}
              externalTeams={externalTeams}
              phases={phaseOptions}
              existingAssignments={[...unassigned, ...phases.flatMap(p => p.assignments)]}
              triggerLabel="Assegna"
              triggerVariant="outline"
              triggerClassName={view ? "border border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50" : AZIONE_PIENA.persona}
              onAdd={(payload, opts) => addAssignment.mutate(payload, opts)}
            /></>}
            {canEditOrders && <>
            <Dialog open={newPhaseOpen} onOpenChange={(o) => (o ? setNewPhaseOpen(true) : closePhaseDialog())}>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Aggiungi una fase</DialogTitle>
                  <DialogDescription>Scrivi una fase oppure usa un modello con più fasi.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2" aria-label="Come aggiungere le fasi"><Button variant={phaseCreationMode === "manuale" ? "default" : "outline"} aria-pressed={phaseCreationMode === "manuale"} onClick={() => setPhaseCreationMode("manuale")}>Scrivi una fase</Button><Button variant={phaseCreationMode === "modello" ? "default" : "outline"} aria-pressed={phaseCreationMode === "modello"} onClick={() => setPhaseCreationMode("modello")}>Usa un modello</Button></div>
                  {/* Modelli di fasi: quelli dell'azienda (con le sottofasi); finché non sono suoi, gli stessi di sempre */}
                  {phaseCreationMode === "modello" && <ModelliFasiPicker
                    inCorso={applyTemplate.isPending}
                    onApplica={(fasi) =>
                      applyTemplate.mutate(fasi, {
                        onSuccess: () => {
                          toast.success(`${fasi.length} fasi aggiunte`);
                          closePhaseDialog();
                        },
                      })
                    }
                  />}

                  {/* Singola fase manuale */}
                  {phaseCreationMode === "manuale" && <div className="space-y-2">
                    <Label
                      htmlFor="new-phase-name"
                      className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Aggiungi una singola fase
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        id="new-phase-name"
                        value={newPhaseName}
                        placeholder="Es. Opere murarie"
                        onChange={(e) => setNewPhaseName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddPhase();
                          }
                        }}
                      />
                      <Button
                        aria-label="Aggiungi fase"
                        onClick={handleAddPhase}
                        disabled={addPhase.isPending || !newPhaseName.trim()}
                      >
                        {addPhase.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        <span className="ml-1">Aggiungi</span>
                      </Button>
                    </div>
                  </div>}

                  {/* Un modello dalle fasi di questa commessa: solo da computer e solo a chi gestisce le impostazioni */}
                  {puoModelli && phases.length > 0 && !isMobile && (
                    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Salva le fasi attuali come modello</summary><div className="mt-3">
                      <SalvaFasiComeModello orderId={orderId} numeroFasi={phases.length} />
                    </div></details>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            </>}
          </>
  ) : null;

  return (
    // Da telefono niente riquadro attorno: le fasi sono già righe-riquadro
    // (niente card dentro card), e la larghezza va alle fasi.
    <Card className={cn("shadow-none", telefono && "border-0 bg-transparent")}>
      <CardHeader className={cn("gap-3", telefono ? "p-0 pb-2" : "p-3", view ? "sm:px-4 sm:pb-2 sm:pt-3" : "sm:p-6")}>
        <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", view && "contents")}>
          {/* Dentro le schede della commessa il titolo ripeterebbe la scheda stessa
              e la sua descrizione: resta solo per chi usa uno screen reader. */}
          <div className={cn("space-y-1", view && "sr-only")}>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardHat className="h-5 w-5 text-primary" />
            {view ? "Lavorazioni" : "Lavori e squadre"}
          </CardTitle>
          <p className="text-sm text-muted-foreground max-sm:hidden">Segui le fasi del lavoro. Apri una fase per gestirne i dettagli.</p>
          </div>

          {!view && (canEditOrders || puoSquadre) && <div className="flex flex-wrap items-center gap-2">
            {azioniCommessa}
          </div>}
        </div>

        {/* Una riga al posto dei riquadri: quante squadre, operai, ditte e
            lavorazioni, e i collegamenti ad app e rapportini. */}
        {(view || (!isLoading && !isError)) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
            {telefono ? (!isLoading && !isError && <span className="min-w-0 shrink-0 tabular-nums">
              <b className="font-semibold text-slate-900">{phases.length}</b> {phases.length === 1 ? "fase" : "fasi"}
              {summary.active > 0 && <> · {summary.active} in corso</>}
            </span>) : !isLoading && !isError && <span className="tabular-nums">
              <b className="font-semibold text-slate-900">{phases.length}</b> {phases.length === 1 ? "fase" : "fasi"}
              {summary.active > 0 && <> ({summary.active} in corso)</>}
              {(!view || squadreAttive.length > 0) && <>{" · "}<b className="font-semibold text-slate-900">{squadreAttive.length}</b> {squadreAttive.length === 1 ? "squadra" : "squadre"}</>}
              {operaiInSquadra > 0 && <>{" · "}<b className="font-semibold text-slate-900">{operaiInSquadra}</b> {operaiInSquadra === 1 ? "operaio in squadra" : "operai in squadra"}</>}
              {summary.employees > 0 && <>{" · "}<b className="font-semibold text-slate-900">{summary.employees}</b> {summary.employees === 1 ? "operaio assegnato individualmente" : "operai assegnati individualmente"}</>}
              {summary.teams > 0 && <> · <b className="font-semibold text-slate-900">{summary.teams}</b> {summary.teams === 1 ? "ditta" : "ditte"}</>}
              {(!view || note.length > 0) && <>{" · "}<b className="font-semibold text-slate-900">{note.length}</b> {note.length === 1 ? "nota" : "note"}</>}
            </span>}
            <span className={cn("flex flex-wrap items-center gap-1.5 sm:ml-auto", telefono ? "min-w-0 flex-1 justify-end" : "max-sm:w-full")}>
              {/* Mobile: due azioni compatte, le assegnazioni in un unico menu. */}
              {!telefono && onOpenReports && <Button variant="ghost" size="sm" className="h-8" aria-label="Vai ai rapportini" onClick={onOpenReports}>Rapportini</Button>}
              {!telefono && showWork && attentionCount > 0 && <Button variant="ghost" size="sm" className="h-8 text-amber-700" onClick={() => {
                setFilter("attention"); setSearch(""); phaseList.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}><AlertTriangle className="mr-1.5 h-4 w-4" />Verifica {attentionCount} lavorazioni</Button>}
              {view && azioniCommessa}
            </span>
          </div>
        )}

        {showTeam && <section ref={organizationRef} id="section-squadra" aria-label="Responsabili e assegnazioni generali" className="space-y-3 scroll-mt-24">
          {!isLoading && !isError && <>
          <AppCantiere orderId={orderId} modificabile={puoSquadre} nomiSquadre={nomiSquadre} compact gestione organizzazione={{
            aperta: organizzazioneAperta,
            riepilogo: squadreQuery.isError ? "squadre non disponibili" : squadreQuery.isLoading ? "caricamento squadre…" : `${squadreGenerali.length ? `Squadra commessa: ${squadreGenerali.slice(0, 2).map(s => `${s.nome}${!s.attiva || s.finita ? " (storico)" : ""}`).join(", ")}${squadreGenerali.length > 2 ? ` +${squadreGenerali.length - 2}` : ""}` : "nessuna squadra generale"}${unassigned.length ? ` · ${unassigned.length} persone / ditte generali` : ""}`,
            onGestione: () => setOrganizzazioneOrdine(organizzazioneAperta ? null : orderId),
            onTurni: canEditOrders && internalTeamShiftsEnabled ? () => setTurniOrdine(orderId) : undefined,
          }} />
          <div id={`organization-body-${orderId}`} hidden={!organizzazioneAperta} className="space-y-3">
          {squadreQuery.isError ? <div role="alert" className="rounded-lg border border-rose-200 p-3 text-sm">Squadre non disponibili. <Button variant="outline" size="sm" onClick={() => void squadreQuery.refetch()}>Riprova squadre</Button></div> : squadreQuery.isLoading ? <p role="status" className="text-xs text-muted-foreground">Caricamento squadre…</p> : squadreCoinvolte.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Capisquadra della commessa">{squadreCoinvolte.map(s => <span key={s.squadra_id} className="rounded-lg border bg-white px-3 py-2 text-sm"><b>{s.nome}</b><span className="ml-2 text-muted-foreground">Caposquadra: {s.responsabile ? `${s.responsabile.nome} ${s.responsabile.cognome}` : "da impostare"}{!s.attiva || s.finita ? " · storico" : ""}</span></span>)}{puoSquadre && <a className="self-center text-xs font-medium underline" href="/azienda/manodopera?tab=operai&vista=squadre">Gestisci capisquadra</a>}</div>}
          {organizzazioneAperta && (squadreGenerali.length > 0 || unassigned.length > 0) && <section aria-label="Assegnazioni per tutta la commessa" className="rounded-lg border px-3 py-2 text-sm">
            <h3 className="font-medium">Assegnazioni per tutta la commessa · {unassigned.length} persone / ditte · {squadreGenerali.length} squadre</h3>
            <div className="mt-3 space-y-3">
              {squadreGenerali.length > 0 && <SquadreCommessa orderId={orderId} modificabile={puoSquadre} aggiungiAperto={aggiungiSquadra} onAggiungiAperto={setAggiungiSquadra} />}
              {unassigned.length > 0 && <UnassignedCard hasPhases={phases.length > 0} assignments={unassigned} employees={employees} externalTeams={externalTeams} phases={phaseOptions} onUpdateAssignment={saveAssignment} onDeleteAssignment={(id, source) => deleteAssignment.mutateAsync({ id, source })} />}
            </div>
          </section>}
          </div>
          </>}
          {organizationContent}
        </section>}
        <Dialog open={turniOrdine === orderId} onOpenChange={open => setTurniOrdine(open ? orderId : null)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{canEditOrders ? "Pianifica turni di lavoro" : "Turni di lavoro"}</DialogTitle><DialogDescription>Organizza i giorni di presenza. Le ore lavorate arrivano dai rapportini.</DialogDescription></DialogHeader>{turniOrdine === orderId && <InternalTeamShifts key={orderId} orderId={orderId} teams={externalTeams} phases={phaseOptions} canPlan={canEditOrders} />}</DialogContent></Dialog>

        {/* Economia delle lavorazioni (06/10/2026): venduto, costo previsto e
            consuntivo fase per fase, al posto del riepilogo della sola
            manodopera. Solo in Lavorazioni e quando c'è qualcosa da sommare. */}
        {showWork && (canViewCosts || canViewOrderAmounts) && !isLoading && !isError && (phases.length > 0 || unassigned.length > 0) && (
          <RiepilogoEconomicoFasi
            economia={economia}
            fasi={phases}
            importoContratto={importoContratto}
            vedeVenduto={canViewOrderAmounts}
            vedeCosti={canViewCosts}
            vedeMargini={canViewMargins}
            onSalvaVenduto={canEditOrders && canViewOrderAmounts ? (id, importo) => updatePhase.mutate({ id, importo_venduto: importo }) : undefined}
          />
        )}
        {/* Alert scostamento SAL: avanzamento dichiarato vs costi consumati.
            Si vede solo se l'azienda l'ha acceso in Governance e c'è il permesso costi. */}
        {showWork && canViewCosts && !isLoading && !isError && phases.length > 0 && (
          <AlertScostamentoSal
            avanzamentoPerc={avanzamentoDellaCommessa(avanzamentoMedio)}
            costoPrevisto={economia.totaleFasi.costoPrevisto}
            costoConsuntivo={economia.totaleFasi.costoConsuntivo}
            className="mt-2 max-sm:hidden"
          />
        )}
      </CardHeader>

      <CardContent className={cn(telefono ? "space-y-2 px-0 pb-0" : "px-3 pb-3", !telefono && (view ? "space-y-3 sm:px-4 sm:pb-4" : "space-y-5 sm:px-6 sm:pb-6"))}>
        {/* Dove si trova, quanta strada dalla sede, mezzi e attrezzi */}

        {/* Commessa appena aperta: tre passi, invece di tre riquadri vuoti. */}
        {!isLoading && !isError && phases.length === 0 && unassigned.length === 0 && squadre.length === 0 && (
          <GuidaCantiere
            puoFasi={canEditOrders}
            puoSquadre={puoSquadre}
            onFasi={() => setNewPhaseOpen(true)}
            onSquadra={() => setAssegnaPersona(true)}
          />
        )}

        {showWork && <>
        <div ref={phaseList} className="scroll-mt-24" />
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento lavorazioni…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-rose-200 bg-rose-50/40 py-10 text-center">
            <p className="max-w-md text-sm text-rose-700">
              Impossibile caricare le lavorazioni. Controlla la connessione e riprova.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <Loader2 className="mr-1 h-4 w-4" /> Riprova
            </Button>
          </div>
        ) : phases.length === 0 && unassigned.length === 0 ? (
          // La guida qui sopra spiega già da dove partire.
          null
        ) : (
          <>
            {/* Una riga sola (06/10/2026): titolo, filtri, ricerca e completate
                stavano su quattro righe, con tanto spazio vuoto. */}
            {telefono ? (mostraFiltri || attentionCount > 0) && (
              <CercaConFiltri
                valore={search}
                onCambia={setSearch}
                segnaposto="Cerca una lavorazione"
                filtriAttivi={filter !== "all" ? 1 : 0}
                onApriFiltri={() => setFiltriAperti(true)}
              />
            ) : <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Fasi di lavoro</h3>
              {mostraFiltri && <div className="flex flex-wrap gap-1" aria-label="Filtra lavorazioni">
                {([["all", "Tutte"], ["in_corso", "In corso"], ["da_iniziare", "Da iniziare"], ["attention", "Da organizzare"], ["completata", "Completate"]] as const).map(([value, label]) =>
                  <Button key={value} size="sm" className="h-8" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}
              </div>}
              {mostraFiltri && <div className="relative min-w-[12rem] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" aria-label="Cerca lavorazione" placeholder="Cerca una lavorazione…" value={search} onChange={e => setSearch(e.target.value)} /></div>}
              {view && groupCompleted && completedCount > 0 && <Button variant="outline" size="sm" className={cn("h-8", !mostraFiltri && "ml-auto")} aria-expanded={showCompleted} onClick={() => setShowCompleted(value => !value)}>{showCompleted ? "Nascondi" : "Mostra"} {completedCount} {completedCount === 1 ? "fase completata" : "fasi completate"}</Button>}
            </div>}
            {telefono && (
              <PannelloFiltri
                aperto={filtriAperti}
                onAperto={setFiltriAperti}
                attivi={filter !== "all" ? 1 : 0}
                onAzzera={() => setFilter("all")}
                risultati={visiblePhases.length}
                titolo="Lavorazioni"
              >
                <PilloleFiltro<WorkFilter>
                  titolo="Mostra"
                  valore={filter}
                  onScegli={setFilter}
                  scelte={([["all", "Tutte"], ["in_corso", "In corso"], ["da_iniziare", "Da iniziare"], ["attention", "Da organizzare"], ["completata", "Completate"]] as const)
                    .map(([value, label]) => ({ value, label, n: phases.filter((p) => matchesFilter(p, value)).length }))}
                />
              </PannelloFiltri>
            )}
            {phases.length > 0 && visiblePhases.length === 0 && <p role="status" className="py-3 text-sm text-muted-foreground">{view && groupCompleted && completedCount > 0 && !showCompleted ? "Le lavorazioni sono completate. Verifica eventuali attività aperte e il collaudo prima della consegna." : "Nessuna lavorazione corrisponde ai filtri."}</p>}
            {view === "lavorazioni" && phases.length > 0 && completedCount === phases.length && visiblePhases.length > 0 && <p role="status" className="text-xs text-muted-foreground">Le lavorazioni sono completate. Verifica eventuali attività aperte e il collaudo prima della consegna.</p>}
            {visiblePhases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                health={healthByPhaseId.get(phase.id)}
                employees={employees}
                externalTeams={externalTeams}
                materials={materialsByPhase.get(phase.id) ?? []}
                economia={economia.perFase.get(phase.id)}
                tempi={tempiFasi.get(phase.id)}
                oggi={oggi}
                unassignedMaterials={unassignedMaterials}
                allPhases={phases.map((p) => ({ id: p.id, name: p.name }))}
                allAssignments={[...unassigned, ...phases.flatMap(p => p.assignments)]}
                orderId={orderId}
                orderCode={orderCode}
                onAssignMaterial={(itemId, phaseId) => setMaterialPhase.mutate({ itemId, phaseId })}
                onSplitMaterial={(itemId, parts, opts) =>
                  splitMaterial.mutate({ itemId, parts }, opts)
                }
                onUpdatePhase={(patch) => updatePhase.mutate({ id: phase.id, ...patch })}
                onDeletePhase={() => deletePhase.mutate(phase.id)}
                onAddAssignment={(payload, opts) => addAssignment.mutate(payload, opts)}
                onUpdateAssignment={(id, source, patch) =>
                  saveAssignment(id, source, patch)
                }
                onDeleteAssignment={(id, source) => deleteAssignment.mutateAsync({ id, source })}
                squadreFase={squadrePerFase.get(phase.id) ?? []}
                squadreGenerali={(squadreGeneraliPerFase.get(phase.id) ?? []).filter(s => !squadrePerFase.get(phase.id)?.some(q => q.squadra_id === s.squadra_id))}
                onManageGeneral={() => { setOrganizzazioneOrdine(orderId); organizationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                noteFase={notePerFase.get(phase.id)?.length ?? 0}
                mezziFase={mezziPerFase.get(phase.id) ?? []}
                puoSquadre={puoSquadre}
                fasiOpzioni={phaseOptions}
                sottofasi={sottofasiDi.get(phase.id) ?? []}
                azioniSottofasi={{
                  onSegna: (id, fatta) => segnaSottofase.mutate({ id, fatta }),
                  onAggiungi: (nome) => aggiungiSottofase.mutate({ phaseId: phase.id, nome }),
                  onRinomina: (id, nome) => rinominaSottofase.mutate({ id, nome }),
                  onPianifica: (id, piano) => pianificaSottofase.mutate({ id, ...piano }),
                  onPesa: (pesi) => pesaSottofasi.mutate(pesi),
                  onPianificaTutte: (passi) => pianificaSottofasi.mutate(passi),
                  onRiordina: (ids) => riordinaSottofasi.mutate(ids),
                  onParallelo: (id, inParallelo) => paralleloSottofase.mutate({ id, in_parallelo: inParallelo }),
                  onElimina: (id) => eliminaSottofase.mutate(id),
                  calendario,
                  fasiDopo: phases.filter((p) => p.position > phase.position).map((p) => ({ id: p.id, name: p.name, start_date: p.start_date, end_date: p.end_date })),
                  // Le fasi dopo scorrono tutte dello stesso tanto: le squadre che le seguono con loro.
                  onSpostaFasiDopo: (giorni, ids) => {
                    for (const p of phases) {
                      if (!ids.includes(p.id) || !p.start_date) continue;
                      updatePhase.mutate({ id: p.id, start_date: fineDaGiorni(p.start_date, giorni + 1), end_date: p.end_date ? fineDaGiorni(p.end_date, giorni + 1) : null });
                    }
                  },
                }}
              />
            ))}
            {/* Da telefono le completate si aprono in fondo, dopo quelle da fare */}
            {telefono && view && groupCompleted && completedCount > 0 && (
              <Button variant="ghost" size="sm" className="tap-compact h-9 w-full text-slate-600" aria-expanded={showCompleted} onClick={() => setShowCompleted(value => !value)}>
                {showCompleted ? "Nascondi le completate" : `Mostra ${completedCount} ${completedCount === 1 ? "fase completata" : "fasi completate"}`}
              </Button>
            )}

          </>
        )}
        </>}

        {/* Le ditte in subappalto (DURC e contratto), solo se ce ne sono. */}
        {showTeam && <>
          <details className="rounded-lg border px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">Istruzioni per il cantiere{note.length > 0 ? ` (${note.length})` : ""}</summary><div className="mt-3"><NoteCantiere orderId={orderId} fasi={phaseOptions} modificabile={puoSquadre} /></div></details>
          <OrderLaborCosts orderId={orderId} editable={canEditOrders} embedded parte="ditte" compact />
          <details className="rounded-lg border px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">Indirizzo e viaggio</summary><div className="mt-3"><CantiereLogistica orderId={orderId} showSiteEquipment={false} /></div></details>
        </>}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Commessa appena aperta: come si organizza il cantiere, in tre passi  */
/* ------------------------------------------------------------------ */

function GuidaCantiere({ puoFasi, puoSquadre, onFasi, onSquadra }: {
  puoFasi: boolean;
  puoSquadre: boolean;
  onFasi: () => void;
  onSquadra: () => void;
}) {
  const passi = [
    { n: 1, titolo: "Dividi il lavoro in fasi", testo: "Demolizioni, impianti, posa… da un modello o una alla volta, con le date." },
    { n: 2, titolo: "In ogni fase, scegli chi la fa", testo: "Una squadra, una persona o una ditta. Chi ha l'app si trova il cantiere sul telefono." },
    { n: 3, titolo: "Lascia le istruzioni", testo: "Note per tutti, per una squadra o per una persona: le leggono nell'app e sai chi le ha lette." },
  ];
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
      <p className="text-sm font-semibold text-slate-900">Come si organizza questo cantiere</p>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {passi.map((p) => (
          <li key={p.n} className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">{p.n}</span>
            <span className="text-sm">
              <span className="block font-medium text-slate-900">{p.titolo}</span>
              <span className="block text-slate-600">{p.testo}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {puoFasi && (
          <Button size="sm" onClick={onFasi} className="bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white hover:from-orange-600 hover:to-amber-600">
            <ListPlus className="mr-1 h-4 w-4" />Scegli le fasi
          </Button>
        )}
        {puoSquadre && (
          <span className="text-sm text-slate-600">
            Lavoro semplice, senza fasi?{" "}
            <button type="button" onClick={onSquadra} className="font-medium text-orange-700 hover:underline">Assegna chi lavora a tutta la commessa</button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phase card                                                          */
/* ------------------------------------------------------------------ */

interface PhaseCardProps {
  phase: WorkPhase;
  /** Venduto, costo previsto e costo consuntivo della fase (economiaFasi). */
  economia?: EconomiaFase;
  /** Date previste e reali e ritardi della fase (cronoprogramma). */
  tempi?: FaseCrono;
  /** Oggi, «yyyy-MM-dd». */
  oggi: string;
  /** Atteso vs reale a oggi (RPC order_schedule_health), solo per fasi datate */
  health?: SchedulePhaseHealth;
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  materials: PhaseMaterial[];
  unassignedMaterials: PhaseMaterial[];
  allPhases: { id: string; name: string }[];
  allAssignments: PhaseAssignment[];
  orderId: string;
  orderCode?: string | null;
  onAssignMaterial: (itemId: string, phaseId: string | null) => void;
  onSplitMaterial: (
    itemId: string,
    parts: { phaseId: string | null; quantity: number }[],
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
  onUpdatePhase: (patch: {
    name?: string;
    status?: PhaseStatus;
    start_date?: string | null;
    end_date?: string | null;
    percentuale?: number;
    importo_venduto?: number | null;
  }) => void;
  onDeletePhase: () => void;
  onAddAssignment: (
    payload: AddAssignmentPayload,
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
  onUpdateAssignment: (id: string, source: AssignmentSource, patch: AssignmentPatch) => Promise<unknown>;
  onDeleteAssignment: (id: string, source: AssignmentSource) => Promise<unknown>;
  /** Squadre che fanno questa fase. */
  squadreFase: SquadraInCommessa[];
  squadreGenerali: SquadraInCommessa[];
  onManageGeneral: () => void;
  /** Quante note per gli operai su questa fase. */
  noteFase: number;
  /** Mezzi e attrezzi di chi lavora su questa fase. */
  mezziFase: MezzoDellaPersona[];
  puoSquadre: boolean;
  fasiOpzioni: { id: string; name: string }[];
  /** Le sottofasi della fase: se ce ne sono, la percentuale ne deriva. */
  sottofasi: Sottofase[];
  azioniSottofasi: {
    onSegna: (id: string, fatta: boolean) => void;
    onAggiungi: (nome: string) => void;
    onRinomina: (id: string, nome: string) => void;
    onPianifica: (id: string, piano: PianoSottofase) => void;
    onPesa: (pesi: Array<{ id: string; peso: number }>) => void;
    onPianificaTutte: (passi: Array<{ id: string } & PianoSottofase>) => void;
    onRiordina: (ids: string[]) => void;
    onParallelo: (id: string, inParallelo: boolean) => void;
    onElimina: (id: string) => void;
    calendario: CalendarioCantiere;
    fasiDopo: Array<{ id: string; name: string; start_date: string | null; end_date: string | null }>;
    onSpostaFasiDopo: (giorni: number, ids: string[]) => void;
  };
}

function PhaseCard({
  phase,
  economia,
  tempi,
  oggi,
  health,
  employees,
  externalTeams,
  materials,
  unassignedMaterials,
  allPhases,
  allAssignments,
  orderId,
  orderCode,
  onAssignMaterial,
  onSplitMaterial,
  onUpdatePhase,
  onDeletePhase,
  onAddAssignment,
  onUpdateAssignment,
  onDeleteAssignment,
  squadreFase,
  squadreGenerali,
  onManageGeneral,
  noteFase,
  mezziFase,
  puoSquadre,
  fasiOpzioni,
  sottofasi,
  azioniSottofasi,
}: PhaseCardProps) {
  const { canEditOrders, canViewCosts, canViewOrderAmounts, canViewMargins, canViewMezzi } = usePermissions();
  const [eliminaAperto, setEliminaAperto] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(phase.name);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState("");
  // Aperta di default solo se i lavori sono in corso: è la fase su cui si opera
  const [open, setOpen] = useState(() => phase.status === "in_corso");
  const [targetSection, setTargetSection] = useState<{ section: PlanningSection } | null>(null);
  const consumedTarget = useRef<typeof targetSection>(null);
  const datesRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);
  const materialsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !targetSection || consumedTarget.current === targetSection) return;
    const section = { dates: datesRef, people: peopleRef, materials: materialsRef }[targetSection.section].current;
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ behavior: "smooth", block: "center" });
    consumedTarget.current = targetSection;
  }, [open, targetSection]);
  const isMobile = useIsMobile();

  const meta = statusMeta(phase.status);

  // Materiali scoperti (né in magazzino né già ordinati) → candidati all'OdA
  const missingMaterials = useMemo(
    () => materials.filter((m) => m.readiness === "da_ordinare"),
    [materials]
  );
  // "Pronti" = coperti da giacenza o da un OdA
  const prontiCount = materials.length - missingMaterials.length;
  const planningIssues = phasePlanningIssues(phase, squadreFase.length > 0 || squadreGenerali.length > 0, missingMaterials.length);

  // Avviso: fase non completata in partenza entro 7 giorni con materiali da ordinare
  const startWarning = useMemo(() => {
    if (phase.status === "completata" || missingMaterials.length === 0 || !phase.start_date) {
      return null;
    }
    const start = parseISO(phase.start_date);
    if (!isValid(start)) return null;
    const days = differenceInCalendarDays(start, new Date());
    return days >= 0 && days <= 7 ? format(start, "dd/MM") : null;
  }, [phase.status, phase.start_date, missingMaterials.length]);

  // Date previste formattate per il riepilogo compatto (visibili a fase chiusa)
  const plannedDates = useMemo(() => {
    const fmt = (iso: string | null) => {
      if (!iso) return null;
      const d = parseISO(iso);
      return isValid(d) ? format(d, "dd/MM") : null;
    };
    return { start: fmt(phase.start_date), end: fmt(phase.end_date) };
  }, [phase.start_date, phase.end_date]);

  // Chi la fa: squadre della fase, poi persone e ditte (le righe dei costi).
  const chiLaFa = useMemo(() => {
    const out: { chiave: string; nome: string; colore: string | null }[] = squadreFase.map((q) => ({
      chiave: `s-${q.squadra_id}`, nome: q.nome, colore: q.colore ?? "#94A3B8",
    }));
    for (const a of phase.assignments) {
      const nome = assignmentName(a, employees, externalTeams);
      out.push({ chiave: `${a.source}-${a.id}`, nome: `${nome}${a.executor_inactive ? " (storico)" : ""}`, colore: null });
    }
    return out;
  }, [squadreFase, phase.assignments, employees, externalTeams]);

  const commitName = () => {
    const name = nameDraft.trim();
    setEditingName(false);
    if (name && name !== phase.name) {
      onUpdatePhase({ name });
    } else {
      setNameDraft(phase.name);
    }
  };

  const campoNome = (classe: string) => (
    <Input
      autoFocus
      value={nameDraft}
      aria-label={`Nome della fase ${phase.name}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setNameDraft(e.target.value)}
      onBlur={commitName}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitName();
        } else if (e.key === "Escape") {
          setNameDraft(phase.name);
          setEditingName(false);
        }
      }}
      className={classe}
    />
  );
  const tendinaStato = (classe: string) => (
    <Select value={phase.status} disabled={derivata} onValueChange={(v) => onUpdatePhase({ status: v as PhaseStatus })}>
      <SelectTrigger className={classe} aria-label={`Stato di ${phase.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const menuFase = (classe: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={classe} aria-label={`Altre azioni per ${phase.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => { setNameDraft(phase.name); setEditingName(true); }}>
          <Pencil className="mr-2 h-4 w-4" />Rinomina
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onSelect={() => setEliminaAperto(true)}>
          <Trash2 className="mr-2 h-4 w-4" />Elimina fase
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const actualPct = phase.status === "completata" ? 100 : phase.percentuale;
  // Con le sottofasi la percentuale e lo stato li calcola il database: a mano
  // verrebbero riscritti alla prossima spunta.
  const derivata = faseHaSottofasi(sottofasi);
  const pctInRitardo = !!health && Number(health.delta_pct) < 0 && phase.status !== "completata";

  return (
    <Card
      className={cn(
        // Accento colorato a sinistra: stato della fase visibile anche da chiusa
        "border-muted border-l-2 shadow-none",
        phase.status === "completata"
          ? "border-l-emerald-400"
          : phase.status === "in_corso"
            ? "border-l-amber-400"
            : "border-l-slate-200",
      )}
    >
      {isMobile && (
        // Telefono (06/10/2026): la fase è una riga — pallino, nome, date e chi
        // la fa; a destra avanzamento e ritardo. Stato e menu solo da aperta.
        <div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`phase-body-${phase.id}`}
            onClick={() => setOpen((o) => !o)}
            className="tap-compact flex min-h-[52px] w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted"
          >
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot, phase.status === "in_corso" && "animate-pulse")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight">{phase.name}</span>
              <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground tabular-nums">
                {plannedDates.start && plannedDates.end
                  ? `${plannedDates.start}–${plannedDates.end}`
                  : plannedDates.start ? `dal ${plannedDates.start}` : plannedDates.end ? `entro ${plannedDates.end}` : "senza date"}
                {" · "}
                {chiLaFa.length === 0
                  ? squadreGenerali.length > 0 ? "Squadra della commessa" : <span className={phase.status !== "completata" ? "text-amber-700" : undefined}>nessuno</span>
                  : chiLaFa.length === 1 ? chiLaFa[0].nome : `${chiLaFa[0].nome} +${chiLaFa.length - 1}`}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className={cn("block text-[13px] font-semibold leading-tight tabular-nums", pctInRitardo ? "text-rose-600" : "text-slate-900")}>{actualPct}%</span>
              {(() => {
                const r = tempi ? ritardoBreve(tempi, oggi) : null;
                return r ? <span className={cn("mt-0.5 block text-[11px] font-medium leading-tight", r.tono === "rosso" ? "text-rose-600" : "text-amber-700")}>{r.testo}</span> : null;
              })()}
            </span>
            <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
          {open && canEditOrders && (
            <div className="flex items-center gap-2 px-3 pb-1">
              {editingName ? campoNome("h-9 min-w-0 flex-1") : tendinaStato("tap-compact h-9 min-w-0 flex-1")}
              {menuFase("tap-compact h-9 w-9 shrink-0 text-muted-foreground")}
            </div>
          )}
        </div>
      )}
      {!isMobile && <CardHeader className={cn("gap-2 p-3", open ? "sm:p-4" : "sm:px-3 sm:py-2.5")}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Zona cliccabile: apre/chiude la fase (accordion fatto a mano:
              i controlli interattivi restano fuori, a destra) */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Dettagli ${phase.name}`} aria-expanded={open} aria-controls={`phase-body-${phase.id}`} onClick={() => setOpen(o => !o)}>
            <motion.span
              animate={{ rotate: open ? 0 : -90 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex shrink-0 text-muted-foreground"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.span>
            </Button>

            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                meta.dot,
                phase.status === "in_corso" && "animate-pulse",
              )}
            />

            {editingName ? (
              campoNome("h-8 max-w-xs")
            ) : (
              <button type="button" className="min-w-0 break-words text-left font-semibold hover:underline" aria-expanded={open} aria-controls={`phase-body-${phase.id}`} onClick={() => setOpen(o => !o)}>{phase.name}</button>
            )}

            {/* Aperta, lo stato si legge (e si cambia) nella tendina a destra */}
            {!(open && canEditOrders) && (
              <Badge variant="outline" className={`gap-1 ${meta.badge}`}>
                {meta.label}
              </Badge>
            )}

            {/* Avanzamento reale dichiarato dai rapportini + atteso a oggi:
                barra piccola sempre visibile, "atteso X%" rosso se in ritardo */}
            {(open || phase.status !== "completata") && (() => {
              const inRitardo = pctInRitardo;
              return (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full transition-all",
                        inRitardo ? "bg-rose-500" : "bg-emerald-500",
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, actualPct))}%` }}
                    />
                  </span>
                  {/* Correzione dall'ufficio: click sulla % → input. Serve
                      quando un rapportino approvato ha dichiarato una %
                      sbagliata (prima non c'era rimedio se non SQL). */}
                  <button
                    type="button"
                    disabled={!canEditOrders || derivata}
                    aria-label={`Avanzamento ${phase.name}: ${actualPct}%`}
                    className="rounded px-0.5 text-[11px] tabular-nums text-muted-foreground underline-offset-2 hover:underline"
                    title={derivata ? "Si calcola dalle sottofasi" : "Correggi l'avanzamento della fase"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setProgressDraft(String(actualPct));
                      setProgressOpen(true);
                    }}
                  >
                    {actualPct}%
                  </button>
                  {inRitardo && (
                    <span className="text-[11px] font-medium text-rose-600">
                      atteso {Math.round(Number(health.expected_pct))}%
                    </span>
                  )}
                </span>
              );
            })()}

            {/* Riepilogo leggibile a fase chiusa: quando e chi la fa. Aperta non
                serve: date, persone, note e materiali sono subito sotto. */}
            {!open && <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {plannedDates.start || plannedDates.end
                  ? `${plannedDates.start ? `dal ${plannedDates.start}` : ""}${plannedDates.end ? ` al ${plannedDates.end}` : ""}`.trim()
                  : "senza date"}
              </span>
              <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
                <UsersRound className="h-3 w-3" aria-hidden="true" />
                {chiLaFa.length === 0
                  ? squadreGenerali.length > 0 ? <span title={squadreGenerali.map(s => s.nome).join(", ")}>Squadra della commessa · nel periodo assegnato</span> : <span className={phase.status !== "completata" ? "text-amber-700" : undefined}>nessuno la fa ancora</span>
                  : chiLaFa.map((c, i) => (
                    <span key={c.chiave} className="inline-flex items-center gap-1 text-slate-700">
                      {i > 0 && <span className="text-muted-foreground">·</span>}
                      {c.colore && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.colore }} aria-hidden="true" />}
                      {c.nome}
                    </span>
                  ))}
                {chiLaFa.length > 0 && squadreGenerali.length > 0 && <span className="text-muted-foreground" title={squadreGenerali.map(s => s.nome).join(", ")}>· anche squadra della commessa</span>}
              </span>
              {noteFase > 0 && (
                <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" aria-hidden="true" />{noteFase === 1 ? "1 nota" : `${noteFase} note`}</span>
              )}
              {materials.length > 0 && <span>{materials.length === 1 ? "1 materiale" : `${materials.length} materiali`}</span>}
              {/* Il ritardo detto con i giorni: «62 giorni di ritardo», «finita con 6 giorni di ritardo» */}
              {(() => {
                const t = tempi ? testoTempi(tempi, oggi) : null;
                return t?.breve
                  ? <span className={t.tono === "rosso" ? "text-rose-600" : "text-amber-700"}>{t.breve}</span>
                  : null;
              })()}
              {canViewCosts && economia && costoSforato(economia) && (
                <span className="text-rose-600 max-sm:hidden">costo oltre il previsto</span>
              )}
            </div>}
          </div>

          {/* Controlli a destra: fuori dalla zona cliccabile */}
          {canEditOrders && <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {open && tendinaStato("h-8 w-[140px]")}

            {menuFase("h-8 w-8 text-muted-foreground")}

            <AlertDialog open={eliminaAperto} onOpenChange={setEliminaAperto}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare la fase?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Eliminare la fase «{phase.name}»? Persone, ditte e materiali restano nella commessa, senza fase; le squadre e le note di questa fase se ne vanno con lei.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onDeletePhase}>
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>}
        </div>
      </CardHeader>}

      {/* Da telefono la conferma serve fuori dalla testata del computer */}
      {isMobile && (
        <AlertDialog open={eliminaAperto} onOpenChange={setEliminaAperto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare «{phase.name}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Persone, ditte e materiali restano nella commessa, senza fase; le squadre e le note di questa fase se ne vanno con lei.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onDeletePhase}>
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {planningIssues.length > 0 && <div className="flex flex-wrap items-center gap-1 px-3 pb-2 sm:px-4" aria-label={`Da organizzare: ${phase.name}`}>
        {planningIssues.map(issue => <Button key={issue.section} variant="ghost" size="sm" className="h-auto min-h-8 whitespace-normal px-2 text-xs text-amber-800 hover:bg-amber-50" aria-label={`${issue.label}: ${phase.name}`} onClick={() => { setOpen(true); setTargetSection({section: issue.section}); }}><AlertTriangle className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />{issue.label}</Button>)}
      </div>}

      {/* Corpo collassabile: esecutori + materiali */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <CardContent id={`phase-body-${phase.id}`} className={cn("px-3 sm:px-4", isMobile ? "space-y-3 pb-3 pt-2" : "space-y-4 pb-4 pt-0")}>
              {phase.notes && <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Descrizione</summary>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{phase.notes}</p>
              </details>}
              {/* ── Quando ── */}
              <div ref={datesRef} tabIndex={-1} aria-label={`Date di ${phase.name}`} className="flex flex-wrap items-center gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:hidden">
                  Quando
                </span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground max-sm:min-w-0 max-sm:flex-1">
                  <span className="max-sm:hidden">dal</span>
                  <Input
                    type="date"
                    disabled={!canEditOrders}
                    key={`${phase.id}-start-${phase.start_date ?? ""}`}
                    defaultValue={phase.start_date ?? ""}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      if (!validWorkDates(value, phase.end_date)) { toast.error("Controlla le date: devono essere valide e la fine non può precedere l'inizio."); e.target.value = phase.start_date ?? ""; return; }
                      onUpdatePhase({ start_date: value });
                    }}
                    className="h-8 w-auto text-xs max-sm:h-9 max-sm:w-full max-sm:min-w-0 max-sm:px-2"
                    aria-label="Data inizio prevista"
                  />
                </label>
                <span aria-hidden="true" className="text-xs text-muted-foreground sm:hidden">→</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground max-sm:min-w-0 max-sm:flex-1">
                  <span className="max-sm:hidden">al</span>
                  <Input
                    type="date"
                    disabled={!canEditOrders}
                    key={`${phase.id}-end-${phase.end_date ?? ""}`}
                    defaultValue={phase.end_date ?? ""}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      if (!validWorkDates(phase.start_date, value)) { toast.error("Controlla le date: devono essere valide e la fine non può precedere l'inizio."); e.target.value = phase.end_date ?? ""; return; }
                      onUpdatePhase({ end_date: value });
                    }}
                    className="h-8 w-auto text-xs max-sm:h-9 max-sm:w-full max-sm:min-w-0 max-sm:px-2"
                    aria-label="Data fine prevista"
                  />
                </label>
                {/* Di lato alle date: previsti contro reali, fine vera e ritardo */}
                {tempi && <TempiFase fase={tempi} oggi={oggi} className="max-sm:basis-full sm:ml-1 sm:border-l sm:pl-3" />}
                {squadreFase.length > 0 && (
                  <span className="text-[11px] text-muted-foreground max-sm:hidden">Le squadre della fase seguono queste date.</span>
                )}
              </div>

              {/* ── Sottofasi: i passi che decidono l'avanzamento ── */}
              <SottofasiFase
                nomeFase={phase.name}
                sottofasi={sottofasi}
                dateFase={{ start_date: phase.start_date, end_date: phase.end_date }}
                // Una fase già avviata (o chiusa) che si divide in sottofasi riparte da quelle fatte: si avvisa.
                avviata={phase.status !== "da_iniziare" || phase.percentuale > 0 ? { percentuale: actualPct, chiusa: phase.status === "completata" } : null}
                puoModificare={canEditOrders}
                puoSegnare={canEditOrders}
                {...azioniSottofasi}
              />

              {/* ── Economia: venduto, costo previsto, consuntivo, margine ── */}
              {economia && (
                <EconomiaFaseRiga
                  economia={economia}
                  nomeFase={phase.name}
                  completata={phase.status === "completata"}
                  vedeVenduto={canViewOrderAmounts}
                  vedeCosti={canViewCosts}
                  vedeMargini={canViewMargins}
                  onSalvaVenduto={canEditOrders && canViewOrderAmounts ? (importo) => onUpdatePhase({ importo_venduto: importo }) : undefined}
                />
              )}

              {/* ── Chi la fa: squadre, poi persone e ditte ── */}
              <div ref={peopleRef} tabIndex={-1} aria-label={`Assegnazioni di ${phase.name}`} className="flex flex-wrap items-start gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="w-24 shrink-0 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:hidden">
                  Chi la fa
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  {squadreGenerali.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-2 text-xs"><span>Squadra della commessa: <strong>{squadreGenerali.map(s => s.nome).join(", ")}</strong> · nel periodo assegnato</span><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-label={`Vedi squadra generale per ${phase.name}`} onClick={onManageGeneral}>Vedi assegnazione generale</Button></div>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SquadreFase orderId={orderId} fase={{ id: phase.id, name: phase.name }} modificabile={puoSquadre} mostraAggiungi={false} />
                    {(canEditOrders || puoSquadre) && <AddAssignmentDialog orderId={orderId}
                      phaseId={phase.id}
                      employees={employees}
                      externalTeams={externalTeams}
                      phases={allPhases}
                      existingAssignments={allAssignments}
                      triggerLabel="Assegna"
                      triggerAriaLabel={`Assegna a ${phase.name}`}
                      triggerClassName={cn("tap-compact h-8 rounded-full px-3", AZIONE_TENUE.persona)}
                      onAdd={onAddAssignment}
                    />}
                  </div>
                  {phase.assignments.length > 0 && (
                    <ElencoAssegnazioni>
                      {phase.assignments.map((a) => (
                        <AssignmentRow
                          key={`${a.source}-${a.id}`}
                          assignment={a}
                          employees={employees}
                          externalTeams={externalTeams}
                          phases={allPhases}
                          onUpdate={(patch) => onUpdateAssignment(a.id, a.source, patch)}
                          onDelete={() => onDeleteAssignment(a.id, a.source)}
                        />
                      ))}
                    </ElencoAssegnazioni>
                  )}
                </div>
              </div>

              {/* ── Mezzi e attrezzi di chi fa la fase ── */}
              {(mezziFase.length > 0 || canEditOrders || canViewMezzi) && (
                <div className="flex flex-wrap items-start gap-2">
                  <span className="w-24 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:hidden">
                    Mezzi
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    <MezziFaseCantiere orderId={orderId} faseId={phase.id} />
                    {mezziFase.map((m) => (
                      <span key={m.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", AZIONE_TENUE.mezzo)}>
                        <b className="font-semibold">{m.nome}</b>
                        <span className="opacity-80">· {m.persona}{m.a_bordo.length > 0 ? `, con ${m.a_bordo.join(", ")}` : ""}{m.altrove ? ` · risulta su ${m.altrove}` : " · al seguito della persona"}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Note per gli operai di questa fase ── */}
              <div className="flex flex-wrap items-start gap-2">
                <span className="w-24 shrink-0 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:hidden">
                  Note
                </span>
                <div className="min-w-0 flex-1">
                  <NoteCantiere orderId={orderId} phaseId={phase.id} fasi={fasiOpzioni} modificabile={puoSquadre} compatta />
                </div>
              </div>

              {/* ── Materiali della fase (order_items.phase_id) ── */}
              {(canEditOrders || materials.length > 0 || unassignedMaterials.length > 0) && (
                <div ref={materialsRef} tabIndex={-1} aria-label={`Materiali di ${phase.name}`} className="flex flex-wrap items-start gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  <span className="w-24 shrink-0 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:hidden">
                    Materiali
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                  {materials.length > 0 && <div className="divide-y rounded-lg border">
                  {materials.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5">
                      <span className="min-w-[9rem] flex-1 break-words text-sm max-sm:text-[13px]">
                        {m.name}{" "}
                        <span className="text-xs text-muted-foreground">(x{m.quantity})</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {m.readiness === "magazzino" ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700"
                          >
                            <Check className="h-3 w-3" />
                            In magazzino
                          </Badge>
                        ) : m.readiness === "ordinato" ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-blue-300 bg-blue-50 text-blue-700"
                          >
                            <Truck className="h-3 w-3" />
                            {`OdA ${m.odaNumber ?? ""}`.trim()}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-300 bg-amber-50 text-amber-700"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Da ordinare
                          </Badge>
                        )}
                        {/* Dividi su più fasi: solo con quantità > 1 e non ancora coperto
                            da un OdA — una volta ordinato, la ripartizione è vincolata
                            all'ordine di acquisto e non si può più spezzare. */}
                        {canEditOrders && m.quantity > 1 && m.readiness !== "ordinato" && (
                          <SplitMaterialDialog
                            material={m}
                            phases={allPhases}
                            currentPhaseId={phase.id}
                            onSplit={(parts, opts) => onSplitMaterial(m.id, parts, opts)}
                          />
                        )}
                        {canEditOrders && <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-rose-600"
                          onClick={() => onAssignMaterial(m.id, null)}
                          aria-label="Togli dalla fase"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>}
                      </div>
                    </div>
                  ))}
                  </div>}

                  <div className="flex flex-wrap items-center gap-2">
                    {canEditOrders && <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="tap-compact h-8">
                          <Plus className="mr-1 h-4 w-4" />
                          <span className="max-sm:hidden">Collega materiale esistente</span>
                          <span className="sm:hidden">Materiale</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 p-1">
                        {unassignedMaterials.length === 0 ? (
                          <p className="p-2 text-xs text-muted-foreground">
                            Nessun materiale da collegare. Puoi crearne uno con «Nuovo materiale».
                          </p>
                        ) : (
                          unassignedMaterials.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className="w-full rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                              onClick={() => onAssignMaterial(m.id, phase.id)}
                            >
                              {m.name} <span className="text-muted-foreground">x{m.quantity}</span>
                            </button>
                          ))
                        )}
                      </PopoverContent>
                    </Popover>}

                    {canEditOrders && <NewPhaseMaterial orderId={orderId} phaseId={phase.id} phaseName={phase.name} />}
                    {canEditOrders && missingMaterials.length > 0 && (
                      <CreatePurchaseOrderButton
                        orderId={orderId}
                        orderCode={orderCode}
                        items={missingMaterials.map((m) => ({
                          id: m.id,
                          name: m.name,
                          quantity: m.quantity,
                          purchase_price: m.purchase_price ?? undefined,
                          supplier_id: m.supplier_id ?? undefined,
                          vat_rate: m.vat_rate ?? undefined,
                        }))}
                      />
                    )}
                    {materials.length > 0 && (
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums max-sm:hidden",
                          prontiCount === materials.length ? "text-emerald-600" : "text-amber-600"
                        )}
                      >
                        {prontiCount}/{materials.length} coperti da giacenza o OdA
                      </span>
                    )}
                  </div>

                  {startWarning && (
                    <p className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Fase in partenza il {startWarning}: {missingMaterials.length} materiali da ordinare
                    </p>
                  )}
                  </div>
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Rettifica avanzamento</DialogTitle><DialogDescription>{phase.name}. Correzione manuale dell'ufficio; non modifica i rapportini già registrati.</DialogDescription></DialogHeader>
          <Label htmlFor={`progress-${phase.id}`}>Avanzamento %</Label>
          <Input id={`progress-${phase.id}`} type="number" min="0" max="100" step="1" value={progressDraft} onChange={e => setProgressDraft(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setProgressOpen(false)}>Annulla</Button><Button disabled={!canEditOrders || !progressDraft.trim() || parseWorkAmount(progressDraft) === null || Number(progressDraft) > 100} onClick={() => {
            const value = Math.round(parseWorkAmount(progressDraft)!);
            onUpdatePhase({ percentuale: value, status: value >= 100 ? "completata" : value > 0 ? "in_corso" : "da_iniziare" });
            setProgressOpen(false);
          }}>Salva avanzamento</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Manodopera senza fase. NON e' un residuo legacy: in produzione e'   */
/* l'88% delle assegnazioni (lavori brevi, subappalti a corpo). Quando */
/* la commessa non ha fasi, questo gruppo E' la manodopera e si        */
/* presenta come tale; l'etichetta "Senza fase" compare solo quando    */
/* esistono anche fasi, per distinguere.                               */
/* ------------------------------------------------------------------ */

interface UnassignedCardProps {
  /** True se la commessa ha almeno una fase: cambia solo l'intestazione. */
  hasPhases: boolean;
  assignments: PhaseAssignment[];
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  phases: { id: string; name: string }[];
  onUpdateAssignment: (id: string, source: AssignmentSource, patch: AssignmentPatch) => Promise<unknown>;
  onDeleteAssignment: (id: string, source: AssignmentSource) => Promise<unknown>;
}

function UnassignedCard({
  hasPhases,
  assignments,
  employees,
  externalTeams,
  phases,
  onUpdateAssignment,
  onDeleteAssignment,
}: UnassignedCardProps) {
  const { canViewCosts } = usePermissions();
  const subtotals = useMemo(() => {
    return assignments.reduce(
      (acc, a) => {
        acc.prev += Number(a.cost_preventivo) || 0;
        acc.cons += Number(a.cost_consuntivo) || 0;
        return acc;
      },
      { prev: 0, cons: 0 }
    );
  }, [assignments]);

  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader className="gap-3 p-3 sm:p-6 sm:pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-muted-foreground">
              {hasPhases ? "Assegnazioni all'intera commessa" : "Squadra della commessa"}
            </span>
            {hasPhases && (
              <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                Senza fase
              </Badge>
            )}
          </div>
          {canViewCosts && <span className="text-xs text-muted-foreground tabular-nums max-sm:hidden">
            Costo previsto {eur.format(subtotals.prev)} · consuntivo {eur.format(subtotals.cons)}
          </span>}
        </div>
        <p className="text-xs text-muted-foreground max-sm:hidden">{hasPhases ? "Assegnazioni generali, non legate a una singola fase. Modifica una riga per collegarla a una lavorazione." : "Dipendenti e squadre esterne assegnati al lavoro, anche senza suddivisione in fasi."}</p>
      </CardHeader>

      <CardContent className="space-y-2 px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
        <ElencoAssegnazioni>
          {assignments.map((a) => (
            <AssignmentRow
              key={`${a.source}-${a.id}`}
              assignment={a}
              employees={employees}
              externalTeams={externalTeams}
              phases={phases}
              onUpdate={(patch) => onUpdateAssignment(a.id, a.source, patch)}
              onDelete={() => onDeleteAssignment(a.id, a.source)}
            />
          ))}
        </ElencoAssegnazioni>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Assignment row                                                      */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* Add assignment dialog                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Split material dialog ("100 kg usati in più fasi")                  */
/* ------------------------------------------------------------------ */

// Riga di ripartizione: phaseId = "none" → senza fase (Select non accetta "")
interface SplitRowDraft {
  phaseId: string;
  quantity: string;
}

interface SplitMaterialDialogProps {
  material: PhaseMaterial;
  phases: { id: string; name: string }[];
  currentPhaseId: string | null;
  onSplit: (
    parts: { phaseId: string | null; quantity: number }[],
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
}

function SplitMaterialDialog({
  material,
  phases,
  currentPhaseId,
  onSplit,
}: SplitMaterialDialogProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SplitRowDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Riga 1 = fase corrente con tutta la quantità, riga 2 = da compilare
  const initialRows = (): SplitRowDraft[] => [
    { phaseId: currentPhaseId ?? "none", quantity: String(material.quantity) },
    { phaseId: "none", quantity: "0" },
  ];

  const maxRows = phases.length + 1; // tutte le fasi + "Senza fase"

  const qtyOf = (r: SplitRowDraft) => {
    const parsed = parseInt(r.quantity, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const assigned = rows.reduce((acc, r) => acc + qtyOf(r), 0);
  const sumOk = assigned === material.quantity;
  const valid = sumOk && rows.every((r) => qtyOf(r) >= 1);

  const updateRow = (i: number, patch: Partial<SplitRowDraft>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleSubmit = () => {
    if (!valid) return;
    setSubmitting(true);
    onSplit(
      rows.map((r) => ({
        phaseId: r.phaseId === "none" ? null : r.phaseId,
        quantity: qtyOf(r),
      })),
      {
        onSuccess: () => {
          setSubmitting(false);
          setOpen(false);
        },
        // Senza questo, un errore lascerebbe il bottone in spinner per sempre.
        onError: () => setSubmitting(false),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setRows(o ? initialRows() : []);
        if (!o) setSubmitting(false);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          aria-label="Dividi su più fasi"
        >
          <Split className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dividi materiale</DialogTitle>
          <DialogDescription>
            «{material.name}» — {material.quantity} pz da ripartire
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={row.phaseId} onValueChange={(v) => updateRow(i, { phaseId: v })}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="Fase…" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Senza fase</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="1"
                step="1"
                value={row.quantity}
                onChange={(e) => updateRow(i, { quantity: e.target.value })}
                className="h-9 w-20 tabular-nums"
                aria-label={`Quantità riga ${i + 1}`}
              />
              {rows.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-rose-600"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  aria-label="Rimuovi riga"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            disabled={rows.length >= maxRows}
            onClick={() => setRows((rs) => [...rs, { phaseId: "none", quantity: "0" }])}
          >
            <Plus className="mr-1 h-4 w-4" />
            Aggiungi riga
          </Button>

          {/* Contatore live: verde solo quando la ripartizione torna */}
          <p
            className={cn(
              "text-xs font-medium tabular-nums",
              sumOk ? "text-emerald-600" : "text-rose-600",
            )}
          >
            Assegnate {assigned} / {material.quantity}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Split className="mr-1 h-4 w-4" />
            )}
            Dividi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
