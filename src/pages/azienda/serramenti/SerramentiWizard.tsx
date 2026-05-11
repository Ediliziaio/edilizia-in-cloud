/**
 * SerramentiWizard — wizard a 8 step per la creazione/modifica di una stima.
 *
 * STEP:
 *  1. Cliente            — anagrafica
 *  2. Immobile           — cantiere, vincoli, tipo intervento
 *  3. Esigenze           — 3 pain bullets (default da template)
 *  4. Serramenti (BOM)   — composizione, materiale, vetro, misure
 *  5. Accessori          — avvolgibili, cassonetti, zanzariere
 *  6. Economia           — forbice min/max, sconto, varianti, finanziamento, ROI
 *  7. Consulenza         — appuntamento, consulente, cronoprogramma
 *  8. PDF                — genera HTML preventivo (Wave 4)
 *
 * Fix Wave 3:
 *  - Bug: dopo "Crea e continua" l'utente passa subito a Step 2 (era bloccato su Step 1)
 *  - Dirty check: avviso AlertDialog se cambio step con modifiche non salvate
 *  - beforeunload guard
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useIsMutating } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ArrowRight, Save, Loader2, RectangleVertical,
  User, Home, MessageCircle, Image as ImageIcon, Euro, Calendar, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useProgetto, useCreateProgetto, useUpdateProgetto,
} from "@/lib/serramenti/queries";
import { SR_WIZARD_STEPS } from "@/types/serramenti";
import type { SrProgettoRow, SrWizardStep, SrTipoIntervento } from "@/types/serramenti";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { StepBom } from "@/components/serramenti/StepBom";
import { StepAccessori } from "@/components/serramenti/StepAccessori";
import { StepEconomia } from "@/components/serramenti/StepEconomia";
import { StepConsulenza } from "@/components/serramenti/StepConsulenza";
import { StepPdf } from "@/components/serramenti/StepPdf";
import { StepContenuti } from "@/components/serramenti/StepContenuti";

const STEP_ICONS: Record<SrWizardStep, React.FC<React.SVGProps<SVGSVGElement>>> = {
  cliente: User,
  immobile: Home,
  esigenze: MessageCircle,
  bom: RectangleVertical,
  accessori_foto: ImageIcon,
  economia: Euro,
  consulenza: Calendar,
  pdf: FileText,
};

export default function SerramentiWizard() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [currentStep, setCurrentStep] = useState<SrWizardStep>("cliente");
  const [creating, setCreating] = useState(false);
  const [pendingStep, setPendingStep] = useState<SrWizardStep | null>(null);

  const { data: detail, isLoading } = useProgetto(id);
  const updateMut = useUpdateProgetto(id);
  const createMut = useCreateProgetto();

  const pendingWrites = useIsMutating({ mutationKey: ["sr-progetto-autosave", id] });

  // Local form state — solo per i campi del progetto stesso
  const [form, setForm] = useState<Partial<SrProgettoRow>>({});
  const [dirty, setDirty] = useState(false);

  // Sync form con dati server al primo load / cambio progetto
  useEffect(() => {
    if (detail?.progetto) {
      setForm(detail.progetto);
      setDirty(false);
    }
  }, [detail?.progetto.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bug fix: dopo creazione (auto-advance step quando si carica un nuovo id appena creato)
  // → quando arriviamo qui con un id appena creato, advance allo step 2
  useEffect(() => {
    if (id && detail?.progetto && currentStep === "cliente") {
      // Se il progetto ha cliente_nome compilato, l'utente probabilmente ha
      // già fatto step 1 → portiamolo allo step 2.
      const hasStep1Data = detail.progetto.cliente_nome || detail.progetto.cliente_cognome;
      if (hasStep1Data) {
        setCurrentStep("immobile");
      }
    }
    // Solo al primo load del progetto
  }, [detail?.progetto.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // Beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || pendingWrites > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, pendingWrites]);

  const saveProgetto = async (): Promise<boolean> => {
    if (!id) return false;
    try {
      await updateMut.mutateAsync(form);
      setDirty(false);
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveAndContinue = async () => {
    // Caso 1: nuovo progetto — crea
    if (isNew) {
      setCreating(true);
      try {
        const created = await createMut.mutateAsync({
          cliente_nome: form.cliente_nome,
          cliente_cognome: form.cliente_cognome,
          cantiere_indirizzo: form.cantiere_indirizzo,
          cantiere_citta: form.cantiere_citta,
          tipo_intervento: (form.tipo_intervento as SrTipoIntervento) ?? "sostituzione",
        });
        navigate(`/azienda/serramenti/${created.id}/modifica`, { replace: true });
      } finally {
        setCreating(false);
      }
      return;
    }

    // Caso 2: progetto esistente — salva e advance
    if (!id) return;
    const ok = await saveProgetto();
    if (!ok) return;
    const idx = SR_WIZARD_STEPS.findIndex((s) => s.key === currentStep);
    if (idx >= 0 && idx < SR_WIZARD_STEPS.length - 1) {
      setCurrentStep(SR_WIZARD_STEPS[idx + 1].key);
    } else {
      toast.success("Stima salvata");
    }
  };

  // Click su step sidebar — controlla dirty
  const handleStepClick = (target: SrWizardStep) => {
    if (target === currentStep) return;
    if (isNew) return; // in new mode lo step laterale è disabled
    if (dirty || pendingWrites > 0) {
      setPendingStep(target);
      return;
    }
    setCurrentStep(target);
  };

  const handleBack = () => {
    const idx = currentStepIndex;
    if (idx > 0) handleStepClick(SR_WIZARD_STEPS[idx - 1].key);
  };

  const confirmStepChange = async (saveFirst: boolean) => {
    if (!pendingStep) return;
    if (saveFirst) {
      const ok = await saveProgetto();
      if (!ok) {
        setPendingStep(null);
        return;
      }
    } else {
      // Discard local changes — re-sync from server
      if (detail?.progetto) {
        setForm(detail.progetto);
        setDirty(false);
      }
    }
    setCurrentStep(pendingStep);
    setPendingStep(null);
  };

  const currentStepIndex = useMemo(
    () => SR_WIZARD_STEPS.findIndex((s) => s.key === currentStep),
    [currentStep],
  );

  const progress = useMemo(
    () => Math.round(((currentStepIndex + 1) / SR_WIZARD_STEPS.length) * 100),
    [currentStepIndex],
  );

  if (!isNew && isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-background border-b">
        <div className="container mx-auto p-3 flex items-center gap-3 max-w-6xl">
          <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/serramenti")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <RectangleVertical className="h-4 w-4 text-emerald-700" />
              <span className="font-semibold text-sm">
                {isNew ? "Nuova stima" : detail?.progetto.code}
              </span>
              {detail?.progetto.cliente_nome && (
                <Badge variant="outline" className="text-[10px]">
                  {[detail.progetto.cliente_nome, detail.progetto.cliente_cognome].filter(Boolean).join(" ")}
                </Badge>
              )}
              {(updateMut.isPending || pendingWrites > 0) && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
                </span>
              )}
              {dirty && pendingWrites === 0 && !updateMut.isPending && (
                <span className="text-[10px] text-amber-600">● Modifiche non salvate</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Step {currentStepIndex + 1} di {SR_WIZARD_STEPS.length} · {SR_WIZARD_STEPS[currentStepIndex]?.label}
            </p>
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-emerald-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="container mx-auto p-3 md:p-6 max-w-6xl">
        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar step */}
          <aside className="hidden md:block md:col-span-3">
            <Card>
              <CardContent className="p-2">
                <nav className="space-y-0.5">
                  {SR_WIZARD_STEPS.map((s, idx) => {
                    const Icon = STEP_ICONS[s.key];
                    const isActive = s.key === currentStep;
                    const isPast = idx < currentStepIndex;
                    const disabled = isNew && idx > 0;
                    return (
                      <button
                        key={s.key}
                        onClick={() => !disabled && handleStepClick(s.key)}
                        disabled={disabled}
                        className={cn(
                          "w-full text-left px-2.5 py-2 rounded-md text-xs flex items-center gap-2 transition-colors",
                          isActive
                            ? "bg-emerald-100 text-emerald-900 font-semibold"
                            : isPast
                            ? "text-foreground hover:bg-muted"
                            : "text-muted-foreground",
                          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        )}
                      >
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                          isActive ? "bg-emerald-600 text-white" :
                          isPast ? "bg-emerald-100 text-emerald-700" :
                          "bg-muted text-muted-foreground",
                        )}>
                          {idx + 1}
                        </span>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{s.label}</span>
                      </button>
                    );
                  })}
                </nav>
                {isNew && (
                  <SrCallout variant="info" className="mt-2 text-[10px]">
                    Compila i dati cliente e crea il progetto per sbloccare gli altri step.
                  </SrCallout>
                )}
              </CardContent>
            </Card>
          </aside>

          {/* Step content */}
          <main className="col-span-12 md:col-span-9 space-y-4">
            {currentStep === "cliente" && (
              <StepCliente form={form} onChange={onChange} />
            )}
            {currentStep === "immobile" && (
              <StepImmobile form={form} onChange={onChange} />
            )}
            {currentStep === "esigenze" && (
              <StepContenuti form={form} onChange={onChange} />
            )}
            {currentStep === "bom" && id && detail && (
              <StepBom progettoId={id} detail={detail} />
            )}
            {currentStep === "accessori_foto" && id && detail && (
              <StepAccessori progettoId={id} detail={detail} />
            )}
            {currentStep === "economia" && id && detail && (
              <StepEconomia progettoId={id} detail={detail} form={form} onChange={onChange} />
            )}
            {currentStep === "consulenza" && id && detail && (
              <StepConsulenza form={form} onChange={onChange} detail={detail} />
            )}
            {currentStep === "pdf" && id && detail && (
              <StepPdf progettoId={id} detail={detail} />
            )}

            {/* Navigation footer */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={handleBack} disabled={currentStepIndex === 0}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
              </Button>
              <Button
                onClick={handleSaveAndContinue}
                disabled={updateMut.isPending || creating}
                className="bg-emerald-700 hover:bg-emerald-800 gap-1"
              >
                {(updateMut.isPending || creating) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : currentStepIndex === SR_WIZARD_STEPS.length - 1 ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {isNew ? "Crea e continua" :
                  currentStepIndex === SR_WIZARD_STEPS.length - 1 ? "Salva" : "Salva e continua"}
              </Button>
            </div>
          </main>
        </div>
      </div>

      {/* Dialog conferma cambio step con modifiche non salvate */}
      <AlertDialog open={!!pendingStep} onOpenChange={(o) => !o && setPendingStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
            <AlertDialogDescription>
              Hai modifiche non ancora salvate. Cosa vuoi fare prima di passare allo step "{SR_WIZARD_STEPS.find((s) => s.key === pendingStep)?.label}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmStepChange(false)}>
              Scarta modifiche
            </Button>
            <AlertDialogAction
              className="bg-emerald-700 hover:bg-emerald-800"
              onClick={() => confirmStepChange(true)}
            >
              Salva e continua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Step inline (Cliente, Immobile, Esigenze) ──────────────────────────────

function StepCliente({
  form, onChange,
}: {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}) {
  return (
    <SrCard
      title="Anagrafica cliente"
      description="Compila i dati del cliente che riceverà la stima. Indirizzo, telefono ed email sono opzionali ma consigliati per il PDF."
      icon={<User className="h-4 w-4" />}
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-6">
          <Label className="text-xs">Nome</Label>
          <Input
            value={form.cliente_nome ?? ""}
            onChange={(e) => onChange("cliente_nome", e.target.value)}
            placeholder="Paolo"
            className="h-9"
          />
        </div>
        <div className="col-span-12 md:col-span-6">
          <Label className="text-xs">Cognome</Label>
          <Input
            value={form.cliente_cognome ?? ""}
            onChange={(e) => onChange("cliente_cognome", e.target.value)}
            placeholder="Conti"
            className="h-9"
          />
        </div>
        <div className="col-span-12 md:col-span-6">
          <Label className="text-xs">Telefono</Label>
          <Input
            value={form.cliente_telefono ?? ""}
            onChange={(e) => onChange("cliente_telefono", e.target.value)}
            placeholder="3331234567"
            className="h-9"
          />
        </div>
        <div className="col-span-12 md:col-span-6">
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            value={form.cliente_email ?? ""}
            onChange={(e) => onChange("cliente_email", e.target.value)}
            placeholder="pconti@email.it"
            className="h-9"
          />
        </div>
        <div className="col-span-12">
          <Label className="text-xs">Indirizzo</Label>
          <Input
            value={form.cliente_indirizzo ?? ""}
            onChange={(e) => onChange("cliente_indirizzo", e.target.value)}
            placeholder="Via Tortona 33"
            className="h-9"
          />
        </div>
        <div className="col-span-12 md:col-span-6">
          <Label className="text-xs">Città</Label>
          <Input
            value={form.cliente_citta ?? ""}
            onChange={(e) => onChange("cliente_citta", e.target.value)}
            placeholder="Milano"
            className="h-9"
          />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label className="text-xs">CAP</Label>
          <Input
            value={form.cliente_cap ?? ""}
            onChange={(e) => onChange("cliente_cap", e.target.value)}
            placeholder="20121"
            className="h-9"
          />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label className="text-xs">Provincia</Label>
          <Input
            value={form.cliente_provincia ?? ""}
            onChange={(e) => onChange("cliente_provincia", e.target.value)}
            placeholder="MI"
            maxLength={2}
            className="h-9 uppercase"
          />
        </div>
      </div>
    </SrCard>
  );
}

function StepImmobile({
  form, onChange,
}: {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}) {
  return (
    <SrCard
      title="Cantiere e intervento"
      description="Indirizzo del cantiere (se diverso dal cliente), tipo di intervento e sintesi che compare in alto al PDF."
      icon={<Home className="h-4 w-4" />}
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12">
          <Label className="text-xs">Tipo di intervento</Label>
          <Select
            value={form.tipo_intervento ?? "sostituzione"}
            onValueChange={(v) => onChange("tipo_intervento", v as SrTipoIntervento)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sostituzione">Sostituzione</SelectItem>
              <SelectItem value="nuova_costruzione">Nuova costruzione</SelectItem>
              <SelectItem value="ristrutturazione">Ristrutturazione</SelectItem>
              <SelectItem value="manutenzione">Manutenzione</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-12">
          <Label className="text-xs">Indirizzo cantiere</Label>
          <Input
            value={form.cantiere_indirizzo ?? ""}
            onChange={(e) => onChange("cantiere_indirizzo", e.target.value)}
            placeholder="Via Tortona 33"
            className="h-9"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Lascia vuoto se coincide con l'indirizzo del cliente
          </p>
        </div>
        <div className="col-span-12 md:col-span-6">
          <Label className="text-xs">Città</Label>
          <Input
            value={form.cantiere_citta ?? ""}
            onChange={(e) => onChange("cantiere_citta", e.target.value)}
            placeholder="Milano"
            className="h-9"
          />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label className="text-xs">CAP</Label>
          <Input
            value={form.cantiere_cap ?? ""}
            onChange={(e) => onChange("cantiere_cap", e.target.value)}
            placeholder="20121"
            className="h-9"
          />
        </div>
        <div className="col-span-6 md:col-span-3">
          <Label className="text-xs">Piano</Label>
          <Input
            value={form.cantiere_piano ?? ""}
            onChange={(e) => onChange("cantiere_piano", e.target.value)}
            placeholder="3° con ascensore"
            className="h-9"
          />
        </div>
        <div className="col-span-12">
          <Label className="text-xs">Sintesi dell'intervento</Label>
          <Textarea
            value={form.intervento_sintesi ?? ""}
            onChange={(e) => onChange("intervento_sintesi", e.target.value)}
            placeholder="Es. Sostituzione di 4 finestre, 2 porte-finestre, più 6 avvolgibili, 6 cassonetti e 6 zanzariere."
            rows={3}
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Comparirà in alto al PDF — "L'intervento in sintesi"
          </p>
        </div>
      </div>
    </SrCard>
  );
}

// StepEsigenze rimosso: ora il contenuto è gestito da
// @/components/serramenti/StepContenuti (picker dal template + custom inline,
// per esigenze + soluzione + perché noi + incluso + prossimi passi).
