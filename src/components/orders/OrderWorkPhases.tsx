import { useMemo, useRef, useState } from "react";
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
  User,
  Users,
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { matchesWorkFilter, summarizeWork, parseWorkAmount, validWorkDates, wouldDuplicateAssignment, type WorkFilter } from "@/lib/orders/workPlanning";
import { costoTariffa, unitaTariffa } from "@/lib/listino/costoTariffa";
import { WorkAssignmentRow as AssignmentRow, type AssignmentPatch } from "./WorkAssignmentRow";
import { economiaFasi, type EconomiaFase } from "@/lib/orders/economiaFasi";
import { useCostiMaterialiFasi } from "@/hooks/useCostiMaterialiFasi";
import { EconomiaFaseRiga, costoSforato } from "./EconomiaFaseRiga";
import { RiepilogoEconomicoFasi } from "./RiepilogoEconomicoFasi";

import {
  useOrderWorkPhases,
  PHASE_TEMPLATES,
  type WorkPhase,
  type PhaseAssignment,
  type PhaseMaterial,
  type PhaseStatus,
  type ExecutorType,
  type ExecutorOption,
  type AssignmentSource,
  type AddAssignmentPayload,
} from "@/hooks/useOrderWorkPhases";
import {
  useOrderScheduleHealth,
  type SchedulePhaseHealth,
} from "@/hooks/useOrderScheduleHealth";
import { cn } from "@/lib/utils";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrderLaborCosts } from "@/components/orders/OrderLaborCosts";
import { AppCantiere } from "@/components/orders/AppCantiere";
import { CantiereLogistica } from "@/components/orders/CantiereLogistica";
import { useMezziLavoro, type MezzoDellaPersona } from "@/hooks/useCantiereLogistica";
import { AZIONE_PIENA, AZIONE_TENUE } from "@/lib/manodopera/colori";
import { CreatePurchaseOrderButton } from "@/components/orders/CreatePurchaseOrderButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { InternalTeamShifts } from "./InternalTeamShifts";
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
  view?: "lavorazioni" | "squadra";
}

export function OrderWorkPhases({ orderId, orderCode, onOpenReports, view }: OrderWorkPhasesProps) {
  const showWork = view !== "squadra";
  const showTeam = view !== "lavorazioni";
  const { canEditOrders, canViewCosts, canEditOperai, canViewOrderAmounts, canViewMargins } = usePermissions();
  // Squadre: le mette sulla commessa chi modifica le commesse o gli operai.
  const puoSquadre = canEditOrders || canEditOperai;
  const [aggiungiSquadra, setAggiungiSquadra] = useState(false);
  const { data: squadre = [] } = useSquadreCommessa(orderId);
  const { data: note = [] } = useNoteCantiere(orderId);
  const squadreAttive = [...new Map(squadre.filter((x) => x.attiva && !x.finita).map((x) => [x.squadra_id, x])).values()];
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

  // Economia delle lavorazioni (06/10/2026): venduto, costo previsto e costo
  // consuntivo per fase. I costi sostenuti dei materiali si leggono solo con
  // il permesso sui costi.
  const { data: costiMateriali } = useCostiMaterialiFasi(orderId, canViewCosts);
  const economia = useMemo(
    () => economiaFasi({
      fasi: phases,
      righe: materials,
      assegnazioni: allAssignments,
      acquisti: costiMateriali?.acquisti,
      movimenti: costiMateriali?.movimenti,
    }),
    [phases, materials, allAssignments, costiMateriali],
  );

  // Semaforo tempi: atteso vs reale per le fasi con date (match per id fase)
  const { data: scheduleHealth } = useOrderScheduleHealth(orderId);
  const healthByPhaseId = useMemo(() => {
    const map = new Map<string, SchedulePhaseHealth>();
    for (const f of scheduleHealth?.fasi ?? []) map.set(f.id, f);
    return map;
  }, [scheduleHealth]);

  const [newPhaseOpen, setNewPhaseOpen] = useState(false);
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const phaseList = useRef<HTMLDivElement>(null);
  const today = format(new Date(), "yyyy-MM-dd");
  const fasiConSquadra = useMemo(() => new Set(squadre.filter((x) => x.phase_id).map((x) => x.phase_id as string)), [squadre]);
  const summary = summarizeWork(phases, unassigned, today, fasiConSquadra);
  const phaseOptions = phases.map(p => ({ id: p.id, name: p.name }));
  const completedCount = phases.filter(p => p.status === "completata").length;
  const groupCompleted = filter === "all" && !search.trim();
  const visiblePhases = phases.filter(p => matchesWorkFilter(p, filter, today, fasiConSquadra) && p.name.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")) && (!view || !groupCompleted || showCompleted || p.status !== "completata"));
  const [newPhaseName, setNewPhaseName] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const selectedTemplate = PHASE_TEMPLATES.find((t) => t.key === selectedTemplateKey) ?? null;

  const closePhaseDialog = () => {
    setNewPhaseOpen(false);
    setNewPhaseName("");
    setSelectedTemplateKey(null);
  };

  const handleAddPhase = () => {
    const name = newPhaseName.trim();
    if (!name) {
      toast.error("Inserisci il nome della fase");
      return;
    }
    addPhase.mutate(name, {
      onSuccess: () => {
        setNewPhaseName("");
        toast.success("Fase aggiunta");
      },
    });
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplate) return;
    applyTemplate.mutate(selectedTemplate.phases, {
      onSuccess: () => {
        toast.success(`${selectedTemplate.phases.length} fasi aggiunte`);
        closePhaseDialog();
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

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-4 p-3 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Dentro le schede della commessa il titolo ripeterebbe la scheda stessa
              e la sua descrizione: resta solo per chi usa uno screen reader. */}
          <div className={cn("space-y-1", view && "sr-only")}>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardHat className="h-5 w-5 text-primary" />
            {view === "squadra" ? "Squadra e mezzi" : view === "lavorazioni" ? "Lavorazioni" : "Lavori e squadre"}
          </CardTitle>
          <p className="text-sm text-muted-foreground max-sm:hidden">{view === "squadra" ? "Organizza persone, ditte, mezzi e istruzioni." : "Segui le fasi del lavoro. Apri una fase per gestirne i dettagli."}</p>
          </div>

          {(canEditOrders || puoSquadre) && <div className={cn("flex flex-wrap items-center gap-2", view && "sm:ml-auto")}>
            {/* Tre cose sole, sempre nello stesso ordine: le fasi, chi lavora,
                e (a parte) persone e ditte con i costi. */}
            {canEditOrders && showWork && (
              <Button size="sm" className="min-h-11 border border-orange-700 bg-orange-700 px-4 font-semibold text-white shadow-sm hover:bg-orange-800" onClick={() => setNewPhaseOpen(true)}>
                <ListPlus className="mr-1 h-4 w-4" />Aggiungi fasi
              </Button>
            )}
            {puoSquadre && showTeam && (
              <Button size="sm" variant="outline" className={AZIONE_PIENA.squadra} onClick={() => setAggiungiSquadra(true)}>
                <UsersRound className="mr-1 h-4 w-4" />Squadra
              </Button>
            )}
            {canEditOrders && <>
            {showTeam && <AddAssignmentDialog
              phaseId={null}
              employees={employees}
              externalTeams={externalTeams}
              phases={phaseOptions}
              existingAssignments={[...unassigned, ...phases.flatMap(p => p.assignments)]}
              triggerLabel="Persona o ditta"
              triggerVariant="outline"
              triggerClassName={view ? "border border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50" : AZIONE_PIENA.persona}
              onAdd={(payload, opts) => addAssignment.mutate(payload, opts)}
            />}
            <Dialog open={newPhaseOpen} onOpenChange={(o) => (o ? setNewPhaseOpen(true) : closePhaseDialog())}>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Fasi di lavoro</DialogTitle>
                  <DialogDescription>Parti da un modello o scrivi le fasi una alla volta. Poi, in ogni fase, scegli chi la fa.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Modelli di fasi per tipo di lavoro */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Parti da un modello
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PHASE_TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() =>
                            setSelectedTemplateKey((k) => (k === t.key ? null : t.key))
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            selectedTemplateKey === t.key
                              ? "border-primary bg-primary/10 font-medium text-primary"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {selectedTemplate && (
                      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">
                          {selectedTemplate.hint} · {selectedTemplate.phases.length} fasi
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedTemplate.phases.map((p, i) => (
                            <span
                              key={i}
                              className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
                            >
                              {i + 1}. {p}
                            </span>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={handleApplyTemplate}
                          disabled={applyTemplate.isPending}
                        >
                          {applyTemplate.isPending ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <ListPlus className="mr-1 h-4 w-4" />
                          )}
                          Aggiungi le {selectedTemplate.phases.length} fasi
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-[10px] uppercase text-muted-foreground">
                      oppure
                    </span>
                  </div>

                  {/* Singola fase manuale */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="new-phase-name"
                      className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Aggiungi una singola fase
                    </Label>
                    <div className="flex gap-2">
                      <Input
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
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            </>}
          </div>}
        </div>

        {/* Una riga al posto dei riquadri: quante squadre, operai, ditte e
            lavorazioni, e i collegamenti ad app e rapportini. */}
        {!isLoading && !isError && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="tabular-nums">
              <b className="font-semibold text-slate-900">{phases.length}</b> {phases.length === 1 ? "fase" : "fasi"}
              {summary.active > 0 && <> ({summary.active} in corso)</>}
              {(!view || squadreAttive.length > 0) && <>{" · "}<b className="font-semibold text-slate-900">{squadreAttive.length}</b> {squadreAttive.length === 1 ? "squadra" : "squadre"}</>}
              {operaiInSquadra > 0 && <>{" · "}<b className="font-semibold text-slate-900">{operaiInSquadra}</b> {operaiInSquadra === 1 ? "operaio in squadra" : "operai in squadra"}</>}
              {summary.employees > 0 && <>{" · "}<b className="font-semibold text-slate-900">{summary.employees}</b> {summary.employees === 1 ? "operaio assegnato individualmente" : "operai assegnati individualmente"}</>}
              {summary.teams > 0 && <> · <b className="font-semibold text-slate-900">{summary.teams}</b> {summary.teams === 1 ? "ditta" : "ditte"}</>}
              {(!view || note.length > 0) && <>{" · "}<b className="font-semibold text-slate-900">{note.length}</b> {note.length === 1 ? "nota" : "note"}</>}
            </span>
            <span className="flex items-center gap-1 sm:ml-auto">
              {onOpenReports && <Button variant="ghost" size="sm" className="h-8" aria-label="Vai ai rapportini" onClick={onOpenReports}>Rapportini</Button>}
              {showWork && summary.attention > 0 && <Button variant="ghost" size="sm" className="h-8 text-amber-700" onClick={() => {
                setFilter("attention"); setSearch(""); phaseList.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}><AlertTriangle className="mr-1.5 h-4 w-4" />Verifica {summary.attention} lavorazioni</Button>}
            </span>
          </div>
        )}

        {showTeam && !isLoading && !isError && <InternalTeamShifts key={orderId} orderId={orderId} teams={externalTeams} phases={phaseOptions} canPlan={canEditOrders} />}

        {/* Riepilogo economico (06/10/2026): venduto, costo previsto e consuntivo
            di tutte le fasi, al posto del riepilogo della sola manodopera. Solo
            quando c'è qualcosa da sommare. */}
        {(canViewCosts || canViewOrderAmounts) && !isLoading && !isError && (phases.length > 0 || unassigned.length > 0) && (
          <RiepilogoEconomicoFasi economia={economia} vedeVenduto={canViewOrderAmounts} vedeCosti={canViewCosts} vedeMargini={canViewMargins} />
        )}
      </CardHeader>

      <CardContent className="space-y-5 px-3 pb-3 sm:px-6 sm:pb-6">
        {/* Dove si trova, quanta strada dalla sede, mezzi e attrezzi */}
        {showTeam && <CantiereLogistica orderId={orderId} showSiteEquipment={view !== "squadra"} />}

        {/* Commessa appena aperta: tre passi, invece di tre riquadri vuoti. */}
        {!isLoading && !isError && phases.length === 0 && unassigned.length === 0 && squadre.length === 0 && (
          <GuidaCantiere
            puoFasi={canEditOrders}
            puoSquadre={puoSquadre}
            onFasi={() => setNewPhaseOpen(true)}
            onSquadra={() => setAggiungiSquadra(true)}
          />
        )}

        {/* Chi vede il cantiere nell'app e il capocantiere: segue chi lavora. */}
        {showTeam && !isLoading && !isError && !(phases.length === 0 && unassigned.length === 0 && squadre.length === 0) && (
          <AppCantiere orderId={orderId} modificabile={puoSquadre} nomiSquadre={nomiSquadre} />
        )}

        {showTeam && <section aria-labelledby="note-operai" className="space-y-2">
          <h3 id="note-operai" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />Note per gli operai · tutta la commessa
          </h3>
          <NoteCantiere orderId={orderId} fasi={phaseOptions} modificabile={puoSquadre} />
        </section>}

        {/* Le squadre su tutta la commessa, se ci sono; se non ci sono ma
            nemmeno fasi, l'invito a metterne una sta nella guida qui sopra. */}
        {showTeam && (squadreGenerali.length > 0 || (squadre.length === 0 && (phases.length > 0 || unassigned.length > 0))) && (
          <section aria-labelledby="lavori-squadre" className="space-y-2">
            <h3 id="lavori-squadre" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Squadre su tutta la commessa</h3>
            <SquadreCommessa orderId={orderId} modificabile={puoSquadre} aggiungiAperto={aggiungiSquadra} onAggiungiAperto={setAggiungiSquadra} />
          </section>
        )}
        {(!showTeam || !(squadreGenerali.length > 0 || (squadre.length === 0 && (phases.length > 0 || unassigned.length > 0)))) && (
          // la finestra «Squadra» serve anche quando la sezione non c'è ancora
          <SquadreCommessa orderId={orderId} modificabile={puoSquadre} aggiungiAperto={aggiungiSquadra} onAggiungiAperto={setAggiungiSquadra} soloFinestra />
        )}

        {showWork && <>
        {(phases.length > 0 || unassigned.length > 0 || isLoading || isError) && (
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fasi di lavoro</h3>
        )}
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
            {(phases.length > 6 || filter !== "all" || search.trim()) && <div className="space-y-3 pb-1">
              <div className="flex flex-wrap gap-1.5" aria-label="Filtra lavorazioni">
                {([["all", "Tutte"], ["in_corso", "In corso"], ["da_iniziare", "Da iniziare"], ["attention", "Da organizzare"], ["completata", "Completate"]] as const).map(([value, label]) =>
                  <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}
              </div>
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Cerca lavorazione" placeholder="Cerca una lavorazione…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            </div>}
            {phases.length > 0 && visiblePhases.length === 0 && <p role="status" className="py-3 text-sm text-muted-foreground">{view && groupCompleted && completedCount > 0 && !showCompleted ? "Le lavorazioni sono completate. Verifica eventuali attività aperte e il collaudo prima della consegna." : "Nessuna lavorazione corrisponde ai filtri."}</p>}
            {view && groupCompleted && completedCount > 0 && <Button variant="outline" size="sm" aria-expanded={showCompleted} onClick={() => setShowCompleted(value => !value)}>{showCompleted ? "Nascondi" : "Mostra"} {completedCount} {completedCount === 1 ? "fase completata" : "fasi completate"}</Button>}
            {visiblePhases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                health={healthByPhaseId.get(phase.id)}
                employees={employees}
                externalTeams={externalTeams}
                materials={materialsByPhase.get(phase.id) ?? []}
                economia={economia.perFase.get(phase.id)}
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
                noteFase={notePerFase.get(phase.id)?.length ?? 0}
                mezziFase={mezziPerFase.get(phase.id) ?? []}
                puoSquadre={puoSquadre}
                fasiOpzioni={phaseOptions}
              />
            ))}

          </>
        )}
        </>}
            {showTeam && unassigned.length > 0 && (
              <UnassignedCard
                hasPhases={phases.length > 0}
                assignments={unassigned}
                employees={employees}
                externalTeams={externalTeams}
                phases={phaseOptions}
                onUpdateAssignment={(id, source, patch) =>
                  saveAssignment(id, source, patch)
                }
                onDeleteAssignment={(id, source) => deleteAssignment.mutateAsync({ id, source })}
              />
            )}

        {/* Le ditte in subappalto (DURC e contratto), solo se ce ne sono. */}
        {showTeam && <OrderLaborCosts orderId={orderId} editable={canEditOrders} embedded parte="ditte" />}
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
            <button type="button" onClick={onSquadra} className="font-medium text-orange-700 hover:underline">Metti una squadra su tutta la commessa</button>
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
  /** Quante note per gli operai su questa fase. */
  noteFase: number;
  /** Mezzi e attrezzi di chi lavora su questa fase. */
  mezziFase: MezzoDellaPersona[];
  puoSquadre: boolean;
  fasiOpzioni: { id: string; name: string }[];
}

function PhaseCard({
  phase,
  economia,
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
  noteFase,
  mezziFase,
  puoSquadre,
  fasiOpzioni,
}: PhaseCardProps) {
  const { canEditOrders, canViewCosts, canViewOrderAmounts, canViewMargins } = usePermissions();
  const [eliminaAperto, setEliminaAperto] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(phase.name);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState("");
  // Aperta di default solo se i lavori sono in corso: è la fase su cui si opera
  const [open, setOpen] = useState(() => phase.status === "in_corso");

  const meta = statusMeta(phase.status);

  // Materiali scoperti (né in magazzino né già ordinati) → candidati all'OdA
  const missingMaterials = useMemo(
    () => materials.filter((m) => m.readiness === "da_ordinare"),
    [materials]
  );
  // "Pronti" = coperti da giacenza o da un OdA
  const prontiCount = materials.length - missingMaterials.length;

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
      const nome = a.source === "employee"
        ? employees.find((e) => e.id === a.employee_id)?.label
        : externalTeams.find((t) => t.id === a.external_team_id)?.label;
      out.push({ chiave: `${a.source}-${a.id}`, nome: nome ?? (a.source === "employee" ? "Dipendente" : "Ditta"), colore: null });
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
      <CardHeader className="gap-3 p-3 sm:p-4">
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
              <Input
                autoFocus
                value={nameDraft}
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
                className="h-8 max-w-xs"
              />
            ) : (
              <button type="button" className="min-w-0 break-words text-left font-semibold hover:underline" aria-expanded={open} aria-controls={`phase-body-${phase.id}`} onClick={() => setOpen(o => !o)}>{phase.name}</button>
            )}

            <Badge variant="outline" className={`gap-1 ${meta.badge}`}>
              {meta.label}
            </Badge>

            {/* Avanzamento reale dichiarato dai rapportini + atteso a oggi:
                barra piccola sempre visibile, "atteso X%" rosso se in ritardo */}
            {(open || phase.status !== "completata") && (() => {
              const actualPct = phase.status === "completata" ? 100 : phase.percentuale;
              const inRitardo =
                !!health && Number(health.delta_pct) < 0 && phase.status !== "completata";
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
                    disabled={!canEditOrders}
                    aria-label={`Avanzamento ${phase.name}: ${actualPct}%`}
                    className="rounded px-0.5 text-[11px] tabular-nums text-muted-foreground underline-offset-2 hover:underline"
                    title="Correggi l'avanzamento della fase"
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

            {/* Riepilogo leggibile a fase chiusa: quando e chi la fa. I costi
                stanno dentro, in «Costi della manodopera». */}
            <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {plannedDates.start || plannedDates.end
                  ? `${plannedDates.start ? `dal ${plannedDates.start}` : ""}${plannedDates.end ? ` al ${plannedDates.end}` : ""}`.trim()
                  : "senza date"}
              </span>
              <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
                <UsersRound className="h-3 w-3" aria-hidden="true" />
                {chiLaFa.length === 0
                  ? <span className={phase.status !== "completata" ? "text-amber-700" : undefined}>nessuno la fa ancora</span>
                  : chiLaFa.map((c, i) => (
                    <span key={c.chiave} className="inline-flex items-center gap-1 text-slate-700">
                      {i > 0 && <span className="text-muted-foreground">·</span>}
                      {c.colore && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.colore }} aria-hidden="true" />}
                      {c.nome}
                    </span>
                  ))}
              </span>
              {noteFase > 0 && (
                <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" aria-hidden="true" />{noteFase === 1 ? "1 nota" : `${noteFase} note`}</span>
              )}
              {materials.length > 0 && <span>{materials.length === 1 ? "1 materiale" : `${materials.length} materiali`}</span>}
              {phase.status !== "completata" && phase.end_date && phase.end_date < format(new Date(), "yyyy-MM-dd") && (
                <span className="text-rose-600">scadenza superata</span>
              )}
              {canViewCosts && economia && costoSforato(economia) && (
                <span className="text-rose-600 max-sm:hidden">costo oltre il previsto</span>
              )}
            </div>
          </div>

          {/* Controlli a destra: fuori dalla zona cliccabile */}
          {canEditOrders && <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {open && <Select
              value={phase.status}
              onValueChange={(v) => onUpdatePhase({ status: v as PhaseStatus })}
            >
              <SelectTrigger className="h-8 w-[140px]" aria-label={`Stato di ${phase.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Altre azioni per ${phase.name}`}>
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
      </CardHeader>

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
            <CardContent id={`phase-body-${phase.id}`} className="space-y-4 px-3 pb-4 pt-0 sm:px-4">
              {/* ── Quando ── */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:w-full">
                  Quando
                </span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  dal
                  <Input
                    type="date"
                    disabled={!canEditOrders}
                    key={`${phase.id}-start-${phase.start_date ?? ""}`}
                    defaultValue={phase.start_date ?? ""}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      if (!validWorkDates(value, phase.end_date)) { toast.error("L'inizio non può essere successivo alla fine."); e.target.value = phase.start_date ?? ""; return; }
                      onUpdatePhase({ start_date: value });
                    }}
                    className="h-8 w-auto text-xs"
                    aria-label="Data inizio prevista"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  al
                  <Input
                    type="date"
                    disabled={!canEditOrders}
                    key={`${phase.id}-end-${phase.end_date ?? ""}`}
                    defaultValue={phase.end_date ?? ""}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      if (!validWorkDates(phase.start_date, value)) { toast.error("La fine non può precedere l'inizio."); e.target.value = phase.end_date ?? ""; return; }
                      onUpdatePhase({ end_date: value });
                    }}
                    className="h-8 w-auto text-xs"
                    aria-label="Data fine prevista"
                  />
                </label>
                {squadreFase.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">Le squadre della fase seguono queste date.</span>
                )}
              </div>

              {/* ── Chi la fa: squadre, poi persone e ditte ── */}
              <div className="flex flex-wrap items-start gap-2">
                <span className="w-24 shrink-0 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:w-full max-sm:pt-0">
                  Chi la fa
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SquadreFase orderId={orderId} fase={{ id: phase.id, name: phase.name }} modificabile={puoSquadre} />
                    {canEditOrders && <AddAssignmentDialog
                      phaseId={phase.id}
                      employees={employees}
                      externalTeams={externalTeams}
                      phases={allPhases}
                      existingAssignments={allAssignments}
                      triggerLabel="Persona o ditta"
                      triggerClassName={cn("h-8 rounded-full px-3", AZIONE_TENUE.persona)}
                      onAdd={onAddAssignment}
                    />}
                  </div>
                  {phase.assignments.length > 0 && (
                    <div className="space-y-2">
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
                    </div>
                  )}
                </div>
              </div>

              {/* ── Economia della fase: venduto, costo previsto, consuntivo ── */}
              {economia && (
                <EconomiaFaseRiga economia={economia} vedeVenduto={canViewOrderAmounts} vedeCosti={canViewCosts} vedeMargini={canViewMargins} />
              )}

              {/* ── Mezzi e attrezzi di chi fa la fase ── */}
              {mezziFase.length > 0 && (
                <div className="flex flex-wrap items-start gap-2">
                  <span className="w-24 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:w-full max-sm:pt-0">
                    Mezzi
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {mezziFase.map((m) => (
                      <span key={m.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", AZIONE_TENUE.mezzo)}>
                        <b className="font-semibold">{m.nome}</b>
                        <span className="opacity-80">· {m.persona}{m.a_bordo.length > 0 ? `, con ${m.a_bordo.join(", ")}` : ""}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Note per gli operai di questa fase ── */}
              <div className="flex flex-wrap items-start gap-2">
                <span className="w-24 shrink-0 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:w-full max-sm:pt-0">
                  Note per gli operai
                </span>
                <div className="min-w-0 flex-1">
                  <NoteCantiere orderId={orderId} phaseId={phase.id} fasi={fasiOpzioni} modificabile={puoSquadre} compatta />
                </div>
              </div>

              {/* ── Materiali della fase (order_items.phase_id) ── */}
              {(materials.length > 0 || unassignedMaterials.length > 0) && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Materiali della fase
                    </span>
                    {materials.length > 0 && (
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          prontiCount === materials.length ? "text-emerald-600" : "text-amber-600"
                        )}
                      >
                        {prontiCount}/{materials.length} coperti da giacenza o OdA
                      </span>
                    )}
                  </div>

                  {materials.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 break-words text-sm">
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

                  {canEditOrders && <div className="flex flex-wrap items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="mr-1 h-4 w-4" />
                          Aggiungi materiale
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 p-1">
                        {unassignedMaterials.length === 0 ? (
                          <p className="p-2 text-xs text-muted-foreground">
                            Nessun articolo senza fase.
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
                    </Popover>

                    {missingMaterials.length > 0 && (
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
                  </div>}

                  {startWarning && (
                    <p className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Fase in partenza il {startWarning}: {missingMaterials.length} materiali da ordinare
                    </p>
                  )}
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
        <p className="text-xs text-muted-foreground max-sm:hidden">{hasPhases ? "Queste assegnazioni non appartengono a una lavorazione specifica. Usa Gestisci per collegarle a una fase." : "Dipendenti e squadre esterne assegnati al lavoro, anche senza suddivisione in fasi."}</p>
      </CardHeader>

      <CardContent className="space-y-2 px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
        <div className="space-y-2">
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
        </div>
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

interface AddAssignmentDialogProps {
  /** null = manodopera senza fase: il caso semplice (lavoro breve, subappalto
      a corpo). In produzione e' l'88% della manodopera reale (138 assegnazioni
      su 156 sono senza fase): non un residuo, il modo normale di lavorare di
      un serramentista con pose da 1-3 giorni. */
  phaseId: string | null;
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  phases: { id: string; name: string }[];
  existingAssignments?: PhaseAssignment[];
  /** Etichetta del bottone che apre il dialog (default "Aggiungi esecutore"). */
  triggerLabel?: string;
  /** Variante del bottone trigger (default "outline"). */
  triggerVariant?: "default" | "outline";
  /** Colore del bottone (vedi lib/manodopera/colori). */
  triggerClassName?: string;
  /** Aperto da fuori (es. dal menu «Aggiungi»): senza bottone proprio. */
  aperto?: boolean;
  onAperto?: (o: boolean) => void;
  onAdd: (
    payload: AddAssignmentPayload,
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
}

// Voce del listino manodopera aziendale (tariffe_aziendali): costo sostenuto
// (prezzo_costo) + prezzo di vendita → il ricarico è visibile al volo.
// prezzo_costo e unita arrivano già normalizzati dalla query (costoTariffa,
// unitaTariffa), non sono le colonne grezze.
interface TariffaManodopera {
  id: string;
  nome: string;
  unita: string | null;
  prezzo_costo: number | null;
  prezzo_vendita: number | null;
  attiva: boolean | null;
  attivo: boolean | null;
  /** Listino della singola squadra (null = listino aziendale generico). */
  external_team_id: string | null;
}

function AddAssignmentDialog({
  phaseId,
  employees,
  externalTeams,
  phases,
  existingAssignments = [],
  triggerLabel = "Persona o ditta",
  triggerVariant = "outline",
  triggerClassName,
  aperto,
  onAperto,
  onAdd,
}: AddAssignmentDialogProps) {
  const { canViewCosts, canViewMargins, canEditOrders } = usePermissions();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [openInterno, setOpenInterno] = useState(false);
  const controllato = aperto !== undefined;
  const open = controllato ? aperto : openInterno;
  const setOpen = (o: boolean) => (controllato ? onAperto?.(o) : setOpenInterno(o));
  const [tipo, setTipo] = useState<ExecutorType>("interno");
  const [executorId, setExecutorId] = useState<string>("");
  const [selectedPhase, setSelectedPhase] = useState(phaseId ?? "");
  const [prev, setPrev] = useState("0");
  const [cons, setCons] = useState("0");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Prefill dal listino manodopera (facoltativo)
  const [tariffaId, setTariffaId] = useState("");
  const [tariffaQty, setTariffaQty] = useState("1");

  // Listino manodopera aziendale — caricato solo a dialog aperto.
  const { data: tariffe = [] } = useQuery({
    queryKey: ["tariffe-manodopera", companyId],
    enabled: open && canViewCosts && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TariffaManodopera[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("tariffe_aziendali")
        .select("id, nome, unita, unita_fatturazione, prezzo_costo, costo_interno, costo_default, prezzo_vendita, attiva, attivo, external_team_id")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      // Costo e unità si normalizzano qui, una volta: tutto il dialog legge
      // prezzo_costo e unita. Prima valeva il solo prezzo_costo, che può
      // essere lo 0 di default quando il costo sta in costo_interno; e la
      // `unita` legacy dice «h» anche per le tariffe a giornata (05/10/2026).
      type Riga = TariffaManodopera & { costo_interno: number | null; costo_default: number | null; unita_fatturazione: string | null };
      return ((data ?? []) as Riga[])
        .map((t) => ({ ...t, prezzo_costo: costoTariffa(t), unita: unitaTariffa(t, "") || null }));
    },
  });
  // Ogni squadra puo' avere il SUO listino ("piu' squadre con listini
  // diversi"): con l'esecutore esterno scelto si vedono le sue voci (prima)
  // e quelle aziendali generiche — mai i prezzi delle altre squadre, che
  // suggerirebbero il costo sbagliato.
  const squadraSelezionata = tipo === "esterno" ? executorId : "";
  /** Varianti di costo per squadra: "questa lavorazione, fatta da questa
      squadra, costa X". Una sola query per company: la tabella e' piccola. */
  const { data: varianti = [] } = useQuery({
    queryKey: ["tariffa-costi-varianti", companyId],
    enabled: open && canViewCosts && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Array<{ id: string; tariffa_id: string; external_team_id: string | null; nome: string; costo: number | null; is_default: boolean | null; attivo: boolean | null; sort_order: number | null }>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("tariffa_costi_varianti")
        .select("id, tariffa_id, external_team_id, nome, costo, is_default, attivo, sort_order")
        .eq("company_id", companyId);
      return data ?? [];
    },
  });
  /** Variante scelta a mano quando la squadra ne ha piu' d'una. */
  const [varianteId, setVarianteId] = useState("");

  const tariffeAttive = tariffe
    .filter((t) => t.attiva ?? t.attivo ?? true)
    .filter((t) => !t.external_team_id || t.external_team_id === squadraSelezionata)
    .sort((a, b) => {
      const pa = a.external_team_id ? 0 : 1;
      const pb = b.external_team_id ? 0 : 1;
      return pa !== pb ? pa - pb : a.nome.localeCompare(b.nome);
    });
  const tariffaSel = tariffeAttive.find((t) => t.id === tariffaId) ?? null;

  /** Varianti valide per la tariffa scelta e la squadra scelta. */
  const variantiSquadra = tariffaSel && squadraSelezionata
    ? varianti
        .filter((v) => v.tariffa_id === tariffaSel.id && v.external_team_id === squadraSelezionata && v.attivo !== false)
        .sort((a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];
  const varianteSel = variantiSquadra.find((v) => v.id === varianteId) ?? variantiSquadra[0] ?? null;
  /** Il costo che vale davvero: variante della squadra se c'e', altrimenti base. */
  const costoUnitarioEffettivo = varianteSel?.costo ?? tariffaSel?.prezzo_costo ?? null;

  // Applica costo (e nota, se vuota) da tariffa × quantità. Il campo resta
  // modificabile: il listino è un prefill, non un vincolo.
  const applyTariffa = (t: TariffaManodopera | null, qtyRaw: string, costoUnit?: number | null) => {
    if (!t) return;
    const qty = Math.max(0, parseFloat(qtyRaw) || 0);
    const unit = costoUnit ?? costoUnitarioEffettivo ?? (Number(t.prezzo_costo) || 0);
    const costo = (Number(unit) || 0) * qty;
    setPrev(costo.toFixed(2));
    setNotes((n) =>
      n.trim() === "" || /^Listino: /.test(n)
        ? `Listino: ${t.nome} × ${qtyRaw || "1"}${t.unita ? ` ${t.unita}` : ""}`
        : n,
    );
  };

  const options = tipo === "interno" ? employees : externalTeams.filter(t => t.kind !== "interna");

  const reset = () => {
    setTipo("interno");
    setExecutorId("");
    setPrev("0");
    setCons("0");
    setHours("");
    setNotes("");
    setSubmitting(false);
    setTariffaId("");
    setTariffaQty("1");
    setVarianteId("");
    setSelectedPhase(phaseId ?? "");
  };

  const num = (raw: string) => {
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const handleSubmit = () => {
    if (!canEditOrders || submitting) return;
    if (!executorId) {
      toast.error("Seleziona un esecutore");
      return;
    }
    if (!options.some(option => option.id === executorId)) {
      toast.error("Esecutore non più disponibile. Ricontrolla la selezione.");
      return;
    }
    if (existingAssignments.some(a => a.phase_id === (selectedPhase || null) &&
      (tipo === "interno" ? a.employee_id === executorId : a.external_team_id === executorId))) {
      toast.error("Esecutore già assegnato a questa lavorazione. Modifica la riga esistente.");
      return;
    }
    const budget = canViewCosts ? parseWorkAmount(prev) : 0;
    const cost = canViewCosts ? parseWorkAmount(cons) : 0;
    const hoursNum = tipo === "interno" && hours.trim() ? parseWorkAmount(hours) : null;
    if (budget === null || cost === null || (tipo === "interno" && hours.trim() && hoursNum === null)) {
      toast.error("Importi e ore devono essere numeri validi, maggiori o uguali a zero.");
      return;
    }
    const payload: AddAssignmentPayload = {
      phase_id: selectedPhase || null,
      executor_type: tipo,
      employee_id: tipo === "interno" ? executorId : null,
      external_team_id: tipo === "esterno" ? executorId : null,
      cost_preventivo: budget,
      cost_consuntivo: cost,
      hours: hoursNum,
      is_paid: false,
      paid_date: null,
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    setSubmitting(true);
    onAdd(payload, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
      // Senza questo, un errore lasciava il bottone in spinner per sempre.
      onError: () => setSubmitting(false),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      {!controllato && <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className={triggerClassName}>
          <Plus className="mr-1 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-6">Assegna una persona o una ditta</DialogTitle>
          <DialogDescription>Chi fa il lavoro: un tuo operaio o una ditta. Una squadra intera si mette col bottone «Squadra». I costi sono facoltativi.</DialogDescription>
        </DialogHeader>

        <fieldset disabled={submitting} className="min-w-0 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">Fase
            <select aria-label="Fase" value={selectedPhase} onChange={e => setSelectedPhase(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Tutta la commessa, senza fase</option>
              {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {/* Tipo toggle */}
          <div className="space-y-1.5">
            <Label>Chi è</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={tipo === "interno" ? "default" : "outline"}
                aria-pressed={tipo === "interno"}
                onClick={() => {
                  setTipo("interno");
                  setExecutorId("");
                  setTariffaId(""); setVarianteId(""); setPrev("0"); setCons("0"); setHours("");
                }}
                className="h-auto min-h-11 justify-start whitespace-normal px-2 py-2 text-left text-xs sm:text-sm"
              >
                <User className="mr-1.5 h-4 w-4" />
                Un operaio
              </Button>
              <Button
                type="button"
                variant={tipo === "esterno" ? "default" : "outline"}
                aria-pressed={tipo === "esterno"}
                onClick={() => {
                  setTipo("esterno");
                  setExecutorId("");
                  setTariffaId(""); setVarianteId(""); setPrev("0"); setCons("0"); setHours("");
                }}
                className="h-auto min-h-11 justify-start whitespace-normal px-2 py-2 text-left text-xs sm:text-sm"
              >
                <Users className="mr-1.5 h-4 w-4" />
                Una ditta
              </Button>
            </div>
          </div>

          {/* Executor picker */}
          {tipo === "interno" && <p className="text-xs text-muted-foreground">Qui metti una persona sola. Le squadre si creano in <a className="underline underline-offset-2" href="/azienda/manodopera?tab=operai&vista=squadre">Manodopera e Mezzi → Squadre</a>.</p>}
          <div className="space-y-1.5">
            <Label>{tipo === "interno" ? "Operaio" : "Ditta"}</Label>
            <Select value={executorId} onValueChange={(v) => {
              setExecutorId(v);
              setVarianteId("");
              if (tariffaSel) {
                if (tariffaSel.external_team_id && tariffaSel.external_team_id !== v) {
                  setTariffaId(""); setPrev("0");
                  setNotes(n => /^Listino: /.test(n) ? "" : n);
                  return;
                }
                const squadra = tipo === "esterno" ? v : "";
                const vs = squadra
                  ? varianti.filter((x) => x.tariffa_id === tariffaSel.id && x.external_team_id === squadra && x.attivo !== false)
                      .sort((a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  : [];
                applyTariffa(tariffaSel, tariffaQty, vs[0]?.costo ?? tariffaSel.prezzo_costo ?? null);
              }
            }}>
              <SelectTrigger aria-label="Scegli chi">
                <SelectValue
                  placeholder={
                    options.length === 0
                      ? tipo === "interno"
                        ? "Nessun operaio disponibile"
                        : "Nessuna squadra disponibile"
                      : "Seleziona…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chi lavora vede la commessa nell'app: si dice prima di salvare. */}
          {(() => {
            const scelto = tipo === "interno" ? employees.find(e => e.id === executorId) : undefined;
            const quando = selectedPhase ? "nei giorni della fase" : "per tutta la durata dei lavori";
            if (scelto && !scelto.campoUserId) {
              return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{scelto.label} non ha l'app: lavorerà qui ma non vedrà la commessa sul telefono. Puoi dargli l'app dalla sua scheda in Manodopera.</p>;
            }
            return <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">{scelto
              ? `${scelto.label} vedrà la commessa nell'app ${quando}.`
              : tipo === "interno"
                ? `Chi metti qui vede la commessa nell'app ${quando}, se ha l'app.`
                : `Se la ditta ha l'app, vede la commessa ${quando}.`}</p>;
          })()}

          {canViewCosts && <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Costo previsto, consuntivo e listino (facoltativo)</summary>
            <div className="mt-3 space-y-3">
          {/* Da listino manodopera: prefill costo sostenuto + ricarico visibile.
              L'azienda può importare il prezziario regionale o caricare il
              proprio listino in Impostazioni → Tariffe. */}
          {canViewCosts && tariffeAttive.length > 0 && (
            <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
              <Label className="text-xs text-muted-foreground">
                Parti dal listino manodopera — costo compilato da solo
              </Label>
              <div className="flex gap-2">
                <Select
                  value={tariffaSel ? tariffaId : ""}
                  onValueChange={(v) => {
                    setTariffaId(v);
                    setVarianteId("");
                    const t = tariffeAttive.find((x) => x.id === v) ?? null;
                    // risolvo al volo: lo stato non e' ancora aggiornato
                    const vs = t && squadraSelezionata
                      ? varianti.filter((x) => x.tariffa_id === t.id && x.external_team_id === squadraSelezionata && x.attivo !== false)
                          .sort((a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      : [];
                    applyTariffa(t, tariffaQty, vs[0]?.costo ?? t?.prezzo_costo ?? null);
                  }}
                >
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue placeholder="Cerca una voce di listino…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tariffeAttive.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} · {eur.format(Number(t.prezzo_costo) || 0)}
                        {t.unita ? `/${t.unita}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={tariffaQty}
                  onChange={(e) => {
                    setTariffaQty(e.target.value);
                    applyTariffa(tariffaSel, e.target.value, costoUnitarioEffettivo);
                  }}
                  className="h-9 w-20"
                  aria-label="Quantità"
                />
              </div>
              {/* La squadra ha piu' varianti di questa lavorazione (es. su
                  nuovo / con smontaggio): la scelta e' esplicita. Con una sola
                  variante si applica da sola. */}
              {variantiSquadra.length > 1 && (
                <Select
                  value={varianteSel?.id ?? ""}
                  onValueChange={(v) => {
                    setVarianteId(v);
                    const vr = variantiSquadra.find((x) => x.id === v);
                    applyTariffa(tariffaSel, tariffaQty, vr?.costo ?? null);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Variante della squadra…" />
                  </SelectTrigger>
                  <SelectContent>
                    {variantiSquadra.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nome} · {eur.format(Number(v.costo) || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {tariffaSel && (
                <p className="text-[11px] text-muted-foreground">
                  {varianteSel ? (
                    <>Variante <strong className="text-foreground">{varianteSel.nome}</strong>: </>
                  ) : null}
                  Costo {eur.format(Number(costoUnitarioEffettivo) || 0)}
                  {tariffaSel.unita ? `/${tariffaSel.unita}` : ""} → preventivo{" "}
                  <strong className="text-foreground">{eur.format(num(prev))}</strong>
                  {canViewMargins && Number(tariffaSel.prezzo_vendita) > 0 && (
                    <>
                      {" "}· vendita consigliata{" "}
                      {eur.format(
                        (Number(tariffaSel.prezzo_vendita) || 0) *
                          Math.max(0, parseFloat(tariffaQty) || 0),
                      )}{" "}
                      <span className="text-emerald-600">
                        (ricarico{" "}
                        {Number(tariffaSel.prezzo_costo) > 0
                          ? Math.round(
                              ((Number(tariffaSel.prezzo_vendita) -
                                Number(tariffaSel.prezzo_costo)) /
                                Number(tariffaSel.prezzo_costo)) *
                                100,
                            )
                          : 0}
                        %)
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Costs */}
          {canViewCosts && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-prev">Costo previsto manodopera €</Label>
              <Input
                id="assign-prev"
                type="number"
                min="0"
                step="0.01"
                value={prev}
                onChange={(e) => setPrev(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-cons">Costo consuntivo già sostenuto €</Label>
              <Input
                id="assign-cons"
                type="number"
                min="0"
                step="0.01"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
              />
            </div>
          </div>}

            </div>
          </details>}

          {/* Hours */}
          {tipo === "interno" && <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Consuntivo iniziale (facoltativo)</summary>
            <div className="mt-3 space-y-1.5">
            <Label htmlFor="assign-hours">Ore già registrate (facoltativo)</Label>
            <Input
              id="assign-hours"
              type="number"
              min="0"
              step="0.5"
              value={hours}
              placeholder="Es. 8"
              onChange={(e) => setHours(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Non sono ore pianificate. Compila solo per recuperare lavoro pregresso non già registrato nei rapportini, altrimenti lascia vuoto.</p>
            </div>
          </details>}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="assign-notes">Note (facoltativo)</Label>
            <Textarea
              id="assign-notes"
              value={notes}
              rows={2}
              placeholder="Dettagli, accordi, riferimenti…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => { reset(); setOpen(false); }}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !executorId}>
            {submitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            Conferma assegnazione
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
