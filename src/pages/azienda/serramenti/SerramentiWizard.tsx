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
 *  - beforeunload guard
 *
 * Fluidità: il cambio step salva al volo (autosave) e naviga senza modale di
 * conferma "Modifiche non salvate" — coerente col bottone "Salva e continua".
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSerramentoPDF } from "@/hooks/useSerramentoPDF";
import { useTemplatePdf, useAziendaPerPdf } from "@/lib/serramenti/queries";
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
  ArrowLeft, ArrowRight, Save, Loader2, RectangleVertical,
  User, Home, MessageCircle, Image as ImageIcon, Euro, Calendar, FileText,
  Users, CheckCircle2, Phone, Mail, MapPin, Sparkles, Camera, Mic,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useProgetto, useCreateProgetto, useUpdateProgetto, useDuplicaProgetto,
} from "@/lib/serramenti/queries";
import { SR_WIZARD_STEPS } from "@/types/serramenti";
import type { SrProgettoDetail, SrProgettoRow, SrWizardStep, SrTipoIntervento, SrStatoProgetto, SrTemplatePdfRow } from "@/types/serramenti";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { StepBom } from "@/components/serramenti/StepBom";
import { StepAccessori } from "@/components/serramenti/StepAccessori";
import { StepEconomia } from "@/components/serramenti/StepEconomia";
import { StepConsulenza } from "@/components/serramenti/StepConsulenza";
import { StepPdf } from "@/components/serramenti/StepPdf";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { StepContenuti } from "@/components/serramenti/StepContenuti";
import { ContactPickerDialog } from "@/components/serramenti/ContactPickerDialog";
import { AiSerramentiDraftLauncher } from "@/components/serramenti/AiSerramentiDraftLauncher";
import type { CrmContactMinimal } from "@/lib/serramenti/api";
import { confermaSalvate, modificheDaSalvare, segnaModifica, type ModificheInSospeso } from "@/lib/serramenti/modificheInSospeso";
import { totaliCambiati, totaliDelPreventivo } from "@/lib/serramenti/righePreventivo";
import { useSerramentiModelSupport } from "@/hooks/useSerramentiModelSupport";
import { isSrQuoteModelId, makeSrQuoteModelSnapshot, readSrQuoteModelSnapshot, srModelProjectDefaults } from "@/lib/serramenti/quoteModel";
import { findSerramentiTemplateModule } from "@/lib/moduli-vendita/serramentiTemplateModules";

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

/** Telefono: i nomi dei passi nello stepper, corti perché stiano tutti in una riga. */
const ETICHETTA_BREVE_PASSO: Partial<Record<SrWizardStep, string>> = {
  immobile: "Immobile",
  bom: "Offerta",
  accessori_foto: "Foto",
  pdf: "PDF",
};

// MP-MKT-001: compactText/compactAddress/isWizardStepComplete estratti
// in ./SerramentiWizard/helpers.ts
import {
  compactText, compactAddress, isWizardStepComplete,
} from "./SerramentiWizard/helpers";

export default function SerramentiWizard() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  const requestedModel = searchParams.get("modello");
  const modelSupport = useSerramentiModelSupport();
  const { user, effectiveCompany } = useAuth();
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  // Riprendi bozza su "nuovo": ultima bozza propria (l'azienda la scopa la RLS)
  const { data: ultimaBozza } = useQuery({
    queryKey: ["sr-ultima-bozza", user?.id, effectiveCompany?.id],
    enabled: isNew && !!user?.id && !!effectiveCompany?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error } = await (supabase as any)
        .from("sr_progetti")
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
  // Pre-link da CRM/Opportunità: ?contact_id=… &opportunity_id=…
  // Permette il flow "Crea preventivo Serramenti" dal dialog opportunità.
  const urlContactId = searchParams.get("contact_id");
  const urlOpportunityId = searchParams.get("opportunity_id");
  // ?ai=1 → flusso "Avvia con Silvio AI" dal primo step: il progetto è appena
  // stato creato, restiamo sul Contatto e apriamo automaticamente l'assistente.
  const urlStartAi = searchParams.get("ai") === "1";

  const [currentStep, setCurrentStep] = useState<SrWizardStep>("cliente");
  const [creating, setCreating] = useState(false);
  const mobileStepRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const { data: detail, isLoading, isError, refetch } = useProgetto(id);
  const updateMut = useUpdateProgetto(id);

  // ─── Anteprima PDF cross-step ──────────────────────────────────────────
  // L'utente può vedere il PDF in qualsiasi momento del wizard, non solo
  // allo Step PDF finale. Riduce sorprese in fase di invio cliente.
  const { previewPDF, isGenerating: isGeneratingPdf } = useSerramentoPDF();
  const { data: pdfTemplate, isLoading: loadingPdfTemplate, isError: templateError } = useTemplatePdf();
  const savedModel = useMemo<{ snapshot: ReturnType<typeof readSrQuoteModelSnapshot>; error: string | null }>(() => {
    try { return { snapshot: detail ? readSrQuoteModelSnapshot(detail.progetto.modello_snapshot, detail.progetto.company_id) : null, error: null }; }
    catch (error) { return { snapshot: null, error: error instanceof Error ? error.message : "Modello non leggibile" }; }
  }, [detail]);
  const modelId = isNew ? (isSrQuoteModelId(requestedModel) ? requestedModel : undefined) : savedModel.snapshot?.modelId;
  const modelDefinition = modelId ? findSerramentiTemplateModule(modelId) : null;
  // La stessa anagrafica del passo PDF, dell'azienda del preventivo: qui
  // mancava il logo chiaro e l'anteprima usciva diversa dal PDF scaricato.
  const { data: pdfCompany } = useAziendaPerPdf(detail?.progetto.company_id);

  // PDF anteprima è disponibile solo se il preventivo è salvato (ha id) e
  // ha almeno 1 serramento o accessorio nel BOM (altrimenti PDF vuoto).
  const hasContent = !!detail && (
    detail.serramenti.length > 0 || detail.accessori.length > 0
  );
  const canPreview = !isNew && hasContent && !isGeneratingPdf;

  const handlePreviewClick = () => {
    if (!detail) return;
    void previewPDF({ detail, template: pdfTemplate ?? null, company: pdfCompany ?? null, useFreshTemplate: true });
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
  const newQuoteInput = async (): Promise<Partial<SrProgettoRow>> => {
    const input = { ...form, tipo_intervento: (form.tipo_intervento as SrTipoIntervento) ?? "sostituzione" };
    if (!requestedModel) return input;
    if (!isSrQuoteModelId(requestedModel) || !modelSupport.supported || !effectiveCompany?.id) {
      throw new Error("Questo modello non è ancora collegato al salvataggio. Usa il preventivatore generale oppure completa l'attivazione.");
    }
    if (loadingPdfTemplate || templateError) throw new Error("Attendi il caricamento del modello aziendale prima di creare il preventivo.");
    const [{ createFullSerramentiTemplate }, { loadLocalSerramentiTemplate }] = await Promise.all([
      import("@/lib/moduli-vendita/fullSerramentiModules"), import("@/lib/moduli-vendita/localSerramentiTemplates"),
    ]);
    const companyId = effectiveCompany.id;
    const { data: currentTemplate, error: readError } = await supabase.from("sr_template_pdf").select("*").eq("company_id", companyId).maybeSingle();
    if (readError) throw new Error("Impossibile verificare il modello aziendale. Riprova prima di creare il preventivo.");
    const localCopy = loadLocalSerramentiTemplate(companyId, requestedModel);
    const template = localCopy?.template ?? createFullSerramentiTemplate({ ...(currentTemplate as unknown as Partial<SrTemplatePdfRow> | null), company_id: companyId }, requestedModel);
    const snapshot = makeSrQuoteModelSnapshot(companyId, requestedModel, template);
    const definition = findSerramentiTemplateModule(requestedModel)!;
    return { ...srModelProjectDefaults(snapshot), intervento_titolo: definition.title, intervento_sintesi: definition.summary,
      ...input, modello_snapshot: snapshot };
  };
  const [dirty, setDirty] = useState(false);
  /** I campi toccati e non ancora salvati: l'autosave manda solo questi. */
  const modificheRef = useRef<ModificheInSospeso<SrProgettoRow>>(new Map());
  /** I salvataggi partono in fila: uno più vecchio non arriva mai dopo uno più nuovo. */
  const codaSalvataggiRef = useRef<Promise<void>>(Promise.resolve());
  /** Timestamp ultimo salvataggio riuscito (usato per indicator "Salvato Xs fa"). */
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  /** Tick di refresh ogni 10s per aggiornare il "Salvato Xs fa" in header. */
  const [, setSavedTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSavedTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  // ─── localStorage backup per crash recovery ─────────────────────────────
  // Ogni onChange scrive in LS i campi toccati prima ancora del save al server.
  // Se l'utente chiude la tab o il browser crasha durante il debounce, al
  // prossimo mount possiamo proporre il restore.
  const LS_KEY = id ? `sr-autosave-progetto-${id}` : null;

  // Sync form con dati server al primo load / cambio progetto.
  // Null-safe contro flicker tra refetch (detail può diventare temporaneamente
  // undefined durante invalidate → poi torna).
  useEffect(() => {
    if (detail?.progetto) {
      setForm(detail.progetto);
      modificheRef.current.clear();
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
      const cached = JSON.parse(raw) as { modifiche?: Partial<SrProgettoRow>; timestamp: number };
      const serverUpdated = new Date(detail.progetto.updated_at ?? 0).getTime();
      // LS più recente del server di almeno 5 secondi → significa cambio non
      // ancora persistito. Sotto la soglia: probabile residuo già salvato.
      // Una copia senza `modifiche` è il modulo intero salvato dalla versione di
      // prima: recuperarla riporterebbe indietro stato e firma, quindi si scarta.
      const modifiche = cached.modifiche;
      if (modifiche && cached.timestamp > serverUpdated + 5000) {
        const ageMin = Math.round((Date.now() - cached.timestamp) / 60_000);
        toast.info("Trovate modifiche non salvate", {
          description: `Modifiche di ${ageMin === 0 ? "pochi secondi" : `${ageMin} minuto/i`} fa. Recuperarle?`,
          duration: 15_000,
          action: {
            label: "Recupera",
            onClick: () => {
              for (const campo of Object.keys(modifiche) as Array<keyof SrProgettoRow>) {
                segnaModifica(modificheRef.current, campo, modifiche[campo]);
              }
              setForm((prev) => ({ ...prev, ...modifiche }));
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
    // Flusso "Avvia con Silvio AI": resta sul Contatto, l'assistente si apre da solo.
    if (urlStartAi) return;
    const hasStep1Data = detail.progetto.cliente_nome || detail.progetto.cliente_cognome;
    if (currentStep === "cliente" && hasStep1Data) {
      setCurrentStep("immobile");
    }
    // Volutamente non includiamo detail.progetto in deps: il ref guard sopra
    // garantisce single-fire per sessione → exhaustive-deps non si applica.
  }, [detail?.progetto?.id, id, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => {
    segnaModifica(modificheRef.current, key, value);
    setForm((prev) => ({ ...prev, [key]: value }));
    // LS backup sincrono dei campi toccati: se l'utente chiude la tab prima
    // dell'autosave, al prossimo mount si propone il recupero.
    if (LS_KEY) {
      try {
        const { patch } = modificheDaSalvare(modificheRef.current);
        localStorage.setItem(LS_KEY, JSON.stringify({ modifiche: patch, timestamp: Date.now() }));
      } catch (e) {
        // QuotaExceededError raro ma possibile: best-effort
        console.warn("[serramenti] LS backup failed", e);
      }
    }
    setDirty(true);
  };

  // ─── Autosave debounced ────────────────────────────────────────────────
  // Salvataggio automatico 2 secondi dopo l'ultima modifica, se il progetto
  // esiste (per isNew il primo «Salva» crea l'id). Si salvano solo i campi
  // toccati: rimandare il modulo caricato all'apertura riportava indietro lo
  // stato cambiato dal menu e cancellava la firma arrivata dal cliente.
  const salvaModifiche = (): Promise<void> => {
    const salvataggio = codaSalvataggiRef.current
      .catch(() => {})
      .then(async () => {
        if (modificheRef.current.size === 0) return;
        const { patch, versioni } = modificheDaSalvare(modificheRef.current);
        await updateMut.mutateAsync(patch);
        // Restano da salvare solo i campi cambiati di nuovo mentre si salvava.
        confermaSalvate(modificheRef.current, versioni);
        setLastSavedAt(new Date());
        if (modificheRef.current.size === 0) {
          setDirty(false);
          if (LS_KEY) localStorage.removeItem(LS_KEY);
        }
      });
    codaSalvataggiRef.current = salvataggio;
    return salvataggio;
  };

  useEffect(() => {
    if (isNew || !id || !dirty) return;
    const timer = window.setTimeout(() => {
      // L'errore lo mostra la mutation: i campi restano da salvare e si riprova
      // alla modifica successiva o con «Salva e continua».
      salvaModifiche().catch(() => {});
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [form, dirty, id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Totali sul preventivo ─────────────────────────────────────────────
  // Totale, pezzi e m² stanno sulla riga del preventivo: li leggono l'elenco,
  // le opportunità e la pagina del cliente. Seguono le posizioni in qualunque
  // passo si sia; prima si aggiornavano solo aprendo Economia, e l'elenco
  // mostrava «0 pezzi» su preventivi pieni.
  const { iva_percentuale, sconto_percentuale, sconto_importo, prezzo_manuale } = form;
  const totaliCalcolati = useMemo(
    () => (detail ? totaliDelPreventivo(detail, { iva_percentuale, sconto_percentuale, sconto_importo, prezzo_manuale }) : null),
    [detail, iva_percentuale, sconto_percentuale, sconto_importo, prezzo_manuale],
  );
  useEffect(() => {
    // Solo col modulo già allineato al preventivo aperto: prima sembrerebbe tutto cambiato.
    if (isNew || !totaliCalcolati || !form.id || form.id !== detail?.progetto.id) return;
    const cambiati = totaliCambiati(form, totaliCalcolati);
    if (Object.keys(cambiati).length === 0) return;
    // Si scrivono come una modifica del modulo, subito dopo il render, e partono
    // con l'autosave.
    const timer = window.setTimeout(() => {
      for (const campo of Object.keys(cambiati) as Array<keyof typeof cambiati>) {
        onChange(campo, cambiati[campo] as SrProgettoRow[typeof campo]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [totaliCalcolati, form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProgetto = async (): Promise<boolean> => {
    if (!id) return false;
    try {
      await salvaModifiche();
      return true;
    } catch {
      // Il messaggio d'errore lo mostra la mutation (useUpdateProgetto).
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
        const created = await createMut.mutateAsync(await newQuoteInput());
        navigate(`/azienda/serramenti/${created.id}/modifica`, { replace: true });
      } catch (error) {
        toast.error("Preventivo non creato", { description: error instanceof Error ? error.message : "Riprova." });
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

  /** Flusso "Avvia con Silvio AI" dal primo step (preventivo nuovo): crea il
   *  progetto anche con dati minimi e ci ritorna con ?ai=1, così l'assistente
   *  si apre da solo sul Contatto (foto / voce / testo → bozza preventivo). */
  const handleCreateAndStartAi = async () => {
    if (!isNew) return;
    setCreating(true);
    try {
      const created = await createMut.mutateAsync(await newQuoteInput());
      navigate(`/azienda/serramenti/${created.id}/modifica?ai=1`, { replace: true });
    } catch (e) {
      toast.error("Non riesco ad avviare Silvio AI", {
        description: e instanceof Error ? e.message : "Riprova tra qualche secondo.",
      });
    } finally {
      setCreating(false);
    }
  };

  // Click su step — navigazione FLUIDA: con l'autosave attivo salviamo al volo
  // e passiamo allo step richiesto, senza interrompere con un modale "Modifiche
  // non salvate" (attrito inutile: i dati vengono comunque salvati). Coerente
  // col bottone "Salva e continua" del footer. Se il salvataggio fallisce
  // resta sullo step corrente e mostra il toast d'errore.
  const handleStepClick = async (target: SrWizardStep) => {
    if (target === currentStep) return;
    if (isNew) return; // in new mode lo step laterale è disabled
    if (dirty) {
      const ok = await saveProgetto();
      if (!ok) return;
    }
    setCurrentStep(target);
  };

  const handleBack = () => {
    const idx = currentStepIndex;
    if (idx > 0) handleStepClick(SR_WIZARD_STEPS[idx - 1].key);
  };

  const currentStepIndex = useMemo(
    () => SR_WIZARD_STEPS.findIndex((s) => s.key === currentStep),
    [currentStep],
  );

  const progress = useMemo(
    () => Math.round(((currentStepIndex + 1) / SR_WIZARD_STEPS.length) * 100),
    [currentStepIndex],
  );

  useEffect(() => {
    const activeButton = mobileStepRefs.current[currentStep];
    if (!activeButton || window.innerWidth >= 768) return;
    window.requestAnimationFrame(() => {
      activeButton.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  }, [currentStep]);

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

  if (savedModel.error || (isNew && requestedModel && !isSrQuoteModelId(requestedModel))) {
    return <div className="mx-auto max-w-3xl space-y-4 p-6" role="alert">
      <h1 className="text-xl font-semibold">{modelSupport.isLoading ? "Verifica del modello…" : "Collegamento del modello da completare"}</h1>
      <p className="text-sm text-muted-foreground">{savedModel.error ?? "Il modello PDF è disponibile nelle impostazioni, ma il salvataggio del modello nel preventivo non è ancora attivo. Nessuna offerta è stata creata."}</p>
      <Button onClick={() => navigate("/azienda/marketing/preventivi?tab=moduli&area=serramenti")}>Torna ai modelli</Button>
      {isNew && <Button variant="outline" onClick={() => {
        const context = new URLSearchParams();
        for (const key of ["contact_id", "opportunity_id"]) { const value = searchParams.get(key); if (value) context.set(key, value); }
        navigate(`/azienda/serramenti/nuovo?${context}`);
      }}>Usa il preventivatore generale</Button>}
    </div>;
  }

  return (
    <div className="pb-28 md:pb-20">
      {modelDefinition && <div className="mx-auto max-w-6xl px-4 pt-4"><div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
        <p className="font-semibold">{modelDefinition.title}</p>
        <p className="mt-1 text-muted-foreground">{isNew ? "Il PDF userà la personalizzazione salvata in questo browser, se presente, altrimenti il modello standard. Prodotti e prezzi arrivano dal tuo listino." : "Il modello PDF è conservato in questo preventivo. Le modifiche successive ai modelli non ne sostituiscono testi e impostazioni."}</p>
        <p className="mt-2 text-xs">Cliente e cantiere → Prodotti e servizi → Prezzi, sconti e PDF</p>
        {isNew && !modelSupport.supported && <p role="alert" className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">Il salvataggio di questo intervento richiede l'attivazione del database. Non inserire dati finché il collegamento non è attivo.</p>}
      </div></div>}
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
            <AlertDialogAction onClick={() => navigate(`/azienda/serramenti/${ultimaBozza!.id}/modifica`)}>
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
              onClick={() => navigate("/azienda/serramenti")}
            >
              Esci senza salvare
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await createMut.mutateAsync(await newQuoteInput());
                  toast.success("Bozza salvata — la ritrovi nella lista");
                } catch (e) {
                  toast.error("Salvataggio bozza fallito", { description: e instanceof Error ? e.message : undefined });
                  return;
                }
                navigate("/azienda/serramenti");
              }}
            >
              Salva bozza ed esci
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="sticky top-0 z-30 border-b bg-background/95 shadow-sm backdrop-blur">
        <div className="container mx-auto flex max-w-6xl items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
          <Button variant="ghost" size="icon" onClick={() => { if (isNew && dirty) { setExitDialogOpen(true); return; } navigate("/azienda/serramenti"); }} className="h-10 w-10 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap max-md:gap-y-0.5">
              <RectangleVertical className="h-4 w-4 text-orange-600 max-md:hidden" />
              <span className="font-semibold text-sm max-md:order-1 max-md:text-[15px]">
                {isNew ? "Nuovo preventivo" : detail?.progetto.code}
              </span>
              {detail?.progetto.cliente_nome && (
                <Badge variant="outline" className="text-[10px] max-md:order-4 max-md:border-0 max-md:p-0 max-md:text-xs max-md:font-normal max-md:text-muted-foreground max-md:after:ml-1.5 max-md:after:content-['·']">
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
                      // tap-compact: senza, la regola dei 44px lo gonfiava a un riquadro giallo alto il doppio.
                      className={`tap-compact text-[10px] h-5 px-1.5 rounded border inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity max-md:order-2 max-md:h-6 max-md:rounded-full max-md:px-2 max-md:text-[11px] ${statoMeta.className}`}
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
                <Badge variant="outline" className={`text-[10px] max-md:order-2 max-md:text-[11px] ${statoMeta.className}`}>
                  {statoMeta.label}
                </Badge>
              ) : null}
              {/* Badge revisione: visibile solo se revision_number > 1
                  (es. "Rev. 2"). Click → toast info su parent_id (utente
                  capisce che esiste una versione precedente). */}
              {!isNew && detail && detail.progetto.revision_number > 1 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-violet-300 bg-violet-50 text-violet-700 max-md:order-2"
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
              {/* Telefono: codice e stato sulla prima riga, cliente e salvataggio sotto. */}
              <span aria-hidden className="hidden h-0 basis-full max-md:order-3 max-md:block" />
              {(updateMut.isPending || pendingWrites > 0) ? (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 max-md:order-5 max-md:text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
                </span>
              ) : dirty ? (
                <span className="text-[10px] text-amber-600 max-md:order-5 max-md:text-xs" title="Le modifiche verranno salvate automaticamente entro 2 secondi">
                  ● Modifiche non salvate
                </span>
              ) : lastSavedAt ? (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5 max-md:order-5 max-md:text-xs" title={`Ultimo salvataggio: ${lastSavedAt.toLocaleString("it-IT")}`}>
                  ✓ {formatLastSaved()}
                </span>
              ) : null}
            </div>
            {/* Telefono: il passo attivo lo dice già lo stepper qui sotto. */}
            <p className="text-[11px] text-muted-foreground truncate max-md:hidden">
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
        <div className="md:hidden overflow-x-auto border-t bg-background/95 px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* min-h-0: la regola globale dà 64px a ogni <nav> su telefono (pensata per la barra in basso). */}
          <nav className="flex min-h-0 w-full min-w-max gap-1" aria-label="Step preventivo serramenti">
            {SR_WIZARD_STEPS.map((s, idx) => {
              const isActive = s.key === currentStep;
              const isPast = idx < currentStepIndex;
              const isComplete = isWizardStepComplete(s.key, form, detail);
              const disabled = isNew && idx > 0;
              return (
                <button
                  key={s.key}
                  ref={(node) => {
                    mobileStepRefs.current[s.key] = node;
                  }}
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
                      : isPast
                      ? "border-slate-200 bg-background text-foreground"
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
          {/* Sidebar step */}
          <aside className="hidden md:block md:col-span-3 xl:col-span-2">
            <Card>
              <CardContent className="p-2">
                <nav className="space-y-0.5">
                  {SR_WIZARD_STEPS.map((s, idx) => {
                    const Icon = STEP_ICONS[s.key];
                    const isActive = s.key === currentStep;
                    const isPast = idx < currentStepIndex;
                    const isComplete = isWizardStepComplete(s.key, form, detail);
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
                            : isPast
                            ? "text-foreground hover:bg-muted"
                            : "text-muted-foreground",
                          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        )}
                      >
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                          isActive ? "bg-orange-600 text-white" :
                          isComplete ? "bg-emerald-100 text-emerald-700" :
                          isPast ? "bg-slate-100 text-slate-700" :
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
                  <SrCallout variant="info" className="mt-2 text-[10px]">
                    Compila i dati cliente e crea il progetto per sbloccare gli altri step.
                  </SrCallout>
                )}
              </CardContent>
            </Card>
          </aside>

          {/* Step content */}
          <main className="col-span-12 space-y-4 md:col-span-9 lg:col-span-6 xl:col-span-7">
            {/* ErrorBoundary granulare per step: se uno step crasha (es. dato
                corrotto), gli altri step restano navigabili e l'utente vede
                un fallback con "Riprova" invece dell'app blank. */}
            <ErrorBoundary title="Errore in questa sezione del preventivo">
            {currentStep === "cliente" && (
              <fieldset disabled={Boolean(isNew && requestedModel && !modelSupport.supported)} className="min-w-0">
              <StepCliente
                form={form}
                onChange={onChange}
                progettoId={id}
                detail={detail}
                isNew={isNew}
                creating={creating}
                onStartAi={handleCreateAndStartAi}
                autoOpenAi={urlStartAi && (!requestedModel || modelSupport.supported)}
                onGoToComposition={() => setCurrentStep("bom")}
              />
              </fieldset>
            )}
            {currentStep === "immobile" && (
              <div className="space-y-4">
                <StepImmobile form={form} onChange={onChange} />
                {/* "Contenuti PDF" (esigenze) accorpato qui */}
                <StepContenuti form={form} onChange={onChange} />
              </div>
            )}
            {currentStep === "bom" && id && detail && (
              <StepBom progettoId={id} detail={detail} modelId={modelId} />
            )}
            {currentStep === "accessori_foto" && id && detail && (
              <StepAccessori progettoId={id} detail={detail} />
            )}
            {currentStep === "economia" && id && detail && (
              <StepEconomia progettoId={id} detail={detail} form={form} onChange={onChange} />
            )}
            {currentStep === "pdf" && id && detail && (
              <div className="space-y-4">
                {/* "Consulenza" accorpata qui, prima della generazione PDF */}
                <StepConsulenza form={form} onChange={onChange} />
                <StepPdf
                  progettoId={id}
                  detail={detail}
                  onIndietro={handleBack}
                  onVaiAlPasso={(passo) => void handleStepClick(passo)}
                />
              </div>
            )}
            </ErrorBoundary>

            {/* Navigation footer: su telefono sopra la barra in basso, che altrimenti lo copre.
                Al passo PDF, sul telefono, la barra la disegna lo step: indietro · PDF · invia. */}
            <div className={cn("fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between gap-2 rounded-2xl border bg-background/95 px-3 py-2.5 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur md:static md:mx-0 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-2 md:shadow-none md:backdrop-blur-0", currentStep === "pdf" && id && detail && "max-md:hidden")}>
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
                disabled={updateMut.isPending || creating || Boolean(isNew && requestedModel && !modelSupport.supported)}
                className="min-h-11 flex-1 bg-orange-500 hover:bg-orange-600 gap-1 sm:flex-none md:min-h-0"
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

          {!isNew && detail && (
            <aside className="hidden lg:block lg:col-span-3">
              <StepClienteSummary
                form={form}
                detail={{ ...detail, progetto: { ...detail.progetto, ...form } as SrProgettoRow }}
              />
            </aside>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Step inline (Cliente, Immobile, Esigenze) ──────────────────────────────

function StepCliente({
  form, onChange, progettoId, detail, onGoToComposition,
  isNew, creating, onStartAi, autoOpenAi,
}: {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
  progettoId?: string;
  detail?: SrProgettoDetail;
  onGoToComposition?: () => void;
  isNew?: boolean;
  creating?: boolean;
  onStartAi?: () => void;
  autoOpenAi?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const detailForAi = detail
    ? ({ ...detail, progetto: { ...detail.progetto, ...form } as SrProgettoRow })
    : undefined;

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
      description="Collega un contatto CRM o compila i dati cliente. Verranno usati nel PDF, nel microsito e nella bozza AI."
      icon={<User className="h-4 w-4" />}
    >
      {/* Silvio AI come prima azione su preventivo NUOVO: crea il progetto e
          apre subito l'assistente (foto/voce/testo → bozza). Su preventivo già
          creato, l'assistente compare nel riquadro più sotto. */}
      {isNew && onStartAi && (
        <div className="mb-3 rounded-md border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-950">
                <Sparkles className="h-4 w-4 text-orange-500" /> Silvio AI — crea il preventivo
              </p>
              <p className="text-xs leading-relaxed text-slate-600 max-md:hidden">
                Scatta una foto del rilievo, detta a voce o scrivi cosa serve: Silvio prepara la bozza. Premendo qui creiamo il preventivo e l'assistente parte subito.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 max-md:hidden">
                <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Foto rilievo</span>
                <span className="inline-flex items-center gap-1"><Mic className="h-3.5 w-3.5" /> Detta a voce</span>
                <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Testo</span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={onStartAi}
              disabled={creating}
              className="shrink-0 gap-1.5 bg-orange-500 hover:bg-orange-600"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Avvia con Silvio AI
            </Button>
          </div>
        </div>
      )}

      <div className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-row items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900">
              {/* Telefono: una riga per titolo e una per il nome, senza spiegazioni. */}
              {form.cliente_id ? <>Contatto CRM<span className="max-md:hidden"> collegato</span></> : "Contatto CRM"}
            </p>
            <p className={cn("truncate text-[11px] text-slate-500", !form.cliente_id && "max-md:hidden")}>
              {form.cliente_id
                ? <>{compactText(form.cliente_nome, form.cliente_cognome) || "Contatto selezionato"}<span className="max-md:hidden"> · dati sincronizzati nel preventivo</span></>
                : "Collega un contatto per compilare anagrafica e recapiti."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {form.cliente_id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange("cliente_id", null)}
                className="tap-compact h-8 px-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                Scollega
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerOpen(true)}
              className="tap-compact h-8 gap-1.5 border-slate-200 px-3 text-xs text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              <Users className="h-3.5 w-3.5" />
              {form.cliente_id ? "Cambia" : "Seleziona da CRM"}
            </Button>
          </div>
        </div>
      </div>

      <ContactPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleSelectContact}
      />

      {progettoId && detailForAi && (
        <div className="mb-3">
          <AiSerramentiDraftLauncher
            progettoId={progettoId}
            detail={detailForAi}
            context="contact"
            autoOpen={autoOpenAi}
            onGoToComposition={onGoToComposition}
          />
        </div>
      )}

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <Label className="text-xs">Nome</Label>
          <Input
            value={form.cliente_nome ?? ""}
            onChange={(e) => onChange("cliente_nome", e.target.value)}
            placeholder="Paolo"
            className="h-9"
          />
        </div>
        <div className="col-span-6">
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
        <div className="col-span-6">
          <Label className="text-xs">Città</Label>
          <Input
            value={form.cliente_citta ?? ""}
            onChange={(e) => onChange("cliente_citta", e.target.value)}
            placeholder="Milano"
            className="h-9"
          />
        </div>
        <div className="col-span-3">
          <Label className="text-xs">CAP</Label>
          <Input
            value={form.cliente_cap ?? ""}
            onChange={(e) => onChange("cliente_cap", e.target.value)}
            placeholder="20121"
            className="h-9"
          />
        </div>
        <div className="col-span-3">
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

function StepClienteSummary({
  form, detail,
}: {
  form: Partial<SrProgettoRow>;
  detail?: SrProgettoDetail;
}) {
  const clienteNome = compactText(form.cliente_nome, form.cliente_cognome);
  const clienteIndirizzo = compactAddress(
    form.cliente_indirizzo,
    compactText(form.cliente_cap, form.cliente_citta),
    form.cliente_provincia,
  );
  const cantiere = compactAddress(
    form.cantiere_indirizzo,
    compactText(form.cantiere_cap, form.cantiere_citta),
    form.cantiere_provincia,
  );
  const righeOfferta = detail?.serramenti.length ?? 0;

  return (
    <div className="sticky top-24 rounded-md border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-semibold text-slate-900">Scheda preventivo</p>
        <p className="text-[11px] leading-4 text-slate-500">
          Dati usati da PDF, microsito cliente e AI.
        </p>
      </div>

      <div className="space-y-2.5">
        <SummaryLine
          icon={<User className="h-3.5 w-3.5" />}
          label="Cliente"
          value={clienteNome || "Da completare"}
          muted={!clienteNome}
        />
        <SummaryLine
          icon={<Phone className="h-3.5 w-3.5" />}
          label="Telefono"
          value={form.cliente_telefono || "Non indicato"}
          muted={!form.cliente_telefono}
        />
        <SummaryLine
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Email"
          value={form.cliente_email || "Non indicata"}
          muted={!form.cliente_email}
        />
        <SummaryLine
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Indirizzo cliente"
          value={clienteIndirizzo || "Non indicato"}
          muted={!clienteIndirizzo}
        />
        <SummaryLine
          icon={<Home className="h-3.5 w-3.5" />}
          label="Cantiere"
          value={cantiere || "Si completa nello step Immobile"}
          muted={!cantiere}
        />
        <SummaryLine
          icon={<RectangleVertical className="h-3.5 w-3.5" />}
          label="Composizione"
          value={`${righeOfferta} ${righeOfferta === 1 ? "riga" : "righe"} in offerta`}
          muted={righeOfferta === 0}
        />
      </div>

      <div className="mt-3 rounded-md border border-orange-100 bg-orange-50/60 p-2">
        <p className="text-[11px] font-semibold text-orange-900">AI legge anche questa scheda</p>
        <p className="mt-0.5 text-[11px] leading-4 text-orange-800/80">
          Cliente, indirizzo, cantiere e contenuti già inseriti vengono usati per proporre righe offerta più coerenti.
        </p>
      </div>
    </div>
  );
}

function SummaryLine({
  icon, label, value, muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className={cn(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
        muted ? "bg-slate-100 text-slate-400" : "bg-white text-slate-700 ring-1 ring-slate-200",
      )}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={cn("truncate text-xs", muted ? "text-slate-400" : "text-slate-900")}>
          {value}
        </p>
      </div>
    </div>
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
        <div className="col-span-6">
          <Label className="text-xs">Città</Label>
          <Input
            value={form.cantiere_citta ?? ""}
            onChange={(e) => onChange("cantiere_citta", e.target.value)}
            placeholder="Milano"
            className="h-9"
          />
        </div>
        <div className="col-span-3">
          <Label className="text-xs">CAP</Label>
          <Input
            value={form.cantiere_cap ?? ""}
            onChange={(e) => onChange("cantiere_cap", e.target.value)}
            placeholder="20121"
            className="h-9"
          />
        </div>
        <div className="col-span-3">
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
