/**
 * PavimentiWizard — shell a step per creare/modificare un progetto di
 * pavimenti. Modellato su SerramentiWizard:
 *  - sticky header con codice, badge stato, indicatore salvataggio
 *  - progress bar + stepper (sidebar desktop / scroller mobile)
 *  - autosave debounced su progetto esistente; "Crea e continua" su nuovo
 *  - navigazione avanti/indietro + beforeunload guard
 *
 * STEP:
 *  1. Cliente   — anagrafica + picker contatto/opportunità CRM   (Task 12)
 *  2. Immobile  — cantiere, immobile, tipo intervento, vincoli   (Task 12)
 *  3. Computo   — computo metrico premium                        (Task 17, in arrivo)
 *  4. Foto      — media situazione/render                        (Task 18, in arrivo)
 *  5. Economia  — sconto/IVA/detrazione + riepilogo              (Task 19, in arrivo)
 *  6. PDF       — generazione preventivo brandizzato             (Task 22, in arrivo)
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ArrowRight, Save, Loader2, Hammer, CheckCircle2,
  User, Home, ClipboardList, Image as ImageIcon, Euro, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePavimentiProgetto,
  useUpsertProgetto,
  getPavTemplatePdf,
} from "@/hooks/usePavimentiProgetto";
import type { PavProgetto } from "@/types/pavimenti";
import {
  PAV_WIZARD_STEPS, PAV_STATI_LABEL, stepCompletion,
  compactText, type PavWizardStepKey,
} from "./PavimentiWizard/helpers";
import type { PavFormPatch } from "./PavimentiWizard/types";
import { useSupportoModelloPreventivo } from "@/hooks/useSupportoModelliPreventivo";
import { TIPO_INTERVENTO_DEL_MODELLO, creaModelloPreventivo, interventoDelModulo, leggiModelloPreventivo } from "@/lib/moduli/modelloPreventivo";
import StepCliente from "./PavimentiWizard/StepCliente";
import StepImmobile from "./PavimentiWizard/StepImmobile";
import StepComputo from "./PavimentiWizard/StepComputo";
import StepMedia from "./PavimentiWizard/StepMedia";
import StepEconomia from "./PavimentiWizard/StepEconomia";
import StepPdf from "./PavimentiWizard/StepPdf";

const STEP_ICONS: Record<PavWizardStepKey, React.FC<React.SVGProps<SVGSVGElement>>> = {
  cliente: User,
  immobile: Home,
  computo: ClipboardList,
  media: ImageIcon,
  economia: Euro,
  pdf: FileText,
};

/** Telefono: i nomi dei passi nello stepper, corti perché stiano tutti in una riga. */
const ETICHETTA_BREVE_PASSO: Partial<Record<PavWizardStepKey, string>> = { immobile: "Intervento" };

export default function PavimentiWizard() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  // ?modello=… : il preventivo nasce da un intervento della libreria (come Tetti).
  const requestedModel = searchParams.get("modello");
  const modelSupport = useSupportoModelloPreventivo("pavimenti");
  const { user, effectiveCompany } = useAuth();
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  // Riprendi bozza su "nuovo": ultima bozza propria (l'azienda la scopa la RLS)
  const { data: ultimaBozza } = useQuery({
    queryKey: ["pav-ultima-bozza", user?.id, effectiveCompany?.id],
    enabled: isNew && !!user?.id && !!effectiveCompany?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error } = await (supabase as any)
        .from("pav_progetti")
        .select("id, code, cliente_nome, cliente_cognome, updated_at")
        .eq("created_by", user!.id)
        // La bozza di QUESTA azienda: chi lavora su più aziende (e il super admin
        // in «Stai visualizzando») si vedeva riproporre quella di un'altra.
        .eq("company_id", effectiveCompany!.id)
        .eq("stato", "bozza")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return row as {
        id: string; code: string | null; cliente_nome: string | null;
        cliente_cognome: string | null; updated_at: string | null;
      } | null;
    },
  });

  // Pre-link da CRM: ?contact_id=… & opportunity_id=…
  const urlContactId = searchParams.get("contact_id");
  const urlOpportunityId = searchParams.get("opportunity_id");

  const [currentStep, setCurrentStep] = useState<PavWizardStepKey>("cliente");
  const [creating, setCreating] = useState(false);

  const { data: detail, isLoading, isError, refetch } = usePavimentiProgetto(id);
  const upsertMut = useUpsertProgetto();
  const savedModel = useMemo<{ snapshot: ReturnType<typeof leggiModelloPreventivo>; error: string | null }>(() => {
    try { return { snapshot: detail ? leggiModelloPreventivo("pavimenti", detail.progetto.modello_snapshot, detail.progetto.company_id) : null, error: null }; }
    catch (error) { return { snapshot: null, error: error instanceof Error ? error.message : "Modello non valido" }; }
  }, [detail]);
  const model = interventoDelModulo("pavimenti", isNew ? requestedModel : savedModel.snapshot?.modelId);

  // Local form state (campi del progetto).
  const [form, setForm] = useState<PavFormPatch>(() => model ? { tipo_intervento: TIPO_INTERVENTO_DEL_MODELLO.pavimenti[model.id] } : {});
  const createInput = async (): Promise<PavFormPatch> => {
    if (!requestedModel) return form;
    if (!model || !modelSupport.supported || !effectiveCompany?.id) throw new Error("Il salvataggio di questo intervento deve essere attivato nel database. Nessuna offerta generica è stata creata.");
    const companyId = effectiveCompany.id;
    const [{ createFullPavTemplate, isFullPavModuleId }, { loadLocalPavTemplate }, { sincronizzaModelliAzienda }] = await Promise.all([
      import("@/lib/moduli-vendita/fullPavModules"), import("@/lib/moduli-vendita/localPavTemplates"),
      import("@/lib/moduli-vendita/archivioModelli"),
    ]);
    if (!isFullPavModuleId(model.id)) throw new Error("Questo intervento non ha un modello completo. Nessuna offerta generica è stata creata.");
    // Il modello personalizzato è dell'azienda: può averlo salvato un collega da
    // un altro computer. Se il database non risponde resta la copia di questo browser.
    await sincronizzaModelliAzienda(companyId).catch((): void => undefined);
    const base = await getPavTemplatePdf(companyId);
    const source = loadLocalPavTemplate(companyId, model.id)?.template ?? createFullPavTemplate(base, model.id);
    return { ...form, tipo_intervento: TIPO_INTERVENTO_DEL_MODELLO.pavimenti[model.id], modello_snapshot: creaModelloPreventivo("pavimenti", companyId, model.id, source) };
  };
  // L'ultimo form a video. Quando un salvataggio torna, «salvato» vale solo se
  // nel frattempo non si è scritto altro: azzerare «dirty» comunque perdeva le
  // modifiche fatte durante la richiesta, perché l'autosave non ripartiva.
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  });
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Etichetta "Salvato Xs fa" calcolata fuori dal render (in un tick periodico)
  // per non chiamare Date.now() durante il render (regola di purezza React).
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  // Sync form con dati server al primo load / cambio progetto. È la sincronia
  // legittima "deriva stato da props quando cambia l'id del record".
  const lastLoadedIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!detail?.progetto) return;
    if (lastLoadedIdRef.current === detail.progetto.id) return;
    lastLoadedIdRef.current = detail.progetto.id;
    setForm(detail.progetto);
    setDirty(false);
    setLastSavedAt(new Date());
  }, [detail?.progetto?.id, detail?.progetto]);

  // Prefill da CRM quando si crea con ?contact_id=… / ?opportunity_id=…
  const didPrefillFromUrlRef = useRef(false);
  useEffect(() => {
    if (!isNew) return;
    if (didPrefillFromUrlRef.current) return;
    if (!urlContactId && !urlOpportunityId) return;
    didPrefillFromUrlRef.current = true;
    const patch: PavFormPatch = {};
    if (urlContactId) patch.cliente_id = urlContactId;
    if (urlOpportunityId) patch.opportunita_id = urlOpportunityId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill one-shot da query string
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(Object.keys(patch).length > 0);
  }, [isNew, urlContactId, urlOpportunityId]);

  // Auto-advance Step 1 → Step 2 dopo creazione iniziale (single-fire).
  const didAutoAdvanceRef = useRef(false);
  useEffect(() => {
    if (didAutoAdvanceRef.current) return;
    if (!id || !detail?.progetto) return;
    didAutoAdvanceRef.current = true;
    const hasStep1Data = detail.progetto.cliente_nome || detail.progetto.cliente_cognome || detail.progetto.cliente_id;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-advance one-shot post creazione
    if (currentStep === "cliente" && hasStep1Data) setCurrentStep("immobile");
    // detail.progetto volutamente non in deps: il ref guard garantisce single-fire.
  }, [detail?.progetto?.id, id, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick periodico (10s) che ricalcola l'etichetta "Salvato Xs fa" in stato,
  // così il render resta puro (nessun Date.now() durante il render).
  useEffect(() => {
    const compute = () => {
      if (!lastSavedAt) { setSavedLabel(null); return; }
      const seconds = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
      if (seconds < 5) setSavedLabel("Salvato adesso");
      else if (seconds < 60) setSavedLabel(`Salvato ${seconds}s fa`);
      else {
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) setSavedLabel(`Salvato ${minutes}min fa`);
        else setSavedLabel(`Salvato alle ${lastSavedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`);
      }
    };
    compute();
    const t = setInterval(compute, 10_000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  const onChange = <K extends keyof PavFormPatch>(key: K, value: PavFormPatch[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // ─── Autosave debounced (solo su progetto esistente) ─────────────────────
  const autosaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (isNew || !id) return;
    if (!dirty) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          await upsertMut.mutateAsync({ ...form, id });
          if (formRef.current === form) setDirty(false);
          setLastSavedAt(new Date());
        } catch {
          // Errore: lasciamo dirty=true così il prossimo ciclo ritenta.
        }
      })();
    }, 2000);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [form, dirty, id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // Beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || upsertMut.isPending) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, upsertMut.isPending]);

  const saveProgetto = async (): Promise<boolean> => {
    if (!id) return false;
    try {
      await upsertMut.mutateAsync({ ...form, id });
      if (formRef.current === form) setDirty(false);
      setLastSavedAt(new Date());
      return true;
    } catch (e) {
      toast.error("Salvataggio fallito", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
      return false;
    }
  };

  const currentStepIndex = useMemo(
    () => PAV_WIZARD_STEPS.findIndex((s) => s.key === currentStep),
    [currentStep],
  );
  const progress = useMemo(
    () => Math.round(((currentStepIndex + 1) / PAV_WIZARD_STEPS.length) * 100),
    [currentStepIndex],
  );
  // Col modello il tipo d'intervento è già scelto: lo step Immobile si completa
  // coi dati del cantiere, non col tipo preimpostato. Senza useMemo, come Tetti:
  // il compilatore di React non riesce a conservarlo con il modello tra le dipendenze.
  const completion = stepCompletion(model ? { ...form, tipo_intervento: null } : form, detail?.computo);

  const handleSaveAndContinue = async () => {
    // Nuovo progetto: crea passando tutto il form, poi naviga al record creato.
    if (isNew) {
      setCreating(true);
      try {
        const created = await upsertMut.mutateAsync(await createInput());
        navigate(`/azienda/pavimenti/${created.id}/modifica`, { replace: true });
      } catch (e) {
        toast.error("Creazione progetto fallita", {
          description: e instanceof Error ? e.message : "Errore sconosciuto",
        });
      } finally {
        setCreating(false);
      }
      return;
    }
    if (!id) return;
    const ok = await saveProgetto();
    if (!ok) return;
    const idx = PAV_WIZARD_STEPS.findIndex((s) => s.key === currentStep);
    if (idx >= 0 && idx < PAV_WIZARD_STEPS.length - 1) {
      setCurrentStep(PAV_WIZARD_STEPS[idx + 1].key);
    } else {
      toast.success("Progetto salvato");
    }
  };

  const handleStepClick = async (target: PavWizardStepKey) => {
    if (target === currentStep) return;
    if (isNew) return; // in new mode gli step laterali sono disabled
    if (dirty) {
      const ok = await saveProgetto();
      if (!ok) return;
    }
    setCurrentStep(target);
  };

  const handleBack = () => {
    if (currentStepIndex > 0) void handleStepClick(PAV_WIZARD_STEPS[currentStepIndex - 1].key);
  };

  // ─── Stati di caricamento/errore ─────────────────────────────────────────
  if (!isNew && isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!isNew && (isError || (!isLoading && !detail))) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-800">Impossibile caricare questo progetto.</p>
          <p className="text-xs text-muted-foreground">
            Il progetto potrebbe essere stato eliminato o c'è un problema di connessione.
          </p>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1">
              <Loader2 className="h-3.5 w-3.5" /> Riprova
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate("/azienda/pavimenti")} className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Torna ai progetti
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (savedModel.error || (isNew && requestedModel && !model)) return <div role="alert" className="space-y-3 p-6"><h1 className="text-xl font-semibold">Intervento non disponibile</h1><p>{savedModel.error ?? "Il tipo di intervento richiesto non è riconosciuto."}</p><Button onClick={() => navigate("/azienda/marketing/preventivi?tab=moduli&area=pavimenti")}>Scegli un intervento</Button></div>;

  const statoMeta = PAV_STATI_LABEL[(detail?.progetto.stato as PavProgetto["stato"]) ?? "bozza"];

  return (
    <div className="pb-28 md:pb-20">
      {model && <section className="mx-auto max-w-6xl space-y-2 p-4"><h1 className="text-xl font-semibold">Preventivo · {model.title}</h1><p className="text-sm text-muted-foreground">{model.summary}</p><p className="text-xs">Cliente → Immobile → Lavorazioni e prodotti → Prezzi e sconti → PDF dell'intervento</p>
        {isNew && !modelSupport.supported && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{modelSupport.isLoading ? "Verifica del salvataggio…" : "Percorso predisposto: il salvataggio richiede ancora l'attivazione del database. Non inserire dati finché il collegamento non è attivo."}</p>}
      </section>}
      {/* Sticky header */}
      {/* ── Riprendi bozza: su "nuovo", se esiste una bozza propria ── */}
      <AlertDialog open={Boolean(isNew && !requestedModel && ultimaBozza && !resumeDismissed)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hai un preventivo in bozza</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Vuoi riprendere da dove eri rimasto?</p>
                <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700 space-y-0.5">
                  <p className="font-semibold text-slate-900">{ultimaBozza?.code ?? "Bozza"}</p>
                  {(ultimaBozza?.cliente_nome || ultimaBozza?.cliente_cognome) && (
                    <p>{[ultimaBozza?.cliente_nome, ultimaBozza?.cliente_cognome].filter(Boolean).join(" ")}</p>
                  )}
                  {ultimaBozza?.updated_at && (
                    <p className="text-xs text-muted-foreground">
                      Ultima modifica {new Date(ultimaBozza.updated_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResumeDismissed(true)}>Nuovo da zero</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(`/azienda/pavimenti/${ultimaBozza!.id}/modifica`)}>
              Riprendi bozza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Uscita con dati non salvati: salva bozza? ── */}
      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvare come bozza?</AlertDialogTitle>
            <AlertDialogDescription>
              I dati inseriti verranno salvati come bozza: la ritroverai nella lista e al prossimo "Nuovo preventivo".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua a compilare</AlertDialogCancel>
            <AlertDialogAction
              className="bg-slate-500 hover:bg-slate-600"
              onClick={() => navigate("/azienda/pavimenti")}
            >
              Esci senza salvare
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await upsertMut.mutateAsync(isNew ? await createInput() : { ...form });
                  toast.success("Bozza salvata — la ritrovi nella lista");
                } catch (e) {
                  toast.error("Salvataggio bozza fallito", { description: e instanceof Error ? e.message : undefined });
                  return;
                }
                navigate("/azienda/pavimenti");
              }}
            >
              Salva bozza ed esci
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Il contenitore che scorre ha 12px (telefono) o 24px (computer) di spazio
          in alto: con top-0 la testata si fermava lì e nella fessura sopra si
          vedevano passare i campi. Da telefono è anche a tutta larghezza,
          attaccata alla barra dell'app. */}
      <div className="sticky top-0 z-30 border-b bg-background/95 shadow-sm backdrop-blur max-md:-mx-3 max-md:-mt-3 max-md:-top-3 md:-top-6">
        <div className="container mx-auto flex max-w-6xl items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
          <Button variant="ghost" size="icon" onClick={() => { if (isNew && dirty) { setExitDialogOpen(true); return; } navigate("/azienda/pavimenti"); }} className="h-10 w-10 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap max-md:gap-y-0.5">
              <Hammer className="h-4 w-4 text-orange-600 max-md:hidden" />
              <span className="font-semibold text-sm max-md:order-1 max-md:text-[15px]">
                {isNew ? model?.title ?? "Nuovo progetto" : detail?.progetto.code ?? "Progetto"}
              </span>
              {!isNew && compactText(detail?.progetto.cliente_nome, detail?.progetto.cliente_cognome) && (
                <Badge variant="outline" className="text-[10px] max-md:order-4 max-md:border-0 max-md:p-0 max-md:text-xs max-md:font-normal max-md:text-muted-foreground">
                  {compactText(detail?.progetto.cliente_nome, detail?.progetto.cliente_cognome)}
                </Badge>
              )}
              {!isNew && detail && (
                <Badge variant="outline" className={cn("text-[10px] max-md:order-2 max-md:text-[11px]", statoMeta.className)}>
                  {statoMeta.label}
                </Badge>
              )}
              {/* Telefono: codice e stato sulla prima riga, cliente e salvataggio sotto. */}
              <span aria-hidden className="hidden h-0 basis-full max-md:order-3 max-md:block" />
              {upsertMut.isPending ? (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 max-md:order-5 max-md:text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
                </span>
              ) : dirty ? (
                <span className="text-[10px] text-amber-600 max-md:order-5 max-md:text-xs" title="Le modifiche verranno salvate automaticamente entro 2 secondi">
                  ● Modifiche non salvate
                </span>
              ) : savedLabel ? (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5 max-md:hidden">
                  ✓ {savedLabel}
                </span>
              ) : null}
            </div>
            {/* Telefono: il passo attivo lo dice già lo stepper qui sotto. */}
            <p className="text-[11px] text-muted-foreground truncate max-md:hidden">
              Step {currentStepIndex + 1} di {PAV_WIZARD_STEPS.length} · {PAV_WIZARD_STEPS[currentStepIndex]?.label}
            </p>
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full bg-orange-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        {/* Stepper mobile */}
        <div className="md:hidden overflow-x-auto border-t bg-background/95 px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* min-h-0: la regola globale dà 64px a ogni <nav> su telefono (pensata per la barra in basso). */}
          <nav className="flex min-h-0 w-full min-w-max gap-1" aria-label="Step progetto pavimenti">
            {PAV_WIZARD_STEPS.map((s, idx) => {
              const isActive = s.key === currentStep;
              const isComplete = completion[s.key];
              const disabled = isNew && idx > 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => !disabled && handleStepClick(s.key)}
                  disabled={disabled}
                  aria-current={isActive ? "step" : undefined}
                  // Telefono: tutti i passi in una riga, col nome corto: quelli
                  // fatti in verde, l'attivo pieno, gli altri spenti.
                  className={cn(
                    "tap-compact inline-flex h-8 flex-1 items-center justify-center rounded-full border px-1.5 text-[11px] font-medium transition-colors",
                    isActive
                      ? "border-orange-500 bg-orange-500 font-semibold text-white"
                      : isComplete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-border bg-background text-muted-foreground",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  {ETICHETTA_BREVE_PASSO[s.key] ?? s.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="container mx-auto max-w-[1400px] p-3 pb-6 md:p-6">
        <div className="grid grid-cols-12 gap-4">
          {/* Sidebar step (desktop) */}
          <aside className="hidden md:block md:col-span-3 xl:col-span-2">
            <Card>
              <CardContent className="p-2">
                <nav className="space-y-0.5">
                  {PAV_WIZARD_STEPS.map((s, idx) => {
                    const Icon = STEP_ICONS[s.key];
                    const isActive = s.key === currentStep;
                    const isComplete = completion[s.key];
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
                            : isComplete
                            ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            : "text-muted-foreground hover:bg-muted",
                          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        )}
                      >
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                          isActive ? "bg-orange-600 text-white" :
                          isComplete ? "bg-emerald-100 text-emerald-700" :
                          "bg-muted text-muted-foreground",
                        )}>
                          {isComplete && !isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                        </span>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{s.label}</span>
                      </button>
                    );
                  })}
                </nav>
                {isNew && (
                  <p className="mt-2 rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5 text-[10px] text-blue-800">
                    Compila i dati cliente e crea il progetto per sbloccare gli altri step.
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>

          {/* Step content */}
          <main className="col-span-12 space-y-4 md:col-span-9 lg:col-span-10">
            {currentStep === "cliente" && (
              <fieldset disabled={Boolean(isNew && requestedModel && !modelSupport.supported)} className="min-w-0">
                <StepCliente form={form} onChange={onChange} />
              </fieldset>
            )}
            {currentStep === "immobile" && (
              <StepImmobile form={form} onChange={onChange} model={model} />
            )}
            {currentStep === "computo" && id && detail && (
              // key = id stabile del progetto: monta una volta col computo iniziale
              // dal server (seeding senza setState-in-effect); l'autosave del
              // computo non rimonta lo step.
              <StepComputo
                key={detail.progetto.id}
                progettoId={id}
                initialComputo={detail.computo}
                scontoPct={Number(form.sconto_pct ?? detail.progetto.sconto_pct ?? 0)}
                ivaPct={Number(form.iva_pct ?? detail.progetto.iva_pct ?? 10)}
                prezzoManuale={form.prezzo_manuale !== undefined ? form.prezzo_manuale : detail.progetto.prezzo_manuale ?? null}
                model={model}
              />
            )}
            {currentStep === "media" && id && detail && (
              <StepMedia progettoId={id} media={detail.media} />
            )}
            {currentStep === "economia" && detail && (
              <StepEconomia form={form} onChange={onChange} computo={detail.computo} />
            )}
            {currentStep === "pdf" && id && detail && (
              // Merge progetto salvato + edit correnti del form (sconto/IVA/
              // detrazione, cliente, cantiere) così l'anteprima riflette le
              // modifiche non ancora persistite dello step Economia.
              <StepPdf
                progetto={{ ...detail.progetto, ...form }}
                computo={detail.computo}
                media={detail.media}
                onIndietro={handleBack}
                onVaiAlPasso={(passo) => void handleStepClick(passo)}
              />
            )}
            {currentStep === "pdf" && !(id && detail) && (
              <StepComingSoon step={currentStep} />
            )}

            {/* Navigation footer: su telefono sopra la barra in basso, che altrimenti lo copre.
                Sticky e non fixed: con un passo corto sta subito sotto il modulo
                (fisso in fondo lasciava un vuoto a metà schermo), con uno lungo
                resta attaccato in basso mentre si scorre. Lo sticky si misura dal
                bordo interno del contenitore che scorre, che su telefono ha già
                7rem di spazio in fondo (pb-28 in CompanyLayout): -1.5rem lo mette
                a 5.5rem dal fondo dello schermo, appena sopra la barra in basso.
                Al passo PDF, sul telefono, la barra la disegna lo step: indietro · PDF · invia. */}
            <div className={cn("sticky bottom-[calc(env(safe-area-inset-bottom)-1.5rem)] z-40 flex items-center justify-between gap-2 rounded-2xl border bg-background/95 px-3 py-2.5 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur md:static md:mx-0 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-2 md:shadow-none md:backdrop-blur-0", currentStep === "pdf" && id && detail && "max-md:hidden")}>
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStepIndex === 0}
                className="min-h-11 md:min-h-0 max-md:w-11 max-md:shrink-0 max-md:px-0"
              >
                {/* Telefono: solo la freccia, il pulsante principale prende la riga. */}
                <ArrowLeft className="h-4 w-4 mr-1 max-md:mr-0" /> <span className="max-md:sr-only">Indietro</span>
              </Button>
              <Button
                onClick={handleSaveAndContinue}
                disabled={upsertMut.isPending || creating || Boolean(isNew && requestedModel && !modelSupport.supported)}
                className="min-h-11 flex-1 bg-orange-500 hover:bg-orange-600 gap-1 sm:flex-none md:min-h-0"
              >
                {(upsertMut.isPending || creating) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : currentStepIndex === PAV_WIZARD_STEPS.length - 1 ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {isNew ? "Crea e continua" :
                  currentStepIndex === PAV_WIZARD_STEPS.length - 1 ? "Salva" : "Salva e continua"}
              </Button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/** Placeholder per gli step non ancora implementati (Fasi 3-5). */
function StepComingSoon({ step }: { step: PavWizardStepKey }) {
  const meta = PAV_WIZARD_STEPS.find((s) => s.key === step);
  const Icon = STEP_ICONS[step];
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">{meta?.label}</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Questa sezione sarà disponibile a breve. I dati cliente e immobile sono già salvati.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
