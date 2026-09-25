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
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { matchesWorkFilter, summarizeWork, parseWorkAmount, validWorkDates, wouldDuplicateAssignment, type WorkFilter } from "@/lib/orders/workPlanning";
import { WorkAssignmentRow as AssignmentRow, type AssignmentPatch } from "./WorkAssignmentRow";

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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyRow } from "./EmptyRow";
import { InternalTeamShifts } from "./InternalTeamShifts";

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
}

export function OrderWorkPhases({ orderId, orderCode, onOpenReports }: OrderWorkPhasesProps) {
  const { canEditOrders, canViewCosts } = usePermissions();
  const {
    phases,
    unassigned,
    isLoading,
    isError,
    refetch,
    employees,
    externalTeams,
    totals,
    addPhase,
    applyTemplate,
    updatePhase,
    deletePhase,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    materialsByPhase,
    unassignedMaterials,
    setMaterialPhase,
    splitMaterial,
  } = useOrderWorkPhases(orderId);

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
  const accessDetails = useRef<HTMLDetailsElement>(null);
  const phaseList = useRef<HTMLDivElement>(null);
  const today = format(new Date(), "yyyy-MM-dd");
  const summary = summarizeWork(phases, unassigned, today);
  const phaseOptions = phases.map(p => ({ id: p.id, name: p.name }));
  const visiblePhases = phases.filter(p => matchesWorkFilter(p, filter, today) && p.name.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")));
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

  const scostamentoClass = totals.scostamento > 0 ? "text-rose-600" : "text-emerald-600";
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
    <Card>
      <CardHeader className="gap-4 p-3 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardHat className="h-5 w-5 text-primary" />
            Lavori e squadra
          </CardTitle>
          <p className="text-sm text-muted-foreground max-sm:hidden">Chi interviene, su quale lavoro e con quali tempi.</p>
          </div>

          {canEditOrders && <div className="flex flex-wrap items-center gap-2">
            {/* La via semplice viene PRIMA: chi lavora e quanto costa, anche a
                corpo, senza dover creare fasi. Le fasi restano per i cantieri
                che ne hanno bisogno. */}
            <AddAssignmentDialog
              phaseId={null}
              employees={employees}
              externalTeams={externalTeams}
              phases={phaseOptions}
              existingAssignments={[...unassigned, ...phases.flatMap(p => p.assignments)]}
              triggerLabel="Assegna persona o squadra"
              triggerVariant="default"
              onAdd={(payload, opts) => addAssignment.mutate(payload, opts)}
            />
            <Dialog open={newPhaseOpen} onOpenChange={(o) => (o ? setNewPhaseOpen(true) : closePhaseDialog())}>
              {/* Mobile: le lavorazioni si pianificano al computer. */}
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="max-sm:hidden">
                  <ListPlus className="mr-1 h-4 w-4" />
                  Aggiungi lavorazioni
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Aggiungi lavorazioni</DialogTitle>
                  <DialogDescription>Crea una lavorazione oppure usa un modello. Le assegnazioni già presenti vengono conservate.</DialogDescription>
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
          </div>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Accessi e referenti Campo" onClick={() => {
            if (!accessDetails.current) return;
            accessDetails.current.open = true;
            accessDetails.current.querySelector("summary")?.focus();
            accessDetails.current.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>Accessi Campo</Button>
          {onOpenReports && <Button variant="outline" size="sm" aria-label="Vai ai rapportini" onClick={onOpenReports}>Rapportini</Button>}
          {!isLoading && !isError && summary.attention > 0 && <Button variant="ghost" size="sm" className="text-amber-700" onClick={() => {
            setFilter("attention"); setSearch(""); phaseList.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}><AlertTriangle className="mr-1.5 h-4 w-4" />Verifica {summary.attention} lavorazioni</Button>}
        </div>

        {/* Mobile no: persone e squadre si contano nell'elenco qui sotto. */}
        {!isLoading && !isError && <div className={cn("grid grid-cols-2 gap-2 max-sm:hidden", phases.length > 0 && "lg:grid-cols-4")}>
          {[
            ...(phases.length ? [["Lavorazioni", phases.length, `${summary.active} in corso · ${summary.completed} completate`]] : []),
            ["Dipendenti", summary.employees, "Persone nelle assegnazioni"],
            ["Squadre esterne", summary.teams, "Imprese nelle assegnazioni"],
            ...(phases.length ? [["Lavorazioni da verificare", summary.attention, "Date, esecutori o scadenze"]] : []),
          ].map(([label, value, hint]) => <div key={label} className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">{hint}</p>
          </div>)}
        </div>}

        {!isLoading && !isError && <InternalTeamShifts key={orderId} orderId={orderId} teams={externalTeams} phases={phaseOptions} canPlan={canEditOrders} />}

        {/* Totals strip — solo quando c'e' qualcosa da sommare: tre "0,00 €"
            sopra lo stato vuoto erano rumore che spingeva in basso il resto. */}
        {canViewCosts && !isLoading && !isError && (phases.length > 0 || unassigned.length > 0) && (
        <details className="rounded-lg border p-3 max-sm:hidden">
        <summary className="cursor-pointer text-sm font-medium">Riepilogo costi della manodopera</summary>
        <p className="my-2 text-xs text-muted-foreground">Somma delle assegnazioni. Il costo registrato non indica da solo lavoro approvato o pagamento eseguito.</p>
        <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/40 p-3 text-center sm:grid-cols-3">
          <div className="flex items-center justify-between gap-2 sm:block">
            <p className="text-xs text-muted-foreground">Budget manodopera</p>
            <p className="text-sm font-semibold tabular-nums sm:text-base">
              {eur.format(totals.preventivo)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:block">
            <p className="text-xs text-muted-foreground">Costo registrato</p>
            <p className="text-sm font-semibold tabular-nums sm:text-base">
              {eur.format(totals.consuntivo)}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:block">
            <p className="text-xs text-muted-foreground">Scostamento</p>
            <p className={`text-sm font-semibold tabular-nums sm:text-base ${scostamentoClass}`}>
              {eur.format(totals.scostamento)}
            </p>
          </div>

          {/* Barra consuntivo vs preventivo: colpo d'occhio su quanto budget
              manodopera è stato consumato (verde entro budget, rosso oltre). */}
          {totals.preventivo > 0 && (
            <div className="pt-1 sm:col-span-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    totals.consuntivo > totals.preventivo ? "bg-rose-500" : "bg-emerald-500"
                  }`}
                  style={{
                    width: `${Math.min(100, (totals.consuntivo / totals.preventivo) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Consuntivo al {((totals.consuntivo / totals.preventivo) * 100).toFixed(0)}% del
                preventivo
              </p>
            </div>
          )}
        </div>
        </details>
        )}
      </CardHeader>

      <CardContent className="space-y-3 px-3 pb-3 sm:px-6 sm:pb-6">
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
          // Riga compatta: a commessa senza lavorazioni questo blocco occupava
          // 663px. L'azione resta, sulla stessa riga.
          <EmptyRow icon={HardHat}>
            Nessuna lavorazione o persona assegnata. Per un intervento semplice puoi assegnare direttamente la squadra; per organizzare più attività, crea le lavorazioni.
          </EmptyRow>
        ) : (
          <>
            {phases.length > 0 && <div className="space-y-3 pb-1">
              <div className="flex flex-wrap gap-1.5" aria-label="Filtra lavorazioni">
                {([["all", "Tutte"], ["in_corso", "In corso"], ["da_iniziare", "Da iniziare"], ["attention", "Da organizzare"], ["completata", "Completate"]] as const).map(([value, label]) =>
                  <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}
              </div>
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Cerca lavorazione" placeholder="Cerca una lavorazione…" value={search} onChange={e => setSearch(e.target.value)} /></div>
              {visiblePhases.length === 0 && <p role="status" className="py-3 text-sm text-muted-foreground">Nessuna lavorazione corrisponde ai filtri.</p>}
            </div>}
            {visiblePhases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                health={healthByPhaseId.get(phase.id)}
                employees={employees}
                externalTeams={externalTeams}
                materials={materialsByPhase.get(phase.id) ?? []}
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
              />
            ))}

            {unassigned.length > 0 && (
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
          </>
        )}

        {/* ── Capocantiere, operai, subappalti e cantiere (sistema operativo) ── */}
        <details ref={accessDetails} className="scroll-mt-24 rounded-lg border">
          <summary className="cursor-pointer p-3 text-sm font-semibold">App Campo e affidamenti <span className="ml-1 font-normal text-muted-foreground">· accessi, capocantiere, DURC e SAL</span></summary>
          <div className="border-t p-3">
          <p className="mb-3 text-xs text-muted-foreground">Qui gestisci chi usa l'app e i referenti dei subappalti. Persone e squadre che eseguono il lavoro si assegnano nelle lavorazioni qui sopra.</p>
          <OrderLaborCosts orderId={orderId} editable={canEditOrders} embedded />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Phase card                                                          */
/* ------------------------------------------------------------------ */

interface PhaseCardProps {
  phase: WorkPhase;
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
}

function PhaseCard({
  phase,
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
}: PhaseCardProps) {
  const { canEditOrders, canViewCosts } = usePermissions();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(phase.name);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState("");
  // Aperta di default solo se i lavori sono in corso: è la fase su cui si opera
  const [open, setOpen] = useState(() => phase.status === "in_corso");

  const meta = statusMeta(phase.status);

  const phaseTotals = useMemo(() => {
    return phase.assignments.reduce(
      (acc, a) => {
        acc.prev += Number(a.cost_preventivo) || 0;
        acc.cons += Number(a.cost_consuntivo) || 0;
        return acc;
      },
      { prev: 0, cons: 0 }
    );
  }, [phase.assignments]);

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
        "border-muted border-l-4",
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
            {(() => {
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

            {/* Riepilogo compatto: leggibile anche a fase chiusa */}
            <span className="basis-full text-xs text-muted-foreground tabular-nums">
              {phase.assignments.length} esecutori
              {materials.length > 0 ? ` · ${materials.length} materiali` : ""}
              {canViewCosts ? ` · Budget ${eur.format(phaseTotals.prev)} · Costo ${eur.format(phaseTotals.cons)}` : ""}
              {plannedDates.start ? ` · dal ${plannedDates.start}` : ""}
              {plannedDates.end ? ` al ${plannedDates.end}` : ""}
            </span>
            {phase.status !== "completata" && <div className="flex basis-full flex-wrap gap-2 text-xs">
              {phase.assignments.length === 0 && <span className="text-amber-700">Da assegnare</span>}
              {(!phase.start_date || !phase.end_date) && <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarDays className="h-3 w-3" />Date da completare</span>}
              {phase.end_date && phase.end_date < format(new Date(), "yyyy-MM-dd") && <span className="text-rose-600">Scadenza superata</span>}
            </div>}
          </div>

          {/* Controlli a destra: fuori dalla zona cliccabile */}
          {canEditOrders && <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={() => {
                setNameDraft(phase.name);
                setEditingName(true);
              }}
              aria-label="Modifica nome fase"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            <Select
              value={phase.status}
              onValueChange={(v) => onUpdatePhase({ status: v as PhaseStatus })}
            >
              <SelectTrigger className="h-8 w-[150px]">
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

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                  aria-label="Elimina fase"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare la fase?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Eliminare la fase «{phase.name}»? Le assegnazioni e i materiali collegati restano nella commessa, senza fase. La fase eliminata non è recuperabile.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 hover:bg-rose-700"
                    onClick={onDeletePhase}
                  >
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
              {/* ── Date previste della fase (start_date / end_date) ── */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Date previste
                </span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Inizio
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
                  Fine
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
                <span className="text-[11px] text-muted-foreground">
                  Alimentano l'avviso materiali in partenza.
                </span>
              </div>

              {phase.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun esecutore assegnato</p>
              ) : (
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

              {canEditOrders && <AddAssignmentDialog
                phaseId={phase.id}
                employees={employees}
                externalTeams={externalTeams}
                phases={allPhases}
                existingAssignments={allAssignments}
                onAdd={onAddAssignment}
              />}

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
            Budget {eur.format(subtotals.prev)} · Costo {eur.format(subtotals.cons)}
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
  onAdd: (
    payload: AddAssignmentPayload,
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
}

// Voce del listino manodopera aziendale (tariffe_aziendali): costo sostenuto
// (prezzo_costo) + prezzo di vendita → il ricarico è visibile al volo.
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
  triggerLabel = "Assegna a questa lavorazione",
  triggerVariant = "outline",
  onAdd,
}: AddAssignmentDialogProps) {
  const { canViewCosts, canViewMargins, canEditOrders } = usePermissions();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [open, setOpen] = useState(false);
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
        .select("id, nome, unita, prezzo_costo, prezzo_vendita, attiva, attivo, external_team_id")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as TariffaManodopera[];
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
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className="mt-1">
          <Plus className="mr-1 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-6">Assegna persona o squadra</DialogTitle>
          <DialogDescription>Scegli chi esegue il lavoro. Budget e costi sono facoltativi e possono essere compilati in seguito.</DialogDescription>
        </DialogHeader>

        <fieldset disabled={submitting} className="min-w-0 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">Lavorazione
            <select aria-label="Lavorazione da assegnare" value={selectedPhase} onChange={e => setSelectedPhase(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Intera commessa · senza fase</option>
              {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {/* Tipo toggle */}
          <div className="space-y-1.5">
            <Label>Tipo esecutore</Label>
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
                Dipendente
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
                Squadra esterna
              </Button>
            </div>
          </div>

          {/* Executor picker */}
          {tipo === "interno" && <p className="text-xs text-muted-foreground">Per organizzare i dipendenti in squadre, usa <a className="underline underline-offset-2" href="/azienda/impostazioni/calendari-lavori?tab=squadre">Squadre operative</a>. Qui resta disponibile l'assegnazione individuale.</p>}
          <div className="space-y-1.5">
            <Label>{tipo === "interno" ? "Dipendente" : "Squadra / subappaltatore"}</Label>
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
              <SelectTrigger aria-label="Seleziona esecutore">
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

          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{tipo === "interno"
            ? employees.find(e => e.id === executorId)?.campoUserId === null
              ? "Account Campo non collegato. Puoi assegnare il lavoro, ma per i rapportini dall'app occorre collegare un account alla scheda dipendente."
              : employees.find(e => e.id === executorId)?.campoUserId
                ? "Account Campo collegato. Al salvataggio viene verificata anche l'assegnazione dell'accesso al cantiere."
                : "L'assegnazione può collegare il dipendente all'app Campo se dispone di un account. Verifica gli accessi nella sezione App Campo."
            : "L'affidamento alla squadra non abilita automaticamente un account: assegna anche il referente nella sezione App Campo per i rapportini."}</p>

          {canViewCosts && <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Budget, costi e listino (facoltativo)</summary>
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
              <Label htmlFor="assign-prev">Budget manodopera €</Label>
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
              <Label htmlFor="assign-cons">Costo già registrato €</Label>
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
