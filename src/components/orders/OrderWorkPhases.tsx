import { useMemo, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

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
import { Switch } from "@/components/ui/switch";
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

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

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
}

export function OrderWorkPhases({ orderId, orderCode }: OrderWorkPhasesProps) {
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
  } = useOrderWorkPhases(orderId);

  const [newPhaseOpen, setNewPhaseOpen] = useState(false);
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

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardHat className="h-5 w-5 text-primary" />
            Lavorazioni / Manodopera
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={newPhaseOpen} onOpenChange={(o) => (o ? setNewPhaseOpen(true) : closePhaseDialog())}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <ListPlus className="mr-1 h-4 w-4" />
                  Aggiungi lavorazioni
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Aggiungi lavorazioni</DialogTitle>
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
          </div>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Preventivo</p>
            <p className="text-sm font-semibold tabular-nums sm:text-base">
              {eur.format(totals.preventivo)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Consuntivo</p>
            <p className="text-sm font-semibold tabular-nums sm:text-base">
              {eur.format(totals.consuntivo)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Scostamento</p>
            <p className={`text-sm font-semibold tabular-nums sm:text-base ${scostamentoClass}`}>
              {eur.format(totals.scostamento)}
            </p>
          </div>

          {/* Barra consuntivo vs preventivo: colpo d'occhio su quanto budget
              manodopera è stato consumato (verde entro budget, rosso oltre). */}
          {totals.preventivo > 0 && (
            <div className="col-span-3 pt-1">
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
      </CardHeader>

      <CardContent className="space-y-3">
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
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-10 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground/60" />
            <p className="max-w-md text-sm text-muted-foreground">
              Nessuna lavorazione ancora. Aggiungi le fasi del cantiere per assegnare operai e
              subappalti e tenere sotto controllo i costi.
            </p>
            <Button onClick={() => setNewPhaseOpen(true)}>
              <ListPlus className="mr-1 h-4 w-4" />
              Aggiungi lavorazioni
            </Button>
          </div>
        ) : (
          <>
            {phases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                employees={employees}
                externalTeams={externalTeams}
                materials={materialsByPhase.get(phase.id) ?? []}
                unassignedMaterials={unassignedMaterials}
                orderId={orderId}
                orderCode={orderCode}
                onAssignMaterial={(itemId, phaseId) => setMaterialPhase.mutate({ itemId, phaseId })}
                onUpdatePhase={(patch) => updatePhase.mutate({ id: phase.id, ...patch })}
                onDeletePhase={() => deletePhase.mutate(phase.id)}
                onAddAssignment={(payload, opts) => addAssignment.mutate(payload, opts)}
                onUpdateAssignment={(id, source, patch) =>
                  updateAssignment.mutate({ id, source, patch })
                }
                onDeleteAssignment={(id, source) => deleteAssignment.mutate({ id, source })}
              />
            ))}

            {unassigned.length > 0 && (
              <UnassignedCard
                assignments={unassigned}
                employees={employees}
                externalTeams={externalTeams}
                onUpdateAssignment={(id, source, patch) =>
                  updateAssignment.mutate({ id, source, patch })
                }
                onDeleteAssignment={(id, source) => deleteAssignment.mutate({ id, source })}
              />
            )}
          </>
        )}

        {/* ── Capocantiere, operai, subappalti e cantiere (sistema operativo) ── */}
        <div className="pt-2">
          <Separator className="mb-3" />
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">
              Capocantiere, squadra e subappalti
            </span>
          </div>
          <OrderLaborCosts orderId={orderId} editable embedded />
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Phase card                                                          */
/* ------------------------------------------------------------------ */

type AssignmentPatch = Partial<
  Pick<
    PhaseAssignment,
    "cost_preventivo" | "cost_consuntivo" | "hours" | "is_paid" | "paid_date" | "phase_id" | "notes"
  >
>;

interface PhaseCardProps {
  phase: WorkPhase;
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  materials: PhaseMaterial[];
  unassignedMaterials: PhaseMaterial[];
  orderId: string;
  orderCode?: string | null;
  onAssignMaterial: (itemId: string, phaseId: string | null) => void;
  onUpdatePhase: (patch: { name?: string; status?: PhaseStatus }) => void;
  onDeletePhase: () => void;
  onAddAssignment: (
    payload: AddAssignmentPayload,
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
  onUpdateAssignment: (id: string, source: AssignmentSource, patch: AssignmentPatch) => void;
  onDeleteAssignment: (id: string, source: AssignmentSource) => void;
}

function PhaseCard({
  phase,
  employees,
  externalTeams,
  materials,
  unassignedMaterials,
  orderId,
  orderCode,
  onAssignMaterial,
  onUpdatePhase,
  onDeletePhase,
  onAddAssignment,
  onUpdateAssignment,
  onDeleteAssignment,
}: PhaseCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(phase.name);

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
    <Card className="border-muted">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Name + status */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {editingName ? (
              <Input
                autoFocus
                value={nameDraft}
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
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-semibold">{phase.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground"
                  onClick={() => {
                    setNameDraft(phase.name);
                    setEditingName(true);
                  }}
                  aria-label="Modifica nome fase"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <Badge variant="outline" className={`gap-1 ${meta.badge}`}>
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </Badge>
          </div>

          {/* Right controls */}
          <div className="flex flex-wrap items-center gap-2">
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

            <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
              Prev: {eur.format(phaseTotals.prev)} · Cons: {eur.format(phaseTotals.cons)}
            </span>

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
                    Eliminare la fase «{phase.name}» e i suoi esecutori? L'operazione non è
                    reversibile.
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
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {phase.assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun esecutore assegnato</p>
        ) : (
          <div className="space-y-2">
            {phase.assignments.map((a) => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                employees={employees}
                externalTeams={externalTeams}
                onUpdate={(patch) => onUpdateAssignment(a.id, a.source, patch)}
                onDelete={() => onDeleteAssignment(a.id, a.source)}
              />
            ))}
          </div>
        )}

        <AddAssignmentDialog
          phaseId={phase.id}
          employees={employees}
          externalTeams={externalTeams}
          onAdd={onAddAssignment}
        />

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
                  {prontiCount}/{materials.length} pronti
                </span>
              )}
            </div>

            {materials.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-rose-600"
                    onClick={() => onAssignMaterial(m.id, null)}
                    aria-label="Togli dalla fase"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
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
            </div>

            {startWarning && (
              <p className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Fase in partenza il {startWarning}: {missingMaterials.length} materiali da ordinare
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* "Senza fase" group (manodopera legacy / pre-esistente)              */
/* ------------------------------------------------------------------ */

interface UnassignedCardProps {
  assignments: PhaseAssignment[];
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  onUpdateAssignment: (id: string, source: AssignmentSource, patch: AssignmentPatch) => void;
  onDeleteAssignment: (id: string, source: AssignmentSource) => void;
}

function UnassignedCard({
  assignments,
  employees,
  externalTeams,
  onUpdateAssignment,
  onDeleteAssignment,
}: UnassignedCardProps) {
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
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-muted-foreground">Senza fase</span>
            <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
              Manodopera non assegnata
            </Badge>
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
            Prev: {eur.format(subtotals.prev)} · Cons: {eur.format(subtotals.cons)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        <div className="space-y-2">
          {assignments.map((a) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              employees={employees}
              externalTeams={externalTeams}
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

function resolveExecutorLabel(
  a: PhaseAssignment,
  employees: ExecutorOption[],
  externalTeams: ExecutorOption[]
): string {
  if (a.executor_type === "interno") {
    return employees.find((e) => e.id === a.employee_id)?.label ?? "—";
  }
  return externalTeams.find((t) => t.id === a.external_team_id)?.label ?? "—";
}

interface AssignmentRowProps {
  assignment: PhaseAssignment;
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  onUpdate: (patch: AssignmentPatch) => void;
  onDelete: () => void;
}

function AssignmentRow({
  assignment,
  employees,
  externalTeams,
  onUpdate,
  onDelete,
}: AssignmentRowProps) {
  const isInterno = assignment.executor_type === "interno";
  const label = resolveExecutorLabel(assignment, employees, externalTeams);

  const [prevDraft, setPrevDraft] = useState(String(assignment.cost_preventivo ?? 0));
  const [consDraft, setConsDraft] = useState(String(assignment.cost_consuntivo ?? 0));

  const commit = (field: "cost_preventivo" | "cost_consuntivo", raw: string) => {
    const parsed = parseFloat(raw);
    const value = Number.isNaN(parsed) ? 0 : parsed;
    if (field === "cost_preventivo") setPrevDraft(String(value));
    else setConsDraft(String(value));
    if (value !== Number(assignment[field])) {
      onUpdate({ [field]: value });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-background p-2.5">
      {/* Executor */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isInterno ? (
          <User className="h-4 w-4 shrink-0 text-blue-600" />
        ) : (
          <Users className="h-4 w-4 shrink-0 text-violet-600" />
        )}
        <span className="truncate text-sm font-medium">{label}</span>
        <Badge
          variant="outline"
          className={
            isInterno
              ? "border-blue-300 bg-blue-100 text-blue-700"
              : "border-violet-300 bg-violet-100 text-violet-700"
          }
        >
          {isInterno ? "Interno" : "Subappalto"}
        </Badge>
      </div>

      {/* Costs */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Prev
          <Input
            type="number"
            step="0.01"
            value={prevDraft}
            onChange={(e) => setPrevDraft(e.target.value)}
            onBlur={(e) => commit("cost_preventivo", e.target.value)}
            className="h-8 w-24 tabular-nums"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Cons
          <Input
            type="number"
            step="0.01"
            value={consDraft}
            onChange={(e) => setConsDraft(e.target.value)}
            onBlur={(e) => commit("cost_consuntivo", e.target.value)}
            className="h-8 w-24 tabular-nums"
          />
        </label>
      </div>

      {/* Paid + delete */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch
            checked={assignment.is_paid}
            onCheckedChange={(checked) =>
              onUpdate({
                is_paid: checked,
                paid_date: checked ? new Date().toISOString().slice(0, 10) : null,
              })
            }
          />
          Pagato
        </label>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-rose-600"
          onClick={onDelete}
          aria-label="Rimuovi esecutore"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add assignment dialog                                               */
/* ------------------------------------------------------------------ */

interface AddAssignmentDialogProps {
  phaseId: string;
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  onAdd: (
    payload: AddAssignmentPayload,
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
}

function AddAssignmentDialog({
  phaseId,
  employees,
  externalTeams,
  onAdd,
}: AddAssignmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<ExecutorType>("interno");
  const [executorId, setExecutorId] = useState<string>("");
  const [prev, setPrev] = useState("0");
  const [cons, setCons] = useState("0");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const options = tipo === "interno" ? employees : externalTeams;

  const reset = () => {
    setTipo("interno");
    setExecutorId("");
    setPrev("0");
    setCons("0");
    setHours("");
    setNotes("");
    setSubmitting(false);
  };

  const num = (raw: string) => {
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const handleSubmit = () => {
    if (!executorId) {
      toast.error("Seleziona un esecutore");
      return;
    }
    const hoursNum = hours.trim() === "" ? null : num(hours);
    const payload: AddAssignmentPayload = {
      phase_id: phaseId,
      executor_type: tipo,
      employee_id: tipo === "interno" ? executorId : null,
      external_team_id: tipo === "esterno" ? executorId : null,
      cost_preventivo: num(prev),
      cost_consuntivo: num(cons),
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
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-1">
          <Plus className="mr-1 h-4 w-4" />
          Aggiungi esecutore
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aggiungi esecutore</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo toggle */}
          <div className="space-y-1.5">
            <Label>Tipo esecutore</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={tipo === "interno" ? "default" : "outline"}
                onClick={() => {
                  setTipo("interno");
                  setExecutorId("");
                }}
                className="justify-start"
              >
                <User className="mr-1.5 h-4 w-4" />
                Operaio interno
              </Button>
              <Button
                type="button"
                variant={tipo === "esterno" ? "default" : "outline"}
                onClick={() => {
                  setTipo("esterno");
                  setExecutorId("");
                }}
                className="justify-start"
              >
                <Users className="mr-1.5 h-4 w-4" />
                Subappalto / squadra
              </Button>
            </div>
          </div>

          {/* Executor picker */}
          <div className="space-y-1.5">
            <Label>{tipo === "interno" ? "Operaio" : "Squadra / subappalto"}</Label>
            <Select value={executorId} onValueChange={setExecutorId}>
              <SelectTrigger>
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

          {/* Costs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-prev">Costo preventivo €</Label>
              <Input
                id="assign-prev"
                type="number"
                step="0.01"
                value={prev}
                onChange={(e) => setPrev(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-cons">Costo consuntivo €</Label>
              <Input
                id="assign-cons"
                type="number"
                step="0.01"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
              />
            </div>
          </div>

          {/* Hours */}
          <div className="space-y-1.5">
            <Label htmlFor="assign-hours">Ore (facoltativo)</Label>
            <Input
              id="assign-hours"
              type="number"
              step="0.5"
              value={hours}
              placeholder="Es. 8"
              onChange={(e) => setHours(e.target.value)}
            />
          </div>

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            Aggiungi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
