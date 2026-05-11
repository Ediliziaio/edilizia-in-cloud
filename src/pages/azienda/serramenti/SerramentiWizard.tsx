/**
 * SerramentiWizard — wizard a 8 step per la creazione/modifica di una stima.
 *
 * STEP:
 *  1. Cliente            — anagrafica (riusa Clienti / link CRM)
 *  2. Immobile           — indirizzo cantiere, vincoli, tipo intervento
 *  3. Esigenze           — 3 pain bullets (default da template)
 *  4. Serramenti (BOM)   — composizione, materiale, vetro, misure, import sopralluogo
 *  5. Accessori + Foto   — avvolgibili, cassonetti, zanzariere + foto cantiere
 *  6. Economia           — forbice min/max, sconto, varianti, finanziamento, ROI
 *  7. Consulenza         — appuntamento, consulente, cronoprogramma
 *  8. PDF                — genera HTML preventivo, salva URL
 *
 * Scheletro Wave 2: navigazione, salvataggio header, layout. Le sezioni
 * di dettaglio vengono completate progressivamente in Wave 3.
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const qc = useQueryClient();
  const isNew = !id;

  const [currentStep, setCurrentStep] = useState<SrWizardStep>("cliente");
  const [creating, setCreating] = useState(false);

  const { data: detail, isLoading } = useProgetto(id);
  const updateMut = useUpdateProgetto(id);
  const createMut = useCreateProgetto();

  // Local form state per il progetto
  const [form, setForm] = useState<Partial<SrProgettoRow>>({});

  useEffect(() => {
    if (detail?.progetto) {
      setForm(detail.progetto);
    }
  }, [detail?.progetto.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAndContinue = async () => {
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
    if (!id) return;
    try {
      await updateMut.mutateAsync(form);
      const idx = SR_WIZARD_STEPS.findIndex((s) => s.key === currentStep);
      if (idx >= 0 && idx < SR_WIZARD_STEPS.length - 1) {
        setCurrentStep(SR_WIZARD_STEPS[idx + 1].key);
      } else {
        toast.success("Stima salvata");
      }
    } catch {
      /* error toast già gestito dal hook */
    }
  };

  const currentStepIndex = useMemo(
    () => SR_WIZARD_STEPS.findIndex((s) => s.key === currentStep),
    [currentStep],
  );

  const progress = useMemo(() => {
    return Math.round(((currentStepIndex + 1) / SR_WIZARD_STEPS.length) * 100);
  }, [currentStepIndex]);

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
              {updateMut.isPending && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Step {currentStepIndex + 1} di {SR_WIZARD_STEPS.length} · {SR_WIZARD_STEPS[currentStepIndex]?.label}
            </p>
          </div>
        </div>
        {/* Progress */}
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
                    return (
                      <button
                        key={s.key}
                        onClick={() => !isNew && setCurrentStep(s.key)}
                        disabled={isNew && idx > 0}
                        className={cn(
                          "w-full text-left px-2.5 py-2 rounded-md text-xs flex items-center gap-2 transition-colors",
                          isActive
                            ? "bg-emerald-100 text-emerald-900 font-semibold"
                            : isPast
                            ? "text-muted-foreground hover:bg-muted"
                            : "text-muted-foreground/60",
                          isNew && idx > 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer",
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
              <StepEsigenze form={form} onChange={onChange} />
            )}
            {currentStep === "bom" && <StepPlaceholder title="Composizione serramenti" description="In Wave 3 — aggiunta tipologie, materiali, vetri, misure per ciascun pezzo. Import da sopralluogo Infissi v6." />}
            {currentStep === "accessori_foto" && <StepPlaceholder title="Accessori e foto" description="In Wave 3 — avvolgibili, cassonetti, zanzariere + upload foto cantiere/render." />}
            {currentStep === "economia" && <StepPlaceholder title="Economia + ROI" description="In Wave 3 — forbice min/max, sconto, varianti (Standard/Comfort/Premium), finanziamento, calcolo risparmio energetico 10 anni." />}
            {currentStep === "consulenza" && <StepPlaceholder title="Consulenza + Cronoprogramma" description="In Wave 3 — appuntamento, consulente, cronoprogramma lavori, prossimi passi." />}
            {currentStep === "pdf" && <StepPlaceholder title="Genera PDF" description="In Wave 4 — chiama edge function sr-genera-pdf, salva HTML su Storage, link condivisibile + QR firma." />}

            {/* Navigation footer */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  const idx = currentStepIndex;
                  if (idx > 0) setCurrentStep(SR_WIZARD_STEPS[idx - 1].key);
                }}
                disabled={currentStepIndex === 0}
              >
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
    </div>
  );
}

// ─── Step components ────────────────────────────────────────────────────────

function StepCliente({
  form, onChange,
}: {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-emerald-700" />
          Anagrafica cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 grid grid-cols-12 gap-3">
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
      </CardContent>
    </Card>
  );
}

function StepImmobile({
  form, onChange,
}: {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="h-4 w-4 text-emerald-700" />
          Cantiere e intervento
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 grid grid-cols-12 gap-3">
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
      </CardContent>
    </Card>
  );
}

function StepEsigenze({
  form, onChange,
}: {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}) {
  const esigenze = (form.esigenze ?? []) as { titolo: string; descrizione: string }[];

  const updateEsigenza = (idx: number, field: "titolo" | "descrizione", value: string) => {
    const next = [...esigenze];
    next[idx] = { ...next[idx], [field]: value };
    onChange("esigenze", next);
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-700" />
          Esigenze del cliente
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Le 3 esigenze principali emerse dal sopralluogo o dalla chiamata. Compaiono nella pagina 1 del PDF come "Le tue esigenze".
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        {[0, 1, 2].map((idx) => {
          const e = esigenze[idx] ?? { titolo: "", descrizione: "" };
          return (
            <div key={idx} className="border-l-4 border-emerald-200 pl-3 py-1">
              <Label className="text-xs">Esigenza {idx + 1} — Titolo</Label>
              <Input
                value={e.titolo}
                onChange={(v) => updateEsigenza(idx, "titolo", v.target.value)}
                placeholder={["Spifferi", "Condensa", "Aspetto"][idx]}
                className="h-9 mb-2"
              />
              <Label className="text-xs">Descrizione</Label>
              <Textarea
                value={e.descrizione}
                onChange={(v) => updateEsigenza(idx, "descrizione", v.target.value)}
                placeholder="Cosa risolve il nuovo serramento"
                rows={2}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StepPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="border-2 border-dashed border-emerald-200 rounded-md p-6 text-center">
          <FileText className="h-8 w-8 mx-auto text-emerald-300 mb-2" />
          <p className="text-sm text-muted-foreground">{description}</p>
          <Badge variant="outline" className="mt-3 bg-amber-50 text-amber-700 border-amber-200">
            🚧 In sviluppo
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
