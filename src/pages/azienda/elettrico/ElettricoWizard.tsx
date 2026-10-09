/**
 * ElettricoWizard — shell a step per creare/modificare un progetto di
 * elettrico. Come il Fotovoltaico e Serramenti:
 *  - le fasi in alto (barra fissa col totale sempre in vista) e l'anteprima live
 *    a destra: il guscio comune è `components/preventivatore/GuscioEdile`
 *  - autosave debounced su progetto esistente; "Crea e continua" su nuovo
 *  - navigazione avanti/indietro + beforeunload guard
 *
 * STEP:
 *  1. Cliente   — anagrafica, indirizzo dei lavori + picker contatto/opportunità CRM
 *  2. Immobile  — immobile, tipo intervento, vincoli             (Task 12)
 *  3. Computo   — computo metrico premium                        (Task 17, in arrivo)
 *  4. Foto      — media situazione/render                        (Task 18, in arrivo)
 *  5. Economia  — sconto/IVA/detrazione + riepilogo              (Task 19, in arrivo)
 *  6. PDF       — generazione preventivo brandizzato             (Task 22, in arrivo)
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSalvaUscendo } from "@/hooks/useSalvaUscendo";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Loader2, Hammer,
  User, Home, ClipboardList, Image as ImageIcon, Euro, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useElettricoProgetto,
  useUpsertProgetto,
  useEleTemplatePdf,
  getEleTemplatePdf,
} from "@/hooks/useElettricoProgetto";
import type { EleComputoVoce, EleProgetto } from "@/types/elettrico";
import { GuscioEdile, type StatoSalvataggio } from "@/components/preventivatore";
import { anteprimaComputo } from "@/lib/preventivatore/anteprimaComputo";
import { RITENTA_SALVATAGGIO_DOPO_MS } from "@/lib/moduli/salvataggioProgetto";
import { avvisaSalvataggioFallito, motivoSalvataggioNonRiuscito, type OpzioniAvviso } from "@/lib/preventivatore/salvataggioFallito";
import { leggiClienteDelContatto, riempiClienteVuoto } from "@/lib/preventivatore/clienteDalContatto";
import { righeSenzaPrezzo } from "@/lib/preventivatore/anteprima";
import * as calcoliEle from "@/lib/elettrico/calcoli";
import {
  ELE_WIZARD_STEPS, ELE_STATI_LABEL, stepCompletion,
  compactText, type EleWizardStepKey,
} from "./ElettricoWizard/helpers";
import type { EleFormPatch } from "./ElettricoWizard/types";
import { useSupportoModelloPreventivo } from "@/hooks/useSupportoModelliPreventivo";
import { TIPO_INTERVENTO_DEL_MODELLO, creaModelloPreventivo, interventoDelModulo, leggiModelloPreventivo } from "@/lib/moduli/modelloPreventivo";
import StepCliente from "./ElettricoWizard/StepCliente";
import StepImmobile from "./ElettricoWizard/StepImmobile";
import StepComputo from "./ElettricoWizard/StepComputo";
import StepMedia from "./ElettricoWizard/StepMedia";
import StepEconomia from "./ElettricoWizard/StepEconomia";
import StepPdf from "./ElettricoWizard/StepPdf";
import { EsigenzeCliente } from "@/components/preventivatore/EsigenzeCliente";
import { esigenzeDelPreventivo, leggiEsigenze } from "@/lib/preventivatore/esigenze";
import { ESIGENZE_DI_SERIE } from "@/lib/preventivatore/esigenzeDiSerie";

const STEP_ICONS: Record<EleWizardStepKey, React.FC<React.SVGProps<SVGSVGElement>>> = {
  cliente: User,
  immobile: Home,
  computo: ClipboardList,
  media: ImageIcon,
  economia: Euro,
  pdf: FileText,
};

/** Telefono: i nomi dei passi nello stepper, corti perché stiano tutti in una riga. */
const ETICHETTA_BREVE_PASSO: Partial<Record<EleWizardStepKey, string>> = { immobile: "Impianto" };

const NESSUNA_VOCE: EleComputoVoce[] = [];

export default function ElettricoWizard() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  // ?modello=… : il preventivo nasce da un intervento della libreria (come Tetti).
  const requestedModel = searchParams.get("modello");
  const modelSupport = useSupportoModelloPreventivo("elettrico");
  const { user, effectiveCompany } = useAuth();
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  // Riprendi bozza su "nuovo": ultima bozza propria (l'azienda la scopa la RLS)
  const { data: ultimaBozza } = useQuery({
    queryKey: ["ele-ultima-bozza", user?.id, effectiveCompany?.id],
    enabled: isNew && !!user?.id && !!effectiveCompany?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error } = await (supabase as any)
        .from("ele_progetti")
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

  const [currentStep, setCurrentStep] = useState<EleWizardStepKey>("cliente");
  const [creating, setCreating] = useState(false);
  // Il computo come lo vede chi lo sta scrivendo: lo step lo comunica a ogni modifica
  // e l'anteprima a destra si ricalcola con quello. Finché non c'è, vale il salvato.
  // Lo scrive solo StepComputo (gli altri lo leggono): nessun altro lo può cambiare.
  const [computoLive, setComputoLive] = useState<EleComputoVoce[] | null>(null);
  const [statoComputo, setStatoComputo] = useState<StatoSalvataggio | null>(null);

  const { data: detail, isLoading, isError, refetch } = useElettricoProgetto(id);
  const upsertMut = useUpsertProgetto();
  const savedModel = useMemo<{ snapshot: ReturnType<typeof leggiModelloPreventivo>; error: string | null }>(() => {
    try { return { snapshot: detail ? leggiModelloPreventivo("elettrico", detail.progetto.modello_snapshot, detail.progetto.company_id) : null, error: null }; }
    catch (error) { return { snapshot: null, error: error instanceof Error ? error.message : "Modello non valido" }; }
  }, [detail]);
  const model = interventoDelModulo("elettrico", isNew ? requestedModel : savedModel.snapshot?.modelId);

  // Local form state (campi del progetto).
  const [form, setForm] = useState<EleFormPatch>(() => model ? { tipo_intervento: TIPO_INTERVENTO_DEL_MODELLO.elettrico[model.id] } : {});
  const createInput = async (): Promise<EleFormPatch> => {
    if (!requestedModel) return form;
    if (!model || !modelSupport.supported || !effectiveCompany?.id) throw new Error("Il salvataggio di questo intervento deve essere attivato nel database. Nessuna offerta generica è stata creata.");
    const companyId = effectiveCompany.id;
    const [{ createFullEltTemplate, isFullEltModuleId }, { loadLocalEltTemplate }, { sincronizzaModelliAzienda }] = await Promise.all([
      import("@/lib/moduli-vendita/fullEltModules"), import("@/lib/moduli-vendita/localEltTemplates"),
      import("@/lib/moduli-vendita/archivioModelli"),
    ]);
    if (!isFullEltModuleId(model.id)) throw new Error("Questo intervento non ha un modello completo. Nessuna offerta generica è stata creata.");
    // Il modello personalizzato è dell'azienda: può averlo salvato un collega da
    // un altro computer. Se il database non risponde resta la copia di questo browser.
    await sincronizzaModelliAzienda(companyId).catch((): void => undefined);
    const base = await getEleTemplatePdf(companyId);
    const source = loadLocalEltTemplate(companyId, model.id)?.template ?? createFullEltTemplate(base, model.id);
    return { ...form, tipo_intervento: TIPO_INTERVENTO_DEL_MODELLO.elettrico[model.id], modello_snapshot: creaModelloPreventivo("elettrico", companyId, model.id, source) };
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
    setComputoLive(null);
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
    const patch: EleFormPatch = {};
    if (urlContactId) patch.cliente_id = urlContactId;
    if (urlOpportunityId) patch.opportunita_id = urlOpportunityId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill one-shot da query string
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(Object.keys(patch).length > 0);
    // Il contatto porta anche chi è: nome, cognome, email e telefono. Quello che nel frattempo si è già scritto non si tocca.
    if (urlContactId) {
      void leggiClienteDelContatto(urlContactId).then((cliente) => {
        if (cliente) setForm((prev) => riempiClienteVuoto(prev, cliente));
      });
    }
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

  const onChange = <K extends keyof EleFormPatch>(key: K, value: EleFormPatch[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // ─── Autosave debounced (solo su progetto esistente) ─────────────────────
  // Se non riesce lo si dice: il piede scrive «Salvataggio non riuscito», un avviso (uno solo per serie di
  // errori) e si ritenta da soli dopo qualche secondo. Prima l'errore era ingoiato e il piede continuava a
  // promettere «si salvano da sole tra un attimo», senza che succedesse più niente.
  const autosaveTimerRef = useRef<number | null>(null);
  const [erroreSalvataggio, setErroreSalvataggio] = useState(false);
  const [tentativoDi, setTentativoDi] = useState(0);
  const avvisoErroreDatoRef = useRef(false);
  useEffect(() => {
    if (isNew || !id) return;
    if (!dirty) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    let ritentaTimer: number | null = null;
    autosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          await upsertMut.mutateAsync({ ...form, id });
          avvisoErroreDatoRef.current = false;
          setErroreSalvataggio(false);
          if (formRef.current === form) setDirty(false);
          setLastSavedAt(new Date());
        } catch (e) {
          // dirty resta true: le modifiche sono ancora da salvare.
          setErroreSalvataggio(true);
          if (!avvisoErroreDatoRef.current) {
            avvisoErroreDatoRef.current = true;
            toast.error("Salvataggio automatico non riuscito", {
              description: `${motivoSalvataggioNonRiuscito(e)} Le modifiche restano qui e riprovo da solo.`,
            });
          }
          ritentaTimer = window.setTimeout(() => setTentativoDi((n) => n + 1), RITENTA_SALVATAGGIO_DOPO_MS);
        }
      })();
    }, 2000);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      if (ritentaTimer) window.clearTimeout(ritentaTimer);
    };
  }, [form, dirty, id, isNew, tentativoDi]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Rete di sicurezza: uscendo senza passare dalla freccia (menu, «indietro» del browser o del telefono) prima dei 2
  // secondi dell'autosave, la modifica appena scritta si salva lo stesso, e se non riesce lo si dice. La freccia
  // «Esci» salva ORA (esci) e poi lo segna qui, così la chiusura della pagina non risalva la stessa cosa.
  const salvaUscendo = useSalvaUscendo({ id, dirty, form, salva: upsertMut.mutateAsync });

  const saveProgetto = async (opzioni?: OpzioniAvviso): Promise<boolean> => {
    if (!id) return false;
    try {
      await upsertMut.mutateAsync({ ...form, id });
      if (formRef.current === form) setDirty(false);
      setLastSavedAt(new Date());
      setErroreSalvataggio(false);
      avvisoErroreDatoRef.current = false;
      return true;
    } catch (e) {
      avvisaSalvataggioFallito(e, opzioni);
      return false;
    }
  };

  const currentStepIndex = useMemo(
    () => ELE_WIZARD_STEPS.findIndex((s) => s.key === currentStep),
    [currentStep],
  );
  const vociAnteprima = computoLive ?? detail?.computo ?? NESSUNA_VOCE;
  // Col modello il tipo d'intervento è già scelto: lo step Immobile si completa
  // coi dati dell'immobile, non col tipo preimpostato. Senza useMemo, come Tetti:
  // il compilatore di React non riesce a conservarlo con il modello tra le dipendenze.
  const completion = stepCompletion(model ? { ...form, tipo_intervento: null } : form, vociAnteprima);

  const { data: templatePdf } = useEleTemplatePdf();
  const datiAnteprima = useMemo(
    () => anteprimaComputo(vociAnteprima, { ...(detail?.progetto ?? {}), ...form }, calcoliEle, {
      emittente: templatePdf?.ragione_sociale ?? effectiveCompany?.name ?? null,
      titolo: model?.title ?? null,
      ivaDefault: 22,
    }),
    [vociAnteprima, detail?.progetto, form, templatePdf?.ragione_sociale, effectiveCompany?.name, model],
  );
  const statoSalvataggio: StatoSalvataggio = isNew
    ? "nuovo"
    : (upsertMut.isPending || statoComputo === "salvando") ? "salvando"
    : (erroreSalvataggio && dirty) ? "errore"
    : (dirty || statoComputo === "modifiche") ? "modifiche"
    : "salvato";

  const handleSaveAndContinue = async () => {
    // Nuovo progetto: crea passando tutto il form, poi naviga al record creato.
    if (isNew) {
      setCreating(true);
      try {
        const created = await upsertMut.mutateAsync(await createInput());
        navigate(`/azienda/elettrico/${created.id}/modifica`, { replace: true });
      } catch (e) {
        toast.error("Creazione progetto fallita", {
          description: motivoSalvataggioNonRiuscito(e),
        });
      } finally {
        setCreating(false);
      }
      return;
    }
    if (!id) return;
    const ok = await saveProgetto();
    if (!ok) return;
    const idx = ELE_WIZARD_STEPS.findIndex((s) => s.key === currentStep);
    if (idx >= 0 && idx < ELE_WIZARD_STEPS.length - 1) {
      setCurrentStep(ELE_WIZARD_STEPS[idx + 1].key);
    } else {
      toast.success("Progetto salvato");
    }
  };

  const handleStepClick = async (target: EleWizardStepKey) => {
    if (target === currentStep) return;
    if (isNew) return; // in new mode gli step laterali sono disabled
    if (dirty) {
      const ok = await saveProgetto();
      if (!ok) return;
    }
    setCurrentStep(target);
  };

  const handleBack = () => {
    if (currentStepIndex > 0) void handleStepClick(ELE_WIZARD_STEPS[currentStepIndex - 1].key);
  };

  // Dalla freccia: un preventivo già creato salva ORA ciò che non è ancora salvato e si esce solo se il salvataggio
  // riesce (altrimenti si resta qui, con il motivo e le modifiche al sicuro, e l'avviso offre «Esci comunque»: se il
  // salvataggio fosse rifiutato SEMPRE, un account bloccato o un permesso tolto, dal preventivo non si uscirebbe più).
  // Un preventivo nuovo con dati chiede se tenerlo come bozza.
  const esci = async () => {
    if (isNew && dirty) { setExitDialogOpen(true); return; }
    const vaiAllElenco = () => navigate("/azienda/marketing/preventivi");
    if (!isNew && (dirty || upsertMut.isPending)) {
      if (!(await saveProgetto({ esciComunque: vaiAllElenco }))) return;
      salvaUscendo.segnaSalvato(form); // salvato: la chiusura della pagina non lo risalva
    }
    vaiAllElenco();
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
            <Button size="sm" variant="ghost" onClick={() => navigate("/azienda/marketing/preventivi")} className="gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Torna ai progetti
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (savedModel.error || (isNew && requestedModel && !model)) return <div role="alert" className="space-y-3 p-6"><h1 className="text-xl font-semibold">Intervento non disponibile</h1><p>{savedModel.error ?? "Il tipo di intervento richiesto non è riconosciuto."}</p><Button onClick={() => navigate("/azienda/marketing/preventivi?tab=moduli&area=elettrico")}>Scegli un intervento</Button></div>;

  const statoMeta = ELE_STATI_LABEL[(detail?.progetto.stato as EleProgetto["stato"]) ?? "bozza"];
  const ultimoPasso = currentStepIndex === ELE_WIZARD_STEPS.length - 1;

  // Lo step Computo dice come sta salvando (il suo autosave è suo): il piede lo riporta.
  const gestisciStatoComputo = (stato: StatoSalvataggio | null) => {
    setStatoComputo(stato);
    if (stato === "salvato") setLastSavedAt(new Date());
  };

  return (
    <>
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
            <AlertDialogAction onClick={() => navigate(`/azienda/elettrico/${ultimaBozza!.id}/modifica`)}>
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
              onClick={() => navigate("/azienda/marketing/preventivi")}
            >
              Esci senza salvare
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await upsertMut.mutateAsync(isNew ? await createInput() : { ...form });
                  toast.success("Bozza salvata — la ritrovi nella lista");
                } catch (e) {
                  toast.error("Salvataggio bozza fallito", { description: motivoSalvataggioNonRiuscito(e) });
                  return;
                }
                navigate("/azienda/marketing/preventivi");
              }}
            >
              Salva bozza ed esci
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GuscioEdile
        testata={{
          icona: Hammer,
          titolo: isNew ? model?.title ?? "Nuovo progetto" : detail?.progetto.code ?? "Progetto",
          cliente: isNew ? null : compactText(detail?.progetto.cliente_nome, detail?.progetto.cliente_cognome) || null,
          stato: !isNew && detail ? statoMeta : null,
          onEsci: () => { void esci(); },
        }}
        passi={ELE_WIZARD_STEPS.map((s) => ({ key: s.key, label: s.label, breve: ETICHETTA_BREVE_PASSO[s.key] }))}
        corrente={currentStep}
        completati={new Set(ELE_WIZARD_STEPS.filter((s) => s.key !== currentStep && completion[s.key]).map((s) => s.key))}
        conAvviso={new Set(ELE_WIZARD_STEPS.filter((s, idx) => idx < currentStepIndex && (
          (s.key === "cliente" && !completion.cliente)
          || (s.key === "computo" && (!completion.computo || righeSenzaPrezzo(datiAnteprima) > 0))
        )).map((s) => s.key))}
        bloccati={new Set<string>(isNew ? ELE_WIZARD_STEPS.slice(1).map((s) => s.key) : [])}
        onSelect={(key) => void handleStepClick(key as EleWizardStepKey)}
        anteprima={datiAnteprima}
        statoSalvataggio={statoSalvataggio}
        testoSalvataggio={savedLabel}
        ariaLabelFasi="Fasi del preventivo elettrico"
        piede={{
          onIndietro: handleBack,
          indietroDisabilitato: currentStepIndex === 0,
          onAvanti: handleSaveAndContinue,
          etichettaAvanti: isNew ? "Crea e continua" : ultimoPasso ? "Salva" : "Salva e continua",
          avantiDisabilitato: upsertMut.isPending || creating || Boolean(isNew && requestedModel && !modelSupport.supported),
          inCorso: upsertMut.isPending || creating,
          ultimoPasso,
          // Al passo PDF, sul telefono, la barra la disegna lo step: indietro · PDF · invia.
          nascostoSuTelefono: currentStep === "pdf" && Boolean(id && detail),
        }}
        sopra={model && (
          // Telefono: niente testata del modello (il nome è nel passo dell'intervento); resta solo l'avviso, se c'è.
          <section className={cn("mx-auto max-w-6xl space-y-2 p-4 max-sm:space-y-0 max-sm:px-3 max-sm:py-0 max-sm:pb-3", !(isNew && !modelSupport.supported) && "max-sm:hidden")}>
            <div className="space-y-2 max-sm:hidden">
              <h1 className="text-xl font-semibold">Preventivo · {model.title}</h1>
              <p className="text-sm text-muted-foreground">{model.summary}</p>
              <p className="text-xs">Cliente → Immobile → Lavorazioni e prodotti → Prezzi e sconti → PDF dell'intervento</p>
            </div>
            {isNew && !modelSupport.supported && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{modelSupport.isLoading ? "Verifica del salvataggio…" : "Percorso predisposto: il salvataggio richiede ancora l'attivazione del database. Non inserire dati finché il collegamento non è attivo."}</p>}
          </section>
        )}
      >
        {currentStep === "cliente" && (
          <fieldset disabled={Boolean(isNew && requestedModel && !modelSupport.supported)} className="min-w-0">
            <StepCliente form={form} onChange={onChange} />
          </fieldset>
        )}
        {currentStep === "immobile" && (
          <>
            <EsigenzeCliente
              valore={esigenzeDelPreventivo(form)}
              onChange={(v) => onChange("esigenze", v)}
              libreria={leggiEsigenze(templatePdf?.esigenze)}
              dellaCasa={ESIGENZE_DI_SERIE.elettrico}
            />
            <StepImmobile form={form} onChange={onChange} model={model} />
          </>
        )}
        {currentStep === "computo" && id && detail && (
          // key = id stabile del progetto: monta una volta col computo iniziale
          // dal server (seeding senza setState-in-effect); l'autosave del
          // computo non rimonta lo step.
          <StepComputo
            key={detail.progetto.id}
            progettoId={id}
            initialComputo={computoLive ?? detail.computo}
            onVociChange={setComputoLive}
            onStato={gestisciStatoComputo}
            initialDirty={statoComputo === "modifiche"}
            model={model}
          />
        )}
        {currentStep === "media" && id && detail && (
          <StepMedia progettoId={id} media={detail.media} />
        )}
        {currentStep === "economia" && detail && (
          <StepEconomia
            form={form}
            onChange={onChange}
            computo={computoLive ?? detail.computo}
            onVaiAlPasso={(passo) => void handleStepClick(passo)}
          />
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
      </GuscioEdile>
    </>
  );
}

/** Placeholder per gli step non ancora implementati (Fasi 3-5). */
function StepComingSoon({ step }: { step: EleWizardStepKey }) {
  const meta = ELE_WIZARD_STEPS.find((s) => s.key === step);
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
