/**
 * Wizard 8-step creazione progetto Fotovoltaico (§31).
 * Layout v2 — replica mockup HTML con tab orizzontale sticky, page header,
 * cards a barra arancione, callout a colori, footer sticky con auto-save.
 *
 * Step 1 — Cliente
 * Step 2 — Immobile (indirizzo + geocoding)
 * Step 3 — Consumi (kWh, profilo, tariffa, ISEE/reddito)
 * Step 4 — Tetto (Solar API / PVGIS / Manuale)
 * Step 5 — Configurazione impianto (componenti dal listino)
 * Step 6 — Anteprima finanziaria espansa (KPI + sensitivity + what-if)
 * Step 7 — Vista impresa (BOM + manodopera + margine)
 * Step 8 — Generazione PDF + emissione
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBundlesList, type Bundle } from "@/hooks/useBundles";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sun,
  Sparkles,
  Loader2,
  Compass,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  FileText,
  Award,
  RefreshCw,
  X,
  Copy,
  Home,
  Building2,
  Plus,
  Wallet,
  Zap, Wrench, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FvContactPicker } from "@/components/fotovoltaico/FvContactPicker";
import {
  useProgetto,
  useAggiornaProgetto,
  useProfiliAutoconsumo,
  useArticoliFv,
  useComponentiProgetto,
  useListinoPerFv,
  useUpsertComponenti,
  useUpsertManodopera,
  useUpsertServizi,
  useTariffeFv,
  useManodoperaProgetto,
  useServiziProgetto,
  useTabelleFinanziamentoFv,
  useTopFinanziamentiFv,
  useTemplatePdf,
  useServiziCatalogo,
  useDuplicaProgetto,
  type FvTariffaAziendale,
  type FvTabellaFinanziamento,
  type FvRigaFinanziamento,
} from "@/lib/fotovoltaico/queries";
import { useDiscountRules } from "@/hooks/useDiscountRules";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { evaluateDiscountRules, classifyDiscount } from "@/lib/serramenti/discountRules";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import type {
  FvArchetipo,
  FvProfiloAutoconsumoCodice,
  FvTariffaTipo,
  FvCategoriaComponente,
} from "@/lib/fotovoltaico/tipi";
import {
  FvTabBar,
  FvPageHeader,
  FvPanelTitle,
  FvCard,
  FvKpi,
  FvCallout,
  FvChip,
  FvFooter,
  FvTabPane,
} from "@/lib/fotovoltaico/wizardUI";
import {
  calcolaFvNoleggioOperativo,
  calcolaFvEconomicsGuard,
  calcolaFvCommercialReadiness,
  shouldSuggestFvAccumulo,
} from "@/lib/fotovoltaico/preventivatore";
import { toast } from "sonner";
// Refactor 2026-05-10: CassaCumulataChart estratto in
// src/components/fotovoltaico/CassaCumulataChart.tsx (-142 righe)
import { CassaCumulataChart } from "@/components/fotovoltaico/CassaCumulataChart";
import { FvConfrontoVarianti } from "@/components/fotovoltaico/FvConfrontoVarianti";
import { FvLayoutTetto } from "@/components/fotovoltaico/FvLayoutTetto";
import { FvSimulatoreInterattivo } from "@/components/fotovoltaico/FvSimulatoreInterattivo";
import { FvDimensionamentoStringhe } from "@/components/fotovoltaico/FvDimensionamentoStringhe";
import { inputBaseDaContesto, type ContestoVariantiVicine } from "@/lib/fotovoltaico/varianti";
import { derivaSpecModuloDaPotenza } from "@/lib/fotovoltaico/catalogoProdotti";
// F16: ricostruisce l'etichetta orientamento (es. "S 180°") dall'azimut numerico
// salvato in DB (fv_progetti.azimut_tetto) all'idratazione del progetto.
import { etichettaAzimut } from "@/lib/fotovoltaico/tetto";

// MP-MKT-001: TOTAL_STEPS + TABS estratti in ./FotovoltaicoWizard/constants.ts
// Bugfix: i range coordinate Italia (ITALIA_LAT/LNG_*) sono usati in
// stepValidation (case 2) e in Step2Immobile (aria-invalid + callout) ma dopo
// l'estrazione in constants.ts non erano più importati → ReferenceError a
// runtime (crash navigando allo Step 2, soprattutto in modifica con coordinate
// valorizzate, dove gli short-circuit `lat != null && lat < ITALIA_LAT_MIN`
// arrivano a leggere la costante inesistente).
import {
  TOTAL_STEPS, TABS,
  ITALIA_LAT_MIN, ITALIA_LAT_MAX, ITALIA_LNG_MIN, ITALIA_LNG_MAX,
} from "./FotovoltaicoWizard/constants";

// MP-MKT-001: WizardData/PersistedDraft → ./FotovoltaicoWizard/types.ts
//   coordinate Italia + helpers di validazione + persistenza locale draft
//   → ./FotovoltaicoWizard/helpers.ts
import type { WizardData } from "./FotovoltaicoWizard/types";
import {
  isCoordinataItalia,
  loadPersistedDraft, savePersistedDraft, clearPersistedDraft,
} from "./FotovoltaicoWizard/helpers";

// MP-MKT-001: INITIAL estratto in ./FotovoltaicoWizard/constants.ts
import { INITIAL, PAGAMENTO_PRESETS } from "./FotovoltaicoWizard/constants";

const formatEur = (n: number) =>
  `€ ${n.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const obj = e as { message?: string; error?: string };
    return obj.message ?? obj.error ?? "Errore sconosciuto. Riprova fra qualche istante.";
  }
  return String(e ?? "Errore sconosciuto");
}

const MODALITA_FINANZIAMENTO = ["cash", "rate", "zero", "noleggio"] as const;

/** La scelta di finanziamento salvata su fv_progetti, nei campi del wizard. */
function finanziamentoSalvato(progetto: unknown): Partial<WizardData> {
  const p = progetto as {
    modalita_pagamento?: unknown;
    scenario_finanziamento?: string | null;
    finanziamento_durata_mesi?: number | null;
    finanziamento_tabella_id?: string | null;
  };
  const modalita = MODALITA_FINANZIAMENTO.find((m) => m === p.scenario_finanziamento);
  if (p.modalita_pagamento == null || !modalita) return {};
  return {
    finanziamento_modalita: modalita,
    durata_mesi_scelta: p.finanziamento_durata_mesi ?? INITIAL.durata_mesi_scelta,
    tabella_finanziamento_id: p.finanziamento_tabella_id ?? null,
  };
}

/** I dati del tetto come colonne di fv_progetti (l'ombreggiamento a parte). */
function campiTetto(d: WizardData) {
  return {
    fonte_dati_tetto: d.fonte_dati_tetto,
    ore_sole_annue: d.ore_sole_annue,
    superficie_tetto_disponibile_mq: d.superficie_tetto_disponibile_mq,
    numero_pannelli_max: d.numero_pannelli_max,
    potenza_max_kwp: d.potenza_max_kwp,
  };
}

// Un altro progetto sullo stesso percorso (per esempio dopo «Duplica») è un
// wizard nuovo: senza chiave React teneva lo stato del progetto di prima. /nuovo
// non cambia indirizzo quando crea la bozza, quindi la chiave non cambia a metà.
export default function FotovoltaicoWizardPerProgetto() {
  const { id } = useParams<{ id?: string }>();
  return <FotovoltaicoWizard key={id ?? "nuovo"} />;
}

function FotovoltaicoWizard() {
  const { id } = useParams<{ id?: string }>();
  // Company effettiva del frontend (multi-azienda): serve a creare il progetto
  // sotto l'azienda selezionata nello switcher, non sotto la primaria del profilo.
  const effectiveCompanyId = useEffectiveCompanyId();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Riprendi bozza (solo su /nuovo): ultima bozza DB dell'utente, con i
  // dati principali. Risolve il flusso "esco → torno → devo reinserire tutto":
  // la bozza vera sta in DB, non nel draft locale.
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const { data: ultimaBozza } = useQuery({
    queryKey: ["fv-ultima-bozza", effectiveCompanyId, user?.id],
    enabled: !id && !!effectiveCompanyId && !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error } = await (supabase as any)
        .from("fv_progetti")
        .select("id, numero, indirizzo, comune, updated_at, cliente:marketing_contacts(first_name, last_name)")
        .eq("company_id", effectiveCompanyId!)
        .eq("created_by", user!.id)
        .eq("stato", "bozza")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return row as {
        id: string; numero: string | null; indirizzo: string | null; comune: string | null;
        updated_at: string | null;
        cliente: { first_name: string | null; last_name: string | null } | null;
      } | null;
    },
  });
  const [searchParams] = useSearchParams();
  // Pre-link da CRM/Opportunità: ?contact_id=… (eventualmente con &opportunity_id=…).
  // Permette il flow "Crea preventivo Fotovoltaico" dal dialog opportunità/contatto,
  // precompilando l'anagrafica cliente (Step 1). Replica il pattern di SerramentiWizard.
  const urlContactId = searchParams.get("contact_id");
  // Opportunità CRM di provenienza: aggancia il progetto FV all'opportunità
  // (fv_progetti.opportunita_crm_id) alla creazione, in parità con SerramentiWizard.
  const urlOpportunityId = searchParams.get("opportunity_id");

  // Restore draft da localStorage al primo render (solo per progetti nuovi
  // o quando il browser è stato chiuso a metà). Se il progetto è già firmato,
  // il draft viene scartato dal merge con progettoEsistente.
  const initialDraft = useMemo(() => loadPersistedDraft(id ?? null), [id]);

  const [step, setStep] = useState(initialDraft?.step ?? 1);
  // Merge con INITIAL: i draft salvati prima dell'aggiunta di nuovi campi
  // (prodotti_extra, sconto_tipo/valore) non li contengono → senza merge
  // `data.prodotti_extra` sarebbe undefined a runtime.
  const [data, setData] = useState<WizardData>(
    initialDraft ? { ...INITIAL, ...initialDraft.data } : INITIAL,
  );
  const [progettoId, setProgettoId] = useState<string | null>(id ?? null);
  const [salvando, setSalvando] = useState(false);
  const [analizzandoTetto, setAnalizzandoTetto] = useState(false);
  const [calcolandoFinanziario, setCalcolandoFinanziario] = useState(false);
  const [scenarioFin, setScenarioFin] = useState<Record<string, unknown> | null>(null);
  const [scenarioErr, setScenarioErr] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    new Set(initialDraft?.completedSteps ?? []),
  );
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    initialDraft ? "saved" : "idle",
  );
  const [lastSaveAt, setLastSaveAt] = useState<Date | null>(
    initialDraft ? new Date(initialDraft.savedAt) : null,
  );

  // Lock atomico anti double-click su goNext (B1). Usa useRef per evitare
  // re-render e leggere il valore sincronicamente dentro l'handler.
  const navigationLock = useRef<boolean>(false);

  // Notifica draft restored.
  // Fix #1 Sprint 3: salviamo l'ID del toast in modo da poterlo dismissare
  // esplicitamente al click "Ricomincia" (evita il loop di rispawn dopo
  // che il reload re-trigga il useEffect con draft ancora presente per
  // un breve istante).
  const restoredToastShown = useRef(false);
  useEffect(() => {
    if (initialDraft && !id && !restoredToastShown.current) {
      restoredToastShown.current = true;
      const toastId = toast.info("Bozza ripristinata dal salvataggio locale", {
        description: "Hai dati non salvati dall'ultima sessione.",
        action: {
          label: "Ricomincia",
          onClick: () => {
            // Cancella draft + dismiss toast + reload
            clearPersistedDraft(null);
            toast.dismiss(toastId);
            window.location.reload();
          },
        },
        closeButton: true, // X per chiudere il toast senza ricominciare
        duration: 8000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Anti-race / unmount guard ────────────────────────────────────────────
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Guardia hydration: id del progetto già caricato dal DB nel form. Evita che
  // i refetch di useProgetto (nessuno staleTime + invalidate dopo ogni
  // aggiornaProgetto) re-idratino il form sovrascrivendo le modifiche live
  // dell'utente ("i dati inseriti non vengono riportati"). Si idrata UNA volta
  // per ogni progetto aperto in modifica.
  const hydratedProjectIdRef = useRef<string | null>(null);

  // ─── Pre-popola anagrafica cliente da CRM (?contact_id=…) ──────────────────
  // Quando il wizard è aperto da un'opportunità/contatto del CRM, precompila
  // i campi cliente dello Step 1 con i dati del contatto. Replica il pattern
  // di SerramentiWizard. Si esegue UNA SOLA VOLTA, solo per progetto NUOVO
  // (senza id in URL) e solo se i campi cliente sono ancora vuoti — così non
  // sovrascrive mai dati già inseriti dall'utente o ripristinati dal draft.
  // Best-effort: in caso di errore fa console.warn e prosegue (no-op).
  const didPrefillFromUrlRef = useRef(false);
  useEffect(() => {
    if (id) return; // solo progetto nuovo
    if (didPrefillFromUrlRef.current) return;
    if (!urlContactId) return;
    // Non sovrascrivere se l'anagrafica è già popolata (utente o draft locale).
    if (data.cliente_nome.trim() || data.cliente_cognome.trim() || data.cliente_id) return;
    didPrefillFromUrlRef.current = true;
    (async () => {
      try {
        const { data: c } = await supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name, email, phone")
          .eq("id", urlContactId)
          .maybeSingle();
        if (!c || !mountedRef.current) return;
        setData((prev) => ({
          ...prev,
          // Non sovrascrivere eventuali valori già presenti (difesa extra).
          cliente_id: prev.cliente_id ?? c.id,
          cliente_nome: prev.cliente_nome || (c.first_name ?? ""),
          cliente_cognome: prev.cliente_cognome || (c.last_name ?? ""),
          cliente_email: prev.cliente_email || (c.email ?? ""),
          cliente_telefono: prev.cliente_telefono || (c.phone ?? ""),
        }));
      } catch (e) {
        console.warn("[fotovoltaico] prefill cliente da URL fallito", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, urlContactId]);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: profili = [] } = useProfiliAutoconsumo();
  const { data: pannelli = [], isLoading: pannelliLoading } = useArticoliFv("pannello");
  const { data: inverter = [], isLoading: inverterLoading } = useArticoliFv("inverter");
  const { data: accumuli = [] } = useArticoliFv("accumulo");
  // Banner Step 5: catalogo FV vuoto (query concluse, 0 pannelli e 0 inverter)
  // → il listino non è ancora stato collegato al preventivatore.
  const catalogoFvVuoto =
    !pannelliLoading && !inverterLoading && pannelli.length === 0 && inverter.length === 0;
  const { data: tariffeFv = [] } = useTariffeFv();
  // Kit/offerte FV: i bundle con fv_kwp valorizzato (indipendente dal vertical
  // dell'azienda, che può essere "generico" pur avendo il modulo FV). Filtro in Step5.
  const { bundles: kitFvBundles } = useBundlesList();
  const { data: fvTemplate } = useTemplatePdf();
  const { data: serviziCatalogo = [] } = useServiziCatalogo();
  const { data: progettoEsistente } = useProgetto(progettoId ?? undefined);
  const { data: manodoperaEsistente } = useManodoperaProgetto(progettoId ?? undefined);
  const { data: serviziEsistente } = useServiziProgetto(progettoId ?? undefined);
  // Componenti già salvati: servono per ri-idratare i "Prodotti extra"
  // (categoria='altro', esclusa la voce-kit) in modifica, così sopravvivono
  // al flusso delete+insert dello Step 5.
  const { data: componentiEsistenti } = useComponentiProgetto(progettoId ?? undefined);

  // Sprint 4: tabelle finanziamento per importo target del progetto
  // Il prezzo appena calcolato (scenarioFin) prima di quello riletto dal DB, che
  // resta vecchio fino al prossimo refetch: tabelle e rata vanno sul prezzo vero.
  const prezzoCalcolato = (scenarioFin?.costi as { prezzo_vendita_iva_inclusa?: number } | undefined)
    ?.prezzo_vendita_iva_inclusa;
  const investimentoCorrente = prezzoCalcolato ?? progettoEsistente?.prezzo_vendita_iva_inclusa ?? null;
  const { data: tabelleFinanziamento = [] } = useTabelleFinanziamentoFv(
    investimentoCorrente ? Number(investimentoCorrente) : undefined,
  );
  const { data: topFinanziamenti = [] } = useTopFinanziamentiFv(
    investimentoCorrente ? Number(investimentoCorrente) : null,
    data.durata_mesi_scelta,
  );

  const aggiornaProgetto = useAggiornaProgetto();
  const upsertComponenti = useUpsertComponenti();
  const upsertManodopera = useUpsertManodopera();
  const upsertServizi = useUpsertServizi();

  // ─── Read-only mode ──────────────────────────────────────────────────────
  // Stati 'firmato' e 'annullato' sono immutabili: si può solo consultare.
  // Stato 'emesso' permette consultazione + rigenerazione PDF, no edit dati.
  const readOnlyMode = useMemo(() => {
    if (!progettoEsistente) return false;
    const stato = (progettoEsistente as { stato?: string }).stato;
    return stato === "firmato" || stato === "annullato" || stato === "emesso";
  }, [progettoEsistente]);

  const readOnlyReason = useMemo(() => {
    if (!progettoEsistente) return null;
    const stato = (progettoEsistente as { stato?: string }).stato;
    if (stato === "firmato")
      return "Progetto firmato dal cliente. I dati non sono più modificabili. Puoi clonarlo per creare una nuova versione.";
    if (stato === "annullato")
      return "Progetto annullato. Sola consultazione.";
    if (stato === "emesso")
      return "Preventivo emesso. Per modificare clona il progetto e crea una nuova versione.";
    return null;
  }, [progettoEsistente]);

  // Carica progetto esistente nello state in MODIFICA. La verità è il DB:
  // sovrascrive sempre il draft locale (eventualmente stale/vuoto) al primo
  // arrivo della riga. Vincoli importanti:
  //  - SOLO per progetti aperti in modifica (URL :id == riga caricata): in
  //    creazione il form è la fonte autorevole, non va idratato dalla riga
  //    appena creata (che contiene solo i dati dello Step 1).
  //  - UNA SOLA VOLTA per id: useProgetto non ha staleTime e viene invalidata
  //    dopo ogni aggiornaProgetto → senza la guardia ogni refetch re-idraterebbe
  //    il form annullando le modifiche in corso dell'utente.
  useEffect(() => {
    if (!progettoEsistente || !progettoId) return;
    // Idrata solo la riga corrispondente all'id aperto in modifica (non una
    // riga creata a runtime durante il flow "nuovo").
    if (id == null || progettoEsistente.id !== id) return;
    // Già idratato questo progetto: non sovrascrivere le modifiche live.
    if (hydratedProjectIdRef.current === progettoEsistente.id) return;
    hydratedProjectIdRef.current = progettoEsistente.id;
    const cli = progettoEsistente as {
      cliente_id?: string | null;
      cliente_nome?: string | null; cliente_cognome?: string | null;
      cliente_telefono?: string | null; cliente_email?: string | null;
      cliente?: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
    };
    setData((d) => ({
      ...d,
      archetipo: progettoEsistente.archetipo,
      // Ripristino Fase 1: snapshot sul progetto, con fallback al contatto CRM collegato.
      cliente_id: cli.cliente_id ?? null,
      cliente_nome: cli.cliente_nome || cli.cliente?.first_name || "",
      cliente_cognome: cli.cliente_cognome || cli.cliente?.last_name || "",
      cliente_telefono: cli.cliente_telefono || cli.cliente?.phone || "",
      cliente_email: cli.cliente_email || cli.cliente?.email || "",
      indirizzo: progettoEsistente.indirizzo,
      comune: progettoEsistente.comune ?? "",
      provincia: progettoEsistente.provincia ?? "",
      cap: progettoEsistente.cap ?? "",
      regione: progettoEsistente.regione ?? "",
      popolazione_comune: progettoEsistente.popolazione_comune,
      latitudine: progettoEsistente.latitudine,
      longitudine: progettoEsistente.longitudine,
      tipologia_immobile: progettoEsistente.tipologia_immobile ?? "residenziale",
      superficie_immobile_mq: progettoEsistente.superficie_immobile_mq,
      prima_casa: progettoEsistente.prima_casa ?? true,
      consumo_annuo_kwh: progettoEsistente.consumo_annuo_kwh,
      costo_kwh_attuale: progettoEsistente.costo_kwh_attuale ?? 0.32,
      tariffa_tipo: progettoEsistente.tariffa_tipo ?? "monoraria",
      profilo_consumo: (progettoEsistente.profilo_consumo as FvProfiloAutoconsumoCodice) ?? "misto",
      isee: progettoEsistente.isee,
      numero_figli: progettoEsistente.numero_figli ?? 0,
      reddito_annuo_dichiarato: progettoEsistente.reddito_annuo_dichiarato,
      fonte_dati_tetto: (progettoEsistente.fonte_dati_tetto as never) ?? "solar_api",
      qualita_dati_tetto: progettoEsistente.qualita_dati_tetto,
      imagery_date: progettoEsistente.imagery_date,
      tetto_mock: progettoEsistente.qualita_dati_tetto === "mock",
      ore_sole_annue: progettoEsistente.ore_sole_annue,
      superficie_tetto_disponibile_mq: progettoEsistente.superficie_tetto_disponibile_mq,
      numero_pannelli_max: progettoEsistente.numero_pannelli_max,
      potenza_max_kwp: progettoEsistente.potenza_max_kwp,
      // F16: ridrata geometria tetto persistita. azimut_tetto in DB è numerico
      // (gradi) → ricostruisco l'etichetta UI; inclinazione/layout passano diretti.
      azimut_tetto:
        progettoEsistente.azimut_tetto != null
          ? etichettaAzimut(Number(progettoEsistente.azimut_tetto))
          : null,
      inclinazione_tetto: progettoEsistente.inclinazione_tetto ?? null,
      layout_tetto:
        (progettoEsistente.layout_tetto as WizardData["layout_tetto"]) ?? null,
      perdita_ombreggiamento_pct: progettoEsistente.perdita_ombreggiamento_pct ?? 0,
      numero_pannelli_scelti: progettoEsistente.numero_pannelli_scelti ?? 16,
      potenza_kwp: progettoEsistente.potenza_kwp ?? 8.64,
      con_accumulo: progettoEsistente.con_accumulo ?? false,
      capacita_accumulo_kwh: progettoEsistente.capacita_accumulo_kwh ?? 0,
      con_wallbox: progettoEsistente.con_wallbox ?? false,
      con_ottimizzatori: progettoEsistente.con_ottimizzatori ?? false,
      kit_bundle_id: (progettoEsistente as { kit_bundle_id?: string | null }).kit_bundle_id ?? null,
      kit_nome: (progettoEsistente as { kit_nome?: string | null }).kit_nome ?? null,
      kit_prezzo: (progettoEsistente as { kit_prezzo?: number | null }).kit_prezzo ?? null,
      prezzo_vendita_manuale:
        (progettoEsistente as { prezzo_vendita_manuale?: number | null }).prezzo_vendita_manuale != null
          ? Number((progettoEsistente as { prezzo_vendita_manuale?: number | null }).prezzo_vendita_manuale)
          : null,
      layout_overlay:
        (progettoEsistente as { layout_overlay?: { x: number; y: number; rot: number; cols: number } | null })
          .layout_overlay ?? null,
      modalita_pagamento:
        (progettoEsistente as { modalita_pagamento?: WizardData["modalita_pagamento"] })
          .modalita_pagamento ?? INITIAL.modalita_pagamento,
      // Sconto commerciale persistito (Step 6): ri-idrata tipo + valore.
      sconto_tipo:
        ((progettoEsistente as { sconto_tipo?: "pct" | "importo" | null }).sconto_tipo ?? "pct"),
      sconto_valore:
        (progettoEsistente as { sconto_valore?: number | null }).sconto_valore != null
          ? Number((progettoEsistente as { sconto_valore?: number | null }).sconto_valore)
          : null,
      // Finanziamento scelto: si salvava ma al riaprire tornava «rate, 84 mesi»,
      // e «Avanti» in Fase 6 sovrascriveva la scelta. modalita_pagamento la scrive
      // solo la Fase 6: senza, scenario_finanziamento è il 'cash' predefinito.
      ...finanziamentoSalvato(progettoEsistente),
    }));
    // Marca tutti gli step "passati" del progetto come completati.
    // Un progetto già emesso ha tutti gli 8 step completati.
    const stato = (progettoEsistente as { stato?: string }).stato;
    if (stato && stato !== "bozza") {
      setCompletedSteps(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    } else if (progettoEsistente.consumo_annuo_kwh != null) {
      setCompletedSteps(new Set([1, 2, 3]));
    }
  }, [progettoEsistente, progettoId, id]);

  // Pre-popola tariffa_installazione_id leggendo dalla manodopera esistente
  // (il dato non è in fv_progetti ma in fv_manodopera_progetto.tariffa_id).
  useEffect(() => {
    if (manodoperaEsistente && manodoperaEsistente.length > 0) {
      const primaRiga = manodoperaEsistente[0] as { tariffa_id?: string | null };
      if (primaRiga.tariffa_id) {
        setData((d) =>
          d.tariffa_installazione_id ? d : { ...d, tariffa_installazione_id: primaRiga.tariffa_id! },
        );
      }
    }
  }, [manodoperaEsistente]);

  // Ri-idrata i "Prodotti extra" dalle righe fv_componenti_progetto salvate
  // (categoria='altro', esclusa la voce-kit che ha unita_misura='kit').
  // UNA volta per progetto: senza guardia il refetch post-save (replace:true)
  // sovrascriverebbe le modifiche live dell'utente (es. extra appena rimossi).
  const extrasHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!progettoId || !componentiEsistenti || componentiEsistenti.length === 0) return;
    if (extrasHydratedRef.current === progettoId) return;
    const extras = componentiEsistenti.filter(
      (c) => c.categoria === "altro" && c.unita_misura !== "kit",
    );
    extrasHydratedRef.current = progettoId;
    if (extras.length === 0) return;
    setData((d) =>
      d.prodotti_extra.length > 0
        ? d
        : {
            ...d,
            prodotti_extra: extras.map((c) => ({
              uid: crypto.randomUUID(),
              listino_id: null,
              descrizione: c.descrizione,
              quantita: Number(c.quantita) || 1,
              prezzo_vendita: Number(c.prezzo_unitario_vendita) || 0,
              prezzo_acquisto:
                c.prezzo_unitario_netto != null ? Number(c.prezzo_unitario_netto) : null,
            })),
          },
    );
  }, [componentiEsistenti, progettoId]);

  // Pannello, inverter e accumulo scelti vivono nelle righe dei componenti:
  // senza ripristinarli, riaprendo una bozza la Fase 5 chiedeva di nuovo i
  // modelli («Seleziona un modello di pannello dal listino»).
  const modelliHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!progettoId || !componentiEsistenti || componentiEsistenti.length === 0) return;
    if (modelliHydratedRef.current === progettoId) return;
    modelliHydratedRef.current = progettoId;
    const articoloDi = (categoria: string) =>
      componentiEsistenti.find((c) => c.categoria === categoria && c.articolo_id)?.articolo_id ?? null;
    setData((d) => ({
      ...d,
      pannello_id: d.pannello_id ?? articoloDi("pannello"),
      inverter_id: d.inverter_id ?? articoloDi("inverter"),
      accumulo_id: d.accumulo_id ?? articoloDi("accumulo"),
    }));
  }, [componentiEsistenti, progettoId]);

  // Ri-idrata manodopera + servizi dalle tabelle (bozza), una volta per progetto,
  // così l'editor Fase 5 mostra le righe salvate. Guard ref anti-clobber del refetch.
  const manodoperaHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!progettoId || !manodoperaEsistente) return;
    if (manodoperaHydratedRef.current === progettoId) return;
    manodoperaHydratedRef.current = progettoId;
    setData((d) =>
      d.manodopera_righe.length > 0
        ? d
        : {
            ...d,
            manodopera_righe: manodoperaEsistente.map((m) => ({
              tariffa_id: (m as { tariffa_id?: string | null }).tariffa_id ?? null,
              descrizione: m.descrizione,
              ore: Number(m.ore) || 0,
              tariffa_oraria_netta: Number(m.tariffa_oraria_netta) || 0,
              tariffa_oraria_vendita: Number(m.tariffa_oraria_vendita) || 0,
            })),
          },
    );
  }, [manodoperaEsistente, progettoId]);

  const serviziHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!progettoId || !serviziEsistente) return;
    if (serviziHydratedRef.current === progettoId) return;
    serviziHydratedRef.current = progettoId;
    setData((d) =>
      d.servizi_righe.length > 0
        ? d
        : {
            ...d,
            servizi_righe: serviziEsistente.map((s) => ({
              tipo: (s as { tipo?: string }).tipo ?? "altro",
              descrizione: s.descrizione,
              quantita: Number((s as { quantita?: number }).quantita) || 1,
              prezzo_netto: Number((s as { prezzo_netto?: number }).prezzo_netto) || 0,
              prezzo_vendita: Number((s as { prezzo_vendita?: number }).prezzo_vendita) || 0,
              note_operative: (s as { note_operative?: string | null }).note_operative ?? null,
            })),
          },
    );
  }, [serviziEsistente, progettoId]);

  // Persistenza locale: salva draft ad ogni cambio di state, ma non quando
  // siamo in read-only (il DB è già la verità).
  // Fix #9 Sprint 3: debounce 800ms per evitare localStorage thrashing
  // ad ogni keystroke (su slow devices il json.stringify del draft completo
  // può diventare un collo di bottiglia con form lunghi).
  useEffect(() => {
    if (readOnlyMode) return;
    const timer = setTimeout(() => {
      savePersistedDraft(progettoId, {
        step,
        data,
        completedSteps: Array.from(completedSteps),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [step, data, completedSteps, progettoId, readOnlyMode]);

  // beforeunload guard: avvisa se l'utente refresha/chiude con dati non salvati
  useEffect(() => {
    if (readOnlyMode) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Mostra il warning solo se stiamo davvero modificando qualcosa
      if (autoSaveState === "saving" || step > 1) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [readOnlyMode, autoSaveState, step]);

  const update = <K extends keyof WizardData>(k: K, v: WizardData[K]) => {
    if (readOnlyMode) {
      // F14a: dedup del toast — un singolo gesto (es. slider) chiama update()
      // più volte di fila; senza id si accumulerebbero N toast identici.
      toast.error("Progetto in sola lettura. Clona per creare una nuova versione.", {
        id: "fv-readonly",
      });
      return;
    }
    setData((d) => ({ ...d, [k]: v }));
  };

  // ─── Validazione step (con bound checks) ─────────────────────────────────
  // Restituisce { valido: boolean, motivo?: string } per dare feedback puntuale.
  const stepValidation = useMemo((): { valido: boolean; motivo?: string } => {
    switch (step) {
      case 1: {
        if (!data.cliente_nome.trim()) return { valido: false, motivo: "Nome obbligatorio" };
        if (!data.cliente_cognome.trim()) return { valido: false, motivo: "Cognome obbligatorio" };
        if (!data.cliente_telefono.trim() && !data.cliente_email.trim())
          return { valido: false, motivo: "Inserisci almeno cellulare o email" };
        return { valido: true };
      }
      case 2: {
        if (!data.indirizzo.trim()) return { valido: false, motivo: "Indirizzo obbligatorio" };
        // Coordinate: consigliate per la stima solare (Solar API/PVGIS) ma NON bloccano
        // l'avanzamento — con l'autocomplete si compilano da sole; se il geocoding non le
        // trova l'utente può proseguire e rifinirle dopo. Se PRESENTI, devono essere in Italia.
        if (data.latitudine != null && data.longitudine != null && !isCoordinataItalia(data.latitudine, data.longitudine))
          return {
            valido: false,
            motivo: `Coordinate fuori Italia (range valido: lat ${ITALIA_LAT_MIN}-${ITALIA_LAT_MAX}, lng ${ITALIA_LNG_MIN}-${ITALIA_LNG_MAX})`,
          };
        return { valido: true };
      }
      case 3: {
        if (data.consumo_annuo_kwh == null || data.consumo_annuo_kwh < 500)
          return { valido: false, motivo: "Consumo annuo minimo 500 kWh" };
        return { valido: true };
      }
      case 4: {
        if (!data.ore_sole_annue || data.ore_sole_annue <= 0)
          return { valido: false, motivo: "Esegui l'analisi tetto o inserisci dati manualmente" };
        if (!data.numero_pannelli_max || data.numero_pannelli_max <= 0)
          return { valido: false, motivo: "Numero pannelli max deve essere > 0" };
        return { valido: true };
      }
      case 5: {
        // Kit FV: se hai scelto un kit dal listino basta quello (porta kWp + prezzo).
        if (data.kit_bundle_id) {
          return data.potenza_kwp > 0
            ? { valido: true }
            : { valido: false, motivo: "Il kit selezionato non ha una potenza (kWp) valida" };
        }
        if (data.potenza_kwp <= 0 || data.numero_pannelli_scelti <= 0)
          return { valido: false, motivo: "Configura almeno un pannello" };
        // Fix #17 Sprint 3: pannello e inverter sono obbligatori per il calcolo
        // finanziario corretto. Senza articoli dal listino i prezzi non quadrano
        // e il preventivo PDF mostra "—" sui componenti.
        if (!data.pannello_id)
          return { valido: false, motivo: "Seleziona un modello di pannello dal listino" };
        if (!data.inverter_id)
          return { valido: false, motivo: "Seleziona un inverter dal listino" };
        // F13: NON richiediamo più accumulo_id quando con_accumulo è true. Lo
        // slider "Accumulo (kWh)" imposta con_accumulo + capacità senza scegliere
        // un articolo; il salvataggio Step 5 gestisce il ramo "accumulo generico"
        // (descrizione + prezzo da capacità). Il dropdown modello resta opzionale.
        return { valido: true };
      }
      case 6:
        return scenarioFin != null
          ? { valido: true }
          : { valido: false, motivo: "Esegui il calcolo finanziario per proseguire" };
      case 7:
        return progettoId
          ? { valido: true }
          : { valido: false, motivo: "Progetto non ancora creato" };
      case 8:
        return progettoId
          ? { valido: true }
          : { valido: false, motivo: "Progetto non disponibile" };
      default:
        return { valido: false, motivo: "Step sconosciuto" };
    }
  }, [step, data, scenarioFin, progettoId]);

  const stepValido = stepValidation.valido;

  // ─── Helpers di stato auto-save ────────────────────────────────────────────
  const markSaved = useCallback(() => {
    if (!mountedRef.current) return;
    setAutoSaveState("saved");
    setLastSaveAt(new Date());
  }, []);

  // ─── Step 2 → onboarding cliente (crea progetto in DB) ────────────────────
  const handleSalvaStep2 = async (): Promise<boolean> => {
    if (!data.indirizzo || data.latitudine == null || data.longitudine == null) return false;
    setSalvando(true);
    setAutoSaveState("saving");
    try {
      const titolo = `${data.cliente_nome} ${data.cliente_cognome}`.trim();
      if (!progettoId) {
        const { data: result, error } = await supabase.functions.invoke(
          "fv-onboarding-cliente",
          {
            body: {
              // Company effettiva (multi-azienda): il progetto va creato sotto
              // l'azienda dello switcher, altrimenti il salvataggio consumi
              // (filtrato per la company effettiva) non lo troverebbe.
              company_id: effectiveCompanyId ?? undefined,
              titolo,
              // Snapshot recapiti cliente: così la bozza ripristina la Fase 1
              // anche senza contatto CRM collegato (inserimento manuale) o su un
              // altro dispositivo (dove il draft localStorage non esiste).
              cliente_nome: data.cliente_nome || null,
              cliente_cognome: data.cliente_cognome || null,
              cliente_telefono: data.cliente_telefono || null,
              cliente_email: data.cliente_email || null,
              // Link CRM: aggancia il contatto e l'opportunità di provenienza
              // alla creazione del progetto (parità con SerramentiWizard). Senza
              // questi due campi il preventivo FV non risultava collegato.
              cliente_id: data.cliente_id ?? null,
              opportunita_crm_id: urlOpportunityId ?? null,
              archetipo: data.archetipo,
              indirizzo: data.indirizzo,
              comune: data.comune || undefined,
              provincia: data.provincia || undefined,
              cap: data.cap || undefined,
              regione: data.regione || undefined,
              popolazione_comune: data.popolazione_comune ?? undefined,
              latitudine: data.latitudine,
              longitudine: data.longitudine,
              tipologia_immobile: data.tipologia_immobile,
              superficie_immobile_mq: data.superficie_immobile_mq ?? undefined,
              prima_casa: data.prima_casa,
              consumo_annuo_kwh: data.consumo_annuo_kwh ?? 3500,
              costo_kwh_attuale: data.costo_kwh_attuale,
              tariffa_tipo: data.tariffa_tipo,
              profilo_consumo: data.profilo_consumo,
              isee: data.isee ?? undefined,
              numero_figli: data.numero_figli,
              reddito_annuo_dichiarato: data.reddito_annuo_dichiarato ?? undefined,
            },
          }
        );
        if (error) throw error;
        const newId = (result as { progetto_id?: string } | null)?.progetto_id;
        // Difesa: se la edge function risponde senza progetto_id non avanziamo
        // con id undefined (gli step successivi farebbero no-op silenziosi).
        if (!newId) throw new Error("Risposta del server priva di progetto_id");
        if (!mountedRef.current) return false;
        setProgettoId(newId);
        // La bozza ora vive in DB: il draft locale "nuovo" (pre-creazione) va
        // rimosso, altrimenti al prossimo /nuovo verrebbe ripristinato quello
        // stale/quasi vuoto invece della vera bozza (bug "ripristina non
        // riprende la bozza").
        clearPersistedDraft(null);
        toast.success("Progetto creato — continua con i consumi");
      } else {
        await aggiornaProgetto.mutateAsync({
          id: progettoId,
          patch: {
            // Snapshot recapiti cliente (aggiornati se l'utente li modifica).
            cliente_id: data.cliente_id ?? null,
            cliente_nome: data.cliente_nome || null,
            cliente_cognome: data.cliente_cognome || null,
            cliente_telefono: data.cliente_telefono || null,
            cliente_email: data.cliente_email || null,
            titolo: `${data.cliente_nome} ${data.cliente_cognome}`.trim() || undefined,
            archetipo: data.archetipo,
            indirizzo: data.indirizzo,
            comune: data.comune,
            provincia: data.provincia,
            cap: data.cap,
            regione: data.regione,
            popolazione_comune: data.popolazione_comune,
            latitudine: data.latitudine,
            longitudine: data.longitudine,
            tipologia_immobile: data.tipologia_immobile,
            superficie_immobile_mq: data.superficie_immobile_mq,
            prima_casa: data.prima_casa,
          } as never,
        });
      }
      if (!mountedRef.current) return false;
      markSaved();
      goTo(3, { markCompleted: true });
      return true;
    } catch (e) {
      if (!mountedRef.current) return false;
      setAutoSaveState("error");
      toast.error(`Salvataggio non riuscito: ${describeError(e)}`);
      return false;
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  };

  // ─── Step 3 → salva consumi ──────────────────────────────────────────────
  const handleSalvaStep3 = async () => {
    if (!progettoId) {
      // Nessun progetto creato (es. Fase 1 non salvata correttamente): niente
      // return silenzioso — "Avanti" sembrava non funzionare. Dai feedback + recupera.
      toast.error("Completa la Fase 1 (Cliente) e premi Avanti per creare il progetto, poi prosegui.");
      goTo(1);
      return;
    }
    setSalvando(true);
    setAutoSaveState("saving");
    try {
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          consumo_annuo_kwh: data.consumo_annuo_kwh,
          costo_kwh_attuale: data.costo_kwh_attuale,
          tariffa_tipo: data.tariffa_tipo,
          profilo_consumo: data.profilo_consumo,
          isee: data.isee,
          numero_figli: data.numero_figli,
          reddito_annuo_dichiarato: data.reddito_annuo_dichiarato,
        } as never,
      });
      if (!mountedRef.current) return;
      markSaved();
      goTo(4, { markCompleted: true });
    } catch (e) {
      if (!mountedRef.current) return;
      setAutoSaveState("error");
      toast.error(`Salvataggio consumi: ${describeError(e)}`);
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  };

  // ─── Step 4 → analisi tetto ───────────────────────────────────────────────
  const handleAnalizzaTetto = async () => {
    // F14b: in sola lettura l'analisi è disabilitata — esci subito senza
    // invocare le edge function né scrivere sul progetto.
    if (readOnlyMode) return;
    if (!progettoId || data.latitudine == null || data.longitudine == null) return;
    setAnalizzandoTetto(true);
    try {
      let result: Record<string, unknown> | null = null;
      // Fonte realmente usata: se la Solar API fallisce, ripieghiamo su PVGIS
      // così l'analisi tetto restituisce SEMPRE dei dati (niente vicolo cieco).
      let fonteEffettiva: "solar_api" | "pvgis" =
        data.fonte_dati_tetto === "pvgis" ? "pvgis" : "solar_api";

      const chiamaPvgis = async (): Promise<Record<string, unknown>> => {
        const { data: r, error } = await supabase.functions.invoke("fv-pvgis-fetch", {
          body: { lat: data.latitudine, lng: data.longitudine, kwp: data.potenza_kwp },
        });
        if (error) throw error;
        fonteEffettiva = "pvgis";
        return r as Record<string, unknown>;
      };

      if (data.fonte_dati_tetto === "solar_api") {
        try {
          const { data: r, error } = await supabase.functions.invoke("fv-solar-api-fetch", {
            body: { lat: data.latitudine, lng: data.longitudine, progetto_id: progettoId },
          });
          if (error) throw error;
          const sr = r as Record<string, unknown>;
          // La Solar API risponde 200 con `error` quando l'edificio non è coperto
          // o l'API rifiuta la richiesta → fallback automatico a PVGIS.
          if (sr?.error) throw new Error(String(sr.message ?? sr.error));
          result = sr;
          fonteEffettiva = "solar_api";
        } catch (solarErr) {
          if (!mountedRef.current) return;
          toast.message("Solar API non disponibile per questo edificio — uso PVGIS", {
            description: describeError(solarErr),
          });
          result = await chiamaPvgis();
        }
      } else if (data.fonte_dati_tetto === "pvgis") {
        result = await chiamaPvgis();
      }

      if (!mountedRef.current) return;
      if (!result) {
        toast.error("Nessun dato dal servizio. Prova un'altra fonte o usa l'inserimento manuale.");
        return;
      }

      const ore =
        (result.ore_sole_annue as number) ??
        (result.ore_sole_annue_equivalenti as number) ??
        null;
      const isMock = result._mock === true;
      const qualitaTetto = isMock ? "mock" : ((result.qualita as string) ?? null);

      // F10: la fonte PVGIS NON restituisce la geometria del tetto
      // (numero_pannelli_max / potenza_max_kwp / superficie_tetto_disponibile_mq):
      // salvarli a null bloccava la validazione dello Step 4 ("max null pannelli").
      // Quando il servizio non fornisce questi campi li stimiamo da una grandezza
      // nota (superficie immobile), con un default ragionevole se manca tutto —
      // così "Avanti" si abilita e l'utente può comunque rifinire a mano.
      const POTENZA_PANNELLO_W = 540; // pannello standard di riferimento
      const numMaxRaw = (result.numero_pannelli_max as number) ?? null;
      const kwpMaxRaw = (result.potenza_max_kwp as number) ?? null;
      const supTettoRaw = (result.superficie_tetto_disponibile_mq as number) ?? null;
      // Stima superficie utile del tetto: ~50% della superficie immobile,
      // fallback a 60 m² (tetto residenziale medio) se la superficie è ignota.
      const supImmobile = data.superficie_immobile_mq ?? null;
      const supTettoStimata =
        supTettoRaw && supTettoRaw > 0
          ? supTettoRaw
          : supImmobile && supImmobile > 0
            ? Math.round(supImmobile * 0.5)
            : 60;
      // ~2 m² per pannello; almeno 4 pannelli per non bloccare lo slider (min 4).
      const numMax =
        numMaxRaw && numMaxRaw > 0
          ? numMaxRaw
          : Math.max(4, Math.floor(supTettoStimata / 2));
      const kwpMax =
        kwpMaxRaw && kwpMaxRaw > 0
          ? kwpMaxRaw
          : Math.round((numMax * POTENZA_PANNELLO_W) / 10) / 100;
      const stimaGeometrica = !(numMaxRaw && numMaxRaw > 0);

      // F16: layout/azimut/inclinazione — la Solar API fornisce sia l'etichetta
      // ("S 180°") sia il valore numerico in gradi. Teniamo l'etichetta nello
      // stato locale (UI) ma persistiamo il numero (colonna numeric in DB).
      const layoutTetto =
        fonteEffettiva === "solar_api"
          ? ((result.layout_suggerito as WizardData["layout_tetto"]) ?? null)
          : null;
      const azimutDeg =
        fonteEffettiva === "solar_api"
          ? ((result.azimut_dominante_deg as number) ?? null)
          : null;
      const inclinazioneDeg =
        fonteEffettiva === "solar_api"
          ? ((result.tilt_dominante_deg as number) ?? null)
          : null;

      update("ore_sole_annue", ore);
      update("numero_pannelli_max", numMax);
      update("potenza_max_kwp", kwpMax);
      update("superficie_tetto_disponibile_mq", supTettoStimata);
      update("qualita_dati_tetto", qualitaTetto);
      update("imagery_date", (result.imagery_date as string) ?? null);
      // Cattura il layout reale dei pannelli (solo Solar API lo fornisce): oggi
      // veniva scartato; ora alimenta la vista "Disposizione reale dei pannelli".
      update("layout_tetto", layoutTetto);
      // Orientamento prevalente reale della falda (azimut + pendenza) da Solar API.
      // Etichetta in stato locale; valore numerico persistito in DB.
      update(
        "azimut_tetto",
        azimutDeg != null ? etichettaAzimut(azimutDeg) : null,
      );
      update("inclinazione_tetto", inclinazioneDeg);

      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          fonte_dati_tetto: fonteEffettiva,
          ore_sole_annue: ore,
          superficie_tetto_disponibile_mq: supTettoStimata,
          numero_pannelli_max: numMax,
          potenza_max_kwp: kwpMax,
          qualita_dati_tetto: qualitaTetto,
          imagery_date: (result.imagery_date as string) ?? null,
          // F16: persisti geometria reale del tetto (vedi migrazione
          // 20271021000000_fv_progetti_dati_tetto.sql).
          azimut_tetto: azimutDeg,
          inclinazione_tetto: inclinazioneDeg,
          layout_tetto: layoutTetto,
          // Ombreggiamento vicino (frazione 0..1): persistito con gli altri campi
          // dello Step 4 così sopravvive a reload e arriva al motore di calcolo.
          perdita_ombreggiamento_pct: data.perdita_ombreggiamento_pct ?? 0,
        } as never,
      });

      if (!mountedRef.current) return;
      markSaved();
      // Fix #16 Sprint 3: traccia se i dati sono mock per warning persistente
      update("tetto_mock", isMock);
      // F10: toast difensivo contro null + nota quando la geometria è stimata.
      const oreTxt = ore != null ? `${ore.toFixed(0)} h sole/anno` : "ore sole non disponibili";
      const maxTxt = numMax != null ? `max ${numMax} pannelli` : "geometria da definire";
      const stimaTxt = stimaGeometrica
        ? " (geometria stimata — affina i valori se serve)"
        : isMock
          ? " (dati stimati)"
          : "";
      toast.success(`Tetto analizzato: ${oreTxt} · ${maxTxt}${stimaTxt}`);
    } catch (e) {
      if (!mountedRef.current) return;
      toast.error(
        `Analisi tetto fallita: ${describeError(e)}. Puoi cambiare fonte o passare a "Manuale".`,
      );
    } finally {
      if (mountedRef.current) setAnalizzandoTetto(false);
    }
  };

  // ─── Step 5 → configurazione + componenti ─────────────────────────────────
  // ─── Step 4 → salva i dati del tetto ─────────────────────────────────────
  // «Avanti» passava alla Fase 5 senza salvare: i valori scritti a mano non
  // arrivavano al calcolo, che si fermava per le ore di sole mancanti o usava
  // quelli di un'analisi fatta prima.
  const handleSalvaStep4 = async () => {
    if (!progettoId || readOnlyMode) {
      goTo(5, { markCompleted: true });
      return;
    }
    setSalvando(true);
    setAutoSaveState("saving");
    try {
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: { ...campiTetto(data), perdita_ombreggiamento_pct: data.perdita_ombreggiamento_pct ?? 0 } as never,
      });
      if (!mountedRef.current) return;
      markSaved();
      goTo(5, { markCompleted: true });
    } catch (e) {
      if (!mountedRef.current) return;
      setAutoSaveState("error");
      toast.error(`Salvataggio non riuscito: ${describeError(e)}`);
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  };

  const handleSalvaStep5 = async (opts?: { skipNav?: boolean }) => {
    if (!progettoId) return;
    if (!opts?.skipNav) setSalvando(true);
    setAutoSaveState("saving");
    try {
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          numero_pannelli_scelti: data.numero_pannelli_scelti,
          potenza_kwp: data.potenza_kwp,
          con_accumulo: data.con_accumulo,
          capacita_accumulo_kwh: data.capacita_accumulo_kwh,
          con_wallbox: data.con_wallbox,
          con_ottimizzatori: data.con_ottimizzatori,
          kit_bundle_id: data.kit_bundle_id,
          kit_nome: data.kit_nome,
          kit_prezzo: data.kit_prezzo,
          // Prezzo di vendita libero: solo in configurazione manuale. Un kit ha
          // già il suo prezzo chiavi-in-mano → azzera l'eventuale override.
          prezzo_vendita_manuale: data.kit_bundle_id ? null : data.prezzo_vendita_manuale,
          layout_overlay: data.layout_overlay,
        } as never,
      });

      // Componenti dal listino
      const comp: Array<{
        progetto_id: string;
        articolo_id: string | null;
        categoria: FvCategoriaComponente;
        descrizione: string;
        quantita: number;
        unita_misura: string;
        prezzo_unitario_netto: number;
        prezzo_unitario_vendita: number;
        margine_pct: number | null;
        potenza_unitaria_w: number | null;
        potenza_unitaria_kw: number | null;
        capacita_kwh: number | null;
        garanzia_anni: number | null;
        ordinamento: number;
      }> = [];

      if (data.kit_bundle_id && data.kit_prezzo != null) {
        // Kit FV: un'unica voce col prezzo d'offerta del kit (chiavi in mano).
        // Costo stimato al 75% del prezzo (margine ~25%) in assenza del dettaglio voci.
        const venditaKit = data.kit_prezzo;
        const nettoKit = Math.round(venditaKit * 0.75);
        comp.push({
          progetto_id: progettoId,
          articolo_id: null,
          categoria: "altro",
          descrizione: data.kit_nome ?? `Kit FV ${data.potenza_kwp} kWp`,
          quantita: 1,
          unita_misura: "kit",
          prezzo_unitario_netto: nettoKit,
          prezzo_unitario_vendita: venditaKit,
          margine_pct: venditaKit > 0 ? (venditaKit - nettoKit) / venditaKit : null,
          potenza_unitaria_w: null,
          potenza_unitaria_kw: data.potenza_kwp,
          capacita_kwh: data.con_accumulo ? data.capacita_accumulo_kwh : null,
          garanzia_anni: 25,
          ordinamento: 1,
        });
      } else {
      const pannello = pannelli.find((p) => (p as { id: string }).id === data.pannello_id);
      if (pannello) {
        const p = pannello as Record<string, unknown>;
        const netto = (p.prezzo_acquisto as number) ?? (p.prezzo_vendita as number) * 0.75;
        const vendita = (p.prezzo_vendita as number) ?? netto * 1.3;
        comp.push({
          progetto_id: progettoId,
          articolo_id: data.pannello_id,
          categoria: "pannello",
          descrizione: (p.descrizione as string) ?? "Pannello FV",
          quantita: data.numero_pannelli_scelti,
          unita_misura: "pz",
          prezzo_unitario_netto: netto,
          prezzo_unitario_vendita: vendita,
          margine_pct: vendita > 0 ? (vendita - netto) / vendita : null,
          potenza_unitaria_w: (p.potenza_w as number) ?? 540,
          potenza_unitaria_kw: null,
          capacita_kwh: null,
          garanzia_anni: (p.garanzia_anni as number) ?? 25,
          ordinamento: 1,
        });
      }
      const inv = inverter.find((p) => (p as { id: string }).id === data.inverter_id);
      if (inv) {
        const p = inv as Record<string, unknown>;
        const netto = (p.prezzo_acquisto as number) ?? (p.prezzo_vendita as number) * 0.75;
        const vendita = (p.prezzo_vendita as number) ?? netto * 1.3;
        comp.push({
          progetto_id: progettoId,
          articolo_id: data.inverter_id,
          categoria: "inverter",
          descrizione: (p.descrizione as string) ?? "Inverter",
          quantita: 1,
          unita_misura: "pz",
          prezzo_unitario_netto: netto,
          prezzo_unitario_vendita: vendita,
          margine_pct: vendita > 0 ? (vendita - netto) / vendita : null,
          potenza_unitaria_w: null,
          potenza_unitaria_kw: (p.potenza_kw as number) ?? data.potenza_kwp,
          capacita_kwh: null,
          garanzia_anni: (p.garanzia_anni as number) ?? 10,
          ordinamento: 2,
        });
      }
      if (data.con_accumulo) {
        const acc = accumuli.find((p) => (p as { id: string }).id === data.accumulo_id);
        if (acc) {
          const p = acc as Record<string, unknown>;
          const netto = (p.prezzo_acquisto as number) ?? (p.prezzo_vendita as number) * 0.75;
          const vendita = (p.prezzo_vendita as number) ?? netto * 1.3;
          comp.push({
            progetto_id: progettoId,
            articolo_id: data.accumulo_id,
            categoria: "accumulo",
            descrizione: (p.descrizione as string) ?? "Accumulo",
            quantita: 1,
            unita_misura: "pz",
            prezzo_unitario_netto: netto,
            prezzo_unitario_vendita: vendita,
            margine_pct: vendita > 0 ? (vendita - netto) / vendita : null,
            potenza_unitaria_w: null,
            potenza_unitaria_kw: null,
            capacita_kwh: (p.capacita_kwh as number) ?? data.capacita_accumulo_kwh,
            garanzia_anni: (p.garanzia_anni as number) ?? 10,
            ordinamento: 3,
          });
        } else {
          comp.push({
            progetto_id: progettoId,
            articolo_id: null,
            categoria: "accumulo",
            descrizione: `Accumulo ${data.capacita_accumulo_kwh} kWh`,
            quantita: 1,
            unita_misura: "pz",
            prezzo_unitario_netto: data.capacita_accumulo_kwh * 600,
            prezzo_unitario_vendita: data.capacita_accumulo_kwh * 800,
            margine_pct: 0.25,
            potenza_unitaria_w: null,
            potenza_unitaria_kw: null,
            capacita_kwh: data.capacita_accumulo_kwh,
            garanzia_anni: 10,
            ordinamento: 3,
          });
        }
      }
      } // chiude il ramo "configurazione manuale" (vs kit)

      // Prodotti extra dal listino (caldaia, clima, colonnina, …): righe con
      // categoria='altro' nello STESSO payload replace-insert dei componenti
      // principali, così sopravvivono al flusso delete+insert e l'edge
      // finanziaria le somma automaticamente (reduce su tutti i componenti).
      data.prodotti_extra.forEach((ex, i) => {
        if (!ex.descrizione.trim() || !(ex.quantita > 0)) return;
        const vendita = Number(ex.prezzo_vendita) || 0;
        const netto =
          ex.prezzo_acquisto != null && ex.prezzo_acquisto > 0
            ? Number(ex.prezzo_acquisto)
            : Math.round(vendita * 0.75 * 100) / 100;
        comp.push({
          progetto_id: progettoId,
          articolo_id: null,
          categoria: "altro",
          descrizione: ex.descrizione.trim(),
          quantita: ex.quantita,
          unita_misura: "pz",
          prezzo_unitario_netto: netto,
          prezzo_unitario_vendita: vendita,
          margine_pct: vendita > 0 ? (vendita - netto) / vendita : null,
          potenza_unitaria_w: null,
          potenza_unitaria_kw: null,
          capacita_kwh: null,
          garanzia_anni: null,
          ordinamento: 10 + i,
        });
      });

      await upsertComponenti.mutateAsync({
        progetto_id: progettoId,
        righe: comp.map(({ progetto_id: _ignored, ...r }) => r),
        replace: true,
      });

      // ── Manodopera e servizi: righe scelte/editate dal commerciale ──────
      // Fonte unica = lo stato del wizard (data.manodopera_righe / servizi_righe),
      // pre-popolato dai default d'anagrafica ma sempre modificabile. Per un kit
      // chiavi-in-mano sono vuote a meno che il commerciale non aggiunga extra.
      await upsertManodopera.mutateAsync({
        progetto_id: progettoId,
        replace: true,
        righe: data.manodopera_righe.map((r, i) => {
          const vendita = Number(r.tariffa_oraria_vendita) || 0;
          const netto = Number(r.tariffa_oraria_netta) || 0;
          return {
            tariffa_id: r.tariffa_id,
            descrizione: r.descrizione || "Manodopera",
            ore: Number(r.ore) || 0,
            tariffa_oraria_netta: netto,
            tariffa_oraria_vendita: vendita,
            margine_pct: vendita > 0 ? (vendita - netto) / vendita : 0,
            ordinamento: i + 1,
          };
        }),
      });
      await upsertServizi.mutateAsync({
        progetto_id: progettoId,
        replace: true,
        righe: data.servizi_righe.map((r, i) => ({
          tipo: r.tipo || "altro",
          descrizione: r.descrizione || "Servizio",
          quantita: Number(r.quantita) || 1,
          prezzo_netto: Number(r.prezzo_netto) || 0,
          prezzo_vendita: Number(r.prezzo_vendita) || 0,
          ordinamento: i + 1,
          note_operative: r.note_operative ?? null,
        })),
      });

      if (!mountedRef.current) return;
      markSaved();
      // Fix #4 Sprint 3: invalida scenarioFin precedente — la configurazione è
      // cambiata (tariffa/componenti/accumulo), il calcolo finanziario va rifatto.
      setScenarioFin(null);
      setScenarioErr(null);
      autoCalcRequested.current = null;
      if (!opts?.skipNav) goTo(6, { markCompleted: true });
    } catch (e) {
      if (!mountedRef.current) return;
      setAutoSaveState("error");
      toast.error(`Salvataggio configurazione: ${describeError(e)}`);
      if (opts?.skipNav) throw e; // in generazione: propaga per non emettere importi stantii
    } finally {
      if (!opts?.skipNav && mountedRef.current) setSalvando(false);
    }
  };

  // ─── Step 6 → calcolo finanziario ─────────────────────────────────────────
  const handleCalcolaFinanziario = useCallback(async (opts?: { silent?: boolean }): Promise<Record<string, unknown> | null> => {
    if (!progettoId) return null;
    setCalcolandoFinanziario(true);
    setScenarioErr(null);
    try {
      // Persisti sconto + prezzo di vendita LIBERO a corpo PRIMA del calcolo:
      // l'edge legge sconto_tipo/valore e prezzo_vendita_manuale dalla riga
      // fv_progetti (clamp sconto + override "a corpo" server-side). Così gli
      // importi finali sono coerenti anche se il calcolo parte fuori dal percorso
      // lineare Step5→Step6 (es. Ricalcola dalla card sconto in Fase 5).
      if (!readOnlyMode) {
        const scontoAttivo = data.sconto_valore != null && data.sconto_valore > 0;
        await aggiornaProgetto.mutateAsync({
          id: progettoId,
          patch: {
            sconto_tipo: scontoAttivo ? data.sconto_tipo : null,
            sconto_valore: scontoAttivo ? data.sconto_valore : null,
            prezzo_vendita_manuale: data.kit_bundle_id ? null : (data.prezzo_vendita_manuale ?? null),
            // L'ombreggiamento cambiato dopo l'analisi del tetto: senza, il calcolo usava quello vecchio.
            perdita_ombreggiamento_pct: data.perdita_ombreggiamento_pct ?? 0,
          } as never,
        });
      }
      const { data: result, error } = await supabase.functions.invoke(
        "fv-calcolo-finanziario",
        { body: { progetto_id: progettoId } },
      );
      if (error) throw error;
      if (!mountedRef.current) return null;
      setScenarioFin(result as Record<string, unknown>);
      setCompletedSteps((s) => new Set(s).add(6));
      // Nota clamp server-side: se lo sconto richiesto superava le regole
      // aziendali, l'edge lo ha limitato — avvisa il venditore.
      const costiRes = (result as { costi?: { sconto_limitato?: boolean; sconto_eur_applicato?: number } } | null)
        ?.costi;
      if (costiRes?.sconto_limitato) {
        toast.warning(
          `Sconto oltre il massimo consentito dalle regole aziendali: applicato ${formatEur(costiRes.sconto_eur_applicato ?? 0)}.`,
        );
      }
      if (!opts?.silent) toast.success("Calcolo finanziario completato");
      return (result as Record<string, unknown>) ?? null;
    } catch (e) {
      if (!mountedRef.current) return null;
      const msg = describeError(e);
      setScenarioErr(msg);
      toast.error(`Calcolo finanziario fallito: ${msg}`);
      return null;
    } finally {
      if (mountedRef.current) setCalcolandoFinanziario(false);
    }
    // aggiornaProgetto escluso dalle deps (identità instabile di useMutation);
    // le dipendenze dati sono progettoId + sconto + prezzo libero correnti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progettoId, readOnlyMode, data.sconto_tipo, data.sconto_valore, data.prezzo_vendita_manuale, data.kit_bundle_id]);

  // Auto-calcolo entrando nello step 6
  const autoCalcRequested = useRef<string | null>(null);

  // Fix #7 Sprint 3: reset auto-calc + scenario quando progettoId cambia
  // (es. utente apre URL diretto di un progetto diverso senza unmount).
  useEffect(() => {
    autoCalcRequested.current = null;
    setScenarioFin(null);
    setScenarioErr(null);
  }, [progettoId]);

  useEffect(() => {
    if (
      step === 6 &&
      progettoId &&
      !scenarioFin &&
      !scenarioErr &&
      !calcolandoFinanziario &&
      autoCalcRequested.current !== progettoId
    ) {
      autoCalcRequested.current = progettoId;
      void handleCalcolaFinanziario();
    }
  }, [step, progettoId, scenarioFin, scenarioErr, calcolandoFinanziario, handleCalcolaFinanziario]);

  // ─── Step 6 → salva finanziamento scelto su fv_progetti (Sprint 4) ───────
  // Persiste tabella + durata + rata + TAEG/TAN reali per l'edge function PDF.
  // Best-effort: se non c'è tabella scelta (cash o no top match), salva solo
  // i campi base e null per le FK.
  const handleSalvaStep6 = async () => {
    if (!progettoId) return;
    setSalvando(true);
    setAutoSaveState("saving");
    try {
      const tabId = data.tabella_finanziamento_id ?? topFinanziamenti[0]?.id ?? null;
      const tabRata = tabId
        ? topFinanziamenti.find((t) => t.id === tabId)?.rata ?? null
        : null;
      let rataEur: number | null = null;
      let taegPct: number | null = null;
      let tanPct: number | null = null;
      let totaleDovuto: number | null = null;
      if (data.finanziamento_modalita === "rate" && tabRata) {
        rataEur = tabRata.importo_rata;
        taegPct = tabRata.taeg;
        tanPct = tabRata.tan;
        totaleDovuto = tabRata.importo_totale_dovuto;
      } else if (data.finanziamento_modalita === "zero" && data.durata_mesi_scelta) {
        const inv = Number(investimentoCorrente) || 0;
        rataEur = Math.round(inv / data.durata_mesi_scelta);
        taegPct = 0;
        tanPct = 0;
        totaleDovuto = inv;
      } else if (data.finanziamento_modalita === "noleggio") {
        const scenarioC = scenarioFin as Record<string, unknown> | null;
        const scenarioCosti = scenarioC?.costi as
          | { prezzo_vendita_netto?: number; prezzo_vendita_iva_inclusa?: number }
          | undefined;
        const invNetto =
          Number(scenarioCosti?.prezzo_vendita_netto) ||
          Math.round((Number(progettoEsistente?.prezzo_vendita_iva_inclusa) || 0) / 1.1);
        const risparmioAnno1 =
          Number(scenarioC?.risparmio_bolletta_eur ?? 0) +
          Number(scenarioC?.ricavi_rid_eur ?? 0);
        const rental = calcolaFvNoleggioOperativo({
          archetipo: data.archetipo,
          investimentoNetto: invNetto,
          risparmioAnno1,
          durataMesi: data.durata_mesi_scelta ?? Number(fvTemplate?.noleggio_durata_default_mesi ?? 84),
          manutenzioneAnnua: Number(fvTemplate?.manutenzione_annua_eur ?? 0),
          aliquotaRisparmioFiscale: Number(fvTemplate?.noleggio_aliquota_fiscale_pct ?? 0.24),
          fattoreCanone:
            fvTemplate?.noleggio_fattore_default == null
              ? null
              : Number(fvTemplate.noleggio_fattore_default),
        });
        if (!rental.eligible) {
          throw new Error("Il noleggio operativo FV e' disponibile solo per aziende, condomini o CER.");
        }
        rataEur = rental.canone_mensile;
        taegPct = 0;
        tanPct = 0;
        totaleDovuto = Math.round(rental.canone_mensile * rental.durata_mesi);
      }
      // Validazione antiusura ARERA: TAEG > 25% blocca (soglia conservativa)
      if (taegPct != null && taegPct > 25) {
        throw new Error(
          `TAEG ${taegPct.toFixed(2)}% supera la soglia ARERA antiusura (~25%). Verifica la tabella finanziamento.`,
        );
      }
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          scenario_finanziamento: data.finanziamento_modalita,
          finanziamento_tabella_id: data.finanziamento_modalita === "rate" ? tabId : null,
          finanziamento_durata_mesi:
            data.finanziamento_modalita === "cash" ? null : data.durata_mesi_scelta,
          finanziamento_rata_eur: rataEur,
          finanziamento_taeg: taegPct,
          finanziamento_tan: tanPct,
          finanziamento_totale_dovuto_eur: totaleDovuto,
          modalita_pagamento: data.modalita_pagamento,
          // Sconto commerciale (già persistito da handleCalcolaFinanziario,
          // ribadito qui per coprire modifiche post-calcolo senza ricalcolo).
          sconto_tipo: data.sconto_valore != null && data.sconto_valore > 0 ? data.sconto_tipo : null,
          sconto_valore: data.sconto_valore != null && data.sconto_valore > 0 ? data.sconto_valore : null,
        } as never,
      });
      if (!mountedRef.current) return;
      markSaved();
      goTo(7, { markCompleted: true });
    } catch (e) {
      if (!mountedRef.current) return;
      setAutoSaveState("error");
      toast.error(`Salvataggio finanziamento: ${describeError(e)}`);
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  };

  // ─── Step 8 → genera preventivo + emetti ─────────────────────────────────
  // Fix #13 (Sprint 3 cleanup): in v2 il template HTML è UNICO per tutti e 3
  // i tipi (vendita/tecnico/mobile) — generare 3 versioni in parallelo
  // significava 3 invocazioni edge function che si overwrite stesso path
  // nello storage. Ora generiamo SOLO la versione "vendita" configurabile.
  // Tecnico/Mobile saranno template differenziati in W2.
  const handleGeneraEdEmetti = async () => {
    if (!progettoId) return;
    // Guard sola-lettura: un progetto firmato/emesso/annullato ha tutti gli step
    // "completati" → la tab bar consente di arrivare allo Step 8. Senza questo
    // guard, "Genera ed emetti" riscriverebbe stato="emesso" (regredendo un
    // firmato) e rigenererebbe il PDF.
    if (readOnlyMode) {
      toast.info("Progetto in sola lettura: clonalo per generare una nuova versione.");
      return;
    }
    setSalvando(true);
    try {
      // Importi sempre coerenti col configurato: ri-salva la Fase 5 (kit/componenti/
      // manodopera/servizi/prezzo libero) e ricalcola PRIMA di generare. Il PDF legge
      // esclusivamente il denormalizzato fv_progetti.prezzo_vendita_iva_inclusa, che
      // solo il calcolo finanziario aggiorna: senza questo passo, saltare da Fase 5 a
      // Fase 8 (tab-bar, progetto già completato) emetterebbe prezzo/sconto vecchi.
      const rataSalvata = async () => {
        const { data: riga } = await supabase
          .from("fv_progetti" as never)
          .select("finanziamento_rata_eur")
          .eq("id", progettoId)
          .maybeSingle();
        return Number((riga as { finanziamento_rata_eur?: number | null } | null)?.finanziamento_rata_eur) || 0;
      };
      const rataPrima = await rataSalvata();
      await handleSalvaStep5({ skipNav: true });
      if (!mountedRef.current) return;
      const recalc = await handleCalcolaFinanziario({ silent: true });
      if (!mountedRef.current) return;
      if (!recalc) return; // errore di calcolo già segnalato: non emettere importi stantii
      // Il prezzo è cambiato e il calcolo ha tolto la rata, che era su quello
      // vecchio: il PDF avrebbe mostrato la rata vecchia accanto al prezzo nuovo.
      if (rataPrima > 0 && (await rataSalvata()) === 0) {
        if (!mountedRef.current) return;
        toast.warning("Il prezzo è cambiato: conferma di nuovo il finanziamento prima di emettere.");
        goTo(6);
        return;
      }
      const { data: result, error } = await supabase.functions.invoke(
        "fv-genera-pdf",
        {
          body: {
            progetto_id: progettoId,
            tipo: "vendita",
            layout_pannelli: data.layout_tetto ?? null,
            azimut: data.azimut_tetto ?? null,
            inclinazione_tetto: data.inclinazione_tetto ?? null,
          },
        },
      );
      if (error) throw error;
      if (!result || (result as { url?: string }).url === undefined) {
        throw new Error("Il server non ha restituito un URL valido per il preventivo.");
      }

      // Marca progetto emesso solo dopo successo conferma
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          stato: "emesso",
          emesso_il: new Date().toISOString(),
        } as never,
      });

      if (!mountedRef.current) return;
      // Pulisci draft locale: progetto è emesso, niente più bozze locali
      clearPersistedDraft(progettoId);
      clearPersistedDraft(null);
      toast.success("Preventivo emesso! Apri la scheda 'Preventivo' per visualizzarlo.");
      navigate(`/azienda/marketing/fotovoltaico/${progettoId}`);
    } catch (e) {
      if (!mountedRef.current) return;
      toast.error(`Generazione preventivo: ${describeError(e)}`);
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  };

  // ─── Helpers nav ──────────────────────────────────────────────────────────
  /**
   * Naviga al passo target. Se markCompleted=true, marca lo step *corrente*
   * come completato prima di muoversi.
   */
  const goTo = useCallback(
    (target: number, opts?: { markCompleted?: boolean }) => {
      const nextCompleted = opts?.markCompleted ? new Set(completedSteps).add(step) : completedSteps;
      if (opts?.markCompleted) {
        setCompletedSteps(nextCompleted);
      }
      const safe = Math.max(1, Math.min(TOTAL_STEPS, target));
      // Flush SINCRONO della bozza: senza, un refresh entro ~800ms dal click su
      // "Avanti" cadrebbe nella finestra del debounce e perderebbe l'ultimo input.
      if (!readOnlyMode) {
        savePersistedDraft(progettoId, { step: safe, data, completedSteps: Array.from(nextCompleted) });
      }
      setStep(safe);
      // scroll to top of content
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [step, completedSteps, readOnlyMode, progettoId, data],
  );

  const goPrev = useCallback(() => goTo(step - 1), [step, goTo]);
  // goNext non è memoizzato: dipende dagli handler salva* che catturano data
  // freschi a ogni render — un useCallback con deps complete forzerebbe ricreazione
  // a ogni keystroke nei form, peggiorando le performance.
  //
  // Bug B1 fix: navigationLock (useRef) è atomico e sincrono. Un secondo click
  // arrivato mentre il primo è in volo viene scartato silenziosamente. Il lock
  // si rilascia in finally, garantito anche su errore.
  const goNext = async () => {
    if (navigationLock.current) {
      // Click duplicato: ignora silenziosamente
      return;
    }
    navigationLock.current = true;
    try {
      if (step === 1) {
        goTo(2, { markCompleted: true });
        return;
      }
      if (step === 2) {
        await handleSalvaStep2();
        return;
      }
      if (step === 3) {
        await handleSalvaStep3();
        return;
      }
      if (step === 4) {
        await handleSalvaStep4();
        return;
      }
      if (step === 5) {
        await handleSalvaStep5();
        return;
      }
      if (step === 6) {
        await handleSalvaStep6();
        return;
      }
      if (step === 7) {
        goTo(8, { markCompleted: true });
        return;
      }
      // Step 8 — non c'è next, c'è solo "Emetti"
    } finally {
      // Rilascia il lock dopo un breve delay per evitare race su transizioni
      // di step (l'UI potrebbe non aver ancora rimosso il disabled).
      setTimeout(() => {
        navigationLock.current = false;
      }, 200);
    }
  };

  const handleSaveDraft = useCallback(async (): Promise<boolean> => {
    if (!progettoId) {
      toast.info("Compila e salva la fase 2 (immobile) per creare il progetto bozza.");
      return false;
    }
    setSalvando(true);
    setAutoSaveState("saving");
    try {
      // Salva campi base del progetto.
      // F15: persisti TUTTI i campi editati nel wizard, non solo un sottoinsieme
      // (prima consumi/config; ora anche immobile/fiscali/opzioni) — altrimenti
      // "Salva bozza" perdeva tariffa/profilo/ISEE/wallbox ecc. al refresh.
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          // immobile
          tipologia_immobile: data.tipologia_immobile,
          superficie_immobile_mq: data.superficie_immobile_mq,
          popolazione_comune: data.popolazione_comune,
          // consumi + fiscali
          consumo_annuo_kwh: data.consumo_annuo_kwh,
          costo_kwh_attuale: data.costo_kwh_attuale,
          tariffa_tipo: data.tariffa_tipo,
          profilo_consumo: data.profilo_consumo,
          isee: data.isee,
          numero_figli: data.numero_figli,
          reddito_annuo_dichiarato: data.reddito_annuo_dichiarato,
          // tetto: ombreggiamento vicino (frazione 0..1) — persistito anche qui
          // così "Salva bozza" non lo perde al refresh.
          perdita_ombreggiamento_pct: data.perdita_ombreggiamento_pct ?? 0,
          // configurazione + opzioni
          numero_pannelli_scelti: data.numero_pannelli_scelti,
          potenza_kwp: data.potenza_kwp,
          con_accumulo: data.con_accumulo,
          capacita_accumulo_kwh: data.capacita_accumulo_kwh,
          con_wallbox: data.con_wallbox,
          con_ottimizzatori: data.con_ottimizzatori,
          // cliente e indirizzo (Fase 1-2)
          cliente_id: data.cliente_id ?? null,
          cliente_nome: data.cliente_nome || null,
          cliente_cognome: data.cliente_cognome || null,
          cliente_telefono: data.cliente_telefono || null,
          cliente_email: data.cliente_email || null,
          titolo: `${data.cliente_nome} ${data.cliente_cognome}`.trim() || undefined,
          archetipo: data.archetipo,
          indirizzo: data.indirizzo,
          comune: data.comune,
          provincia: data.provincia,
          cap: data.cap,
          regione: data.regione,
          latitudine: data.latitudine,
          longitudine: data.longitudine,
          prima_casa: data.prima_casa,
          // tetto scritto a mano (Fase 4)
          ...campiTetto(data),
          // kit, prezzo libero e sconto (Fase 5). Il finanziamento no: la rata
          // la calcola solo la Fase 6, e una modalità salvata senza rata la
          // contraddirebbe.
          kit_bundle_id: data.kit_bundle_id,
          kit_nome: data.kit_nome,
          kit_prezzo: data.kit_prezzo,
          prezzo_vendita_manuale: data.kit_bundle_id ? null : data.prezzo_vendita_manuale,
          layout_overlay: data.layout_overlay,
          sconto_tipo: data.sconto_valore != null && data.sconto_valore > 0 ? data.sconto_tipo : null,
          sconto_valore: data.sconto_valore != null && data.sconto_valore > 0 ? data.sconto_valore : null,
        } as never,
      });

      // Manodopera e servizi sono salvati dallo Step 5 (righe editate dal
      // commerciale nello stato): qui non ri-generiamo/sovrascriviamo nulla.

      if (!mountedRef.current) return true;
      markSaved();
      toast.success("Bozza salvata");
      return true;
    } catch (e) {
      if (!mountedRef.current) return false;
      setAutoSaveState("error");
      toast.error(`Salvataggio bozza: ${describeError(e)}`);
      return false;
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  }, [progettoId, data, aggiornaProgetto, markSaved, manodoperaEsistente, tariffeFv, upsertManodopera]);

  // «Duplica» e «Clona»: nuova bozza con numero nuovo e versione + 1, anche da
  // un preventivo emesso o firmato. Prima i due pulsanti mostravano un avviso e
  // basta, mentre cinque messaggi dicevano di clonare per correggere.
  const duplicaProgetto = useDuplicaProgetto();
  const handleDuplica = async () => {
    if (!progettoId || duplicaProgetto.isPending) return;
    try {
      const nuovoId = await duplicaProgetto.mutateAsync(progettoId);
      toast.success("Progetto duplicato: stai lavorando sulla nuova versione");
      navigate(`/azienda/marketing/fotovoltaico/${nuovoId}/modifica`);
    } catch (e) {
      toast.error(`Duplicazione non riuscita: ${describeError(e)}`);
    }
  };

  // ─── Header info ──────────────────────────────────────────────────────────
  // F11: il campo reale su FvProgetto è `numero` (non `numero_progetto`),
  // altrimenti l'header mostrava sempre "Progetto fotovoltaico" senza codice.
  const numero = (progettoEsistente as { numero?: string } | undefined)?.numero;
  const titoloHeader = progettoId
    ? `Progetto ${numero ?? "fotovoltaico"}`
    : "Nuovo progetto fotovoltaico";
  const subtitleHeader = data.cliente_nome || data.indirizzo
    ? `${[data.cliente_nome, data.cliente_cognome].filter(Boolean).join(" ")}${data.indirizzo ? " · " + data.indirizzo : ""}`
    : "Compila la fase 1 per iniziare";

  const lastSaveText = lastSaveAt
    ? `Ultima modifica ${lastSaveAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
    : undefined;

  // Stato display nell'header
  const statoHeader = readOnlyMode
    ? (progettoEsistente as { stato?: string } | undefined)?.stato === "firmato"
      ? "Firmato"
      : (progettoEsistente as { stato?: string } | undefined)?.stato === "annullato"
        ? "Annullato"
        : "Emesso"
    : progettoId
      ? "In compilazione"
      : "Bozza";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <FvPageHeader
        numero={numero ?? null}
        stato={statoHeader}
        title={titoloHeader}
        subtitle={subtitleHeader}
        lastModified={lastSaveText}
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                if (readOnlyMode) { navigate("/azienda/marketing/fotovoltaico"); return; }
                if (progettoId) {
                  // Diceva «salvata» senza salvare: l'autosave è solo nel browser.
                  // Ora salva davvero ed esce solo se il salvataggio riesce.
                  void handleSaveDraft().then((salvata) => {
                    if (salvata) navigate("/azienda/marketing/fotovoltaico");
                  });
                  return;
                }
                const dirty = Boolean(data.cliente_nome || data.cliente_cognome || data.indirizzo);
                if (!dirty) { navigate("/azienda/marketing/fotovoltaico"); return; }
                // Dati inseriti ma nessuna bozza DB ancora: chiedi cosa fare
                setExitDialogOpen(true);
              }}
              className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
            >
              <X className="h-4 w-4" /> {readOnlyMode ? "Chiudi" : "Salva e chiudi"}
            </button>
            {progettoId && (
              <button
                type="button"
                onClick={() => void handleDuplica()}
                disabled={duplicaProgetto.isPending}
                className="px-3 py-1.5 text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Copy className="h-4 w-4" /> Duplica
              </button>
            )}
          </>
        }
        chips={
          <>
            <FvChip variant={readOnlyMode ? "yellow" : "green"}>
              {readOnlyMode ? "🔒" : <Sun className="h-3 w-3" />}
              {readOnlyMode ? "Sola lettura" : "Fotovoltaico"}
            </FvChip>
          </>
        }
      />

      {/* ── Riprendi bozza: su /nuovo, se esiste una bozza DB dell'utente ── */}
      <AlertDialog open={Boolean(!id && !progettoId && ultimaBozza && !resumeDismissed && !readOnlyMode)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hai un preventivo in bozza</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Vuoi riprendere da dove eri rimasto?</p>
                <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700 space-y-0.5">
                  <p className="font-semibold text-slate-900">{ultimaBozza?.numero ?? "Bozza"}</p>
                  {(ultimaBozza?.cliente?.first_name || ultimaBozza?.cliente?.last_name) && (
                    <p>{[ultimaBozza?.cliente?.first_name, ultimaBozza?.cliente?.last_name].filter(Boolean).join(" ")}</p>
                  )}
                  {(ultimaBozza?.indirizzo || ultimaBozza?.comune) && (
                    <p>{[ultimaBozza?.indirizzo, ultimaBozza?.comune].filter(Boolean).join(", ")}</p>
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
            <AlertDialogCancel onClick={() => setResumeDismissed(true)}>
              Nuovo da zero
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(`/azienda/marketing/fotovoltaico/${ultimaBozza!.id}`)}>
              Riprendi bozza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Uscita con dati non ancora in DB: salva bozza? ── */}
      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvare come bozza?</AlertDialogTitle>
            <AlertDialogDescription>
              {data.indirizzo && data.latitudine != null && data.longitudine != null
                ? "I dati inseriti verranno salvati come bozza: la ritroverai nella lista preventivi e al prossimo \"Nuovo preventivo\"."
                : "Per salvare la bozza sul server serve almeno l'indirizzo dell'impianto. I dati inseriti restano comunque memorizzati su questo dispositivo e verranno ripresi al prossimo accesso."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua a compilare</AlertDialogCancel>
            <AlertDialogAction
              className="bg-slate-500 hover:bg-slate-600"
              onClick={() => {
                clearPersistedDraft(null);
                navigate("/azienda/marketing/fotovoltaico");
              }}
            >
              Esci senza salvare
            </AlertDialogAction>
            {data.indirizzo && data.latitudine != null && data.longitudine != null && (
              <AlertDialogAction
                onClick={async () => {
                  // Prima usciva con «Bozza salvata» anche quando il salvataggio falliva.
                  if (!(await handleSalvaStep2())) return;
                  clearPersistedDraft(null);
                  toast.success("Bozza salvata — la ritrovi tra i preventivi");
                  navigate("/azienda/marketing/fotovoltaico");
                }}
              >
                Salva bozza ed esci
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Banner read-only (B5/F4 + Sprint3 #21: CTA azioni disponibili) */}
      {readOnlyMode && readOnlyReason && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-3 text-sm text-amber-900 flex items-start gap-3 flex-wrap">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-[260px]">
            <strong>Modalità sola lettura · </strong>
            {readOnlyReason}
            <span className="block text-xs text-amber-800/80 mt-0.5">
              Cosa puoi fare: scaricare il preventivo PDF, consultare i dettagli, oppure
              clonare il progetto per crearne una nuova versione modificabile.
            </span>
          </div>
          {progettoId && (
            <div className="flex gap-3 items-center">
              <button
                type="button"
                onClick={() => void handleDuplica()}
                disabled={duplicaProgetto.isPending}
                className="text-xs font-semibold text-amber-900 underline hover:no-underline whitespace-nowrap"
              >
                ⎘ Clona
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate(`/azienda/marketing/fotovoltaico/${progettoId}`)
                }
                className="text-xs font-semibold text-amber-900 underline hover:no-underline whitespace-nowrap"
              >
                Vai al dettaglio →
              </button>
            </div>
          )}
        </div>
      )}

      <FvTabBar
        tabs={TABS}
        current={step}
        completed={completedSteps}
        onSelect={(n) => {
          // Tornare INDIETRO è sempre consentito (n <= step): una fase già vista
          // si può sempre rivedere/correggere. In avanti solo verso fasi completate
          // o la fase immediatamente successiva (validazione su "Avanti" invariata).
          const isClickable =
            n <= step || completedSteps.has(n) || n === step + 1;
          if (!isClickable) {
            toast.info(
              `Completa la fase ${step} prima di passare alla fase ${n}.`,
              { duration: 3000 },
            );
            return;
          }
          // Avanti di una fase via stepper → passa da goNext (valida + SALVA + crea
          // il progetto), come il bottone "Avanti". Senza, saltando avanti con lo
          // stepper il progetto non veniva creato (progettoId null → "Avanti" delle
          // fasi successive falliva). Indietro / fasi già completate → goTo libero.
          if (n === step + 1 && !completedSteps.has(n)) {
            void goNext();
          } else {
            goTo(n);
          }
        }}
      />

      <div className="flex-1 px-4 sm:px-8 pt-7 pb-28 max-w-[1400px] w-full mx-auto">
        <FvTabPane keyValue={step}>
          {step === 1 && <Step1Cliente data={data} update={update} />}
          {step === 2 && <Step2Immobile data={data} update={update} />}
          {step === 3 && (
            <Step3Consumi data={data} update={update} profili={profili as never} />
          )}
          {step === 4 && (
            <Step4Tetto
              data={data}
              update={update}
              analizzando={analizzandoTetto}
              onAnalizza={handleAnalizzaTetto}
              readOnlyMode={readOnlyMode}
            />
          )}
          {step === 5 && (
            <Step5Configurazione
              data={data}
              update={update}
              readOnlyMode={readOnlyMode}
              pannelli={pannelli as never}
              inverter={inverter as never}
              accumuli={accumuli as never}
              tariffeFv={tariffeFv}
              kitFv={kitFvBundles}
              serviziCatalogoCount={serviziCatalogo.length}
              serviziCatalogo={serviziCatalogo}
              catalogoFvVuoto={catalogoFvVuoto}
              scenario={scenarioFin}
              calcolando={calcolandoFinanziario}
              onRicalcola={() => {
                autoCalcRequested.current = null; // permette retry
                void handleCalcolaFinanziario();
              }}
            />
          )}
          {step === 6 && (
            <Step6Finanziario
              data={data}
              update={update}
              scenario={scenarioFin}
              calcolando={calcolandoFinanziario}
              error={scenarioErr}
              tabelleFinanziamento={tabelleFinanziamento}
              topFinanziamenti={topFinanziamenti}
              fvTemplate={fvTemplate}
              onRicalcola={() => {
                autoCalcRequested.current = null; // permette retry
                void handleCalcolaFinanziario();
              }}
            />
          )}
          {step === 7 && progettoId && (
            <Step7VistaImpresa progettoId={progettoId} scenario={scenarioFin} />
          )}
          {step === 8 && (
            <Step8Genera
              onEmetti={handleGeneraEdEmetti}
              salvando={salvando}
              readOnly={readOnlyMode}
            />
          )}
        </FvTabPane>
      </div>

      {/* Mostra il motivo del blocco se Avanti è disabilitato */}
      {!stepValido && stepValidation.motivo && step < TOTAL_STEPS && !readOnlyMode && (
        <div className="bg-blue-50 border-t border-blue-200 px-4 sm:px-8 py-2 text-xs text-blue-900 flex items-center gap-2">
          <span aria-hidden>ℹ</span>
          <span>
            <strong>Per proseguire:</strong> {stepValidation.motivo}
          </span>
        </div>
      )}

      <FvFooter
        autoSaveState={autoSaveState}
        numero={numero ?? null}
        lastSaveText={lastSaveText}
        onPrev={goPrev}
        onSaveDraft={progettoId && !readOnlyMode ? handleSaveDraft : undefined}
        onNext={step < TOTAL_STEPS && !readOnlyMode ? goNext : undefined}
        prevDisabled={step === 1}
        nextDisabled={!stepValido || analizzandoTetto || calcolandoFinanziario}
        nextLabel={step === 7 ? "Vai a generazione →" : "Avanti"}
        showNext={step < TOTAL_STEPS && !readOnlyMode}
        saving={salvando}
      />
    </div>
  );
}

// ============================================================================
// STEP 1 — CLIENTE
// ============================================================================
function Step1Cliente({
  data,
  update,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <>
      <FvPanelTitle
        step={1}
        totalSteps={TOTAL_STEPS}
        title="Dati del cliente"
        subtitle={
          <>
            Anagrafica e contatti del committente. Collega un contatto dal{" "}
            <strong>CRM EiC</strong> per compilare i dati in automatico.
          </>
        }
      />

      <FvContactPicker
        clienteId={data.cliente_id}
        onSelect={(c) => {
          update("cliente_id", c.id);
          update("cliente_nome", c.first_name ?? "");
          update("cliente_cognome", c.last_name ?? "");
          update("cliente_email", c.email ?? "");
          update("cliente_telefono", c.phone ?? "");
        }}
        onClear={() => update("cliente_id", null)}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <FvCard title="Anagrafica">
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={data.cliente_nome}
                onChange={(e) => update("cliente_nome", e.target.value)}
                placeholder="Mario"
                autoComplete="given-name"
              />
            </div>
            <div>
              <Label>Cognome *</Label>
              <Input
                value={data.cliente_cognome}
                onChange={(e) => update("cliente_cognome", e.target.value)}
                placeholder="Rossi"
                autoComplete="family-name"
              />
            </div>
          </div>
          <div>
            <Label>Tipologia / Archetipo *</Label>
            <Select value={data.archetipo} onValueChange={(v) => update("archetipo", v as FvArchetipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="privato_prima">Privato — prima casa</SelectItem>
                <SelectItem value="privato_seconda">Privato — seconda casa</SelectItem>
                <SelectItem value="privato_isee">Privato — ISEE basso (Reddito Energetico)</SelectItem>
                <SelectItem value="pmi">PMI / Partita IVA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FvCard>

        <FvCard title="Contatti">
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <Label>Cellulare *</Label>
              <Input
                type="tel"
                value={data.cliente_telefono}
                onChange={(e) => update("cliente_telefono", e.target.value)}
                placeholder="+39 345 1234567"
                autoComplete="tel"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={data.cliente_email}
                onChange={(e) => update("cliente_email", e.target.value)}
                placeholder="mario.rossi@example.it"
                autoComplete="email"
              />
            </div>
          </div>
          <FvCallout variant="info">
            * Almeno uno tra <strong>cellulare</strong> ed <strong>email</strong> è obbligatorio per
            inviare il preventivo.
          </FvCallout>
        </FvCard>
      </div>
    </>
  );
}

// ============================================================================
// STEP 2 — IMMOBILE
// ============================================================================
function Step2Immobile({
  data,
  update,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  const [geoLoading, setGeoLoading] = useState(false);
  // Ultimo indirizzo geocodificato con successo — evita richieste duplicate
  // quando il blur scatta senza che l'utente abbia cambiato il testo.
  const lastGeocodedRef = useRef<string>("");

  // ── Autocomplete indirizzo (Google Places via maps-proxy), come il campo "Luogo"
  //    altrove: suggerimenti mentre digiti; alla selezione comune/prov/CAP/coordinate
  //    si compilano da soli (niente click su "Trova coordinate").
  const [acPredictions, setAcPredictions] = useState<{ place_id: string; description: string }[]>([]);
  const [acOpen, setAcOpen] = useState(false);
  const [acLoading, setAcLoading] = useState(false);
  const acDebounce = useRef<ReturnType<typeof setTimeout>>();
  const acWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (acWrapRef.current && !acWrapRef.current.contains(e.target as Node)) setAcOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const fetchAcPredictions = async (q: string) => {
    if (q.trim().length < 3) { setAcPredictions([]); setAcOpen(false); return; }
    setAcLoading(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "autocomplete", query: q, country: "it" },
      });
      if (!error && (r as { predictions?: { place_id: string; description: string }[] })?.predictions) {
        setAcPredictions((r as { predictions: { place_id: string; description: string }[] }).predictions);
        setAcOpen(true);
      }
    } catch { /* fallback: inserimento manuale */ } finally { setAcLoading(false); }
  };

  const handleIndirizzoChange = (val: string) => {
    update("indirizzo", val);
    if (acDebounce.current) clearTimeout(acDebounce.current);
    acDebounce.current = setTimeout(() => void fetchAcPredictions(val), 300);
  };

  const selectAcPrediction = async (p: { place_id: string; description: string }) => {
    setAcOpen(false);
    setAcLoading(true);
    try {
      const { data: d, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "place-details", place_id: p.place_id },
      });
      const det = d as { formatted_address?: string; city?: string; province?: string; postal_code?: string; lat?: number; lng?: number } | null;
      if (!error && det) {
        update("indirizzo", det.formatted_address || p.description);
        if (det.city) update("comune", det.city);
        if (det.province) update("provincia", det.province);
        if (det.postal_code) update("cap", det.postal_code);
        if (det.lat != null) update("latitudine", Math.round(det.lat * 1e6) / 1e6);
        if (det.lng != null) update("longitudine", Math.round(det.lng * 1e6) / 1e6);
        lastGeocodedRef.current = det.formatted_address || p.description;
      }
    } catch { /* fallback */ } finally { setAcLoading(false); }
  };

  // Geocoding indirizzo→coordinate (edge fv-geocode). Se non configurato,
  // l'utente resta sull'inserimento manuale (fallback graceful).
  // silent=true: invocato in automatico al blur del campo indirizzo —
  // niente toast d'errore per non disturbare mentre si compila.
  const cercaCoordinate = async (silent = false) => {
    const indirizzo = [data.indirizzo, data.comune, data.provincia, data.cap]
      .filter(Boolean)
      .join(", ")
      .trim();
    if (indirizzo.length < 4) {
      if (!silent) toast.error("Inserisci prima l'indirizzo");
      return;
    }
    if (silent && indirizzo === lastGeocodedRef.current) return;
    setGeoLoading(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("fv-geocode", {
        body: { indirizzo },
      });
      if (error) throw error;
      const res = r as {
        lat?: number; lng?: number; comune?: string | null;
        provincia?: string | null; cap?: string | null;
        regione?: string | null; in_italia?: boolean;
      };
      if (res?.lat == null || res?.lng == null) {
        if (!silent) toast.error("Indirizzo non trovato. Inserisci lat/lng manualmente.");
        return;
      }
      lastGeocodedRef.current = indirizzo;
      update("latitudine", Math.round(res.lat * 1e6) / 1e6);
      update("longitudine", Math.round(res.lng * 1e6) / 1e6);
      // La risposta del geocoder è autorevole: compila sempre i campi che
      // restituisce (l'utente può comunque correggerli a mano dopo).
      if (res.comune) update("comune", res.comune);
      if (res.provincia) update("provincia", res.provincia);
      if (res.cap) update("cap", res.cap);
      if (res.regione) update("regione", res.regione);
      toast.success(
        res.comune
          ? `Trovato: ${res.comune}${res.provincia ? ` (${res.provincia})` : ""} — coordinate impostate`
          : `Coordinate trovate: ${res.lat.toFixed(5)}, ${res.lng.toFixed(5)}`,
      );
    } catch (e) {
      if (!silent) {
        toast.error(`Geocoding non disponibile (${describeError(e)}). Inserisci lat/lng a mano.`);
      }
    } finally {
      setGeoLoading(false);
    }
  };

  // Auto-geocoding al blur del campo indirizzo: i campi comune/prov/CAP/
  // coordinate si compilano da soli senza dover cliccare il bottone.
  const handleIndirizzoBlur = () => {
    if (geoLoading) return;
    if ((data.indirizzo ?? "").trim().length >= 8) {
      void cercaCoordinate(true);
    }
  };

  return (
    <>
      <FvPanelTitle
        step={2}
        totalSteps={TOTAL_STEPS}
        title="Immobile"
        subtitle={
          <>
            Indirizzo dove sarà installato l'impianto. Scegli un <strong>suggerimento</strong> mentre digiti
            e comune, provincia, CAP e coordinate (per Solar API/PVGIS) si compilano da soli.
          </>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <FvCard title="Indirizzo impianto">
          <div className="mb-3" ref={acWrapRef}>
            <Label>Indirizzo completo *</Label>
            <div className="relative">
              <Input
                placeholder="Inizia a digitare: Via Roma 12, Milano…"
                value={data.indirizzo}
                onChange={(e) => handleIndirizzoChange(e.target.value)}
                onFocus={() => acPredictions.length > 0 && setAcOpen(true)}
                onBlur={handleIndirizzoBlur}
                autoComplete="off"
              />
              {acLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {acOpen && acPredictions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-auto">
                  {acPredictions.map((p) => (
                    <button
                      key={p.place_id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void selectAcPrediction(p)}
                    >
                      {p.description}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Scegli un suggerimento: comune, provincia, CAP e coordinate si compilano da soli.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <div>
              <Label>Comune</Label>
              <Input
                value={data.comune}
                onChange={(e) => update("comune", e.target.value)}
                placeholder="Milano"
              />
            </div>
            <div>
              <Label>Prov. (sigla)</Label>
              <Input
                maxLength={2}
                value={data.provincia}
                onChange={(e) => update("provincia", e.target.value.toUpperCase())}
                placeholder="MI"
              />
            </div>
            <div>
              <Label>CAP</Label>
              <Input
                value={data.cap}
                onChange={(e) => update("cap", e.target.value)}
                placeholder="20100"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Latitudine <span className="font-normal text-muted-foreground">(consigliata)</span></Label>
              <Input
                type="number"
                step="0.000001"
                value={data.latitudine ?? ""}
                onChange={(e) =>
                  update("latitudine", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="45.4642"
                aria-invalid={
                  data.latitudine != null &&
                  (data.latitudine < ITALIA_LAT_MIN || data.latitudine > ITALIA_LAT_MAX)
                }
              />
            </div>
            <div>
              <Label>Longitudine <span className="font-normal text-muted-foreground">(consigliata)</span></Label>
              <Input
                type="number"
                step="0.000001"
                value={data.longitudine ?? ""}
                onChange={(e) =>
                  update("longitudine", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="9.1900"
                aria-invalid={
                  data.longitudine != null &&
                  (data.longitudine < ITALIA_LNG_MIN || data.longitudine > ITALIA_LNG_MAX)
                }
              />
            </div>
          </div>
          {data.latitudine != null &&
            data.longitudine != null &&
            !isCoordinataItalia(data.latitudine, data.longitudine) && (
              <FvCallout variant="error" title="Coordinate fuori Italia">
                Range valido: lat <strong>{ITALIA_LAT_MIN}–{ITALIA_LAT_MAX}</strong>, lng{" "}
                <strong>{ITALIA_LNG_MIN}–{ITALIA_LNG_MAX}</strong>. Solar API e PVGIS sono
                ottimizzati per il territorio italiano.
              </FvCallout>
            )}
        </FvCard>

        <FvCard title="Caratteristiche edificio">
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <Label>Tipologia</Label>
              <Select
                value={data.tipologia_immobile}
                onValueChange={(v) => update("tipologia_immobile", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residenziale">Residenziale</SelectItem>
                  <SelectItem value="capannone">Capannone</SelectItem>
                  <SelectItem value="ufficio">Ufficio</SelectItem>
                  <SelectItem value="agricolo">Agricolo</SelectItem>
                  <SelectItem value="altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Superficie (m²)</Label>
              <Input
                type="number"
                value={data.superficie_immobile_mq ?? ""}
                onChange={(e) =>
                  update("superficie_immobile_mq", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="120"
              />
            </div>
          </div>
          <div className="mb-3">
            <Label>Popolazione comune (per stima CER)</Label>
            <Input
              type="number"
              value={data.popolazione_comune ?? ""}
              onChange={(e) =>
                update("popolazione_comune", e.target.value ? Number(e.target.value) : null)
              }
              placeholder="es. 1.350.000 per Milano"
            />
          </div>
          {data.tipologia_immobile === "residenziale" ? (
            <>
              <div className="mt-3">
                <Label className="mb-2 block font-medium">Tipo di abitazione</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => update("prima_casa", true)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-sm transition-colors ${
                      data.prima_casa
                        ? "border-orange-500 bg-orange-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <Home className={`h-5 w-5 ${data.prima_casa ? "text-orange-500" : "text-slate-400"}`} />
                    <span className={`font-semibold ${data.prima_casa ? "text-orange-700" : "text-slate-600"}`}>
                      Prima casa
                    </span>
                    <span className="text-xs font-bold text-emerald-600">Detrazione 50%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => update("prima_casa", false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-sm transition-colors ${
                      !data.prima_casa
                        ? "border-orange-500 bg-orange-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <Building2 className={`h-5 w-5 ${!data.prima_casa ? "text-orange-500" : "text-slate-400"}`} />
                    <span className={`font-semibold ${!data.prima_casa ? "text-orange-700" : "text-slate-600"}`}>
                      Seconda casa
                    </span>
                    <span className="text-xs font-bold text-amber-600">Detrazione 36%</span>
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Detrazione IRPEF spalmata in 10 anni · plafond €96.000 · prima casa max €48.000 recuperati · seconda casa max €34.560
                </p>
              </div>
              <FvCallout variant="tip" title="Aliquota IVA 10% applicata">
                Per immobili residenziali si applica l'IVA al 10%.
              </FvCallout>
            </>
          ) : (
            <FvCallout variant="tip" title="IVA 22% — detrazione abitativa non applicabile">
              Per capannoni, uffici e immobili non residenziali si applica l'IVA al 22%. La
              detrazione IRPEF 50%/36% è riservata agli immobili residenziali.
            </FvCallout>
          )}
        </FvCard>
      </div>
    </>
  );
}

// ============================================================================
// STEP 3 — CONSUMI
// ============================================================================
function Step3Consumi({
  data,
  update,
  profili,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  profili: Array<{ codice: string; nome_visualizzato: string; emoji: string | null }>;
}) {
  const consumoAnnuo = data.consumo_annuo_kwh ?? 0;
  // F12: costo_kwh_attuale può essere null (campo svuotato) → tratta come 0
  // nei derivati per non propagare NaN nei KPI.
  const costoKwh = data.costo_kwh_attuale ?? 0;
  const spesaAnnua = consumoAnnuo * costoKwh;
  const stima10anni = spesaAnnua * 10 * 1.5; // include +5%/anno aspettato

  return (
    <>
      <FvPanelTitle
        step={3}
        totalSteps={TOTAL_STEPS}
        title="Consumi elettrici attuali"
        subtitle={<>Da bolletta o stima rapida. Più dati ⇒ analisi più precisa del payback.</>}
      />

      {/* KPI hero (visibile sempre) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <FvKpi
          label="Consumo annuo"
          value={consumoAnnuo > 0 ? consumoAnnuo.toLocaleString("it-IT") : "—"}
          unit="kWh"
          variant="orange"
        />
        <FvKpi
          label="Spesa annua"
          value={spesaAnnua > 0 ? spesaAnnua.toLocaleString("it-IT", { maximumFractionDigits: 0 }) : "—"}
          unit="€"
        />
        <FvKpi
          label="Prezzo medio"
          value={
            data.costo_kwh_attuale != null && Number.isFinite(data.costo_kwh_attuale)
              ? data.costo_kwh_attuale.toFixed(3)
              : "—"
          }
          unit="€/kWh"
          hint={data.tariffa_tipo}
        />
        <FvKpi
          label="Stima 10 anni"
          value={stima10anni > 0 ? `~${(stima10anni / 1000).toFixed(0)}k` : "—"}
          unit="€"
          variant="red"
          hint="Senza FV (con +5%/anno)"
        />
      </div>

      <div className="grid gap-4">
        <FvCard title="Dati consumo">
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <Label>Consumo annuo kWh *</Label>
              <Input
                type="number"
                value={data.consumo_annuo_kwh ?? ""}
                onChange={(e) =>
                  update("consumo_annuo_kwh", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="es. 3500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Tipico residenziale: 2.500 – 4.500 kWh/anno
              </p>
            </div>
            <div>
              <Label>Costo €/kWh attuale</Label>
              <Input
                type="number"
                step="0.001"
                value={data.costo_kwh_attuale ?? ""}
                onChange={(e) => {
                  // F12: campo vuoto → null (non 0, che falsava spesa/payback);
                  // valori non finiti scartati.
                  const n = Number(e.target.value);
                  update(
                    "costo_kwh_attuale",
                    e.target.value === "" ? null : Number.isFinite(n) ? n : null,
                  );
                }}
                placeholder="0.32"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Tipo tariffa</Label>
              <Select
                value={data.tariffa_tipo}
                onValueChange={(v) => update("tariffa_tipo", v as FvTariffaTipo)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monoraria">Monoraria</SelectItem>
                  <SelectItem value="bioraria">Bioraria F1/F2</SelectItem>
                  <SelectItem value="trioraria">Trioraria F1/F2/F3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profilo consumo</Label>
              <Select
                value={data.profilo_consumo}
                onValueChange={(v) =>
                  update("profilo_consumo", v as FvProfiloAutoconsumoCodice)
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {profili.map((p) => (
                    <SelectItem key={p.codice} value={p.codice}>
                      {p.emoji} {p.nome_visualizzato}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </FvCard>

      </div>
    </>
  );
}

// ============================================================================
// STEP 4 — TETTO
// ============================================================================
// Vista satellitare del tetto: immagine reale via maps-proxy (Google Static Maps
// → fallback HERE). Solo immagine + badge sorgente/orientamento, NESSUN overlay
// di moduli (la disposizione reale si definisce in sopralluogo). Degrada con
// grazia: se nessuna chiave/API risponde, la card non viene mostrata.
function RoofSatelliteView({
  lat,
  lng,
  azimut,
  tilt,
  fonte,
  title,
}: {
  lat: number;
  lng: number;
  azimut?: string | null;
  tilt?: number | null;
  fonte?: string | null;
  title?: string;
}) {
  const [img, setImg] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setImg(null);
    (async () => {
      try {
        const { data: r, error } = await supabase.functions.invoke("maps-proxy", {
          body: { action: "staticmap", lat, lng, zoom: 20, w: 700, h: 430 },
        });
        if (cancelled) return;
        const url = (r as { dataUrl?: string } | null)?.dataUrl;
        if (error || !url) {
          setState("error");
          return;
        }
        setImg(url);
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (state === "error") return null; // niente immagine → nessuna card (graceful)

  const fonteLabel =
    fonte === "solar_api" ? "Google Solar API" : fonte === "pvgis" ? "PVGIS" : "Satellite";

  return (
    <FvCard title={title ?? "Vista satellitare del tetto"} className="mt-4">
      <div
        className="relative w-full overflow-hidden rounded-xl bg-slate-900/5 ring-1 ring-slate-200"
        style={{ aspectRatio: "700 / 430" }}
      >
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carico l'immagine del tetto…
          </div>
        )}
        {img && (
          <img
            src={img}
            alt="Vista satellitare del tetto"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}
        {img && (
          <div
            className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(2,6,23,0.55), transparent)" }}
          />
        )}
        {/* Badge sorgente (alto sx) */}
        {img && (
          <div
            className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white inline-flex items-center gap-1"
            style={{ background: "rgba(2,6,23,0.55)" }}
          >
            <Sparkles className="h-3 w-3 text-amber-300" /> {fonteLabel}
          </div>
        )}
        {/* Orientamento + inclinazione (alto dx) */}
        {img && (azimut || tilt != null) && (
          <div
            className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-white inline-flex items-center gap-1"
            style={{ background: "rgba(2,6,23,0.55)" }}
          >
            <Compass className="h-3 w-3" /> {azimut ?? "—"}
            {tilt != null ? ` · ${tilt}°` : ""}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-1.5">
        Immagine satellitare a scopo illustrativo del tetto; la disposizione reale dei moduli si
        definisce in sopralluogo.
      </p>
    </FvCard>
  );
}

function Step4Tetto({
  data,
  update,
  analizzando,
  onAnalizza,
  readOnlyMode,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  analizzando: boolean;
  onAnalizza: () => void;
  readOnlyMode: boolean;
}) {
  return (
    <>
      <FvPanelTitle
        step={4}
        totalSteps={TOTAL_STEPS}
        title="Tetto e geometria"
        subtitle={
          <>
            Analisi automatica via <strong>Google Solar API</strong> con fallback{" "}
            <strong>PVGIS (UE)</strong> + posizionamento manuale.
          </>
        }
      />

      <FvCard title="Sorgente dati">
        <div className="grid sm:grid-cols-3 gap-3">
          <SourceTile
            active={data.fonte_dati_tetto === "solar_api"}
            onClick={() => update("fonte_dati_tetto", "solar_api")}
            disabled={readOnlyMode}
            icon={<Sparkles className="h-5 w-5 text-orange-500" />}
            title="Google Solar API"
            description="Analisi satellitare ad alta risoluzione, layout pannelli automatico."
            badge="Consigliato"
          />
          <SourceTile
            active={data.fonte_dati_tetto === "pvgis"}
            onClick={() => update("fonte_dati_tetto", "pvgis")}
            disabled={readOnlyMode}
            icon={<Sun className="h-5 w-5 text-amber-500" />}
            title="PVGIS (JRC EU)"
            description="Dati irradiazione gratuiti europei. Niente geometria del tetto."
          />
          <SourceTile
            active={data.fonte_dati_tetto === "manuale"}
            onClick={() => update("fonte_dati_tetto", "manuale")}
            disabled={readOnlyMode}
            icon={<FileText className="h-5 w-5 text-slate-500" />}
            title="Manuale"
            description="Inserisci tu i parametri se le altre fonti non rispondono."
          />
        </div>

        {data.fonte_dati_tetto !== "manuale" && (
          <button
            type="button"
            onClick={onAnalizza}
            disabled={analizzando || readOnlyMode}
            className="mt-4 w-full px-5 py-3 text-sm font-bold rounded-lg text-white bg-gradient-to-br from-orange-500 to-amber-400 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {analizzando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Stiamo analizzando il tetto…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Analizza tetto ora
              </>
            )}
          </button>
        )}
      </FvCard>

      {data.latitudine != null && data.longitudine != null && (
        <RoofSatelliteView
          lat={data.latitudine}
          lng={data.longitudine}
          azimut={data.azimut_tetto}
          tilt={data.inclinazione_tetto}
          fonte={data.fonte_dati_tetto}
        />
      )}

      {data.fonte_dati_tetto === "manuale" && (
        <FvCard title="Parametri manuali" className="mt-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>Ore sole annue</Label>
              <Input
                type="number"
                value={data.ore_sole_annue ?? ""}
                onChange={(e) =>
                  update("ore_sole_annue", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="es. 1450"
              />
            </div>
            <div>
              <Label>Numero pannelli max</Label>
              <Input
                type="number"
                value={data.numero_pannelli_max ?? ""}
                onChange={(e) => {
                  // Campi COLLEGATI (pannello rif. 540 W): prima si poteva
                  // scrivere "8 kWp e 100 pannelli" — incoerenza che finiva
                  // in offerta. Modificando uno, l'altro si allinea.
                  const n = e.target.value ? Number(e.target.value) : null;
                  update("numero_pannelli_max", n);
                  update("potenza_max_kwp", n ? Math.round(n * 540) / 1000 : null);
                }}
              />
            </div>
            <div>
              <Label>Potenza max kWp</Label>
              <Input
                type="number"
                step="0.01"
                value={data.potenza_max_kwp ?? ""}
                onChange={(e) => {
                  const kwp = e.target.value ? Number(e.target.value) : null;
                  update("potenza_max_kwp", kwp);
                  update("numero_pannelli_max", kwp ? Math.max(1, Math.round((kwp * 1000) / 540)) : null);
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Collegata al n° pannelli (modulo di riferimento 540 W)
              </p>
            </div>
          </div>
        </FvCard>
      )}

      {data.ore_sole_annue && data.ore_sole_annue > 0 && (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FvKpi
            label="Sup. utilizzabile"
            value={
              data.superficie_tetto_disponibile_mq
                ? data.superficie_tetto_disponibile_mq.toFixed(0)
                : "—"
            }
            unit="m²"
          />
          <FvKpi
            label="Pannelli max"
            value={data.numero_pannelli_max ?? "—"}
            unit="pz"
            variant="orange"
          />
          <FvKpi
            label="Potenza max"
            value={data.potenza_max_kwp?.toFixed(1) ?? "—"}
            unit="kWp"
            variant="navy"
          />
          <FvKpi
            label="Ore sole/anno"
            value={data.ore_sole_annue?.toFixed(0) ?? "—"}
            unit="h"
            variant="green"
          />
        </div>
      )}

      {data.ore_sole_annue && data.ore_sole_annue > 0 && (
        <>
          <FvCallout variant="success" title="Tetto idoneo all'installazione" >
            Dati acquisiti dalla sorgente <strong>{data.fonte_dati_tetto === "solar_api" ? "Google Solar API" : data.fonte_dati_tetto === "pvgis" ? "PVGIS" : "manuale"}</strong>.
            {data.qualita_dati_tetto && <> Qualità dati: <strong>{data.qualita_dati_tetto}</strong>.</>}
            {data.imagery_date && <> Immagine satellitare del <strong>{data.imagery_date}</strong>.</>}
            {data.azimut_tetto && (
              <> Orientamento prevalente: <strong>{data.azimut_tetto}</strong>
                {data.inclinazione_tetto != null && <> · inclinazione <strong>{data.inclinazione_tetto}°</strong></>}.</>
            )}
            {" "}Procedi alla configurazione impianto per dimensionare l'investimento.
          </FvCallout>
          {/* Fix #16 Sprint 3: warning persistente se dati sono mock dev */}
          {data.tetto_mock && (
            <FvCallout variant="warn" title="Dati stimati (modalità sviluppo)">
              Stima generata da modello statistico Italia perché la chiave Google Solar
              API non è configurata. I numeri sono ragionevoli per Milano/Roma/Napoli ma{" "}
              <strong>non rappresentano una misura reale</strong> del tetto specifico del
              cliente. L'amministratore può configurare la chiave reale in <em>Admin → FV
              Modulo → API & Secrets</em>.
            </FvCallout>
          )}

          {/* Ombreggiamento da ostacoli vicini (alberi/edifici adiacenti).
              Lo slider/Select MOSTRA la percentuale ma SALVA la frazione 0..1.
              Default 0 = "Nessuno" → nessun impatto sui progetti esistenti. */}
          <FvCard title="Ombreggiamento da ostacoli vicini" className="mt-4">
            <div className="grid sm:grid-cols-2 gap-3 items-start">
              <div>
                <Label>Ombra da alberi o edifici vicini (opzionale)</Label>
                <Select
                  value={String(Math.round((data.perdita_ombreggiamento_pct ?? 0) * 100))}
                  onValueChange={(v) =>
                    update("perdita_ombreggiamento_pct", Number(v) / 100)
                  }
                  disabled={readOnlyMode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Nessuno</SelectItem>
                    <SelectItem value="5">Leggero — 5%</SelectItem>
                    <SelectItem value="10">Moderato — 10%</SelectItem>
                    <SelectItem value="15">Sensibile — 15%</SelectItem>
                    <SelectItem value="20">Marcato — 20%</SelectItem>
                    <SelectItem value="30">Forte — 30%</SelectItem>
                    <SelectItem value="40">Molto forte — 40%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed sm:pt-6">
                L'orizzonte e le colline sono già considerati nei dati di
                irradiazione: indica qui <strong>solo</strong> le ombre ravvicinate
                (un albero alto, un edificio adiacente) che riducono la produzione.
                Riduce la stima di produzione del valore scelto.
              </p>
            </div>
          </FvCard>

          <FvLayoutTetto panels={data.layout_tetto} className="mt-3" />
        </>
      )}
    </>
  );
}

function SourceTile({
  active,
  onClick,
  icon,
  title,
  description,
  badge,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative text-left rounded-xl border-2 p-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "border-orange-500 bg-orange-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {badge && active && (
        <span className="absolute top-2 right-2 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-bold text-sm text-slate-900">{title}</span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </button>
  );
}

// ============================================================================
// STEP 5 — CONFIGURAZIONE
// ============================================================================
/**
 * Sconto commerciale (Fase 5): editor % / € con verdetto di AUTORIZZAZIONE live
 * sulle discount_rules aziendali (sconto max, soglia approvazione admin, margine
 * minimo). Il clamp definitivo è server-side nell'edge fv-calcolo-finanziario.
 * La base prezzo arriva dallo scenario se già calcolato; per un kit usa il
 * prezzo del kit, così il verdetto in % è affidabile anche prima del calcolo.
 * Non si mostra quando è impostato un prezzo di vendita libero a corpo (che
 * bypassa lo sconto).
 */
function FvScontoCard({
  data,
  update,
  readOnlyMode,
  scenario,
  calcolando,
  onRicalcola,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  readOnlyMode: boolean;
  scenario: Record<string, unknown> | null;
  calcolando: boolean;
  onRicalcola: () => void;
}) {
  const { data: discountRules = [] } = useDiscountRules();
  const [scontoInput, setScontoInput] = useState<string>(() =>
    data.sconto_valore != null ? String(data.sconto_valore).replace(".", ",") : "",
  );
  // Ri-sincronizza l'input se il valore cambia da fuori (idratazione bozza).
  useEffect(() => {
    setScontoInput(data.sconto_valore != null ? String(data.sconto_valore).replace(".", ",") : "");
  }, [data.sconto_valore]);

  const costi = (scenario?.costi ?? null) as {
    costo_totale_netto?: number;
    prezzo_pieno_netto?: number;
    sconto_eur_applicato?: number;
    sconto_limitato?: boolean;
    prezzo_vendita_netto?: number;
  } | null;

  // Base = prezzo netto PIENO pre-sconto: dallo scenario se calcolato, altrimenti
  // dal prezzo del kit (chiavi in mano). Manuale non ancora calcolato → 0.
  const baseFromScenario = costi
    ? (costi.prezzo_pieno_netto ?? ((costi.prezzo_vendita_netto ?? 0) + (costi.sconto_eur_applicato ?? 0)))
    : null;
  const baseFromKit = data.kit_bundle_id && data.kit_prezzo != null ? data.kit_prezzo : null;
  const prezzoPienoNetto = baseFromScenario ?? baseFromKit ?? 0;
  const hasBase = prezzoPienoNetto > 0;
  const costoTotaleNetto = costi?.costo_totale_netto ?? 0;
  const hasCosto = costi?.costo_totale_netto != null;

  const scontoValoreNum = data.sconto_valore ?? 0;
  const scontoAttivo = scontoValoreNum > 0;
  const scontoEurRichiesto = scontoAttivo
    ? (data.sconto_tipo === "pct" ? (prezzoPienoNetto * scontoValoreNum) / 100 : scontoValoreNum)
    : 0;
  // % richiesta: diretta per lo sconto in %, ricavata dalla base per l'importo €.
  const scontoPctRichiesto = data.sconto_tipo === "pct"
    ? scontoValoreNum
    : (hasBase ? (scontoValoreNum / prezzoPienoNetto) * 100 : null);

  const discountEval = evaluateDiscountRules(discountRules, {
    importo: prezzoPienoNetto,
    tipoLavoro: "fotovoltaico",
  });
  const discountVerdict = scontoPctRichiesto != null
    ? classifyDiscount(scontoPctRichiesto, discountEval)
    : "ok";
  const scontoCapEur = (prezzoPienoNetto * discountEval.scontoMaxPct) / 100;
  const scontoApplicatoLive = hasBase ? Math.min(scontoEurRichiesto, scontoCapEur) : scontoEurRichiesto;
  const prezzoNettoScontatoLive = Math.max(0, prezzoPienoNetto - scontoApplicatoLive);
  const margineLiveEur = prezzoNettoScontatoLive - costoTotaleNetto;
  const margineLivePct = prezzoNettoScontatoLive > 0 ? (margineLiveEur / prezzoNettoScontatoLive) * 100 : 0;
  const scontoServerApplicato = costi?.sconto_eur_applicato ?? 0;
  const scontoDaRicalcolare = hasBase && Math.abs(scontoApplicatoLive - scontoServerApplicato) > 0.5;

  const RicalcolaBtn = (
    <button
      type="button"
      onClick={onRicalcola}
      disabled={calcolando}
      className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg text-white bg-gradient-to-br from-orange-500 to-amber-400 shadow hover:shadow-md transition-all inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {calcolando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      Ricalcola
    </button>
  );

  return (
    <FvCard title="Sconto commerciale">
      <p className="text-xs text-slate-500 mb-3">
        Applica uno sconto e verifica subito se rientra nelle <strong>regole aziendali</strong> o se
        richiede <strong>autorizzazione</strong>. Il limite viene comunque applicato al calcolo.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <Label className="text-xs text-slate-500 mb-1 block">Tipo di sconto</Label>
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
            <button
              type="button"
              disabled={readOnlyMode}
              onClick={() => update("sconto_tipo", "pct")}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                data.sconto_tipo === "pct" ? "bg-orange-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              %
            </button>
            <button
              type="button"
              disabled={readOnlyMode}
              onClick={() => update("sconto_tipo", "importo")}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-l border-slate-300 ${
                data.sconto_tipo === "importo" ? "bg-orange-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              €
            </button>
          </div>
        </div>
        <div className="w-40">
          <Label className="text-xs text-slate-500 mb-1 block">
            {data.sconto_tipo === "pct" ? "Sconto (%)" : "Sconto (€)"}
          </Label>
          <Input
            inputMode="decimal"
            value={scontoInput}
            disabled={readOnlyMode}
            onChange={(e) => {
              setScontoInput(e.target.value);
              const v = e.target.value.trim() === "" ? null : Math.max(0, parseDecimalIT(e.target.value));
              update("sconto_valore", v);
            }}
            placeholder={data.sconto_tipo === "pct" ? "es. 5" : "es. 500"}
            className={`h-10 ${
              discountVerdict === "blocked"
                ? "border-red-400 focus-visible:ring-red-400"
                : discountVerdict === "approve"
                  ? "border-amber-400 focus-visible:ring-amber-400"
                  : ""
            }`}
          />
        </div>
        <div className="text-xs text-slate-500 pb-2">
          Regole aziendali: sconto max <strong>{discountEval.scontoMaxPct.toFixed(1)}%</strong>
          {discountEval.approvaOltrePct != null && (
            <> · approvazione oltre <strong>{discountEval.approvaOltrePct.toFixed(1)}%</strong></>
          )}
          {discountEval.isFallback && <> · (nessuna regola: fallback 10%)</>}
        </div>
      </div>

      {/* Verdetto di autorizzazione */}
      {scontoAttivo && scontoPctRichiesto != null && discountVerdict === "ok" && (
        <p className="text-xs text-emerald-700 mb-3 flex items-center gap-1.5">
          ✓ Sconto {scontoPctRichiesto.toFixed(1)}% entro le regole — <strong>autorizzato</strong>
          {hasCosto && hasBase && (
            <> · margine post-sconto <strong>{margineLivePct.toFixed(1)}%</strong> ({formatEur(margineLiveEur)})</>
          )}
        </p>
      )}
      {scontoAttivo && scontoPctRichiesto != null && discountVerdict === "approve" && (
        <p className="text-xs text-amber-700 mb-3 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Sconto {scontoPctRichiesto.toFixed(1)}% oltre soglia {discountEval.approvaOltrePct?.toFixed(1)}%: richiede <strong>approvazione admin</strong>.
        </p>
      )}
      {scontoAttivo && scontoPctRichiesto != null && discountVerdict === "blocked" && (
        <p className="text-xs text-red-600 mb-3 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Sconto {scontoPctRichiesto.toFixed(1)}% oltre il massimo consentito ({discountEval.scontoMaxPct.toFixed(1)}%):
          verrà limitato a {discountEval.scontoMaxPct.toFixed(1)}%{hasBase && <> (≈ {formatEur(scontoCapEur)})</>}.
        </p>
      )}
      {scontoAttivo && scontoPctRichiesto == null && (
        <p className="text-xs text-slate-500 mb-3">
          Per validare l'autorizzazione di uno sconto in € serve il prezzo base: premi
          <strong> Ricalcola</strong> qui sotto oppure imposta lo sconto in %.
        </p>
      )}
      {costi?.sconto_limitato && !scontoDaRicalcolare && (
        <p className="text-xs text-amber-700 mb-3">
          ⚠ Lo sconto richiesto superava le regole: il calcolo ha applicato{" "}
          <strong>{formatEur(scontoServerApplicato)}</strong>.
        </p>
      )}

      {/* Riepilogo prezzo (quando la base è nota) */}
      {hasBase ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Prezzo pieno (netto)</div>
            <div className="font-extrabold text-slate-900 tabular-nums">{formatEur(prezzoPienoNetto)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Sconto applicato</div>
            <div className="font-extrabold text-slate-900 tabular-nums">
              −{formatEur(scontoApplicatoLive)}
              {scontoApplicatoLive > 0 && (
                <span className="text-xs font-medium text-slate-500 ml-1">
                  ({((scontoApplicatoLive / prezzoPienoNetto) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
            <div className="text-xs text-orange-700">Prezzo netto scontato</div>
            <div className="font-extrabold text-orange-800 tabular-nums">{formatEur(prezzoNettoScontatoLive)}</div>
          </div>
          {hasCosto ? (
            <div className={`rounded-lg border p-3 ${margineLiveEur >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
              <div className={`text-xs ${margineLiveEur >= 0 ? "text-emerald-700" : "text-rose-700"}`}>Margine post-sconto</div>
              <div className={`font-extrabold tabular-nums ${margineLiveEur >= 0 ? "text-emerald-800" : "text-rose-700"}`}>
                {formatEur(margineLiveEur)}
                <span className="text-xs font-medium ml-1">({margineLivePct.toFixed(1)}%)</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Margine post-sconto</div>
              <div className="text-xs text-slate-400 pt-1">Calcola per vederlo</div>
            </div>
          )}
        </div>
      ) : (
        scontoAttivo && !readOnlyMode && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Prezzo scontato e margine: calcola lo scenario per vederli.</p>
            {RicalcolaBtn}
          </div>
        )
      )}

      {scontoDaRicalcolare && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-900">
            Sconto modificato: premi <strong>Ricalcola</strong> per applicarlo a IVA, rata, payback
            e a tutti i numeri del preventivo.
          </p>
          {!readOnlyMode && RicalcolaBtn}
        </div>
      )}
    </FvCard>
  );
}

function Step5Configurazione({
  data,
  update,
  readOnlyMode,
  pannelli,
  inverter,
  accumuli,
  tariffeFv,
  kitFv,
  serviziCatalogoCount,
  serviziCatalogo,
  catalogoFvVuoto,
  scenario,
  calcolando,
  onRicalcola,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  readOnlyMode: boolean;
  pannelli: Array<Record<string, unknown>>;
  inverter: Array<Record<string, unknown>>;
  accumuli: Array<Record<string, unknown>>;
  tariffeFv: FvTariffaAziendale[];
  kitFv: Bundle[];
  serviziCatalogoCount: number;
  serviziCatalogo: Array<Record<string, unknown>>;
  catalogoFvVuoto: boolean;
  scenario: Record<string, unknown> | null;
  calcolando: boolean;
  onRicalcola: () => void;
}) {
  // Prodotti extra: ricerca live sull'INTERO listino generale (article_families).
  const [extraSearch, setExtraSearch] = useState("");

  // ── Composizione offerta: Kit pronto vs configurazione manuale ──
  const kitDisponibili = useMemo(() => kitFv.filter((k) => k.attivo && k.fv_kwp != null), [kitFv]);
  // Filtri catalogo kit (con ~100 kit servono ricerca + filtri).
  const [kitSearch, setKitSearch] = useState("");
  const [kitPotenza, setKitPotenza] = useState<"all" | "s3" | "3_6" | "6_10" | "g10">("all");
  const [kitAccumulo, setKitAccumulo] = useState<"all" | "con" | "senza">("all");
  const [kitSort, setKitSort] = useState<"nome" | "prezzo" | "potenza">("nome");
  // Catalogo kit in un popup: con ~100 kit l'elenco inline è ingestibile.
  const [kitDialogOpen, setKitDialogOpen] = useState(false);
  const kitFiltrati = useMemo(() => {
    const q = kitSearch.trim().toLowerCase();
    const arr = kitDisponibili.filter((k) => {
      if (q && !(`${k.nome ?? ""} ${k.descrizione ?? ""}`.toLowerCase().includes(q))) return false;
      const kwp = Number(k.fv_kwp ?? 0);
      if (kitPotenza === "s3" && !(kwp <= 3)) return false;
      if (kitPotenza === "3_6" && !(kwp > 3 && kwp <= 6)) return false;
      if (kitPotenza === "6_10" && !(kwp > 6 && kwp <= 10)) return false;
      if (kitPotenza === "g10" && !(kwp > 10)) return false;
      const acc = Number(k.fv_accumulo_kwh ?? 0);
      if (kitAccumulo === "con" && !(acc > 0)) return false;
      if (kitAccumulo === "senza" && acc > 0) return false;
      return true;
    });
    return [...arr].sort((a, b) => {
      if (kitSort === "prezzo") return Number(a.prezzo_offerta ?? 0) - Number(b.prezzo_offerta ?? 0);
      if (kitSort === "potenza") return Number(a.fv_kwp ?? 0) - Number(b.fv_kwp ?? 0);
      return (a.nome ?? "").localeCompare(b.nome ?? "");
    });
  }, [kitDisponibili, kitSearch, kitPotenza, kitAccumulo, kitSort]);
  const [modalitaOfferta, setModalitaOfferta] = useState<"kit" | "manuale">(
    data.kit_bundle_id ? "kit" : "manuale",
  );
  const applicaKit = (k: Bundle) => {
    update("kit_bundle_id", k.id);
    update("kit_nome", k.nome);
    update("kit_prezzo", k.prezzo_offerta ?? null);
    if (k.fv_kwp != null) {
      update("potenza_kwp", Number(k.fv_kwp));
      update("numero_pannelli_scelti", Math.max(1, Math.round((Number(k.fv_kwp) * 1000) / 540)));
    }
    const acc = Number(k.fv_accumulo_kwh ?? 0);
    update("con_accumulo", acc > 0);
    update("capacita_accumulo_kwh", acc);
    // Kit chiavi in mano: il prezzo comprende tutto → azzera manodopera/servizi
    // e l'eventuale prezzo libero a corpo (il kit ha già il suo prezzo).
    update("manodopera_righe", []);
    update("servizi_righe", []);
    update("prezzo_vendita_manuale", null);
  };

  const rimuoviKit = () => {
    update("kit_bundle_id", null);
    update("kit_nome", null);
    update("kit_prezzo", null);
  };
  const { data: listinoExtra = [] } = useListinoPerFv(extraSearch);

  const aggiungiExtra = (l: { id: string; nome: string | null; descrizione: string | null; prezzo: number | null; prezzo_acquisto: number | null }) => {
    update("prodotti_extra", [
      ...data.prodotti_extra,
      {
        uid: crypto.randomUUID(),
        listino_id: l.id,
        descrizione: l.nome || l.descrizione || "Prodotto listino",
        quantita: 1,
        prezzo_vendita: l.prezzo ?? 0,
        prezzo_acquisto: l.prezzo_acquisto,
      },
    ]);
    setExtraSearch("");
  };

  const aggiungiExtraLibero = (nome?: string) => {
    update("prodotti_extra", [
      ...data.prodotti_extra,
      {
        uid: crypto.randomUUID(),
        listino_id: null,
        descrizione: nome?.trim() || "",
        quantita: 1,
        prezzo_vendita: 0,
        prezzo_acquisto: null,
      },
    ]);
    setExtraSearch("");
  };

  const aggiornaExtra = (
    idx: number,
    patch: Partial<WizardData["prodotti_extra"][number]>,
  ) => {
    update(
      "prodotti_extra",
      data.prodotti_extra.map((ex, i) => (i === idx ? { ...ex, ...patch } : ex)),
    );
  };

  const rimuoviExtra = (idx: number) => {
    update("prodotti_extra", data.prodotti_extra.filter((_, i) => i !== idx));
  };

  // ── Manodopera & Servizi editabili dal commerciale ──────────────────────────
  const oreDefaultManodopera = () => Math.max(1, Math.ceil(data.numero_pannelli_scelti * 0.5 + 8));
  const aggiungiManodoperaDaTariffa = (t: FvTariffaAziendale) => {
    update("manodopera_righe", [
      ...data.manodopera_righe,
      {
        tariffa_id: t.id,
        descrizione: `${t.nome} — impianto ${data.potenza_kwp} kWp`,
        ore: oreDefaultManodopera(),
        tariffa_oraria_netta: Number(t.prezzo_costo),
        tariffa_oraria_vendita: Number(t.prezzo_vendita),
      },
    ]);
  };
  const aggiungiManodoperaLibera = () => {
    update("manodopera_righe", [
      ...data.manodopera_righe,
      { tariffa_id: null, descrizione: "", ore: 1, tariffa_oraria_netta: 0, tariffa_oraria_vendita: 0 },
    ]);
  };
  const aggiornaManodopera = (idx: number, patch: Partial<WizardData["manodopera_righe"][number]>) => {
    update("manodopera_righe", data.manodopera_righe.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const rimuoviManodopera = (idx: number) => {
    update("manodopera_righe", data.manodopera_righe.filter((_, i) => i !== idx));
  };

  const aggiungiServizioDaCatalogo = (s: Record<string, unknown>) => {
    const netto = Number(s.prezzo_netto_default ?? 0);
    const margine = Math.min(0.8, Math.max(0, Number(s.margine_pct_default ?? 0.35)));
    update("servizi_righe", [
      ...data.servizi_righe,
      {
        tipo: String(s.codice ?? "altro"),
        descrizione: String(s.descrizione ?? "Servizio"),
        quantita: 1,
        prezzo_netto: netto,
        prezzo_vendita: margine < 1 ? Math.round((netto / (1 - margine)) * 100) / 100 : netto,
        note_operative: s.note_operative ? String(s.note_operative) : null,
      },
    ]);
  };
  const aggiungiServizioLibero = () => {
    update("servizi_righe", [
      ...data.servizi_righe,
      { tipo: "altro", descrizione: "", quantita: 1, prezzo_netto: 0, prezzo_vendita: 0, note_operative: null },
    ]);
  };
  const aggiornaServizio = (idx: number, patch: Partial<WizardData["servizi_righe"][number]>) => {
    update("servizi_righe", data.servizi_righe.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const rimuoviServizio = (idx: number) => {
    update("servizi_righe", data.servizi_righe.filter((_, i) => i !== idx));
  };
  // Auto-calcolo potenza_kwp da numero pannelli. In sola lettura NON scrive:
  // update() in read-only mostra un toast d'errore, che da un useEffect
  // partirebbe spurio al mount dello step.
  useEffect(() => {
    if (readOnlyMode) return;
    if (data.kit_bundle_id) return; // kit: la potenza arriva dal kit, niente auto-calcolo
    if (data.pannello_id) {
      const p = pannelli.find((x) => (x as { id: string }).id === data.pannello_id);
      const w = (p?.potenza_w as number) ?? 540;
      update("potenza_kwp", Math.round((data.numero_pannelli_scelti * w) / 10) / 100);
    } else {
      update("potenza_kwp", Math.round((data.numero_pannelli_scelti * 540) / 10) / 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.numero_pannelli_scelti, data.pannello_id, data.kit_bundle_id]);

  // Auto-suggerimento accumulo (5 kWh per profili serali/misti).
  const suggerisciAccumulo = shouldSuggestFvAccumulo(data.profilo_consumo);

  const stimaProducibilita =
    data.potenza_kwp && data.ore_sole_annue
      ? // ore_sole_annue è LORDO (ore di picco): applico il derate di sistema PR×perdite
        // (~0.7565), coerente col motore finanziario, non solo PR (0.85).
        data.potenza_kwp * data.ore_sole_annue * 0.7565
      : 0;
  const listinoCompleto = Boolean(
    data.pannello_id && data.inverter_id && (!data.con_accumulo || data.accumulo_id),
  );
  const readiness = calcolaFvCommercialReadiness({
    consumo_annuo_kwh: data.consumo_annuo_kwh,
    costo_kwh_attuale: data.costo_kwh_attuale,
    potenza_kwp: data.potenza_kwp,
    potenza_max_kwp: data.potenza_max_kwp,
    numero_pannelli_scelti: data.numero_pannelli_scelti,
    numero_pannelli_max: data.numero_pannelli_max,
    produzione_annua_stimata_kwh: stimaProducibilita || null,
    con_accumulo: data.con_accumulo,
    capacita_accumulo_kwh: data.capacita_accumulo_kwh,
    listinoCompleto,
    tariffaInstallazioneConfigurata: Boolean(data.tariffa_installazione_id),
    tettoMock: data.tetto_mock,
  });
  const readinessVariant =
    readiness.status === "blocked"
      ? "error"
      : readiness.status === "review"
        ? "warn"
        : "success";
  const readinessLabel =
    readiness.status === "blocked"
      ? "Blocchi da correggere"
      : readiness.status === "review"
        ? "Da rivedere"
        : "Pronto offerta";

  // Specifiche modulo derivate dal pannello scelto (catalogo) → dimensionamento stringhe
  const pannelloSelStringhe = pannelli.find((p) => (p as { id?: string }).id === data.pannello_id);
  const moduloSpecStringhe = derivaSpecModuloDaPotenza(
    pannelloSelStringhe ? Number((pannelloSelStringhe as { potenza_w?: number }).potenza_w) || 540 : 540,
  );

  return (
    <>
      <FvPanelTitle
        step={5}
        totalSteps={TOTAL_STEPS}
        title="Configurazione impianto"
        subtitle={
          <>
            Dimensionamento via <strong>motore PVGIS + algoritmo accumulo</strong>. Modificabile dal venditore.
          </>
        }
      />

      {/* Catalogo FV vuoto: il listino non è ancora stato collegato al
          preventivatore (0 pannelli e 0 inverter in articoli_native). */}
      {catalogoFvVuoto && (
        <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm text-amber-900">
            <strong>Nessun componente nel catalogo FV.</strong>{" "}
            I prodotti del tuo listino non sono ancora stati collegati al preventivatore.
          </div>
          <Link
            to="/azienda/marketing/fotovoltaico/componenti"
            className="inline-flex items-center gap-1.5 shrink-0 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-amber-600 hover:bg-amber-700 transition-colors"
          >
            Collega il listino al preventivatore
          </Link>
        </div>
      )}

      {/* ── Composizione offerta: scelta esplicita Kit pronto vs manuale ── */}
      {kitDisponibili.length > 0 && (
        <div className="mb-4">
          <FvCard title="Composizione offerta">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={readOnlyMode}
                onClick={() => { setModalitaOfferta("kit"); if (!data.kit_bundle_id) setKitDialogOpen(true); }}
                className={`text-left rounded-xl border-2 p-4 transition-all ${
                  modalitaOfferta === "kit"
                    ? "border-orange-400 bg-orange-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Zap className={`h-4 w-4 ${modalitaOfferta === "kit" ? "text-orange-500" : "text-slate-400"}`} />
                  Kit pronti dal listino
                  <span className="ml-auto text-[11px] font-bold text-orange-600 bg-orange-100 rounded-full px-2 py-0.5">
                    {kitDisponibili.length}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Potenza, accumulo e prezzo già impostati: un click e l'offerta è pronta.</p>
              </button>
              <button
                type="button"
                disabled={readOnlyMode}
                onClick={() => {
                  setModalitaOfferta("manuale");
                  if (data.kit_bundle_id) rimuoviKit();
                }}
                className={`text-left rounded-xl border-2 p-4 transition-all ${
                  modalitaOfferta === "manuale"
                    ? "border-orange-400 bg-orange-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Wrench className={`h-4 w-4 ${modalitaOfferta === "manuale" ? "text-orange-500" : "text-slate-400"}`} />
                  Configurazione manuale
                </div>
                <p className="text-xs text-slate-500 mt-1">Scegli pannello, inverter e accumulo dal catalogo: la potenza si calcola dai moduli.</p>
              </button>
            </div>

            {modalitaOfferta === "kit" && (
              <div className="mt-4">
                {data.kit_bundle_id ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{data.kit_nome ?? "Kit selezionato"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {data.potenza_kwp.toLocaleString("it-IT")} kWp
                        </span>
                        {data.con_accumulo && data.capacita_accumulo_kwh > 0 && (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">
                            {data.capacita_accumulo_kwh.toLocaleString("it-IT")} kWh
                          </span>
                        )}
                        {data.kit_prezzo != null && (
                          <span className="text-[11px] font-bold text-emerald-700">{formatEur(data.kit_prezzo)}</span>
                        )}
                      </div>
                    </div>
                    {!readOnlyMode && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setKitDialogOpen(true)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-300"
                        >
                          Cambia kit
                        </button>
                        <button
                          type="button"
                          onClick={rimuoviKit}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-red-300 hover:text-red-600"
                        >
                          Rimuovi
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={readOnlyMode}
                    onClick={() => setKitDialogOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 px-4 py-6 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50 disabled:opacity-50"
                  >
                    <Zap className="h-4 w-4" />
                    Sfoglia i {kitDisponibili.length} kit disponibili
                  </button>
                )}

                {/* Popup catalogo kit: filtri + griglia. Un click applica e chiude. */}
                <Dialog open={kitDialogOpen} onOpenChange={setKitDialogOpen}>
                  <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
                    <DialogHeader>
                      <DialogTitle>Scegli un kit pronto</DialogTitle>
                      <DialogDescription>
                        Potenza, accumulo e prezzo sono già impostati: un click e l'offerta è pronta.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={kitSearch}
                        onChange={(e) => setKitSearch(e.target.value)}
                        placeholder="Cerca kit o marca…"
                        className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <select value={kitPotenza} onChange={(e) => setKitPotenza(e.target.value as typeof kitPotenza)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                        <option value="all">Tutte le potenze</option>
                        <option value="s3">≤ 3 kWp</option>
                        <option value="3_6">3–6 kWp</option>
                        <option value="6_10">6–10 kWp</option>
                        <option value="g10">&gt; 10 kWp</option>
                      </select>
                      <select value={kitAccumulo} onChange={(e) => setKitAccumulo(e.target.value as typeof kitAccumulo)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                        <option value="all">Con o senza accumulo</option>
                        <option value="con">Con accumulo</option>
                        <option value="senza">Senza accumulo</option>
                      </select>
                      <select value={kitSort} onChange={(e) => setKitSort(e.target.value as typeof kitSort)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                        <option value="nome">Ordina: nome</option>
                        <option value="prezzo">Ordina: prezzo</option>
                        <option value="potenza">Ordina: potenza</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-slate-400">{kitFiltrati.length} di {kitDisponibili.length} kit</p>
                    <div className="-mx-1 overflow-y-auto px-1">
                      {kitFiltrati.length === 0 ? (
                        <p className="py-10 text-center text-sm text-slate-500">Nessun kit corrisponde ai filtri.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
                          {kitFiltrati.map((k) => {
                            const selected = data.kit_bundle_id === k.id;
                            return (
                              <button
                                key={k.id}
                                type="button"
                                disabled={readOnlyMode}
                                onClick={() => { applicaKit(k); setKitDialogOpen(false); }}
                                className={`relative text-left rounded-xl border-2 p-4 transition-all ${
                                  selected
                                    ? "border-emerald-400 bg-emerald-50 shadow-md"
                                    : "border-slate-200 bg-white hover:border-orange-300 hover:shadow-sm"
                                }`}
                              >
                                {selected && (
                                  <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-emerald-600" />
                                )}
                                <p className="pr-6 text-sm font-semibold text-slate-900">{k.nome}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                    {Number(k.fv_kwp).toLocaleString("it-IT")} kWp
                                  </span>
                                  {Number(k.fv_accumulo_kwh ?? 0) > 0 && (
                                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700">
                                      {Number(k.fv_accumulo_kwh).toLocaleString("it-IT")} kWh
                                    </span>
                                  )}
                                </div>
                                {k.prezzo_offerta != null && (
                                  <p className="mt-2 text-lg font-extrabold text-slate-900">
                                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Number(k.prezzo_offerta))}
                                  </p>
                                )}
                                <p className="mt-1 text-[11px] text-slate-400">{selected ? "Selezionato" : "Click per applicare"}</p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {modalitaOfferta === "manuale" && (
              <p className="text-xs text-muted-foreground mt-3">
                Componi l'impianto con le sezioni qui sotto: pannello, inverter, accumulo e servizi. La potenza si aggiorna dal numero di moduli scelti.
              </p>
            )}
          </FvCard>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <FvKpi label="Potenza" value={data.potenza_kwp.toFixed(2)} unit="kWp" variant="orange" />
        <FvKpi
          label="Pannelli"
          value={
            data.numero_pannelli_scelti > 0
              ? `${data.numero_pannelli_scelti} × ${Math.round((data.potenza_kwp * 1000) / data.numero_pannelli_scelti)}`
              : `${data.numero_pannelli_scelti} × —`
          }
          unit="Wp"
        />
        <FvKpi
          label="Accumulo"
          value={data.con_accumulo ? data.capacita_accumulo_kwh : 0}
          unit="kWh"
        />
        <FvKpi
          label="Producibilità"
          value={stimaProducibilita > 0 ? stimaProducibilita.toFixed(0) : "—"}
          unit="kWh/a"
          variant="green"
        />
      </div>

      {/* 13/7: mappa di posizionamento pannelli RIMOSSA dalla configurazione —
          il posizionamento si definisce nello studio di fattibilità post-firma.
          La falda della Fase 4 (vista indicativa) resta e finisce nel PDF. */}

      {/* Progettazione elettrica: dimensionamento stringhe/MPPT (gap vs Reonic/Autarc) */}
      <FvDimensionamentoStringhe
        numeroModuli={data.numero_pannelli_scelti}
        modulo={moduloSpecStringhe}
        className="mb-4"
      />

      <div className="mb-4">
        <FvCallout
          variant={readinessVariant}
          title="Controllo operativo prima dell'offerta"
          action={<FvChip variant={readiness.status === "ready" ? "green" : readiness.status === "review" ? "yellow" : "red"}>{readiness.score}/100</FvChip>}
        >
          <div className="space-y-2">
            <p>
              <strong>{readinessLabel}</strong>: {readiness.nextAction}
            </p>
            {readiness.issues.length > 0 && (
              <ul className="grid gap-1 text-xs md:grid-cols-2">
                {readiness.issues.slice(0, 6).map((issue) => (
                  <li key={issue.code} className="rounded-md bg-white/60 px-2 py-1">
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FvCallout>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <FvCard title="Dimensionamento">
          <div className="space-y-4">
            {data.kit_bundle_id && (
              <FvCallout variant="info" title="Definito dal kit">
                Potenza, accumulo e numero moduli arrivano dal kit{" "}
                <strong>{data.kit_nome}</strong>. Rimuovi il kit (riquadro in alto) per
                configurare manualmente.
              </FvCallout>
            )}
            <div className={data.kit_bundle_id ? "opacity-60 pointer-events-none" : ""}>
              <div className="flex items-center justify-between mb-2">
                <Label>Numero pannelli</Label>
                <span className="text-orange-600 font-bold text-lg tabular-nums">
                  {data.numero_pannelli_scelti}
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={data.numero_pannelli_max ?? 60}
                value={data.numero_pannelli_scelti}
                onChange={(e) => update("numero_pannelli_scelti", Number(e.target.value))}
                disabled={!!data.kit_bundle_id || readOnlyMode}
                className="w-full accent-orange-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Min 4 · Max{" "}
                <strong>{data.numero_pannelli_max ?? "—"}</strong>{" "}
                {data.numero_pannelli_max
                  ? "(da analisi tetto)"
                  : "(richiede analisi tetto)"}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Accumulo (kWh)</Label>
                <span className="text-orange-600 font-bold text-lg tabular-nums">
                  {data.con_accumulo ? data.capacita_accumulo_kwh : 0}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={15}
                step={0.5}
                value={data.con_accumulo ? data.capacita_accumulo_kwh : 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === 0) {
                    update("con_accumulo", false);
                    update("capacita_accumulo_kwh", 0);
                  } else {
                    update("con_accumulo", true);
                    update("capacita_accumulo_kwh", v);
                  }
                }}
                disabled={!!data.kit_bundle_id || readOnlyMode}
                className="w-full accent-orange-500"
              />
            </div>
          </div>

          {suggerisciAccumulo && data.capacita_accumulo_kwh < 5 && (
            <FvCallout variant="tip" title="Suggerimento accumulo">
              Profilo consumo <strong>{data.profilo_consumo}</strong>: con accumulo <strong>5 kWh</strong> sposti
              l'energia prodotta a mezzogiorno verso le 18-22h, raggiungi il <strong>70% di
              autoconsumo</strong> e migliori il payback di 1-2 anni.
            </FvCallout>
          )}
        </FvCard>

        <FvCard title="Modelli da listino">
          <div className="space-y-3">
            <div>
              <Label>Modello pannello</Label>
              <Select
                value={data.pannello_id ?? ""}
                onValueChange={(v) => update("pannello_id", v || null)}
                disabled={!!data.kit_bundle_id || readOnlyMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona pannello…" />
                </SelectTrigger>
                <SelectContent>
                  {pannelli.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Nessun pannello in listino
                    </SelectItem>
                  ) : (
                    pannelli.map((p) => (
                      <SelectItem
                        key={(p as { id: string }).id}
                        value={(p as { id: string }).id}
                      >
                        {p.descrizione as string} ({p.potenza_w as number}W)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Inverter</Label>
              <Select
                value={data.inverter_id ?? ""}
                onValueChange={(v) => update("inverter_id", v || null)}
                disabled={!!data.kit_bundle_id || readOnlyMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona inverter…" />
                </SelectTrigger>
                <SelectContent>
                  {inverter.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Nessun inverter
                    </SelectItem>
                  ) : (
                    inverter.map((p) => (
                      <SelectItem
                        key={(p as { id: string }).id}
                        value={(p as { id: string }).id}
                      >
                        {p.descrizione as string}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Accumulo (opzionale)</Label>
              <Select
                value={data.accumulo_id ?? "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") {
                    update("accumulo_id", null);
                    update("con_accumulo", false);
                    update("capacita_accumulo_kwh", 0);
                  } else {
                    update("accumulo_id", v);
                    update("con_accumulo", true);
                    const acc = accumuli.find((x) => (x as { id: string }).id === v);
                    update("capacita_accumulo_kwh", (acc?.capacita_kwh as number) ?? 5);
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun accumulo</SelectItem>
                  {accumuli.map((p) => (
                    <SelectItem
                      key={(p as { id: string }).id}
                      value={(p as { id: string }).id}
                    >
                      {p.descrizione as string} ({p.capacita_kwh as number} kWh)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Manodopera & Servizi: righe scelte dal commerciale ── */}
            {data.kit_bundle_id && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <strong>Kit chiavi in mano:</strong> il prezzo del kit comprende tutto. Manodopera e pratiche non vengono aggiunte. Puoi comunque inserire voci extra qui sotto se un caso lo richiede.
              </div>
            )}
            {!data.kit_bundle_id && !readOnlyMode && data.manodopera_righe.length === 0 && data.servizi_righe.length === 0 && (
              <p className="text-xs text-slate-400">
                Nessuna voce impostata. Aggiungi manodopera e servizi solo se servono, con i pulsanti qui sotto.
              </p>
            )}

            {/* MANODOPERA */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Manodopera</Label>
                {!readOnlyMode && (
                  <div className="flex items-center gap-2">
                    <Select value="" onValueChange={(v) => { const t = tariffeFv.find((x) => x.id === v); if (t) aggiungiManodoperaDaTariffa(t); }}>
                      <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue placeholder="+ Da tariffa" /></SelectTrigger>
                      <SelectContent>
                        {tariffeFv.length === 0 && <SelectItem value="__none__" disabled>Nessuna tariffa in anagrafica</SelectItem>}
                        {tariffeFv.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome} — {Number(t.prezzo_vendita).toFixed(0)}€/{t.unita}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button type="button" onClick={aggiungiManodoperaLibera} className="text-xs font-semibold text-orange-600">+ Voce libera</button>
                  </div>
                )}
              </div>
              {data.manodopera_righe.length === 0 ? (
                <p className="text-xs text-slate-400">Nessuna manodopera. Aggiungi una voce (da tariffa o libera) se serve.</p>
              ) : (
                <div className="space-y-2">
                  {/* Il costo segue il prezzo finché sono uguali: con «costo || prezzo» restava la prima cifra digitata (1500 → costo 1). */}
                  {data.manodopera_righe.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input value={r.descrizione} onChange={(e) => aggiornaManodopera(idx, { descrizione: e.target.value })} placeholder="Descrizione" disabled={readOnlyMode} className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm" />
                      <input type="number" min={0} value={r.ore} onChange={(e) => aggiornaManodopera(idx, { ore: Number(e.target.value) })} title="Ore" disabled={readOnlyMode} className="w-16 rounded border border-slate-200 px-2 py-1 text-sm" />
                      <span className="text-xs text-slate-400">h ×</span>
                      <input type="number" min={0} value={r.tariffa_oraria_vendita} onChange={(e) => { const v = Number(e.target.value); aggiornaManodopera(idx, { tariffa_oraria_vendita: v, tariffa_oraria_netta: r.tariffa_oraria_netta === r.tariffa_oraria_vendita ? v : r.tariffa_oraria_netta }); }} title="€/h vendita" disabled={readOnlyMode} className="w-20 rounded border border-slate-200 px-2 py-1 text-sm" />
                      <span className="text-xs text-slate-400">€/h</span>
                      {!readOnlyMode && <button type="button" onClick={() => rimuoviManodopera(idx)} className="px-1 text-slate-400 hover:text-red-500" title="Rimuovi">✕</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SERVIZI E PRATICHE */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Servizi e pratiche</Label>
                {!readOnlyMode && (
                  <div className="flex items-center gap-2">
                    <Select value="" onValueChange={(v) => { const s = serviziCatalogo.find((x) => String(x.id) === v); if (s) aggiungiServizioDaCatalogo(s); }}>
                      <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue placeholder="+ Dal catalogo" /></SelectTrigger>
                      <SelectContent>
                        {serviziCatalogo.length === 0 && <SelectItem value="__none__" disabled>Catalogo servizi vuoto</SelectItem>}
                        {serviziCatalogo.map((s) => (
                          <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.descrizione ?? "Servizio")} — {Number(s.prezzo_netto_default ?? 0).toFixed(0)}€</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button type="button" onClick={aggiungiServizioLibero} className="text-xs font-semibold text-orange-600">+ Voce libera</button>
                  </div>
                )}
              </div>
              {data.servizi_righe.length === 0 ? (
                <p className="text-xs text-slate-400">Nessun servizio/pratica. Aggiungi dal tuo catalogo o come voce libera.</p>
              ) : (
                <div className="space-y-2">
                  {data.servizi_righe.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input value={r.descrizione} onChange={(e) => aggiornaServizio(idx, { descrizione: e.target.value })} placeholder="Descrizione servizio" disabled={readOnlyMode} className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm" />
                      <input type="number" min={0} value={r.prezzo_vendita} onChange={(e) => { const v = Number(e.target.value); aggiornaServizio(idx, { prezzo_vendita: v, prezzo_netto: r.prezzo_netto === r.prezzo_vendita ? v : r.prezzo_netto }); }} title="Prezzo vendita" disabled={readOnlyMode} className="w-24 rounded border border-slate-200 px-2 py-1 text-sm" />
                      <span className="text-xs text-slate-400">€</span>
                      {!readOnlyMode && <button type="button" onClick={() => rimuoviServizio(idx)} className="px-1 text-slate-400 hover:text-red-500" title="Rimuovi">✕</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.con_wallbox}
                  onChange={(e) => update("con_wallbox", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span>Wallbox (cross-sell auto elettrica)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.con_ottimizzatori}
                  onChange={(e) => update("con_ottimizzatori", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span>Ottimizzatori per ombreggiamento (PR +3%)</span>
              </label>
            </div>
          </div>
        </FvCard>
      </div>

      {/* ── Prezzo di vendita a corpo (config manuale, stile Reonic) ──────────
          Il commerciale compone l'impianto e poi può fissare un prezzo di
          vendita libero: quel valore diventa il prezzo finale (imponibile),
          sostituisce il totale calcolato e ignora lo sconto. Le righe restano
          per la scheda tecnica e per il costo/margine. */}
      {!data.kit_bundle_id && (
        <div className="mt-4">
          <FvCard title="Prezzo di vendita">
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
              <div>
                <Label htmlFor="fv-prezzo-manuale">Prezzo di vendita a corpo (imponibile, IVA esclusa)</Label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                  <Input
                    id="fv-prezzo-manuale"
                    key={`pvm-${data.prezzo_vendita_manuale ?? "auto"}`}
                    inputMode="decimal"
                    defaultValue={data.prezzo_vendita_manuale != null ? String(data.prezzo_vendita_manuale).replace(".", ",") : ""}
                    disabled={readOnlyMode}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      update("prezzo_vendita_manuale", raw === "" ? null : Math.max(0, parseDecimalIT(raw)));
                    }}
                    placeholder="Calcola dal listino"
                    className="pl-7"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Lascia vuoto per calcolare il prezzo da componenti, manodopera e servizi.
                  Se lo imposti, <strong>questo è il prezzo di vendita finale</strong>: sostituisce il
                  totale calcolato e ignora lo sconto commerciale. Pannello, inverter e accumulo restano
                  nella scheda tecnica e nel calcolo del margine.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                {data.prezzo_vendita_manuale != null && data.prezzo_vendita_manuale > 0 ? (
                  <>
                    <p className="text-xs text-slate-500">Chiavi in mano (IVA 10% inclusa)</p>
                    <p className="text-2xl font-extrabold text-slate-900">
                      {formatEur(Math.round(data.prezzo_vendita_manuale * 1.1))}
                    </p>
                    {!readOnlyMode && (
                      <button
                        type="button"
                        onClick={() => update("prezzo_vendita_manuale", null)}
                        className="mt-1 text-xs font-semibold text-orange-600 underline"
                      >
                        Torna al prezzo calcolato dal listino
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    Prezzo calcolato automaticamente da componenti, manodopera e servizi.
                    Il totale chiavi in mano è nella <strong>Fase 6</strong>.
                  </p>
                )}
              </div>
            </div>
          </FvCard>
        </div>
      )}

      {/* ── Sconto commerciale (Fase 5): scontistica + autorizzazione ──────────
          Non si mostra con un prezzo di vendita libero a corpo: quello è già il
          prezzo finale e bypassa lo sconto. */}
      {!(data.prezzo_vendita_manuale != null && data.prezzo_vendita_manuale > 0) && (
        <div className="mt-4">
          <FvScontoCard
            data={data}
            update={update}
            readOnlyMode={readOnlyMode}
            scenario={scenario}
            calcolando={calcolando}
            onRicalcola={onRicalcola}
          />
        </div>
      )}

      {/* ─── Prodotti extra dal listino ─────────────────────────────────────
          Ricerca live sull'INTERO listino generale (article_families): caldaia,
          clima, colonnina, … Le righe vengono salvate in fv_componenti_progetto
          con categoria='altro' insieme ai componenti principali e sommate
          automaticamente nel riepilogo economico dello Step 6. */}
      <div className="mt-4">
        <FvCard title="Prodotti extra dal listino (opzionale)">
          <p className="text-sm text-slate-600 mb-3">
            Aggiungi al preventivo altri prodotti del tuo listino (es. caldaia,
            climatizzatore, colonnina di ricarica). Vengono sommati al totale e
            compaiono nel riepilogo economico della Fase 6.
          </p>

          {!readOnlyMode && (
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Input
                  value={extraSearch}
                  onChange={(e) => setExtraSearch(e.target.value)}
                  placeholder="Cerca prodotto del listino da aggiungere…"
                />
                {extraSearch.trim() && (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {listinoExtra.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => aggiungiExtra(l)}
                        className="w-full text-left text-sm px-3 py-2 hover:bg-orange-50 flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0 truncate text-slate-700">{l.nome || l.descrizione}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {l.prezzo != null ? formatEur(l.prezzo) : "—"}
                        </span>
                      </button>
                    ))}
                    {listinoExtra.length >= 40 && (
                      <p className="px-3 py-1.5 text-[11px] text-slate-400">
                        Mostro i primi 40: scrivi di più per restringere.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => aggiungiExtraLibero(extraSearch)}
                      className="w-full text-left text-sm px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-500 border-t border-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span>Aggiungi "{extraSearch.trim()}" come prodotto libero</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => aggiungiExtraLibero()}
                className="shrink-0 flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-orange-400 hover:text-orange-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Prodotto libero
              </button>
            </div>
          )}

          {data.prodotti_extra.length === 0 ? (
            <p className="text-xs text-slate-400">Nessun prodotto extra aggiunto.</p>
          ) : (
            <div className="space-y-2">
              {data.prodotti_extra.map((ex, idx) => (
                <div
                  key={ex.uid ?? `extra-${idx}`}
                  className="grid grid-cols-12 gap-2 items-end rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-[11px] text-slate-500">Descrizione</Label>
                    <Input
                      value={ex.descrizione}
                      disabled={readOnlyMode}
                      onChange={(e) => aggiornaExtra(idx, { descrizione: e.target.value })}
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-[11px] text-slate-500">Quantità</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={ex.quantita}
                      disabled={readOnlyMode}
                      onChange={(e) =>
                        aggiornaExtra(idx, { quantita: Math.max(1, Math.round(Number(e.target.value) || 1)) })
                      }
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-[11px] text-slate-500">Vendita € (unit.)</Label>
                    <div className="flex gap-1 items-center">
                      <Input
                        key={`pv-${ex.uid ?? idx}-${ex.prezzo_vendita === 0 ? "gratis" : "paid"}`}
                        inputMode="decimal"
                        defaultValue={ex.prezzo_vendita === 0 ? "" : ex.prezzo_vendita || ""}
                        disabled={readOnlyMode}
                        onBlur={(e) => {
                          const v = Math.max(0, parseDecimalIT(e.target.value));
                          aggiornaExtra(idx, { prezzo_vendita: v });
                          // Campo non controllato: l'eco va scritta nel DOM,
                          // altrimenti resta a video il testo digitato e chi
                          // scrive "1.500" non vede mai cosa è stato capito.
                          e.target.value = v > 0 ? formatDecimalIT(v) : "";
                        }}
                        className="h-9 text-sm bg-white min-w-0"
                        placeholder={ex.prezzo_vendita === 0 ? "Gratis" : "0,00"}
                      />
                      {!readOnlyMode && (
                        <button
                          type="button"
                          title={ex.prezzo_vendita === 0 ? "Prodotto gratuito" : "Imposta come gratuito"}
                          onClick={() => aggiornaExtra(idx, { prezzo_vendita: 0 })}
                          className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
                            ex.prezzo_vendita === 0
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-400 hover:bg-green-50 hover:text-green-600"
                          }`}
                        >
                          Gratis
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-[11px] text-slate-500">Acquisto € (margine)</Label>
                    <Input
                      inputMode="decimal"
                      defaultValue={ex.prezzo_acquisto ?? ""}
                      disabled={readOnlyMode}
                      onBlur={(e) => {
                        const vuoto = e.target.value.trim() === "";
                        const v = vuoto ? null : Math.max(0, parseDecimalIT(e.target.value));
                        aggiornaExtra(idx, { prezzo_acquisto: v });
                        e.target.value = v != null && v > 0 ? formatDecimalIT(v) : "";
                      }}
                      className="h-9 text-sm bg-white"
                      placeholder="—"
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1 pb-1">
                    {!readOnlyMode && (
                      <button
                        type="button"
                        onClick={() => rimuoviExtra(idx)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        aria-label="Rimuovi prodotto extra"
                        title="Rimuovi"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="col-span-11 text-[11px] text-slate-500 -mt-1">
                    {ex.prezzo_vendita === 0
                      ? <span className="text-green-600 font-medium">Gratuito (incluso nel preventivo)</span>
                      : <>Totale riga: <strong>{formatEur((Number(ex.prezzo_vendita) || 0) * (ex.quantita || 1))}</strong></>
                    }
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500 text-right">
                Totale prodotti extra:{" "}
                <strong className="text-slate-700">
                  {formatEur(
                    data.prodotti_extra.reduce(
                      (s, ex) => s + (Number(ex.prezzo_vendita) || 0) * (ex.quantita || 1),
                      0,
                    ),
                  )}
                </strong>
              </p>
            </div>
          )}
        </FvCard>
      </div>
    </>
  );
}

// ============================================================================
// STEP 6 — ANTEPRIMA FINANZIARIA
// ============================================================================
/**
 * Indicator step-by-step durante calcolo finanziario.
 * Cicla 4 fasi ogni ~700ms per dare percezione di progresso (anche se il
 * calcolo è server-side e dura sempre lo stesso tempo).
 */
function FvCalcoloProgress() {
  const fasi = [
    "Energy flows: produzione, autoconsumo, ceduto rete…",
    "NPV 25 anni + IRR + payback…",
    "Sensitivity ±15% prezzo energia…",
    "What-if: auto elettrica + pompa di calore…",
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % fasi.length), 700);
    return () => clearInterval(t);
  }, [fasi.length]);
  return (
    <p className="text-sm text-slate-500 max-w-md mx-auto min-h-[1.5em] transition-opacity">
      {fasi[idx]}
    </p>
  );
}

/**
 * Sprint 4: Payment toggle (3 modalità). Replica del mockup HTML p.6 — invece
 * di mostrare solo "Cofidis 84m" hardcoded ora il cliente vede 3 opzioni
 * cliccabili (cash/rate/zero) e i KPI sotto si aggiornano live.
 */
function FvPaymentToggle({
  modalita,
  durata,
  topConsigliata,
  noleggioEnabled = true,
  onChange,
}: {
  modalita: "cash" | "rate" | "zero" | "noleggio";
  durata: number;
  topConsigliata: (FvTabellaFinanziamento & { rata: FvRigaFinanziamento }) | null;
  noleggioEnabled?: boolean;
  onChange: (m: "cash" | "rate" | "zero" | "noleggio") => void;
}) {
  const baseOpts: Array<{
    key: "cash" | "rate" | "zero" | "noleggio";
    icon: string;
    label: string;
    sub: string;
  }> = [
    { key: "cash", icon: "⚡", label: "Pagamento immediato", sub: "Cash · IVA 10%" },
    {
      key: "rate",
      icon: "€",
      label: "Rateale finanziato",
      sub: topConsigliata
        ? `${topConsigliata.finanziaria_nome ?? "Top"} · ${durata} mesi · TAEG ${topConsigliata.rata.taeg.toFixed(2)}%`
        : `${durata} mesi · finanziaria consigliata`,
    },
    { key: "zero", icon: "0", label: "Tasso zero", sub: `${durata} rate · 0% interessi` },
    { key: "noleggio", icon: "B2B", label: "Noleggio azienda", sub: "Zero anticipo · canone operativo" },
  ];
  const opts = noleggioEnabled
    ? baseOpts
    : baseOpts.filter((option) => option.key !== "noleggio");
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 mb-4">
      {opts.map((o) => {
        const active = o.key === modalita;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`p-3 rounded-lg flex flex-col items-center gap-1 text-center transition-all ${
              active
                ? "bg-white shadow-md text-slate-900 border-2 border-orange-500"
                : "bg-transparent text-slate-500 hover:bg-white/50 border-2 border-transparent"
            }`}
          >
            <span className="text-xl">{o.icon}</span>
            <span className="text-sm font-semibold">{o.label}</span>
            <span className={`text-[11px] ${active ? "text-orange-700" : "text-slate-400"}`}>
              {o.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModalitaPagamentoCard — schema di pagamento diretto (acconto / SAL / saldo),
// come negli altri preventivi. Le % delle tranche sommano a 100; gli importi €
// si ricalcolano sul prezzo di vendita IVA inclusa (l'ultima tranche assorbe
// l'arrotondamento per far quadrare il totale). Si affianca al finanziamento.
// ─────────────────────────────────────────────────────────────────────────────
function ModalitaPagamentoCard({
  data,
  update,
  investimento,
  modalita,
  rataPrestito,
  durataMesi,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  investimento: number;
  modalita: WizardData["finanziamento_modalita"];
  rataPrestito: number;
  durataMesi: number;
}) {
  const mp =
    data.modalita_pagamento ??
    INITIAL.modalita_pagamento ?? { tranche: [], note: null, anticipo_pct: 0 };

  const cardTitle = (
    <span className="inline-flex items-center gap-2">
      <Wallet className="h-4 w-4 text-orange-500" />
      Modalità di pagamento
    </span>
  );

  // Campo note condiviso da tutte le modalità.
  const noteField = (
    <div className="mt-4">
      <Label className="text-xs text-slate-600">
        Note / condizioni di pagamento (facoltative)
      </Label>
      <textarea
        value={mp.note ?? ""}
        onChange={(e) =>
          update("modalita_pagamento", { ...mp, note: e.target.value || null })
        }
        rows={2}
        placeholder="Es. Acconto tramite bonifico bancario. Saldo a collaudo e allaccio. IVA agevolata 10%."
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-y"
      />
    </div>
  );

  // ═══ NOLEGGIO operativo: zero anticipo, canone mensile ═══════════════════
  if (modalita === "noleggio") {
    return (
      <FvCard title={cardTitle} action={<FvChip variant="navy">Noleggio operativo</FvChip>} className="mt-4">
        <p className="text-xs text-slate-500 mb-3">
          Nel noleggio operativo il cliente <strong>non versa un anticipo</strong>:
          paga un canone mensile tutto incluso. Comparirà nel preventivo PDF.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center gap-x-10 gap-y-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Anticipo</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums">€ 0</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Canone mensile</div>
            <div className="text-lg font-bold text-orange-600 tabular-nums">
              {formatEur(rataPrestito)}<span className="text-sm font-medium text-slate-500">/mese</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Durata</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums">{durataMesi} mesi</div>
          </div>
        </div>
        {noteField}
      </FvCard>
    );
  }

  // ═══ FINANZIATO (rate / tasso zero): anticipo in contanti + resto a rate ══
  if (modalita === "rate" || modalita === "zero") {
    const anticipoPct = Math.max(0, Math.min(100, Number(mp.anticipo_pct) || 0));
    const anticipoEur = Math.round((investimento * anticipoPct) / 100);
    const finanziatoEur = Math.max(0, investimento - anticipoEur);
    // Rata sul capitale residuo: lineare nel capitale (esatto per ammortamento
    // alla francese a parità di TAN/durata e per il tasso zero).
    const rataScalata =
      investimento > 0 ? Math.round(rataPrestito * (finanziatoEur / investimento)) : 0;
    const setAnticipo = (v: number) =>
      update("modalita_pagamento", {
        ...mp,
        anticipo_pct: Math.max(0, Math.min(100, Math.round(v))),
      });
    return (
      <FvCard
        title={cardTitle}
        action={
          <FvChip variant={modalita === "zero" ? "purple" : "green"}>
            {modalita === "zero" ? "Tasso zero" : "Finanziato a rate"}
          </FvChip>
        }
        className="mt-4"
      >
        <p className="text-xs text-slate-500 mb-3">
          Con il finanziamento il cliente versa un <strong>anticipo in contanti</strong>{" "}
          alla firma e rateizza il resto. Imposta l'anticipo: la rata si ricalcola
          sul capitale residuo. Comparirà nel preventivo PDF.
        </p>

        {/* Anticipo: preset rapidi + input % */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium text-slate-600 mr-1">Anticipo alla firma:</span>
          {[0, 10, 20, 30].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAnticipo(p)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                anticipoPct === p
                  ? "border-orange-500 bg-orange-50 text-orange-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {p}%
            </button>
          ))}
          <div className="relative w-20">
            <Input
              type="number"
              min={0}
              max={100}
              value={anticipoPct}
              onChange={(e) => setAnticipo(Number(e.target.value) || 0)}
              className="h-8 text-sm pr-6 text-right tabular-nums"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
          </div>
        </div>

        {/* Riepilogo: anticipo + finanziato + rata */}
        <div className="grid sm:grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Anticipo alla firma</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums">{formatEur(anticipoEur)}</div>
            <div className="text-[11px] text-slate-400">{anticipoPct}% del totale</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Importo finanziato</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums">{formatEur(finanziatoEur)}</div>
            <div className="text-[11px] text-slate-400">resto rateizzato</div>
          </div>
          <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-orange-600">Rata mensile</div>
            <div className="text-lg font-bold text-orange-700 tabular-nums">
              {formatEur(rataScalata)}<span className="text-xs font-medium">/mese</span>
            </div>
            <div className="text-[11px] text-orange-600/80">
              {durataMesi} rate{anticipoPct > 0 ? ` · senza anticipo ${formatEur(rataPrestito)}` : ""}
            </div>
          </div>
        </div>

        <div className="mt-2 text-right text-sm font-bold text-slate-700 tabular-nums">
          Totale chiavi in mano · {formatEur(investimento)}
        </div>

        {noteField}
      </FvCard>
    );
  }

  // ═══ CASH (pagamento immediato): acconto / SAL / saldo ════════════════════
  const tranche = mp.tranche;
  const sommaPct = tranche.reduce((s, t) => s + (Number(t.pct) || 0), 0);
  const sumOk = Math.abs(sommaPct - 100) < 0.01;

  // Importi € per tranche: arrotonda al singolo €; se le % quadrano, l'ultima
  // tranche assorbe la differenza così la somma è esattamente l'investimento.
  const importi: number[] = (() => {
    if (investimento <= 0) return tranche.map(() => 0);
    const arr = tranche.map((t) =>
      Math.round((investimento * (Number(t.pct) || 0)) / 100),
    );
    if (sumOk && arr.length > 0) {
      arr[arr.length - 1] += investimento - arr.reduce((s, v) => s + v, 0);
    }
    return arr;
  })();

  const setTranche = (next: Array<{ label: string; pct: number }>) =>
    update("modalita_pagamento", { ...mp, tranche: next });
  const updateRow = (i: number, patch: Partial<{ label: string; pct: number }>) =>
    setTranche(tranche.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const removeRow = (i: number) =>
    setTranche(tranche.filter((_, idx) => idx !== i));
  const addRow = () =>
    setTranche([...tranche, { label: "Nuova tranche", pct: 0 }]);

  const activePreset = PAGAMENTO_PRESETS.find(
    (p) => JSON.stringify(p.tranche) === JSON.stringify(tranche),
  )?.id;

  return (
    <FvCard
      title={
        <span className="inline-flex items-center gap-2">
          <Wallet className="h-4 w-4 text-orange-500" />
          Modalità di pagamento
        </span>
      }
      action={
        <FvChip variant={sumOk ? "green" : "yellow"}>
          {sumOk ? "✓ Totale 100%" : `⚠ Totale ${sommaPct.toFixed(0)}%`}
        </FvChip>
      }
      className="mt-4"
    >
      <p className="text-xs text-slate-500 mb-3">
        Pagamento immediato: come il cliente salda l'importo in contanti
        (acconto, stati di avanzamento, saldo). Comparirà nel preventivo PDF.
        Per rateizzare scegli "Rateale finanziato" qui sopra.
      </p>

      {/* Preset rapidi */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PAGAMENTO_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setTranche(p.tranche.map((t) => ({ ...t })))}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
              activePreset === p.id
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Righe tranche */}
      <div className="space-y-2">
        {tranche.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={t.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
              placeholder="Es. Acconto alla firma"
              className="flex-1 h-9 text-sm"
            />
            <div className="relative w-20 shrink-0">
              <Input
                type="number"
                min={0}
                max={100}
                value={Number.isFinite(t.pct) ? t.pct : 0}
                onChange={(e) =>
                  updateRow(i, {
                    pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
                className="h-9 text-sm pr-6 text-right tabular-nums"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                %
              </span>
            </div>
            <div className="w-28 shrink-0 text-right text-sm font-semibold text-slate-800 tabular-nums">
              {formatEur(importi[i] ?? 0)}
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={tranche.length <= 1}
              aria-label="Rimuovi tranche"
              className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Aggiungi + totale */}
      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-orange-400 hover:text-orange-600"
        >
          <Plus className="h-3.5 w-3.5" />
          Aggiungi tranche
        </button>
        <div
          className={`text-sm font-bold tabular-nums ${
            sumOk ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          Totale {sommaPct.toFixed(0)}% · {formatEur(investimento)}
        </div>
      </div>

      {!sumOk && (
        <p className="text-[11px] text-amber-600 mt-1.5">
          La somma delle percentuali deve essere 100% perché gli importi
          quadrino col totale.
        </p>
      )}

      {noteField}
    </FvCard>
  );
}

function Step6Finanziario({
  data,
  update,
  scenario,
  calcolando,
  error,
  tabelleFinanziamento,
  topFinanziamenti,
  fvTemplate,
  onRicalcola,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  scenario: Record<string, unknown> | null;
  calcolando: boolean;
  error: string | null;
  tabelleFinanziamento: FvTabellaFinanziamento[];
  topFinanziamenti: Array<FvTabellaFinanziamento & { rata: FvRigaFinanziamento }>;
  fvTemplate: Record<string, unknown> | null | undefined;
  onRicalcola: () => void;
}) {
  // Confronto varianti (gap vs Reonic/Autarc): profili autoconsumo per stimare
  // il delta delle varianti con/senza accumulo. Hook prima di ogni early-return.
  const { data: profiliAutoconsumo } = useProfiliAutoconsumo();

  if (calcolando) {
    return (
      <FvCard>
        <div className="py-12 text-center space-y-3">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-orange-500" />
          <p className="font-semibold text-slate-900">Sto calcolando il tuo scenario finanziario…</p>
          {/* Fix #18 Sprint 3: progress indicator step-by-step (cycling) */}
          <FvCalcoloProgress />
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-3">
            Tipicamente 2-5 secondi. Se richiede più di 30 secondi prova "Ricalcola".
          </p>
        </div>
      </FvCard>
    );
  }

  if (error || !scenario) {
    return (
      <FvCard title="Calcolo finanziario">
        <FvCallout variant="error" title={error ? "Calcolo non riuscito" : "Nessun calcolo eseguito"}>
          {error ?? "Premi ricalcola per generare lo scenario finanziario completo (NPV, IRR, sensitivity, what-if)."}
        </FvCallout>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onRicalcola}
            className="px-5 py-2.5 text-sm font-bold rounded-lg text-white bg-gradient-to-br from-orange-500 to-amber-400 shadow-md hover:shadow-lg transition-all inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {error ? "Riprova calcolo" : "Calcola scenario"}
          </button>
        </div>
      </FvCard>
    );
  }

  const sens_minus15 = scenario.sensitivity_minus15 as { payback_anni: number | null; npv: number };
  const sens_plus15 = scenario.sensitivity_plus15 as { payback_anni: number | null; npv: number };
  const auto_ev = scenario.scenario_auto_elettrica as {
    payback_anni: number | null;
    npv: number;
    autoconsumo: number;
  };
  const pdc = scenario.scenario_pompa_calore as { payback_anni: number | null; npv: number };
  const incentivi =
    (scenario.incentivi as Array<{
      codice: string;
      nome: string;
      importo_eur: number | null;
    }>) ?? [];
  const costi = scenario.costi as {
    costo_totale_netto?: number;
    prezzo_pieno_netto?: number;
    sconto_eur_applicato?: number;
    sconto_limitato?: boolean;
    prezzo_vendita_netto?: number;
    prezzo_vendita_iva_inclusa: number;
    margine_eur?: number;
    margine_pct?: number;
  };

  const investimento = costi?.prezzo_vendita_iva_inclusa ?? 0;

  const risparmioAnno1 =
    (scenario.risparmio_bolletta_eur as number) + (scenario.ricavi_rid_eur as number);
  const risparmio25Anni = scenario.risparmio_totale_25_anni as number;
  const cassaAnni =
    (scenario.cassa_anno_per_anno as Array<{ anno: number; cumulato: number }>) ?? [];
  const detrazione10anni = ((scenario.detrazione_anno_eur as number) ?? 0) * 10;
  const costoNettoReale = investimento - detrazione10anni;
  const risparmioMensile = Math.round(risparmioAnno1 / 12);
  const noleggioScenario = calcolaFvNoleggioOperativo({
    archetipo: data.archetipo,
    investimentoNetto:
      costi?.prezzo_vendita_netto ??
      (costi?.prezzo_vendita_iva_inclusa ? Math.round(costi.prezzo_vendita_iva_inclusa / 1.1) : 0),
    risparmioAnno1,
    durataMesi: data.durata_mesi_scelta ?? Number(fvTemplate?.noleggio_durata_default_mesi ?? 84),
    manutenzioneAnnua: Number(fvTemplate?.manutenzione_annua_eur ?? 0),
    aliquotaRisparmioFiscale: Number(fvTemplate?.noleggio_aliquota_fiscale_pct ?? 0.24),
    fattoreCanone:
      fvTemplate?.noleggio_fattore_default == null
        ? null
        : Number(fvTemplate.noleggio_fattore_default),
  });

  // Sprint 4: calcolo rata REALE basato sul finanziamento scelto dall'utente.
  // - cash: nessuna rata (pagamento immediato)
  // - rate: lookup tabella finanziamento scelta (o suggerita top 1)
  // - zero: investimento diviso durata (TAEG 0)
  const tabellaScelta = data.tabella_finanziamento_id
    ? tabelleFinanziamento.find((t) => t.id === data.tabella_finanziamento_id) ?? null
    : null;
  const topAuto = topFinanziamenti[0] ?? null;
  let rataMensilePrestito: number;
  let rataInfoLabel: string;
  // taegInfoPct riservato per uso futuro (validazione antiusura UI)
  let _taegInfoPct: number | null = null;
  let durataInfoMesi = 0;
  if (data.finanziamento_modalita === "cash") {
    rataMensilePrestito = 0;
    rataInfoLabel = "Pagamento immediato";
  } else if (data.finanziamento_modalita === "zero") {
    const dur = data.durata_mesi_scelta ?? 60;
    rataMensilePrestito = Math.round(investimento / dur);
    durataInfoMesi = dur;
    _taegInfoPct = 0;
    rataInfoLabel = `Tasso 0% · ${dur} mesi`;
  } else if (data.finanziamento_modalita === "noleggio") {
    rataMensilePrestito = noleggioScenario.canone_mensile;
    durataInfoMesi = noleggioScenario.durata_mesi;
    _taegInfoPct = 0;
    rataInfoLabel = noleggioScenario.eligible
      ? `Noleggio operativo · ${noleggioScenario.durata_mesi} mesi · manutenzione inclusa`
      : "Disponibile per aziende, condomini e CER";
  } else {
    // rate
    const dur = data.durata_mesi_scelta ?? 84;
    durataInfoMesi = dur;
    if (tabellaScelta) {
      // Cerco la rata della tabella selezionata via topFinanziamenti (best-fit)
      const tabRata = topFinanziamenti.find((t) => t.id === tabellaScelta.id)?.rata;
      if (tabRata) {
        rataMensilePrestito = tabRata.importo_rata;
        _taegInfoPct = tabRata.taeg;
        rataInfoLabel = `${tabellaScelta.finanziaria_nome ?? ""} · ${dur} mesi · TAEG ${tabRata.taeg.toFixed(2)}%`;
      } else {
        rataMensilePrestito = Math.round((investimento * 1.2) / dur);
        rataInfoLabel = `${tabellaScelta.finanziaria_nome ?? ""} · ${dur} mesi (stima)`;
      }
    } else if (topAuto) {
      rataMensilePrestito = topAuto.rata.importo_rata;
      _taegInfoPct = topAuto.rata.taeg;
      rataInfoLabel = `${topAuto.finanziaria_nome ?? ""} · ${dur} mesi · TAEG ${topAuto.rata.taeg.toFixed(2)}% (top consigliata)`;
    } else {
      rataMensilePrestito = Math.round((investimento * 1.2) / dur);
      rataInfoLabel = `${dur} mesi · stima generica`;
    }
  }
  const costoNettoMensile =
    data.finanziamento_modalita === "noleggio"
      ? noleggioScenario.costo_effettivo_mensile
      : Math.max(0, rataMensilePrestito - risparmioMensile);
  const templateMarginTarget = Number(fvTemplate?.margine_target_pct ?? 0.35);
  const templateCplMax = Number(fvTemplate?.cpl_max_sostenibile ?? 120);
  const economicsGuard = calcolaFvEconomicsGuard({
    prezzo_vendita_netto: costi?.prezzo_vendita_netto ?? null,
    costo_totale_netto: costi?.costo_totale_netto ?? null,
    margine_eur: costi?.margine_eur ?? null,
    margine_pct: costi?.margine_pct ?? null,
    margine_target_pct: Number.isFinite(templateMarginTarget) ? templateMarginTarget : 0.35,
    cpl_max_sostenibile: Number.isFinite(templateCplMax) ? templateCplMax : 120,
    payback_anni: (scenario.payback_anni as number | null) ?? null,
    rata_mensile_eur: rataMensilePrestito,
    risparmio_mensile_eur:
      data.finanziamento_modalita === "noleggio"
        ? risparmioMensile + noleggioScenario.beneficio_fiscale_mensile
        : risparmioMensile,
  });
  const economicsVariant =
    economicsGuard.status === "blocked"
      ? "error"
      : economicsGuard.status === "review"
        ? "warn"
        : "success";
  const economicsTitle =
    economicsGuard.status === "blocked"
      ? "Offerta non scalabile ancora"
      : economicsGuard.status === "review"
        ? "Economia da rivedere"
        : "Economia pronta per vendita e campagne";

  // ─── Confronto varianti (stima indicativa client-side) ────────────────────
  const profiloRow =
    (profiliAutoconsumo ?? []).find((p) => p.codice === data.profilo_consumo) ?? null;
  const produzioneAnnua = (scenario.produzione_annua_kwh as number) ?? 0;
  const ctxVarianti: ContestoVariantiVicine | null =
    data.potenza_kwp > 0 && investimento > 0 && produzioneAnnua > 0
      ? {
          potenza_kwp: data.potenza_kwp,
          investimento_eur: investimento,
          produzione_anno_1_kwh: produzioneAnnua,
          autoconsumo_pct: (scenario.autoconsumo_pct as number) ?? 0,
          consumo_annuo_kwh: data.consumo_annuo_kwh ?? 0,
          costo_kwh_attuale: (scenario.costo_kwh_attuale as number) ?? 0.32,
          prezzo_rid_kwh: (scenario.prezzo_rid_eur_kwh as number) ?? 0.1,
          detrazione_annua_eur: (scenario.detrazione_anno_eur as number) ?? 0,
          con_accumulo: data.con_accumulo,
          capacita_accumulo_kwh: data.capacita_accumulo_kwh,
          costo_kwp_base: Number(fvTemplate?.costo_kwp_base ?? 0),
          costo_accumulo_kwh: Number(fvTemplate?.costo_accumulo_kwh ?? 0),
          profilo: profiloRow
            ? {
                autoconsumo_no_accumulo: profiloRow.autoconsumo_no_accumulo,
                autoconsumo_accumulo_5kwh: profiloRow.autoconsumo_accumulo_5kwh,
                autoconsumo_accumulo_10kwh: profiloRow.autoconsumo_accumulo_10kwh,
                autoconsumo_accumulo_15kwh: profiloRow.autoconsumo_accumulo_15kwh,
              }
            : null,
        }
      : null;
  const baseSimulatore = ctxVarianti ? inputBaseDaContesto(ctxVarianti) : null;

  return (
    <>
      <FvPanelTitle
        step={6}
        totalSteps={TOTAL_STEPS}
        title="Anteprima finanziaria per il cliente"
        subtitle={
          <>
            Quello che vedrà il cliente nel preventivo PDF. Cambia modalità di pagamento per simulare gli scenari finanziari.
          </>
        }
      />

      {/* Sprint 4: Payment toggle modalità pagamento (cash / rate / zero) */}
      <FvPaymentToggle
        modalita={data.finanziamento_modalita}
        durata={data.durata_mesi_scelta ?? 84}
        topConsigliata={topAuto}
        noleggioEnabled={fvTemplate?.noleggio_operativo_attivo !== false}
        onChange={(modalita) => update("finanziamento_modalita", modalita)}
      />

      {/* MP: schema di pagamento diretto (acconto / SAL / saldo) — come gli altri preventivi */}
      <ModalitaPagamentoCard
        data={data}
        update={update}
        investimento={investimento}
        modalita={data.finanziamento_modalita}
        rataPrestito={rataMensilePrestito}
        durataMesi={durataInfoMesi || (data.durata_mesi_scelta ?? 84)}
      />

      <div className="mb-4">
        <FvCallout
          variant={economicsVariant}
          title={economicsTitle}
          action={
            <FvChip
              variant={
                economicsGuard.status === "ready"
                  ? "green"
                  : economicsGuard.status === "review"
                    ? "yellow"
                    : "red"
              }
            >
              {economicsGuard.score}/100
            </FvChip>
          }
        >
          <div className="space-y-3">
            <p>{economicsGuard.nextAction}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div className="rounded-md bg-white/70 p-2">
                <div className="text-slate-500">Margine reale</div>
                <div className="font-bold text-slate-900">
                  {economicsGuard.metrics.margine_pct != null
                    ? `${(economicsGuard.metrics.margine_pct * 100).toFixed(1)}%`
                    : "—"}
                  {economicsGuard.metrics.margine_target_pct != null && (
                    <span className="font-medium text-slate-500">
                      {" "}
                      / target {(economicsGuard.metrics.margine_target_pct * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-md bg-white/70 p-2">
                <div className="text-slate-500">Margine lordo</div>
                <div className="font-bold text-slate-900">
                  {economicsGuard.metrics.margine_eur != null
                    ? formatEur(economicsGuard.metrics.margine_eur)
                    : "—"}
                </div>
              </div>
              <div className="rounded-md bg-white/70 p-2">
                <div className="text-slate-500">CPL massimo</div>
                <div className="font-bold text-slate-900">
                  {economicsGuard.metrics.cpl_max_sostenibile != null
                    ? formatEur(economicsGuard.metrics.cpl_max_sostenibile)
                    : "—"}
                </div>
              </div>
              <div className="rounded-md bg-white/70 p-2">
                <div className="text-slate-500">Rata meno risparmio</div>
                <div className="font-bold text-slate-900">
                  {economicsGuard.metrics.costo_netto_mensile != null
                    ? `${formatEur(economicsGuard.metrics.costo_netto_mensile)}/mese`
                    : "—"}
                </div>
              </div>
            </div>
            {economicsGuard.issues.length > 0 && (
              <ul className="grid gap-1 text-xs md:grid-cols-2">
                {economicsGuard.issues.slice(0, 6).map((issue) => (
                  <li key={issue.code} className="rounded-md bg-white/60 px-2 py-1">
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FvCallout>
      </div>

      {/* Confronto varianti — affianca configurazioni alternative (gap vs Reonic/Autarc) */}
      <FvConfrontoVarianti ctx={ctxVarianti} className="mb-4" />

      {/* Simulatore interattivo — il cliente muove i parametri e vede i numeri live */}
      {baseSimulatore && (
        <FvSimulatoreInterattivo
          base={baseSimulatore}
          potenzaKwp={data.potenza_kwp}
          conAccumulo={data.con_accumulo}
          className="mb-4"
        />
      )}

      {/* HERO */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8 text-white shadow-xl mb-4"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}
      >
        <div
          className="absolute -top-1/2 -right-10 w-3/5 h-[200%] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 60%)",
          }}
        />
        <div className="absolute right-8 top-8 text-7xl opacity-10 select-none" aria-hidden>
          ☀
        </div>
        <div className="relative">
          <div className="text-xs uppercase tracking-widest font-semibold mb-2 text-orange-200">
            ★ L'INVESTIMENTO
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-3 max-w-[80%]">
            Il tuo impianto fotovoltaico in 25 anni
          </h2>
          <div className="flex flex-wrap items-baseline gap-6 sm:gap-8 mt-4">
            <span
              className="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-none tracking-tight"
              style={{
                color: "#F97316",
                textShadow: "0 4px 24px rgba(249,115,22,0.4)",
              }}
            >
              {formatEur(risparmio25Anni)}
            </span>
            <div className="text-sm space-y-1.5 max-w-xs">
              <div>guadagno netto in 25 anni vs senza FV</div>
              <div>
                Investimento:{" "}
                <strong className="text-orange-200">{formatEur(investimento)}</strong>
              </div>
              <div>
                Detrazione IRPEF:{" "}
                <strong className="text-orange-200">
                  {formatEur(detrazione10anni)}
                </strong>{" "}
                in 10 anni
              </div>
              <div>
                Costo netto effettivo:{" "}
                <strong className="text-orange-200">{formatEur(costoNettoReale)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 KPI HERO */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <FvKpi label="Investimento" value={formatEur(investimento)} />
        <FvKpi label="Risparmio anno 1" value={formatEur(risparmioAnno1)} variant="green" />
        <FvKpi
          label="Payback"
          value={(scenario.payback_anni as number | null) ?? "—"}
          unit="anni"
          variant="orange"
        />
        <FvKpi label="Risparmio 25 anni" value={formatEur(risparmio25Anni)} variant="green" />
      </div>

      {/* 3 NUM CARDS — Rata vs Risparmio vs Costo netto reale (Sprint 4: rata REALE) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-5 text-center transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <div className="text-xs uppercase tracking-wider font-semibold text-blue-900 mb-1.5">
            {data.finanziamento_modalita === "cash"
              ? "Pagamento cash"
              : data.finanziamento_modalita === "zero"
                ? "Rata mensile (tasso 0%)"
                : data.finanziamento_modalita === "noleggio"
                  ? "Canone operativo"
                  : "Rata mensile finanziata"}
          </div>
          <div className="text-3xl font-extrabold text-blue-900 tabular-nums">
            {formatEur(rataMensilePrestito)}
          </div>
          <div className="text-xs text-blue-700 mt-1 truncate" title={rataInfoLabel}>
            {rataInfoLabel || `×${durataInfoMesi || 84} mesi`}
          </div>
        </div>
        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-5 text-center transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <div className="text-xs uppercase tracking-wider font-semibold text-emerald-900 mb-1.5">
            Risparmio bolletta
          </div>
          <div className="text-3xl font-extrabold text-emerald-700 tabular-nums">
            {formatEur(risparmioMensile)}
          </div>
          <div className="text-xs text-emerald-700 mt-1">ogni mese, primo anno</div>
        </div>
        <div className="rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-orange-200 p-5 text-center relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <div className="absolute top-2 right-2 bg-white text-orange-700 text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider">
            ★ COSTO REALE
          </div>
          <div className="text-xs uppercase tracking-wider font-semibold text-orange-900 mb-1.5">
            Costo netto reale
          </div>
          <div className="text-4xl font-extrabold tabular-nums text-orange-700 animate-fv-pulse-scale">
            {formatEur(costoNettoMensile)}
          </div>
          <div className="text-xs text-orange-800 mt-1">
            /mese · dopo risparmio{data.finanziamento_modalita === "noleggio" ? " e beneficio fiscale" : ""}
          </div>
        </div>
      </div>

      {/* Grafico cassa cumulata */}
      {cassaAnni.length > 0 && (
        <FvCard
          title="Cassa cumulata 25 anni"
          action={
            <div className="flex gap-2">
              <FvChip variant="green">★ Breakeven anno {(scenario.payback_anni as number | null) ?? "—"}</FvChip>
              <FvChip variant="orange">{formatEur(risparmio25Anni)} a fine vita</FvChip>
            </div>
          }
        >
          <CassaCumulataChart cassa={cassaAnni} payback={scenario.payback_anni as number | null} />
        </FvCard>
      )}

      {/* 13/7: callout capienza IRPEF rimosso su richiesta — la verifica di
          capienza è tema da commercialista del cliente, non entriamo nel merito. */}

      {/* Sensitivity */}
      <FvCard title="Cosa succede se cambia il prezzo dell'energia" className="mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ScenarioBox
            label="Pessimistico (-15%)"
            payback={sens_minus15?.payback_anni}
            npv={sens_minus15?.npv}
            icon={<TrendingDown className="h-4 w-4 text-red-600" />}
          />
          <ScenarioBox
            label="Base"
            payback={scenario.payback_anni as number | null}
            npv={scenario.npv_25_anni as number}
            icon={<Award className="h-4 w-4 text-amber-500" />}
            highlight
          />
          <ScenarioBox
            label="Ottimistico (+15%)"
            payback={sens_plus15?.payback_anni}
            npv={sens_plus15?.npv}
            icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          />
        </div>
      </FvCard>

      {/* What-if scenari */}
      <FvCard title="Se tra 2-3 anni…" className="mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ScenarioBox
            label="…compri auto elettrica"
            payback={auto_ev?.payback_anni}
            npv={auto_ev?.npv}
            subtitle={`autoconsumo ${(auto_ev?.autoconsumo * 100 || 0).toFixed(0)}%`}
          />
          <ScenarioBox
            label="…installi pompa calore"
            payback={pdc?.payback_anni}
            npv={pdc?.npv}
            subtitle="sostituisci caldaia gas"
          />
        </div>
      </FvCard>

      {/* Incentivi applicati */}
      {incentivi.length > 0 && (
        <FvCard title="Incentivi che ti spettano" className="mt-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {incentivi.map((inc) => (
              <div
                key={inc.codice}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="font-semibold text-sm text-slate-900">{inc.nome}</div>
                <div className="text-xl font-bold mt-1 text-orange-600 tabular-nums">
                  {inc.importo_eur != null ? formatEur(inc.importo_eur) : "Disponibile"}
                </div>
              </div>
            ))}
          </div>
        </FvCard>
      )}

      {data.finanziamento_modalita === "noleggio" && (
        <FvCard
          title="Noleggio operativo fotovoltaico per aziende"
          action={
            <FvChip
              variant={
                noleggioScenario.status === "recommended"
                  ? "green"
                  : noleggioScenario.status === "review"
                    ? "yellow"
                    : "red"
              }
            >
              {noleggioScenario.eligible ? "B2B" : "Non adatto"}
            </FvChip>
          }
          className="mt-4"
        >
          {!noleggioScenario.eligible ? (
            <FvCallout variant="warn" title="Scenario pensato per aziende">
              {noleggioScenario.nextAction}
            </FvCallout>
          ) : (
            <div className="space-y-4">
              <FvCallout
                variant={
                  noleggioScenario.status === "recommended"
                    ? "success"
                    : noleggioScenario.status === "review"
                      ? "warn"
                      : "error"
                }
                title={
                  noleggioScenario.status === "recommended"
                    ? "Canone sostenibile per proposta B2B"
                    : "Verifica sostenibilità del canone"
                }
              >
                {noleggioScenario.nextAction}
              </FvCallout>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 border p-3">
                  <div className="text-xs text-slate-500">Anticipo</div>
                  <div className="font-extrabold text-slate-900">{formatEur(noleggioScenario.anticipo_eur)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border p-3">
                  <div className="text-xs text-slate-500">Canone</div>
                  <div className="font-extrabold text-slate-900">{formatEur(noleggioScenario.canone_mensile)}/mese</div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <div className="text-xs text-emerald-700">Risparmio energia</div>
                  <div className="font-extrabold text-emerald-800">{formatEur(noleggioScenario.risparmio_mensile)}/mese</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="text-xs text-blue-700">Beneficio fiscale stimato</div>
                  <div className="font-extrabold text-blue-800">{formatEur(noleggioScenario.beneficio_fiscale_mensile)}/mese</div>
                </div>
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                  <div className="text-xs text-orange-700">Costo effettivo</div>
                  <div className="font-extrabold text-orange-800">{formatEur(noleggioScenario.costo_effettivo_mensile)}/mese</div>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-2 text-xs text-slate-600">
                <div className="rounded-md bg-white border p-2">
                  Durata: <strong>{noleggioScenario.durata_mesi} mesi</strong>
                </div>
                <div className="rounded-md bg-white border p-2">
                  Manutenzione inclusa stimata:{" "}
                  <strong>{formatEur(noleggioScenario.manutenzione_inclusa_mensile)}/mese</strong>
                </div>
                <div className="rounded-md bg-white border p-2">
                  Copertura canone: <strong>{(noleggioScenario.copertura_canone_pct * 100).toFixed(0)}%</strong>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Stima commerciale: deducibilita e trattamento fiscale vanno confermati con consulente e contratto del provider.
              </p>
            </div>
          )}
        </FvCard>
      )}

      {/* Sprint 4: Modalità rateale dettagli + confronto top 3 finanziarie */}
      {data.finanziamento_modalita === "rate" && (
        <FvCard
          title="Modalità rateale — dettagli e confronto"
          action={
            tabelleFinanziamento.length > 0 ? (
              <FvChip variant="green">✓ Configurato in Impostazioni Azienda</FvChip>
            ) : (
              <FvChip variant="yellow">⚠ Nessuna tabella attiva</FvChip>
            )
          }
          className="mt-4"
        >
          {tabelleFinanziamento.length === 0 ? (
            <FvCallout variant="warn">
              <strong>Nessuna tabella finanziamento attiva</strong> per l'importo{" "}
              {formatEur(investimento)}. L'amministratore può caricare nuove tabelle in{" "}
              <em>Impostazioni → Finanziamenti</em>.
            </FvCallout>
          ) : (
            <>
              {/* Dropdown durata + finanziaria scelta */}
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <Label>Durata finanziamento</Label>
                  <Select
                    value={String(data.durata_mesi_scelta ?? 84)}
                    onValueChange={(v) => update("durata_mesi_scelta", Number(v))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {/* Durate disponibili da unione di tutte le tabelle */}
                      {Array.from(
                        new Set(
                          tabelleFinanziamento.flatMap((t) => t.durate_disponibili),
                        ),
                      )
                        .sort((a, b) => a - b)
                        .map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} mesi ({(d / 12).toFixed(0)} anni)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Finanziaria scelta</Label>
                  <Select
                    value={data.tabella_finanziamento_id ?? "__top__"}
                    onValueChange={(v) =>
                      update("tabella_finanziamento_id", v === "__top__" ? null : v)
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__top__">
                        ★ Top consigliata (best TAEG)
                      </SelectItem>
                      {tabelleFinanziamento.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.finanziaria_nome ?? "—"} · {t.nome_prodotto}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Confronto top 3 con badge "consigliata" */}
              {topFinanziamenti.length > 0 && (
                <div className="space-y-2 mb-3">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Confronto top {topFinanziamenti.length} per importo {formatEur(investimento)} ×{" "}
                    {data.durata_mesi_scelta ?? 84} mesi
                  </div>
                  {topFinanziamenti.map((t, i) => {
                    const isSelected =
                      (!data.tabella_finanziamento_id && i === 0) ||
                      data.tabella_finanziamento_id === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`rounded-xl p-3 border-2 transition-all relative ${
                          isSelected
                            ? "border-orange-500 bg-orange-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        {i === 0 && (
                          <span className="absolute -top-2 right-3 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            ★ Consigliata
                          </span>
                        )}
                        <div className="flex justify-between items-center">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 text-sm">
                              {t.finanziaria_nome ?? "—"} · {t.nome_prodotto}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {t.rata.durata_mesi} mesi · TAEG{" "}
                              <strong>{t.rata.taeg.toFixed(2)}%</strong> · TAN{" "}
                              {t.rata.tan.toFixed(2)}%
                              {t.rata.spese_istruttoria
                                ? ` · spese istruttoria ${formatEur(t.rata.spese_istruttoria)}`
                                : ""}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <div className="text-2xl font-extrabold text-orange-600 tabular-nums">
                              {formatEur(t.rata.importo_rata)}
                            </div>
                            <div className="text-[11px] text-slate-500">/mese</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Riepilogo costo del credito */}
              {(() => {
                const ratiData = topFinanziamenti.find(
                  (t) => t.id === (data.tabella_finanziamento_id ?? topFinanziamenti[0]?.id),
                );
                if (!ratiData) return null;
                const r = ratiData.rata;
                return (
                  <div className="border-t border-slate-200 pt-3 mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr>
                          <td className="text-slate-600 py-1">Importo finanziato</td>
                          <td className="text-right font-semibold tabular-nums">
                            {formatEur(r.importo_erogato)}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-slate-600 py-1">Numero rate</td>
                          <td className="text-right font-semibold tabular-nums">
                            {r.numero_rate} mensili
                          </td>
                        </tr>
                        <tr>
                          <td className="text-slate-600 py-1">Importo rata</td>
                          <td className="text-right font-bold text-orange-600 tabular-nums">
                            {formatEur(r.importo_rata)}/mese
                          </td>
                        </tr>
                        <tr>
                          <td className="text-slate-600 py-1">Totale dovuto</td>
                          <td className="text-right font-semibold tabular-nums">
                            {formatEur(r.importo_totale_dovuto)}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-slate-600 py-1">Costo del credito</td>
                          <td className="text-right font-semibold tabular-nums text-slate-700">
                            {formatEur(r.interessi_cliente ?? r.importo_totale_dovuto - r.importo_erogato)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <FvCallout variant="info" >
                Calcolato dal <strong>modulo Finanziamenti EiC</strong> con tabelle reali. Il
                TAEG include spese istruttoria. Validato server-side contro le soglie ARERA
                antiusura.
              </FvCallout>
            </>
          )}
        </FvCard>
      )}

      {/* Sezione narrativa */}
      <div
        className="rounded-2xl p-6 sm:p-7 border-2 border-orange-300 mt-4"
        style={{
          background: "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 50%, #FECACA 100%)",
        }}
      >
        <div className="text-center mb-5">
          <div className="inline-block bg-white text-orange-700 px-4 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3">
            ★ Perché farlo ADESSO
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-2 leading-tight">
            Negli ultimi 10 anni le bollette sono salite del{" "}
            <span className="text-orange-600">+240%</span>
          </h2>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
            Il tuo stipendio? Solo <span className="text-red-600">+11,5%</span>
          </h2>
          <p className="text-sm text-slate-700 mt-3 max-w-xl mx-auto">
            Dati Codacons + ISTAT. La differenza è una mazzata che peggiora ogni anno. Il fotovoltaico è
            l'unico modo concreto per <strong>uscire da questa forbice</strong>.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            {
              val: "+240%",
              lbl: "Bolletta luce",
              sub: "2012 → 2022 · Codacons",
              color: "text-red-600",
            },
            {
              val: "+107%",
              lbl: "In soli 5 anni",
              sub: "2019 → 2024 · Confcommercio",
              color: "text-orange-600",
            },
            {
              val: "+11,5%",
              lbl: "Reddito famiglie",
              sub: "Stesso periodo · ISTAT",
              color: "text-slate-500",
            },
          ].map((k) => (
            <div
              key={k.lbl}
              className="bg-white rounded-xl p-4 text-center shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <div className={`text-4xl font-extrabold leading-none ${k.color}`}>{k.val}</div>
              <div className="text-xs font-bold text-slate-900 mt-2 uppercase tracking-wide">
                {k.lbl}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">{k.sub}</div>
            </div>
          ))}
        </div>
        <div
          className="rounded-xl p-5 text-center text-white relative overflow-hidden"
          style={{ background: "#1E3A5F" }}
        >
          <div
            className="absolute -top-1/3 -right-10 w-1/2 h-[160%] pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(249,115,22,0.2) 0%, transparent 60%)",
            }}
          />
          <div className="relative text-base sm:text-lg font-bold leading-relaxed">
            {(() => {
              // Proiezione bollette 25 anni dai dati REALI del cliente: spesa annua
              // attuale con rincaro composto prudente del 3%/anno (fattore ≈ 36,5).
              // Prima era un "~250.000 €" FISSO — cioè 833 €/mese per chiunque:
              // numero indifendibile davanti al cliente.
              const spesaAnnuaAttuale =
                (data.consumo_annuo_kwh ?? 0) * (data.costo_kwh_attuale ?? 0);
              const bollette25Anni = Math.round(
                spesaAnnuaAttuale * ((Math.pow(1.03, 25) - 1) / 0.03),
              );
              return bollette25Anni > 0 ? (
                <>
                  In 25 anni pagherai{" "}
                  <strong className="text-orange-400">~{formatEur(bollette25Anni)}</strong> di
                  bollette (rincaro prudente del 3%/anno)
                  <br />
                </>
              ) : null;
            })()}
            {"Investi "}<strong className="text-orange-400">{formatEur(investimento)}</strong> oggi e{" "}
            <strong className="text-emerald-400">guadagnerai {formatEur(risparmio25Anni)}</strong>.
          </div>
          <div className="relative text-sm opacity-85 mt-3">
            Non è un investimento: è una scelta tra{" "}
            <strong>essere ostaggio del mercato</strong> o <strong>essere indipendente</strong>.
          </div>
        </div>
      </div>

      <div className="text-right mt-4">
        <button
          type="button"
          onClick={onRicalcola}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-3 w-3" />
          Ricalcola
        </button>
      </div>
    </>
  );
}

/**
 * Grafico SVG cassa cumulata 25 anni — area negativa rossa, area positiva
 * verde, breakeven marker arancione, end-value badge verde.
 */
// ─────────────────────────────────────────────────────────────────────────────
// CassaCumulataChart (~142 righe) estratto in:
//   src/components/fotovoltaico/CassaCumulataChart.tsx
// Refactor 2026-05-10.
// ─────────────────────────────────────────────────────────────────────────────
function ScenarioBox({
  label,
  payback,
  npv,
  icon,
  highlight,
  subtitle,
}: {
  label: string;
  payback: number | null | undefined;
  npv: number | null | undefined;
  icon?: React.ReactNode;
  highlight?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 transition-all hover:-translate-y-0.5 hover:shadow ${
        highlight ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="mt-2 space-y-0.5">
        <div className="text-sm">
          Payback: <strong className="tabular-nums">{payback ?? "—"} anni</strong>
        </div>
        <div className="text-sm">
          NPV:{" "}
          <strong className="tabular-nums">
            € {(npv ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}
          </strong>
        </div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// STEP 7 — VISTA IMPRESA
// ============================================================================
function Step7VistaImpresa({
  scenario,
}: {
  progettoId: string;
  scenario: Record<string, unknown> | null;
}) {
  const costi = scenario?.costi as
    | {
        costo_totale_netto?: number;
        prezzo_vendita_iva_inclusa?: number;
        margine_eur?: number;
        margine_pct?: number;
      }
    | undefined;

  return (
    <>
      <FvPanelTitle
        step={7}
        totalSteps={TOTAL_STEPS}
        title="Vista impresa (interna)"
        subtitle={
          <>
            Marginalità, costi diretti, allocazione cantiere. <strong>Solo per il venditore</strong> — il cliente non lo vede mai.
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <FvKpi
          label="Ricavo netto"
          value={(costi?.costo_totale_netto ?? 0).toLocaleString("it-IT", {
            maximumFractionDigits: 0,
          })}
          unit="€"
        />
        <FvKpi
          label="Prezzo vendita"
          value={(costi?.prezzo_vendita_iva_inclusa ?? 0).toLocaleString("it-IT", {
            maximumFractionDigits: 0,
          })}
          unit="€"
        />
        <FvKpi
          label="Margine €"
          value={(costi?.margine_eur ?? 0).toLocaleString("it-IT", {
            maximumFractionDigits: 0,
          })}
          unit="€"
          variant="green"
        />
        <FvKpi
          label="Margine %"
          value={`${((costi?.margine_pct ?? 0) * 100).toFixed(1)}`}
          unit="%"
          variant="orange"
        />
      </div>

      <FvCallout variant="info" title="Vista riservata venditore + Titolare">
        Questa schermata non viene mai esportata né inviata al cliente. I numeri qui sono interni
        all'impresa: margini, allocazione squadra, costi reali. Il cliente vede solo la fase 6.
      </FvCallout>

      <FvCard title="Modifiche componenti & manodopera" className="mt-4">
        <p className="text-sm text-slate-600 mb-3">
          Per modificare componenti, manodopera o servizi torna alla <strong>Fase 5</strong>. Le modifiche al margine per
          singolo componente saranno disponibili nella pagina <strong>Dettaglio progetto</strong> dopo l'emissione.
        </p>
      </FvCard>
    </>
  );
}

// ============================================================================
// STEP 8 — GENERA
// ============================================================================
function Step8Genera({
  onEmetti,
  salvando,
  readOnly = false,
}: {
  onEmetti: () => void;
  salvando: boolean;
  readOnly?: boolean;
}) {
  return (
    <>
      <FvPanelTitle
        step={8}
        totalSteps={TOTAL_STEPS}
        title="Genera preventivo professionale"
        subtitle={
          <>
            Riepilogo finale e generazione del <strong>preventivo HTML configurabile</strong> (cover,
            viste tetto, componenti, produzione, flussi energetici, risparmio, costi futuri,
            piano economico, cassa 25 anni, CO₂, garanzie, iter pratiche, FAQ, firma).
            Apribile nel browser e stampabile come PDF con un click.
          </>
        }
      />

      <FvCard>
        <div className="py-8 text-center space-y-4">
          <FileText className="h-16 w-16 mx-auto text-orange-500" />
          <h3 className="text-xl font-bold text-slate-900">
            Pronto a generare il preventivo
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Genereremo un documento <strong>print-ready A4</strong> con tutti i dati reali del
            progetto, grafici inline, viste satellitari del tetto, calcoli finanziari completi
            e pagina firma cliente. Tempo stimato: 5 secondi.
          </p>
          <button
            type="button"
            onClick={onEmetti}
            disabled={salvando || readOnly}
            className="px-6 py-3 text-sm font-bold rounded-lg text-white bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generazione in corso…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Genera ed emetti preventivo
              </>
            )}
          </button>
          {readOnly && (
            <p className="text-xs text-amber-700 max-w-md mx-auto">
              🔒 Progetto in sola lettura: già emesso/firmato. Clona il progetto
              per generare una nuova versione del preventivo.
            </p>
          )}
        </div>
      </FvCard>

      <FvCallout variant="success" title="Tutto pronto per la generazione finale">
        Il preventivo verrà salvato nello storage e diventa scaricabile dalla scheda <strong>Preventivo</strong>
        del dettaglio progetto. Potrai aprirlo nel browser ("Apri preventivo") oppure stamparlo
        direttamente in PDF ("Apri e stampa subito").
      </FvCallout>
    </>
  );
}
