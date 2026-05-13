/**
 * SerramentiWizard — wizard a 8 step per la creazione/modifica di un preventivo.
 *
 * STEP:
 *  1. Cliente            — anagrafica
 *  2. Immobile           — cantiere, vincoli, tipo intervento
 *  3. Esigenze           — 3 pain bullets (default da template)
 *  4. Serramenti (BOM)   — composizione, materiale, vetro, misure
 *  5. Accessori          — avvolgibili, cassonetti, zanzariere
 *  6. Economia           — forbice min/max, sconto, varianti, finanziamento, ROI
 *  7. Consulenza         — appuntamento, consulente, prossimi passi
 *  8. PDF                — genera HTML preventivo (Wave 4)
 *
 * Fix Wave 3:
 *  - Bug: dopo "Crea e continua" l'utente passa subito a Step 2 (era bloccato su Step 1)
 *  - Dirty check: avviso AlertDialog se cambio step con modifiche non salvate
 *  - beforeunload guard
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSerramentoPDF } from "@/hooks/useSerramentoPDF";
import { useTemplatePdf } from "@/lib/serramenti/queries";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Eye, ChevronDown, Copy, GitBranch } from "lucide-react";
import { STATI_LABEL, TRANSIZIONI_STATO } from "@/lib/serramenti/statoLabels";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useProgetto, useCreateProgetto, useUpdateProgetto, useDuplicaProgetto,
} from "@/lib/serramenti/queries";
import { SR_WIZARD_STEPS } from "@/types/serramenti";
import type { SrProgettoRow, SrWizardStep, SrTipoIntervento } from "@/types/serramenti";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { StepBom } from "@/components/serramenti/StepBom";
import { StepAccessori } from "@/components/serramenti/StepAccessori";
import { StepEconomia } from "@/components/serramenti/StepEconomia";
import { StepConsulenza } from "@/components/serramenti/StepConsulenza";
import { StepPdf } from "@/components/serramenti/StepPdf";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { StepContenuti } from "@/components/serramenti/StepContenuti";
import { ContactPickerDialog } from "@/components/serramenti/ContactPickerDialog";
import { Users } from "lucide-react";
import type { CrmContactMinimal } from "@/lib/serramenti/api";

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
  const [searchParams] = useSearchParams();
  const isNew = !id;
  // Pre-link da CRM/Opportunità: ?contact_id=… &opportunity_id=…
  // Permette il flow "Crea preventivo Serramenti" dal dialog opportunità.
  const urlContactId = searchParams.get("contact_id");
  const urlOpportunityId = searchParams.get("opportunity_id");

  const [currentStep, setCurrentStep] = useState<SrWizardStep>("cliente");
  const [creating, setCreating] = useState(false);
  const [pendingStep, setPendingStep] = useState<SrWizardStep | null>(null);

  const { data: detail, isLoading, isError, refetch } = useProgetto(id);
  const updateMut = useUpdateProgetto(id);

  // ─── Anteprima PDF cross-step ──────────────────────────────────────────
  // L'utente può vedere il PDF in qualsiasi momento del wizard, non solo
  // allo Step PDF finale. Riduce sorprese in fase di invio cliente.
  const { previewPDF, isGenerating: isGeneratingPdf } = useSerramentoPDF();
  const { data: pdfTemplate } = useTemplatePdf();
  const wizCompanyId = useEffectiveCompanyId();
  const { data: pdfCompany } = useQuery({
    queryKey: ["sr-wizard-company-pdf", wizCompanyId],
    enabled: !!wizCompanyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("name, ragione_sociale, indirizzo, telefono, email, partita_iva, logo_url")
        .eq("id", wizCompanyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  // PDF anteprima è disponibile solo se il preventivo è salvato (ha id) e
  // ha almeno 1 serramento o accessorio nel BOM (altrimenti PDF vuoto).
  const hasContent = !!detail && (
    detail.serramenti.length > 0 || detail.accessori.length > 0
  );
  const canPreview = !isNew && hasContent && !isGeneratingPdf;

  const handlePreviewClick = () => {
    if (!detail) return;
    void previewPDF({ detail, template: pdfTemplate ?? null, company: pdfCompany ?? null });
  };

  // ─── Status workflow ──────────────────────────────────────────────────
  const currentStato: SrStatoProgetto = (detail?.progetto.stato as SrStatoProgetto) ?? "bozza";
  const statoMeta = STATI_LABEL[currentStato];
  const transizioniDisponibili = TRANSIZIONI_STATO[currentStato] ?? [];

  /** Cambia lo stato del preventivo via mutation immediata (no debounce:
   *  azione utente esplicita, feedback subito visibile). */
  const handleChangeStato = async (next: SrStatoProgetto) => {
    if (!id) return;
    try {
      // Patch immediata via update (bypass autosave debounce per UX snappy).
      await updateMut.mutateAsync({ stato: next });
      setLastSavedAt(new Date());
      const label = STATI_LABEL[next].label;
      toast.success(`Stato → ${label}`);
    } catch (e) {
      toast.error("Impossibile cambiare stato", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  // Auto-expiry: se il preventivo è in stato "consegnato" o "in_valutazione"
  // e la validità è scaduta, proponiamo il flag "scaduto" all'utente.
  // (Non auto-cambiamo silenziosamente per evitare side-effect inattesi.)
  useEffect(() => {
    if (!detail?.progetto) return;
    const { stato, valido_fino_data } = detail.progetto;
    if (stato !== "consegnato" && stato !== "in_valutazione") return;
    if (!valido_fino_data) return;
    const scaduta = new Date(valido_fino_data).getTime() < Date.now();
    if (!scaduta) return;
    // One-shot suggestion via toast, no auto-mutation.
    const dismissKey = `sr-scaduto-toast-${id}`;
    if (sessionStorage.getItem(dismissKey)) return;
    sessionStorage.setItem(dismissKey, "1");
    toast.warning("Preventivo scaduto", {
      description: `La validità è scaduta il ${new Date(valido_fino_data).toLocaleDateString("it-IT")}. Vuoi marcarlo come "scaduto"?`,
      duration: 12_000,
      action: {
        label: "Marca scaduto",
        onClick: () => void handleChangeStato("scaduto"),
      },
    });
  }, [detail?.progetto?.stato, detail?.progetto?.valido_fino_data, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const createMut = useCreateProgetto();
  const duplicaMut = useDuplicaProgetto();

  /** Duplica come nuova revisione: crea SR-xxx-r2/r3/... linked al parent.
   *  Naviga al nuovo progetto in stato bozza per editing immediato. */
  const handleDuplicateAsRevision = async () => {
    if (!id || !detail) return;
    try {
      const result = await duplicaMut.mutateAsync(id);
      toast.success(`Revisione ${result.revision_number} creata`, {
        description: `Nuovo codice: ${result.newCode}. Naviga per modificare.`,
      });
      navigate(`/azienda/serramenti/${result.newId}/modifica`);
    } catch (err) {
      // Error toast già gestito dal mutation onError
      console.error("[duplicate] failed", err);
    }
  };

  const pendingWrites = useIsMutating({ mutationKey: ["sr-progetto-autosave", id] });

  // Local form state — solo per i campi del progetto stesso
  const [form, setForm] = useState<Partial<SrProgettoRow>>({});
  const [dirty, setDirty] = useState(false);
  /** Timestamp ultimo salvataggio riuscito (usato per indicator "Salvato Xs fa"). */
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  /** Tick di refresh ogni 10s per aggiornare il "Salvato Xs fa" in header. */
  const [, setSavedTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSavedTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  // ─── localStorage backup per crash recovery ─────────────────────────────
  // Ogni onChange scrive l'intero form in LS prima ancora del save al server.
  // Se l'utente chiude la tab o il browser crasha durante il debounce, al
  // prossimo mount possiamo proporre il restore.
  const LS_KEY = id ? `sr-autosave-progetto-${id}` : null;

  // Sync form con dati server al primo load / cambio progetto.
  // Null-safe contro flicker tra refetch (detail può diventare temporaneamente
  // undefined durante invalidate → poi torna).
  useEffect(() => {
    if (detail?.progetto) {
      setForm(detail.progetto);
      setDirty(false);
      setLastSavedAt(new Date(detail.progetto.updated_at ?? Date.now()));
    }
  }, [detail?.progetto?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Recovery prompt al mount ──────────────────────────────────────────
  // Se LS ha dati per questo progetto più recenti di server (es. user ha
  // chiuso la tab durante un edit), proponiamo il restore.
  const didCheckRecoveryRef = useRef(false);
  useEffect(() => {
    if (didCheckRecoveryRef.current) return;
    if (!LS_KEY || !detail?.progetto) return;
    didCheckRecoveryRef.current = true;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as { form: Partial<SrProgettoRow>; timestamp: number };
      const serverUpdated = new Date(detail.progetto.updated_at ?? 0).getTime();
      // LS più recente del server di almeno 5 secondi → significa cambio non
      // ancora persistito. Sotto la soglia: probabile residuo già salvato.
      if (cached.timestamp > serverUpdated + 5000) {
        const ageMin = Math.round((Date.now() - cached.timestamp) / 60_000);
        toast.info("Trovate modifiche non salvate", {
          description: `Modifiche di ${ageMin === 0 ? "pochi secondi" : `${ageMin} minuto/i`} fa. Recuperarle?`,
          duration: 15_000,
          action: {
            label: "Recupera",
            onClick: () => {
              setForm(cached.form);
              setDirty(true);
              toast.success("Modifiche ripristinate. Salvataggio in corso…");
            },
          },
          cancel: {
            label: "Scarta",
            onClick: () => {
              if (LS_KEY) localStorage.removeItem(LS_KEY);
            },
          },
        });
      } else {
        // LS obsoleto rispetto a server → pulizia silenziosa.
        localStorage.removeItem(LS_KEY);
      }
    } catch (e) {
      console.warn("[serramenti] LS recovery check failed", e);
    }
  }, [LS_KEY, detail?.progetto?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-popola da CRM quando si arriva con ?contact_id=… (eventualmente
  // accompagnato da ?opportunity_id=…). Fa la fetch del contatto e, se
  // disponibile, dell'opportunità per riempire anche il titolo intervento.
  // Si esegue UNA SOLA VOLTA per nuovo preventivo, e solo se form è vuoto.
  const didPrefillFromUrlRef = useRef(false);
  useEffect(() => {
    if (!isNew) return;
    if (didPrefillFromUrlRef.current) return;
    if (!urlContactId && !urlOpportunityId) return;
    didPrefillFromUrlRef.current = true;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = (await import("@/integrations/supabase/client")).supabase as any;
        const patch: Partial<SrProgettoRow> = {};
        if (urlContactId) {
          const { data: c } = await sb
            .from("marketing_contacts")
            .select("id, first_name, last_name, email, phone, address, city, province, postal_code, fiscal_code")
            .eq("id", urlContactId)
            .maybeSingle();
          if (c) {
            patch.cliente_id = c.id;
            patch.cliente_nome = c.first_name ?? null;
            patch.cliente_cognome = c.last_name ?? null;
            patch.cliente_email = c.email ?? null;
            patch.cliente_telefono = c.phone ?? null;
            patch.cliente_indirizzo = c.address ?? null;
            patch.cliente_citta = c.city ?? null;
            patch.cliente_provincia = c.province ?? null;
            patch.cliente_cap = c.postal_code ?? null;
            patch.cliente_codice_fiscale = c.fiscal_code ?? null;
          }
        }
        if (urlOpportunityId) {
          patch.opportunita_id = urlOpportunityId;
          const { data: opp } = await sb
            .from("marketing_opportunities")
            .select("id, title, description")
            .eq("id", urlOpportunityId)
            .maybeSingle();
          if (opp) {
            patch.intervento_titolo = opp.title ?? null;
            patch.intervento_sintesi = opp.description ?? null;
          }
        }
        setForm((prev) => ({ ...prev, ...patch }));
        setDirty(Object.keys(patch).length > 0);
      } catch (e) {
        console.warn("[serramenti] prefill from URL failed", e);
      }
    })();
  }, [isNew, urlContactId, urlOpportunityId]);

  // Auto-advance Step 1 → Step 2 dopo creazione iniziale.
  // Si attiva UNA SOLA VOLTA per sessione di editing: subito dopo il primo
  // load del progetto. Su refresh successivi (anche con cliente_nome già
  // popolato) l'utente resta dove sta, e può tornare allo Step 1 liberamente.
  const didAutoAdvanceRef = useRef(false);
  useEffect(() => {
    if (didAutoAdvanceRef.current) return;
    if (!id || !detail?.progetto) return;
    didAutoAdvanceRef.current = true;
    const hasStep1Data = detail.progetto.cliente_nome || detail.progetto.cliente_cognome;
    if (currentStep === "cliente" && hasStep1Data) {
      setCurrentStep("immobile");
    }
    // Volutamente non includiamo detail.progetto in deps: il ref guard sopra
    // garantisce single-fire per sessione → exhaustive-deps non si applica.
  }, [detail?.progetto?.id, id, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // LS backup sincrono: ogni cambio è subito persisto in LocalStorage,
      // anche se l'utente chiude la tab prima del debounced autosave.
      // Recovery al prossimo mount confronta con server.updated_at.
      if (LS_KEY) {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ form: next, timestamp: Date.now() }));
        } catch (e) {
          // QuotaExceededError raro ma possibile su form enormi: best-effort
          console.warn("[serramenti] LS backup failed", e);
        }
      }
      return next;
    });
    setDirty(true);
  };

  // ─── Autosave debounced ────────────────────────────────────────────────
  // Salvataggio automatico ogni 2 secondi dopo l'ultima modifica, se il
  // progetto è esistente (no autosave per isNew: prima Save manuale crea
  // l'id, poi autosave subentra). Su preventivi esistenti l'utente NON deve
  // più cliccare "Salva e continua" per non perdere dati.
  const autosaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (isNew || !id) return;
    if (!dirty) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          await updateMut.mutateAsync(form);
          setDirty(false);
          setLastSavedAt(new Date());
          // Cleanup LS dopo save riuscito: la recovery non avrebbe più senso
          // perché server è ora la source-of-truth.
          if (LS_KEY) localStorage.removeItem(LS_KEY);
        } catch {
          // Errore loggato dal mutation (toast.error sotto). Lasciamo dirty=true
          // così il prossimo debounce ritenta.
        }
      })();
    }, 2000);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [form, dirty, id, isNew, LS_KEY]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setLastSavedAt(new Date());
      if (LS_KEY) localStorage.removeItem(LS_KEY);
      return true;
    } catch (e) {
      // Prima: silent catch -> utente cliccava "Salva e continua" e non
      // succedeva nulla. Ora notifica chiara.
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      toast.error("Salvataggio fallito", { description: msg });
      return false;
    }
  };

  /** Formatta "Salvato Xs fa" per l'header. Funzione (non useMemo) perché
   *  Date.now() non è una dependency stabile; il re-render è triggered dal
   *  savedTick interval ogni 10s, e la funzione viene rieseguita inline in JSX. */
  const formatLastSaved = (): string | null => {
    if (!lastSavedAt) return null;
    const seconds = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
    if (seconds < 5) return "Salvato adesso";
    if (seconds < 60) return `Salvato ${seconds}s fa`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Salvato ${minutes}min fa`;
    return `Salvato alle ${lastSavedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const handleSaveAndContinue = async () => {
    // Caso 1: nuovo progetto — crea passando TUTTO il form, non solo 4 campi.
    // Bug fix: prima i campi cliente_indirizzo/cap/telefono/email/provincia ecc.
    // inseriti nello Step 1 venivano persi alla creazione.
    if (isNew) {
      setCreating(true);
      try {
        const created = await createMut.mutateAsync({
          ...form,
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
      toast.success("Preventivo salvato");
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

  // Error state con retry: prima se la query falliva l'utente vedeva
  // solo l'header del wizard senza children (perche' tutti gli step
  // sono condizionati a `id && detail`) -> percepito come bug/freeze.
  if (!isNew && (isError || (!isLoading && !detail))) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-800">
            Impossibile caricare questo preventivo.
          </p>
          <p className="text-xs text-muted-foreground">
            Il preventivo potrebbe essere stato eliminato o c'è un problema di connessione.
          </p>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1">
              <Loader2 className="h-3.5 w-3.5" /> Riprova
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate("/azienda/serramenti")} className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Torna ai preventivi
            </Button>
          </div>
        </div>
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
              <RectangleVertical className="h-4 w-4 text-orange-600" />
              <span className="font-semibold text-sm">
                {isNew ? "Nuovo preventivo" : detail?.progetto.code}
              </span>
              {detail?.progetto.cliente_nome && (
                <Badge variant="outline" className="text-[10px]">
                  {[detail.progetto.cliente_nome, detail.progetto.cliente_cognome].filter(Boolean).join(" ")}
                </Badge>
              )}
              {/* Status badge azionabile: click → dropdown con transizioni
                  consentite. Le azioni cambiano in base allo stato corrente
                  (es. da "consegnato" → Accettato/Rifiutato/In valutazione). */}
              {!isNew && detail && transizioniDisponibili.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`text-[10px] h-5 px-1.5 rounded border inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity ${statoMeta.className}`}
                      title="Cambia stato preventivo"
                    >
                      {statoMeta.label}
                      <ChevronDown className="h-2.5 w-2.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium border-b">
                      Cambia stato
                    </div>
                    {transizioniDisponibili.map((t, idx) => (
                      <DropdownMenuItem
                        key={t.next}
                        onClick={() => void handleChangeStato(t.next)}
                        className="text-xs"
                      >
                        {t.label}
                        {idx === 0 && transizioniDisponibili.length > 2 && (
                          <span className="ml-auto text-[9px] text-muted-foreground">consigliato</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                    {currentStato !== "archiviato" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => void handleChangeStato("archiviato")}
                          className="text-xs text-muted-foreground"
                        >
                          Archivia
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : !isNew && detail ? (
                <Badge variant="outline" className={`text-[10px] ${statoMeta.className}`}>
                  {statoMeta.label}
                </Badge>
              ) : null}
              {/* Badge revisione: visibile solo se revision_number > 1
                  (es. "Rev. 2"). Click → toast info su parent_id (utente
                  capisce che esiste una versione precedente). */}
              {!isNew && detail && detail.progetto.revision_number > 1 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-violet-300 bg-violet-50 text-violet-700"
                  title={
                    detail.progetto.parent_id
                      ? `Revisione ${detail.progetto.revision_number} di un preventivo precedente`
                      : `Revisione ${detail.progetto.revision_number}`
                  }
                >
                  <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                  Rev. {detail.progetto.revision_number}
                </Badge>
              )}
              {(updateMut.isPending || pendingWrites > 0) ? (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
                </span>
              ) : dirty ? (
                <span className="text-[10px] text-amber-600" title="Le modifiche verranno salvate automaticamente entro 2 secondi">
                  ● Modifiche non salvate
                </span>
              ) : lastSavedAt ? (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5" title={`Ultimo salvataggio: ${lastSavedAt.toLocaleString("it-IT")}`}>
                  ✓ {formatLastSaved()}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Step {currentStepIndex + 1} di {SR_WIZARD_STEPS.length} · {SR_WIZARD_STEPS[currentStepIndex]?.label}
            </p>
          </div>
          {/* Duplica come revisione: crea copia del preventivo come nuova
              revisione (parent_id linked). Utile per "Cliente vuole 3 offerte
              base/medio/premium" senza ri-creare tutto da zero. */}
          {!isNew && detail && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDuplicateAsRevision()}
              disabled={duplicaMut.isPending}
              className="hidden md:inline-flex h-9 gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
              title="Crea una nuova revisione del preventivo (es. variante per il cliente)"
            >
              {duplicaMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="hidden lg:inline">Nuova revisione</span>
              <span className="lg:hidden">Rev</span>
            </Button>
          )}
          {/* Anteprima PDF veloce: sempre presente nell'header sticky.
              Permette al commerciale di vedere come apparirà il PDF cliente
              SENZA dover navigare allo Step finale. Disable se preventivo
              nuovo (no id) o BOM vuoto (PDF sarebbe inutile). */}
          {!isNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviewClick}
              disabled={!canPreview}
              className="hidden sm:inline-flex h-9 gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
              title={
                !hasContent
                  ? "Aggiungi almeno un serramento o accessorio per vedere l'anteprima"
                  : isGeneratingPdf
                  ? "Generazione PDF in corso..."
                  : "Apri anteprima PDF in nuova finestra"
              }
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="hidden md:inline">Anteprima PDF</span>
              <span className="md:hidden">PDF</span>
            </Button>
          )}
        </div>
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-orange-600 transition-all duration-300"
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
                            ? "bg-orange-100 text-orange-900 font-semibold"
                            : isPast
                            ? "text-foreground hover:bg-muted"
                            : "text-muted-foreground",
                          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        )}
                      >
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                          isActive ? "bg-orange-600 text-white" :
                          isPast ? "bg-orange-100 text-orange-600" :
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
            {/* ErrorBoundary granulare per step: se uno step crasha (es. dato
                corrotto), gli altri step restano navigabili e l'utente vede
                un fallback con "Riprova" invece dell'app blank. */}
            <ErrorBoundary title="Errore in questa sezione del preventivo">
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
              <StepConsulenza form={form} onChange={onChange} />
            )}
            {currentStep === "pdf" && id && detail && (
              <StepPdf progettoId={id} detail={detail} />
            )}
            </ErrorBoundary>

            {/* Navigation footer */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={handleBack} disabled={currentStepIndex === 0}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
              </Button>
              <Button
                onClick={handleSaveAndContinue}
                disabled={updateMut.isPending || creating}
                className="bg-orange-500 hover:bg-orange-600 gap-1"
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
              className="bg-orange-500 hover:bg-orange-600"
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
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelectContact = (c: CrmContactMinimal) => {
    // Popola tutti i campi dal contatto CRM, salva il riferimento via cliente_id
    onChange("cliente_id", c.id);
    onChange("cliente_nome", c.first_name);
    onChange("cliente_cognome", c.last_name);
    onChange("cliente_email", c.email);
    onChange("cliente_telefono", c.phone);
    onChange("cliente_indirizzo", c.address);
    onChange("cliente_citta", c.city);
    onChange("cliente_cap", c.postal_code);
    onChange("cliente_provincia", c.province);
  };

  return (
    <SrCard
      title="Contatto"
      description="Seleziona un contatto esistente dal CRM oppure compila a mano. I campi non obbligatori (telefono, email, indirizzo) compaiono nel PDF e nel microsito cliente."
      icon={<User className="h-4 w-4" />}
    >
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-dashed border-orange-300 bg-orange-50/40 p-3">
        <div>
          <p className="text-xs font-semibold text-orange-900">Hai già un contatto nel CRM?</p>
          <p className="text-[11px] text-orange-600">
            {form.cliente_id
              ? "Contatto CRM selezionato — i dati sono pre-popolati dal record esistente."
              : "Selezionalo per pre-popolare nome, telefono, email e indirizzo."}
          </p>
        </div>
        <div className="flex gap-2">
          {form.cliente_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange("cliente_id", null)}
              className="text-xs"
            >
              Scollega contatto
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="gap-1 border-orange-400 text-orange-600 hover:bg-orange-100"
          >
            <Users className="h-3.5 w-3.5" />
            {form.cliente_id ? "Cambia contatto" : "Seleziona da CRM"}
          </Button>
        </div>
      </div>

      <ContactPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleSelectContact}
      />

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
      description="Indirizzo del cantiere (se diverso dal cliente) e tipo di intervento. La sintesi narrativa si genera automaticamente dal BOM."
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
        {/* Campo "Sintesi dell'intervento" rimosso intenzionalmente.
            E' generato in automatico da `generateInterventoSintesi` partendo
            dal BOM (serramenti + accessori) e dal tipo intervento. Comparira'
            in alto al PDF — "L'intervento in sintesi". */}
      </div>
    </SrCard>
  );
}
