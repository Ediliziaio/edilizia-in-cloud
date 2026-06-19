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
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  FileText,
  Award,
  RefreshCw,
  X,
  Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FvContactPicker } from "@/components/fotovoltaico/FvContactPicker";
import {
  useProgetto,
  useAggiornaProgetto,
  useProfiliAutoconsumo,
  useArticoliFv,
  useUpsertComponenti,
  useUpsertManodopera,
  useUpsertServizi,
  useTariffeFv,
  useManodoperaProgetto,
  useTabelleFinanziamentoFv,
  useTopFinanziamentiFv,
  useTemplatePdf,
  useServiziCatalogo,
  type FvTariffaAziendale,
  type FvTabellaFinanziamento,
  type FvRigaFinanziamento,
} from "@/lib/fotovoltaico/queries";
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
  buildFvServiceRows,
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
  isCoordinataItalia, validaIseeReddito, calcolaCapienzaWarning,
  loadPersistedDraft, savePersistedDraft, clearPersistedDraft,
} from "./FotovoltaicoWizard/helpers";

// MP-MKT-001: INITIAL estratto in ./FotovoltaicoWizard/constants.ts
import { INITIAL } from "./FotovoltaicoWizard/constants";

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

export default function FotovoltaicoWizard() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
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
  const [data, setData] = useState<WizardData>(initialDraft?.data ?? INITIAL);
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
  const { data: pannelli = [] } = useArticoliFv("pannello");
  const { data: inverter = [] } = useArticoliFv("inverter");
  const { data: accumuli = [] } = useArticoliFv("accumulo");
  const { data: tariffeFv = [] } = useTariffeFv();
  const { data: fvTemplate } = useTemplatePdf();
  const { data: serviziCatalogo = [] } = useServiziCatalogo();
  const { data: progettoEsistente } = useProgetto(progettoId ?? undefined);
  const { data: manodoperaEsistente } = useManodoperaProgetto(progettoId ?? undefined);

  // Sprint 4: tabelle finanziamento per importo target del progetto
  const investimentoCorrente = progettoEsistente?.prezzo_vendita_iva_inclusa ?? null;
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
    setData((d) => ({
      ...d,
      archetipo: progettoEsistente.archetipo,
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
      numero_pannelli_scelti: progettoEsistente.numero_pannelli_scelti ?? 16,
      potenza_kwp: progettoEsistente.potenza_kwp ?? 8.64,
      con_accumulo: progettoEsistente.con_accumulo ?? false,
      capacita_accumulo_kwh: progettoEsistente.capacita_accumulo_kwh ?? 0,
      con_wallbox: progettoEsistente.con_wallbox ?? false,
      con_ottimizzatori: progettoEsistente.con_ottimizzatori ?? false,
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
        if (data.latitudine == null || data.longitudine == null)
          return { valido: false, motivo: "Inserisci latitudine e longitudine" };
        if (!isCoordinataItalia(data.latitudine, data.longitudine))
          return {
            valido: false,
            motivo: `Coordinate fuori Italia (range valido: lat ${ITALIA_LAT_MIN}-${ITALIA_LAT_MAX}, lng ${ITALIA_LNG_MIN}-${ITALIA_LNG_MAX})`,
          };
        return { valido: true };
      }
      case 3: {
        if (data.consumo_annuo_kwh == null || data.consumo_annuo_kwh < 500)
          return { valido: false, motivo: "Consumo annuo minimo 500 kWh" };
        const isee_err = validaIseeReddito(data.isee, data.reddito_annuo_dichiarato);
        if (isee_err) return { valido: false, motivo: isee_err };
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
  const handleSalvaStep2 = async () => {
    if (!data.indirizzo || data.latitudine == null || data.longitudine == null) return;
    setSalvando(true);
    setAutoSaveState("saving");
    try {
      const titolo = `${data.cliente_nome} ${data.cliente_cognome}`.trim();
      if (!progettoId) {
        const { data: result, error } = await supabase.functions.invoke(
          "fv-onboarding-cliente",
          {
            body: {
              titolo,
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
        if (!mountedRef.current) return;
        setProgettoId(newId);
        toast.success("Progetto creato — continua con i consumi");
      } else {
        await aggiornaProgetto.mutateAsync({
          id: progettoId,
          patch: {
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
      if (!mountedRef.current) return;
      markSaved();
      goTo(3, { markCompleted: true });
    } catch (e) {
      if (!mountedRef.current) return;
      setAutoSaveState("error");
      toast.error(`Salvataggio non riuscito: ${describeError(e)}`);
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  };

  // ─── Step 3 → salva consumi ──────────────────────────────────────────────
  const handleSalvaStep3 = async () => {
    if (!progettoId) return;
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
  const handleSalvaStep5 = async () => {
    if (!progettoId) return;
    setSalvando(true);
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

      await upsertComponenti.mutateAsync({
        progetto_id: progettoId,
        righe: comp.map(({ progetto_id: _ignored, ...r }) => r),
        replace: true,
      });

      // Manodopera: usa la tariffa scelta dall'utente (se presente in
      // tariffe_aziendali) altrimenti fallback su 30€/40€ standard.
      // Bug I1 fix: prima era SEMPRE hardcoded → margine reale falsato.
      const ore_installazione = Math.ceil(data.numero_pannelli_scelti * 0.5 + 8);
      const tariffaScelta = data.tariffa_installazione_id
        ? tariffeFv.find((t) => t.id === data.tariffa_installazione_id)
        : null;
      const tariffaCosto = tariffaScelta ? Number(tariffaScelta.prezzo_costo) : 30;
      const tariffaVendita = tariffaScelta ? Number(tariffaScelta.prezzo_vendita) : 40;
      const margineCalcolato =
        tariffaVendita > 0 ? (tariffaVendita - tariffaCosto) / tariffaVendita : 0.25;
      await upsertManodopera.mutateAsync({
        progetto_id: progettoId,
        replace: true,
        righe: [
          {
            tariffa_id: data.tariffa_installazione_id,
            descrizione: tariffaScelta
              ? `${tariffaScelta.nome} — impianto ${data.potenza_kwp} kWp`
              : `Installazione impianto ${data.potenza_kwp} kWp (tariffa standard)`,
            ore: ore_installazione,
            tariffa_oraria_netta: tariffaCosto,
            tariffa_oraria_vendita: tariffaVendita,
            margine_pct: margineCalcolato,
            ordinamento: 1,
          },
        ],
      });
      const costoPraticheDefault = Number(fvTemplate?.costo_pratiche_default ?? 600);
      const serviziRows = buildFvServiceRows({
        catalogo: serviziCatalogo.map((servizio) => ({
          codice: String(servizio.codice ?? "altro"),
          descrizione: String(servizio.descrizione ?? "Servizio fotovoltaico"),
          prezzo_netto_default: Number(servizio.prezzo_netto_default ?? 0),
          margine_pct_default:
            servizio.margine_pct_default == null ? null : Number(servizio.margine_pct_default),
          note_operative: servizio.note_operative ? String(servizio.note_operative) : null,
          ordinamento:
            servizio.ordinamento == null ? null : Number(servizio.ordinamento),
        })),
        costoPraticheDefault: Number.isFinite(costoPraticheDefault) ? costoPraticheDefault : 600,
      });

      await upsertServizi.mutateAsync({
        progetto_id: progettoId,
        replace: true,
        righe: serviziRows,
      });

      if (!mountedRef.current) return;
      markSaved();
      // Fix #4 Sprint 3: invalida scenarioFin precedente — la configurazione è
      // cambiata (tariffa/componenti/accumulo), il calcolo finanziario va rifatto.
      setScenarioFin(null);
      setScenarioErr(null);
      autoCalcRequested.current = null;
      goTo(6, { markCompleted: true });
    } catch (e) {
      if (!mountedRef.current) return;
      setAutoSaveState("error");
      toast.error(`Salvataggio configurazione: ${describeError(e)}`);
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  };

  // ─── Step 6 → calcolo finanziario ─────────────────────────────────────────
  const handleCalcolaFinanziario = useCallback(async () => {
    if (!progettoId) return;
    setCalcolandoFinanziario(true);
    setScenarioErr(null);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "fv-calcolo-finanziario",
        { body: { progetto_id: progettoId } },
      );
      if (error) throw error;
      if (!mountedRef.current) return;
      setScenarioFin(result as Record<string, unknown>);
      setCompletedSteps((s) => new Set(s).add(6));
      toast.success("Calcolo finanziario completato");
    } catch (e) {
      if (!mountedRef.current) return;
      const msg = describeError(e);
      setScenarioErr(msg);
      toast.error(`Calcolo finanziario fallito: ${msg}`);
    } finally {
      if (mountedRef.current) setCalcolandoFinanziario(false);
    }
  }, [progettoId]);

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
        const inv = (progettoEsistente?.prezzo_vendita_iva_inclusa ?? 0) as number;
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
        goTo(5, { markCompleted: true });
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

  const handleSaveDraft = useCallback(async () => {
    if (!progettoId) {
      toast.info("Compila e salva la fase 2 (immobile) per creare il progetto bozza.");
      return;
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
          // configurazione + opzioni
          numero_pannelli_scelti: data.numero_pannelli_scelti,
          potenza_kwp: data.potenza_kwp,
          con_accumulo: data.con_accumulo,
          capacita_accumulo_kwh: data.capacita_accumulo_kwh,
          con_wallbox: data.con_wallbox,
          con_ottimizzatori: data.con_ottimizzatori,
        } as never,
      });

      // Fix #3 Sprint 3: sincronizza ANCHE la tariffa di manodopera scelta
      // (era persistita solo in localStorage, persa al refresh dopo "Salva bozza")
      const manodoperaCorrente = (manodoperaEsistente?.[0] as { tariffa_id?: string | null } | undefined);
      if (
        data.tariffa_installazione_id &&
        manodoperaCorrente?.tariffa_id !== data.tariffa_installazione_id
      ) {
        const tariffaScelta = tariffeFv.find((t) => t.id === data.tariffa_installazione_id);
        if (tariffaScelta) {
          const ore = Math.ceil(data.numero_pannelli_scelti * 0.5 + 8);
          const margine =
            tariffaScelta.prezzo_vendita > 0
              ? (tariffaScelta.prezzo_vendita - tariffaScelta.prezzo_costo) /
                tariffaScelta.prezzo_vendita
              : 0.25;
          await upsertManodopera.mutateAsync({
            progetto_id: progettoId,
            replace: true,
            righe: [
              {
                tariffa_id: data.tariffa_installazione_id,
                descrizione: `${tariffaScelta.nome} — impianto ${data.potenza_kwp} kWp`,
                ore,
                tariffa_oraria_netta: Number(tariffaScelta.prezzo_costo),
                tariffa_oraria_vendita: Number(tariffaScelta.prezzo_vendita),
                margine_pct: margine,
                ordinamento: 1,
              },
            ],
          });
        }
      }

      if (!mountedRef.current) return;
      markSaved();
      toast.success("Bozza salvata");
    } catch (e) {
      if (!mountedRef.current) return;
      setAutoSaveState("error");
      toast.error(`Salvataggio bozza: ${describeError(e)}`);
    } finally {
      if (mountedRef.current) setSalvando(false);
    }
  }, [progettoId, data, aggiornaProgetto, markSaved, manodoperaEsistente, tariffeFv, upsertManodopera]);

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
              onClick={() => navigate("/azienda/marketing/fotovoltaico")}
              className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
            >
              <X className="h-4 w-4" /> {readOnlyMode ? "Chiudi" : "Salva e chiudi"}
            </button>
            {progettoId && (
              <button
                type="button"
                onClick={() => toast.info("Duplicazione disponibile dalla pagina dettaglio")}
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
                onClick={() => {
                  toast.info(
                    "Duplicazione progetto disponibile dalla pagina dettaglio (in arrivo).",
                  );
                }}
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
          // Fix #15 Sprint 3: feedback su click tab futuro non raggiungibile
          const isClickable =
            completedSteps.has(n) || n === step || n === step + 1;
          if (!isClickable) {
            toast.info(
              `Completa la fase ${step} prima di passare alla fase ${n}.`,
              { duration: 3000 },
            );
            return;
          }
          goTo(n);
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
              serviziCatalogoCount={serviziCatalogo.length}
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
            Indirizzo dove sarà installato l'impianto e geolocalizzazione (necessaria per Solar API/PVGIS).
            Usa <strong>"Trova coordinate"</strong> per ricavarle dall'indirizzo.
          </>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <FvCard title="Indirizzo impianto">
          <div className="mb-3">
            <Label>Indirizzo completo *</Label>
            <Input
              placeholder="Via Roma 12, 20100 Milano (MI)"
              value={data.indirizzo}
              onChange={(e) => update("indirizzo", e.target.value)}
              onBlur={handleIndirizzoBlur}
              autoComplete="street-address"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Comune, provincia, CAP e coordinate si compilano da soli appena esci dal campo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => cercaCoordinate()}
            disabled={geoLoading}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60"
          >
            {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span aria-hidden>📍</span>}
            {geoLoading ? "Ricerca coordinate…" : "Trova coordinate dall'indirizzo"}
          </button>
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
              <Label>Latitudine *</Label>
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
              <Label>Longitudine *</Label>
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
          <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={data.prima_casa}
              onChange={(e) => update("prima_casa", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
            />
            <span>Prima casa (abitazione principale)</span>
          </label>
          <FvCallout variant="tip" title="Aliquota IVA 10% applicata">
            Per immobili residenziali (anche seconda casa) si applica l'IVA al 10%. Per attività
            commerciali/industriali → IVA 22%.
          </FvCallout>
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

      <div className="grid lg:grid-cols-2 gap-4">
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

        {(data.archetipo === "privato_prima" ||
          data.archetipo === "privato_seconda" ||
          data.archetipo === "privato_isee") && (
          <FvCard title="Dati fiscali (per incentivi)">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>ISEE €</Label>
                <Input
                  type="number"
                  value={data.isee ?? ""}
                  onChange={(e) =>
                    update("isee", e.target.value ? Number(e.target.value) : null)
                  }
                  placeholder="solo Reddito Energetico"
                  aria-invalid={
                    !!validaIseeReddito(data.isee, data.reddito_annuo_dichiarato)
                  }
                />
              </div>
              <div>
                <Label>N° figli</Label>
                <Input
                  type="number"
                  min={0}
                  value={data.numero_figli}
                  onChange={(e) => update("numero_figli", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Reddito annuo lordo €</Label>
                <Input
                  type="number"
                  value={data.reddito_annuo_dichiarato ?? ""}
                  onChange={(e) =>
                    update(
                      "reddito_annuo_dichiarato",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  placeholder="check capienza IRPEF"
                />
              </div>
            </div>
            {/* Validation warning live (B6) */}
            {validaIseeReddito(data.isee, data.reddito_annuo_dichiarato) && (
              <FvCallout variant="warn" title="Dati incoerenti">
                {validaIseeReddito(data.isee, data.reddito_annuo_dichiarato)}
              </FvCallout>
            )}
            {/* Capienza fiscale insufficiente (B6/GAP10) */}
            {calcolaCapienzaWarning(data.archetipo, data.reddito_annuo_dichiarato) && (
              <FvCallout variant="warn" title="Capienza IRPEF insufficiente">
                {calcolaCapienzaWarning(data.archetipo, data.reddito_annuo_dichiarato)}
              </FvCallout>
            )}
            <FvCallout variant="info">
              ISEE ≤ 15.000 € sblocca il bando Reddito Energetico (contributo a fondo perduto).
              Reddito serve per stimare la capienza fiscale per la detrazione 50%.
            </FvCallout>
          </FvCard>
        )}
      </div>
    </>
  );
}

// ============================================================================
// STEP 4 — TETTO
// ============================================================================
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
                onChange={(e) =>
                  update("numero_pannelli_max", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
            <div>
              <Label>Potenza max kWp</Label>
              <Input
                type="number"
                step="0.01"
                value={data.potenza_max_kwp ?? ""}
                onChange={(e) =>
                  update("potenza_max_kwp", e.target.value ? Number(e.target.value) : null)
                }
              />
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
function Step5Configurazione({
  data,
  update,
  readOnlyMode,
  pannelli,
  inverter,
  accumuli,
  tariffeFv,
  serviziCatalogoCount,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  readOnlyMode: boolean;
  pannelli: Array<Record<string, unknown>>;
  inverter: Array<Record<string, unknown>>;
  accumuli: Array<Record<string, unknown>>;
  tariffeFv: FvTariffaAziendale[];
  serviziCatalogoCount: number;
}) {
  // Auto-calcolo potenza_kwp da numero pannelli. In sola lettura NON scrive:
  // update() in read-only mostra un toast d'errore, che da un useEffect
  // partirebbe spurio al mount dello step.
  useEffect(() => {
    if (readOnlyMode) return;
    if (data.pannello_id) {
      const p = pannelli.find((x) => (x as { id: string }).id === data.pannello_id);
      const w = (p?.potenza_w as number) ?? 540;
      update("potenza_kwp", Math.round((data.numero_pannelli_scelti * w) / 10) / 100);
    } else {
      update("potenza_kwp", Math.round((data.numero_pannelli_scelti * 540) / 10) / 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.numero_pannelli_scelti, data.pannello_id]);

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
            <div>
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

            <div>
              <Label>
                Tariffa manodopera installazione
                {!data.tariffa_installazione_id && (
                  <span className="ml-2 text-xs text-amber-600 font-normal">
                    ⚠ Standard 30€/40€ — configura tariffe in Impostazioni per dato reale
                  </span>
                )}
              </Label>
              <Select
                value={data.tariffa_installazione_id ?? "__default__"}
                onValueChange={(v) =>
                  update("tariffa_installazione_id", v === "__default__" ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    Tariffa standard (30€ costo / 40€ vendita)
                  </SelectItem>
                  {tariffeFv.length === 0 && (
                    <SelectItem value="__empty__" disabled>
                      Nessuna tariffa configurata in Impostazioni Azienda
                    </SelectItem>
                  )}
                  {tariffeFv.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome} — costo {Number(t.prezzo_costo).toFixed(0)}€ / vendita{" "}
                      {Number(t.prezzo_vendita).toFixed(0)}€/{t.unita}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data.tariffa_installazione_id &&
                (() => {
                  const t = tariffeFv.find((x) => x.id === data.tariffa_installazione_id);
                  if (!t) return null;
                  const margine =
                    t.prezzo_vendita > 0
                      ? ((t.prezzo_vendita - t.prezzo_costo) / t.prezzo_vendita) * 100
                      : 0;
                  return (
                    <p className="text-[11px] text-emerald-700 mt-1.5 font-semibold">
                      ✓ Margine reale {margine.toFixed(0)}% — collegato a tariffe_aziendali
                    </p>
                  );
                })()}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <strong>Pratiche e servizi:</strong>{" "}
              {serviziCatalogoCount > 0
                ? `${serviziCatalogoCount} voci dal catalogo FV aziendale saranno usate nel margine.`
                : "nessun catalogo FV configurato, uso fallback dal template Fotovoltaico."}
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
  let rataMensilePrestito = 0;
  let rataInfoLabel = "";
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

      {/* Capienza IRPEF */}
      {scenario.capienza_irpef_warning ? (
        <FvCallout variant="warn" title="Attenzione capienza IRPEF" icon={<AlertTriangle className="h-4 w-4" />}>
          {scenario.capienza_irpef_warning as string}
        </FvCallout>
      ) : scenario.capienza_irpef_ok ? (
        <FvCallout variant="success" title="Capienza IRPEF OK">
          Detrazione interamente recuperabile in 10 anni.
        </FvCallout>
      ) : null}

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
            In 25 anni pagherai{" "}
            <strong className="text-orange-400">~250.000 €</strong> di bollette
            <br />
            oppure investirai <strong className="text-orange-400">{formatEur(investimento)}</strong> oggi e{" "}
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
