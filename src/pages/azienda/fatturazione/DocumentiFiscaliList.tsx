import { BOTTONE_SECONDARIO, BOTTONE_NUOVO, RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { SoloDaTabletOComputer } from "@/components/shared/SoloDaTabletOComputer";
import { useContabilitaGeneraleAttiva } from "@/components/contabilita/ContabilitaInCasa";
import { supabase } from "@/integrations/supabase/client";
import { nomeCliente } from "@/lib/fatturazione/clienteSnapshot";
import { CelleEmesse, IntestazioniEmesse, SceltaColonneEmesse, STICKY_SELEZIONE, useColonneEmesse } from "@/components/fatturazione/ColonneFattureEmesse";
import { FILTRI_EMESSE_VUOTI, FiltriEmesseAttivi, FiltriFattureEmesse, type FiltriEmesse } from "@/components/fatturazione/FiltriFattureEmesse";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { useState, useMemo, useCallback, useEffect } from "react";
import { documentoDaConservare } from "@/lib/fatturazione/conservazione";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useDocumentiFiscali, useDeleteDocumento, useUpdateDocumento, useRipristinaDocumento, rileggiDocumentoFiscale } from "@/hooks/useDocumentiFiscali";
import { preparaCopiaDocumento, siPuoDuplicare } from "@/lib/fatturazione/duplicaDocumento";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Checkbox } from "@/components/ui/checkbox";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { mesiVuoti, useMonthlyTimeline } from "@/hooks/billing/useMonthlyTimeline";
import { useDocumentCounts } from "@/hooks/billing/useDocumentCounts";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { useShipmentDDTPDF } from "@/hooks/useShipmentDDTPDF";
import { scaricaXmlFattura } from "@/lib/fatturazione/scaricaXml";
import { siPuoRipristinare } from "@/lib/fatturazione/cestino";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { BottoneMesi, MonthlyTimeline, useStrisciaMesi } from "@/components/fatturazione/MonthlyTimeline";
import { RiepilogoFatture } from "@/components/fatturazione/RiepilogoFatture";
import { CompletezzaFatture } from "@/components/fatturazione/CompletezzaFatture";
import { StatoBadge } from "@/components/fatturazione/StatoBadge";
import { useEmesseSenzaIncasso } from "@/components/fatturazione/EmesseSenzaIncasso";
import { FaseSdiBadge } from "@/components/fatturazione/FaseSdiBadge";
import { SegnaPagataDialog } from "@/components/fatturazione/SegnaPagataDialog";
import { IncassiFatturaDialog } from "@/components/fatturazione/IncassiFattura";
import { residuoDaIncassare } from "@/lib/fatturazione/incassi";
import { faseSdi } from "@/lib/fatturazione/sdiCassetto";
import { getScadenzaInfo, STATI_FILTRO_DOCUMENTI, TIPI_ELENCO_FATTURE } from "@/lib/fatturazione/filtriDocumenti";
import { DocumentiFooter } from "@/components/fatturazione/DocumentiFooter";
import { Button } from "@/components/ui/button";
import { CollegaEmessaDialog } from "@/components/fatturazione/CollegaEmessaDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { AbbinaFattureCommesseDialog } from "@/components/fatture/AbbinaFattureCommesseDialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, MoreHorizontal, Search, X, Loader2, ChevronLeft, ChevronRight,
  Download, Eye, Pencil, Copy, CreditCard, Trash2, FileWarning, FileText, ReceiptText,
  AlertCircle, CheckCircle2, Clock, Truck, RotateCcw, FileSpreadsheet,
  BarChart3, Settings2, BookUser, Wallet, Archive, Calculator, ShieldCheck,
  Link2, Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { exportToXLSX, type CsvColumn } from "@/lib/csvExport";
import type { DocumentoFiscale, TipoDocumento, StatoDocumento, AnagraficaAzienda } from "@/types/fatturazione";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import AnagraficheList from "./AnagraficheList";
import RegistroIncassi from "./RegistroIncassi";
import CassettoSDI from "./CassettoSDI";
import FiscalWorkspace from "@/components/fatturazione/FiscalWorkspace";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { GestionaleEsternoAzioni, ImportInCorsoBanner, SegnaIncassateImportateDialog, SegnaPagataImportataDialog, importataPagabile } from "@/components/fatturazione/GestionaleEsterno";
import { RiportaDaIncassareDialog, siRiportaDaIncassare } from "@/components/fatturazione/RiportaDaIncassare";
import { CassettoSdiEsterno, RegistroIncassiImportate } from "@/components/fatturazione/HubEsterno";

import { useIsMobile } from "@/hooks/use-mobile";
import { CercaConFiltri, DettaglioFiltri, GruppoFiltri, PannelloFiltri, SceltaFiltro, SelettoreSezione } from "@/components/mobile/FiltriMobile";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
const PER_PAGE = 25;

// Mobile: Fatture, Incassi e Fiscalità; le altre schede restano al desktop.

type BillingHubTab = "fatture" | "rubrica" | "incassi" | "sdi" | "fiscalita";

const HUB_TABS: {
  id: BillingHubTab;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { id: "fatture", label: "Fatture", description: "Emissione, DDT, proforma e note", icon: FileText },
  { id: "rubrica", label: "Clienti fiscali", description: "Clienti, fornitori e riconciliazione", icon: BookUser },
  { id: "incassi", label: "Registro incassi", description: "Pagamenti, residui e scadenze", icon: Wallet },
  { id: "sdi", label: "Cassetto SDI", description: "Invii, ricevute e scarti", icon: Archive },
  { id: "fiscalita", label: "Fiscalità", description: "IVA, F24, ritenute e conservazione", icon: Calculator },
];

/** Schede che dal telefono non compaiono: si usano da tablet o computer. */
const SOLO_DA_TABLET = new Set<BillingHubTab>(["incassi", "fiscalita"]);

// ─── Tab config ───────────────────────────────────────────
const TIPO_TABS: {
  id: string;
  label: string;
  tipos: TipoDocumento[] | null;
  icon: React.ElementType;
  countKey: string;
  tabColor?: string;
  emptyTitle: string;
  emptyDescription: string;
}[] = [
  { id: "fattura", label: "Fatture", tipos: TIPI_ELENCO_FATTURE, icon: FileText, countKey: "fatture", emptyTitle: "Nessuna fattura trovata", emptyDescription: "Crea la tua prima fattura per iniziare." },
  { id: "proforma", label: "Pro forma", tipos: ["proforma"], icon: Clock, countKey: "proforma", emptyTitle: "Nessun proforma trovato", emptyDescription: "Crea un proforma da inviare al cliente prima della fattura definitiva." },
  { id: "nota_credito", label: "Note di Credito", tipos: ["nota_credito"], icon: FileWarning, countKey: "nota_credito", emptyTitle: "Nessuna nota di credito", emptyDescription: "Le note di credito emesse per stornare fatture appariranno qui." },
  { id: "ddt", label: "DDT", tipos: ["ddt"], icon: Truck, countKey: "ddt", emptyTitle: "Nessun DDT trovato", emptyDescription: "I documenti di trasporto emessi appariranno qui." },
  { id: "annullate", label: "Cestino", tipos: null, icon: Trash2, countKey: "cestinati", tabColor: "text-destructive", emptyTitle: "Il cestino è vuoto", emptyDescription: "I documenti eliminati appariranno qui. Dopo 14 giorni vengono cancellati definitivamente." },
];

const NC_ALLOWED: StatoDocumento[] = ["emessa", "consegnata", "inviata_sdi", "accettata", "pagata", "parzialmente_pagata"];
const PAGABILE: StatoDocumento[] = ["emessa", "inviata_sdi", "consegnata", "accettata", "scaduta", "parzialmente_pagata"];
const TIPI_PAGABILI: TipoDocumento[] = ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "nota_debito"];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

function isDocumentoPagabile(doc: DocumentoFiscale) {
  return TIPI_PAGABILI.includes(doc.tipo) && PAGABILE.includes(doc.stato) && residuoDaIncassare(doc) > 0;
}

/** Ha (o può avere) incassi da vedere, annullare o abbinare al bonifico. */
function haIncassi(doc: DocumentoFiscale) {
  return TIPI_PAGABILI.includes(doc.tipo) && (PAGABILE.includes(doc.stato) || doc.stato === "pagata");
}

function isDocumentoEliminabile(doc: DocumentoFiscale) {
  return doc.stato === "bozza" || doc.stato === "annullata";
}

function BillingHubTabs({
  activeTab,
  onChange,
  senzaLinguette,
}: {
  activeTab: BillingHubTab;
  onChange: (tab: BillingHubTab) => void;
  /** Sugli schermi larghi le linguette stanno nella riga del titolo della scheda (Fatture): qui solo sotto i 1536px. */
  senzaLinguette?: boolean;
}) {
  const t = useT();
  // Telefono (decisione del founder, 23/11/2026): Registro incassi e Fiscalità non compaiono.
  const telefono = useIsMobile(640);
  // Con la contabilità generale l'IVA sta là (24/11/2026): qui Fiscalità tiene ritenute di garanzia e archivio.
  const { attiva: generale } = useContabilitaGeneraleAttiva();
  const schede = generale ? HUB_TABS.map((h) => (h.id === "fiscalita" ? { ...h, description: "Ritenute di garanzia e archivio" } : h)) : HUB_TABS;
  const sezioni = telefono ? schede.filter(({ id }) => !SOLO_DA_TABLET.has(id)) : schede;
  return (
    <>
      <SelettoreSezione nome={t("Sezioni documenti")} valore={activeTab} sezioni={sezioni} onScegli={onChange} className="max-sm:-order-1 lg:hidden" />
      <LinguetteSezioni activeTab={activeTab} onChange={onChange} schede={schede} className={senzaLinguette ? "2xl:hidden" : undefined} />
    </>
  );
}

// `schede` arriva da chi conosce il contesto (con la contabilità generale la Fiscalità
// cambia descrizione): senza, le linguette sono quelle di sempre.
function LinguetteSezioni({ activeTab, onChange, schede = HUB_TABS, className }: { activeTab: BillingHubTab; onChange: (tab: BillingHubTab) => void; schede?: typeof HUB_TABS; className?: string }) {
  const t = useT();
  return (
    <>
      {/* Da computer (25/11/2026): cinque linguette da 32px su una riga, non cinque schede da 53px.
          La descrizione di ogni sezione resta nel titolo della linguetta. */}
      <nav aria-label={t("Sezioni documenti")} className={cn("hidden min-h-0 flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm lg:flex", className)}>
        {schede.map(({ id, icon: Icon, label, description }) => {
          const attiva = activeTab === id;
          return (
            <button key={id} type="button" aria-current={attiva ? "page" : undefined} onClick={() => onChange(id)} title={t(description)}
              className={cn("flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-3 text-left text-sm",
                attiva ? "bg-slate-950 font-semibold text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950")}>
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{t(label)}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

function DocumentiFiscaliHub() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as BillingHubTab | null;
  const activeHubTab = HUB_TABS.find(({ id }) => id === requestedTab)?.id ?? "fatture";

  const handleHubTabChange = (tab: BillingHubTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "fatture") {
      next.delete("tab");
    } else {
      next.set("tab", tab);
      next.delete("tipo");
    }
    setSearchParams(next, { replace: false });
  };

  // Chi fattura con un altro programma vede le stesse schede: dove il dato nativo
  // non c'è (incassi, invii SDI) la scheda legge le fatture importate o lo dice.
  const esterna = useBillingMode({ facoltativo: true })?.isExternal ?? false;
  const telefonoHub = useIsMobile(640);

  // Mobile: colonna flessibile, così le linguette (order -1) scendono sotto il
  // titolo della scheda (order -2), che sta dentro il componente figlio.
  return (
    <div className="space-y-3 max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:space-y-0">
      {/* Sulla scheda Fatture, da 1536px in su, le linguette stanno nella riga del titolo
          (25/11/2026): una riga da 54px in meno prima dell'elenco. Più stretto non ci stanno
          accanto ai comandi e restano qui sopra. Le altre schede hanno la loro testata. */}
      <BillingHubTabs activeTab={activeHubTab} onChange={handleHubTabChange} senzaLinguette={activeHubTab === "fatture"} />

      {activeHubTab === "fatture" && (
        <DocumentiFiscaliListInner sezioni={<LinguetteSezioni activeTab={activeHubTab} onChange={handleHubTabChange} className="mr-auto lg:hidden 2xl:flex" />} />
      )}
      {activeHubTab === "rubrica" && <AnagraficheList embedded />}
      {/* Chi fattura qui vede il registro nativo e, sotto, lo storico delle
          importate: il giorno del passaggio di incassi nativi non ce n'è
          nessuno. Chi non ha importate non vede la seconda sezione. */}
      {telefonoHub && SOLO_DA_TABLET.has(activeHubTab) ? (
        <SoloDaTabletOComputer titolo={t(HUB_TABS.find(({ id }) => id === activeHubTab)?.label ?? "Documenti")}
          dove={<>{t("la trovi in")} <strong>{t("Fatture")}</strong>{t(", nelle schede in alto.")}</>}
          indietro={{ url: "/azienda/documenti", etichetta: t("Torna alle fatture") }}><></></SoloDaTabletOComputer>
      ) : <>
      {activeHubTab === "incassi" && (esterna ? <RegistroIncassiImportate /> : (
        <><RegistroIncassi embedded /><RegistroIncassiImportate soloSeCeNe /></>
      ))}
      {activeHubTab === "sdi" && (esterna ? <CassettoSdiEsterno /> : <CassettoSDI embedded />)}
      {activeHubTab === "fiscalita" && <FiscalWorkspace />}
      </>}
    </div>
  );
}

// ─── Inner Component ──────────────────────────────────────
function DocumentiFiscaliListInner({ sezioni }: { sezioni?: React.ReactNode } = {}) {
  const tr = useT();
  const isMobile = useIsMobile();
  const [tabellaSuTablet, setTabellaSuTablet] = useState(false);
  const soloVistaCompatta = tabellaSuTablet ? "sm:hidden" : "lg:hidden";
  const soloTabella = tabellaSuTablet ? "max-sm:hidden" : "max-lg:hidden";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTipo = searchParams.get("tipo");
  const isCommercialistaMode = searchParams.get("commercialistaMode") === "1";
  const activeTab = TIPO_TABS.some((tab) => tab.id === requestedTipo) ? requestedTipo! : "fattura";
  const ddtPdf = useShipmentDDTPDF();

  // Fatture importate dal gestionale esterno che non sanno a quale cantiere
  // appartengono: finché non lo sanno, la commessa non sa quanto ha incassato.
  const { effectiveCompany, user } = useAuth();
  const permissions=usePermissions();
  const [collegaTarget,setCollegaTarget]=useState<DocumentoFiscale|null>(null);
  const sceltaColonne = useColonneEmesse(effectiveCompany?.id, user?.id);
  const [riquadroTabella, setRiquadroTabella] = useState<HTMLDivElement | null>(null);
  const [filtriEmesse, setFiltriEmesse] = useState<FiltriEmesse>(FILTRI_EMESSE_VUOTI);
  const clienteFiltro = useDebounce(filtriEmesse.cliente, 300);
  const commessaFiltro = useDebounce(filtriEmesse.commessa, 300);
  const [ordinamento, setOrdinamento] = useState<"progressivo" | "data">("progressivo");
  const [abbinaAperto, setAbbinaAperto] = useState(false);

  // Chi fattura con un altro programma: vede anche le importate, non crea documenti.
  const esterna = useBillingMode({ facoltativo: true })?.isExternal ?? false;
  const puoCreare = !esterna && !isCommercialistaMode;
  const elencoEmesse = activeTab === "fattura";
  const isTrash = activeTab === "annullate";
  const statiFiltro = elencoEmesse
    ? [{ value: "all", label: tr("Tutti i documenti") }, { value: "bozza", label: tr("Bozza") }, { value: "emessa", label: tr("Emessi") }, { value: "annullata", label: tr("Annullati") }, { value: "stornata", label: tr("Stornati") }]
    : esterna
    ? STATI_FILTRO_DOCUMENTI.filter((o) => o.value !== "bozza" && !o.value.startsWith("sdi:"))
    : STATI_FILTRO_DOCUMENTI;
  const statoRichiesto = searchParams.get("stato");
  const statoFilter = !isTrash && statiFiltro.some((stato) => stato.value === statoRichiesto)
    ? statoRichiesto!
    : "all";
  const soloBozzeFatture = elencoEmesse && !esterna && statoFilter === "bozza";
  const setStatoFilter = (stato: string, azzeraRicerca = false) => {
    const params = new URLSearchParams(searchParams);
    if (stato === "all") params.delete("stato");
    else params.set("stato", stato);
    if (azzeraRicerca) params.delete("cerca");
    params.delete("pagina");
    setSearchParams(params, { replace: true });
  };

  const [incassoImportata, setIncassoImportata] = useState<DocumentoFiscale | null>(null);
  const [daRiaprire, setDaRiaprire] = useState<DocumentoFiscale | null>(null);
  const apriDocumento = (doc: DocumentoFiscale) => {
    // Le importate hanno il loro dettaglio, con la stessa impaginazione e senza azioni che creano.
    if (doc.origine === "importata") navigate(`/azienda/documenti/importata/${doc.id}`);
    else if (soloBozzeFatture && doc.stato === "bozza" && puoCreare) navigate(`/azienda/documenti/${doc.id}`);
    else navigate(`/azienda/documenti/${doc.id}/dettaglio`);
  };

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [timelineYear, setTimelineYear] = useState(new Date().getFullYear());
  // «?cerca=» arriva da Clienti fiscali: le fatture di quel cliente.
  const [searchRaw, setSearchRaw] = useState(() => searchParams.get("cerca") ?? "");
  const search = useDebounce(searchRaw, 300);
  // «?pagina=» (da 1): con la ricerca, è ciò che riporta ai risultati chi apre
  // una fattura e torna indietro. Prima stavano solo in memoria e si perdevano.
  const [page, setPage] = useState(() => Math.max(0, (Number(searchParams.get("pagina")) || 1) - 1));
  // La pagina va nell'indirizzo da chi la cambia (vaiAPagina, o i filtri che la tolgono
  // da sé), nello stesso tocco: un effetto che la riscriveva dopo faceva gara con i filtri.
  const vaiAPagina = (n: number) => {
    setPage(n);
    const attesa = n > 0 ? String(n + 1) : null;
    if (searchParams.get("pagina") === attesa) return;
    setSearchParams((attuali) => {
      const prossimi = new URLSearchParams(attuali);
      if (attesa) prossimi.set("pagina", attesa); else prossimi.delete("pagina");
      return prossimi;
    }, { replace: true });
  };
  useEffect(() => {
    // Solo la ricerca già «ferma» (300ms): i filtri che la azzerano scrivono l'indirizzo da
    // sé, e reagire al campo appena svuotato faceva gara con loro («?stato=bozza» spariva).
    // Solo se cambia davvero: ogni riscrittura è una voce nuova di cronologia.
    const testo = search.trim();
    if ((searchParams.get("cerca") ?? "") === testo) return;
    setSearchParams((attuali) => {
      const prossimi = new URLSearchParams(attuali);
      if (testo) prossimi.set("cerca", testo); else prossimi.delete("cerca");
      prossimi.delete("pagina");
      return prossimi;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si scrive l'URL quando cambia la ricerca, non quando lo cambiano altri
  }, [search]);
  const [deleteTarget, setDeleteTarget] = useState<DocumentoFiscale | null>(null);
  const [payTarget, setPayTarget] = useState<DocumentoFiscale | null>(null);
  // «Incassi e banca» dal menu della riga: l'id, così la finestra segue la fattura aggiornata.
  const [incassiId, setIncassiId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  // Mobile: tipo di documento e stato in un pannello dal basso.
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);

  const { isScopriPlan } = useSubscriptionLimits();
  const { data: azienda } = useAnagraficaAzienda();
  const deleteMutation = useDeleteDocumento();
  const updateMutation = useUpdateDocumento();
  const ripristina = useRipristinaDocumento();

  // Current tab config
  const currentTab = TIPO_TABS.find((t) => t.id === activeTab) ?? TIPO_TABS[0];
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const azzeraFiltriElenco = () => {
    setPage(0);
    setSelectedMonth(null);
    setSearchRaw("");
    setFiltriEmesse(FILTRI_EMESSE_VUOTI);
    clearSelection();
  };

  const handleTabChange = (tabId: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete("stato");
    params.delete("cerca");
    params.delete("pagina");
    if (tabId === "fattura") params.delete("tipo");
    else params.set("tipo", tabId);
    setSearchParams(params, { replace: true });
    azzeraFiltriElenco();
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // toggleSelectAll is defined after docs

  // Build filters for useDocumentiFiscali
  const tipoFilter = isTrash ? undefined : currentTab.tipos ?? undefined;
  const statoFilterArr = useMemo(
    () => isTrash
      ? undefined // Cestino uses showDeleted flag instead
      : !["all", "emessa", "scaduta"].includes(statoFilter) && !statoFilter.startsWith("sdi:")
        ? ([statoFilter] as StatoDocumento[])
        : undefined,
    [isTrash, statoFilter]
  );
  // «Da inviare SDI», «In elaborazione», «Scartate»: la fase verso lo SDI, che
  // non sta nella colonna stato (lì c'è anche l'incasso).
  const sdiFilter = !isTrash && statoFilter.startsWith("sdi:")
    ? (statoFilter.slice(4) as "da_inviare" | "in_elaborazione" | "scartata")
    : undefined;

  // Month → date range
  const dataDa = elencoEmesse && filtriEmesse.dal ? filtriEmesse.dal : selectedMonth ? `${selectedMonth}-01` : undefined;
  const dataA = elencoEmesse && filtriEmesse.al ? filtriEmesse.al : selectedMonth
    ? (() => {
        const [y, m] = selectedMonth.split("-").map(Number);
        const last = new Date(y, m, 0).getDate();
        return `${selectedMonth}-${String(last).padStart(2, "0")}`;
      })()
    : undefined;

  const filters = {
      tipo: tipoFilter,
      stato: statoFilterArr,
      emessi: !isTrash && statoFilter === "emessa",
      scaduta: !isTrash && statoFilter === "scaduta",
      search: searchRaw ? search || undefined : undefined,
      data_da: dataDa,
      data_a: dataA,
      page,
      perPage: PER_PAGE,
      showDeleted: isTrash,
      ordinamento: soloBozzeFatture ? "aggiornamento" as const : elencoEmesse ? ordinamento : activeTab === "nota_credito" ? "progressivo" as const : "data" as const,
      sdi: elencoEmesse && filtriEmesse.sdi !== "all" ? filtriEmesse.sdi : sdiFilter,
      incasso: elencoEmesse && filtriEmesse.incasso !== "all" ? filtriEmesse.incasso : undefined,
      cliente: elencoEmesse ? clienteFiltro : undefined,
      commessa: elencoEmesse ? commessaFiltro : undefined,
      conNote: elencoEmesse && filtriEmesse.conNote,
      conAllegati: elencoEmesse && filtriEmesse.conAllegati,
      // Le importate si leggono sempre, non solo per chi fattura con un altro
      // programma: chi passa a fatturare qui ha lo storico in `invoices` e
      // nessun documento nativo, e l'elenco gli risultava vuoto il giorno del
      // passaggio (Impresa Vulcano: 481 documenti per 7 milioni, zero nativi).
      // Chi è sempre stato nativo non ha importate, quindi non cambia niente.
      conImportate: true,
  };

  const { data, isLoading, isError, isFetching, refetch } = useDocumentiFiscali(filters);
  const [slowLoadingKey, setSlowLoadingKey] = useState<string | null>(null);
  const loadingKey = JSON.stringify([activeTab, page, search, selectedMonth, statoFilter]);
  const showSlowLoading = isLoading && slowLoadingKey === loadingKey;
  const { data: counts } = useDocumentCounts();
  const { data: timelineMonths, isPending: caricaTimeline } = useMonthlyTimeline(isTrash ? null : currentTab.tipos, timelineYear, { enabled: !soloBozzeFatture });
  // La striscia dei mesi e i sei numeri si disegnano subito, coi dodici mesi
  // vuoti: prima aspettavano i numeri e comparivano a mezzo secondo dalla
  // pagina, spingendo giù l'elenco (23/11/2026).
  const mesiStriscia = useMemo(() => timelineMonths ?? mesiVuoti(timelineYear), [timelineMonths, timelineYear]);
  const striscia = useStrisciaMesi("emesse", selectedMonth);
  const strisciaVisibile = !isTrash && !soloBozzeFatture;
  // L'anno prima serve solo alla variazione dei numeri veloci, e solo da tablet in su.
  const { data: timelineMonthsPrima } = useMonthlyTimeline(currentTab.tipos, timelineYear - 1, {
    enabled: !isTrash && !soloBozzeFatture && activeTab === "fattura" && !isMobile,
  });

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setTimeout(() => setSlowLoadingKey(loadingKey), 3500);
    return () => window.clearTimeout(timer);
  }, [isLoading, loadingKey]);

  const docs = useMemo(() => data?.documenti ?? [], [data?.documenti]);
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === docs.length && docs.length > 0) return new Set();
      return new Set(docs.map((d) => d.id));
    });
  }, [docs]);

  // ── Bulk actions ──────────────────────────────────────
  const selectedDocs = useMemo(() => docs.filter((d) => selectedIds.has(d.id)), [docs, selectedIds]);
  const allSelected = docs.length > 0 && selectedDocs.length === docs.length;
  const someSelected = selectedDocs.length > 0;

  const handleBulkExport = () => {
    const columns: CsvColumn[] = [
      { key: "numero", label: "Numero" },
      { key: "tipo", label: "Tipo" },
      { key: "data_emissione", label: "Data" },
      { key: "cliente", label: "Cliente" },
      { key: "stato", label: "Stato" },
      { key: "imponibile", label: "Imponibile" },
      { key: "iva", label: "IVA" },
      { key: "totale", label: "Totale" },
    ];
    const rows = selectedDocs.map((d) => ({
      numero: d.numero,
      tipo: d.tipo,
      data_emissione: d.data_emissione,
      // Un privato non ha ragione sociale: «Nome Cognome».
      cliente: nomeCliente(d.cliente_snapshot as never),
      stato: d.stato,
      imponibile: String(d.imponibile_totale),
      iva: String(d.iva_totale),
      totale: String(d.totale_documento),
    }));
    exportToXLSX(rows, columns, `documenti_${new Date().toISOString().slice(0, 10)}.xlsx`, "Documenti");
    toast.success(tr("{n} documenti esportati", { n: rows.length }));
  };

  // Gli XML partiti allo SDI dei documenti selezionati, in uno zip (quello che chiede il
  // commercialista). Solo quelli già trasmessi: l'XML di una bozza non è ancora un documento.
  const handleBulkExportXml = async () => {
    const conXml = selectedDocs.filter((d) => !!d.sdi_file_xml_url);
    if (conXml.length === 0) {
      toast.info(tr("Nessun XML da esportare"), { description: tr("Gli XML ci sono solo per le fatture già inviate allo SDI.") });
      return;
    }
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usati = new Set<string>();
      let mancanti = 0;
      for (const d of conXml) {
        const { data, error } = await supabase.storage.from("fatture-xml").download(d.sdi_file_xml_url as string);
        if (error || !data) { mancanti++; continue; }
        let nome = `${d.data_emissione}_${String(d.numero).replace(/[^a-zA-Z0-9-]+/g, "_")}.xml`;
        for (let n = 2; usati.has(nome); n++) nome = nome.replace(/(_\d+)?\.xml$/, `_${n}.xml`);
        usati.add(nome);
        zip.file(nome, await data.text());
      }
      if (usati.size === 0) throw new Error("Nessun file trovato nell'archivio");
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fatture_emesse_xml_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const senza = selectedDocs.length - conXml.length + mancanti;
      if (senza > 0) toast.warning(tr("{size} XML esportati, {senza} senza file", { size: String(usati.size ?? ""), senza: String(senza ?? "") }), { description: tr("Mancano le bozze, le fatture non ancora inviate e i file non trovati.") });
      else toast.success(tr("{size} XML esportati", { size: String(usati.size ?? "") }));
    } catch (err) {
      toast.error(tr("Esportazione non riuscita"), { description: err instanceof Error ? err.message : undefined });
    }
  };

  // «Segna pagate»: un incasso per fattura (registra_incasso_atomico), solo
  // su quelle che hanno qualcosa da incassare; le altre si dicono nel dialog.
  const pagabiliSelezionate = useMemo(() => selectedDocs.filter(isDocumentoPagabile), [selectedDocs]);
  // Emesse da XML segnate incassate senza un incasso registrato: lo si dice accanto allo stato.
  const { data: senzaIncasso } = useEmesseSenzaIncasso(effectiveCompany?.id);
  const importateDaIncassare = useMemo(() => selectedDocs.filter(importataPagabile), [selectedDocs]);
  const [bulkIncassaOpen, setBulkIncassaOpen] = useState(false);

  const handleBulkDelete = async () => {
    let ok = 0;
    let skipped = 0;
    for (const doc of selectedDocs) {
      if (!isDocumentoEliminabile(doc)) {
        skipped++;
        continue;
      }
      try {
        await deleteMutation.mutateAsync(doc.id);
        ok++;
      } catch (err: unknown) {
        toast.error(tr("Documento non eliminato"), { description: getErrorMessage(err) });
      }
    }
    if (ok > 0) toast.success(tr("{ok} documenti spostati nel cestino", { ok: String(ok ?? "") }));
    if (skipped > 0) toast.info(tr("{skipped} documenti emessi ignorati: usa una nota di credito per stornarli", { skipped: String(skipped ?? "") }));
    clearSelection();
    setBulkDeleteOpen(false);
  };

  // Totals for footer
  const totals = useMemo(() => {
    let imp = 0, iva = 0, tot = 0;
    for (const d of docs) {
      imp += d.imponibile_totale;
      iva += d.iva_totale;
      tot += d.totale_documento;
    }
    return { imp, iva, tot };
  }, [docs]);

  const nFiltriEmesse = elencoEmesse ? (Object.keys(filtriEmesse) as (keyof FiltriEmesse)[]).filter(k => filtriEmesse[k] !== FILTRI_EMESSE_VUOTI[k]).length : 0;
  const hasFilters = statoFilter !== "all" || searchRaw || selectedMonth || nFiltriEmesse > 0;
  const clearFilters = () => {
    setStatoFilter("all", true);
    azzeraFiltriElenco();
  };

  const cambiaFiltriEmesse = (patch: Partial<FiltriEmesse>) => {
    setFiltriEmesse(v => ({ ...v, ...patch }));
    if ("dal" in patch || "al" in patch) setSelectedMonth(null);
    vaiAPagina(0);
    clearSelection();
  };

  // ── Actions ─────────────────────────────────────────────
  const handleAction = async (action: string, doc: DocumentoFiscale) => {
    switch (action) {
      case "view":
        apriDocumento(doc);
        break;
      case "edit":
        navigate(`/azienda/documenti/${doc.id}`);
        break;
      case "duplicate":
        // La riga dell'elenco è ridotta (niente righe né pagamento): la copia nasce dal documento intero.
        try {
          const completo = await rileggiDocumentoFiscale(doc.id);
          navigate(`/azienda/documenti/nuovo?tipo=${doc.tipo}`, { state: preparaCopiaDocumento(completo) });
        } catch (e: unknown) {
          toast.error(tr("Documento non duplicato"), { description: getErrorMessage(e) });
        }
        break;
      case "pdf":
        try {
          if (doc.tipo === "ddt") {
            // DDT usa template @react-pdf/renderer dedicato (layout standard
            // italiano DPR 472/96, senza prezzi, con sezione vettore +
            // subappaltatore + seriali per garanzia). Il toast di successo
            // è gestito dentro l'hook.
            await ddtPdf.generate(doc.id);
          } else {
            // Tutti gli altri tipi (fattura, NC, proforma, ecc.) usano la
            // edge function generate-native-pdf che produce HTML stampabile.
            await downloadNativePDF(doc.id, doc.numero);
            toast.info(tr("Stampa richiesta"), { description: tr("Per salvare il file scegli «Salva come PDF» nel dialogo del browser. Il file non viene scaricato automaticamente."), duration: 12000 });
          }
        } catch (e: unknown) {
          toast.error(tr(getErrorMessage(e)));
        }
        break;
      case "save_pdf":
        try {
          if (doc.tipo === "ddt") {
            await ddtPdf.uploadAndAttach(doc.id);
          } else {
            toast.error(tr("Salvataggio PDF disponibile solo per DDT"));
          }
        } catch (e: unknown) {
          toast.error(tr(getErrorMessage(e)));
        }
        break;
      case "xml":
        try {
          if (!azienda) {
            toast.error(tr("Anagrafica azienda non configurata"));
            return;
          }
          // La riga dell'elenco non ha le righe della fattura: l'XML nasce dal documento intero.
          await scaricaXmlFattura(await rileggiDocumentoFiscale(doc.id), azienda as AnagraficaAzienda);
          toast.success(tr("XML scaricato"));
        } catch (e: unknown) {
          toast.error(tr(getErrorMessage(e)));
        }
        break;
      case "nc":
        try {
          const prefilled = await creaNotaCredito(doc.id, "totale");
          navigate("/azienda/documenti/nuovo?tipo=nota_credito", { state: { prefilled } });
        } catch (e: unknown) {
          toast.error(tr(getErrorMessage(e)));
        }
        break;
      case "pagata":
        // Metodo di pagamento e storni non sono nella riga dell'elenco.
        try {
          setPayTarget(await rileggiDocumentoFiscale(doc.id));
        } catch (e: unknown) {
          toast.error(tr(getErrorMessage(e)));
        }
        break;
      case "delete":
        setDeleteTarget(doc);
        break;
      case "convert_proforma":
        try {
          const fattura = await convertiProformaInFattura(doc.id);
          toast.success(tr("Convertito in fattura"), { description: tr("Bozza {numero}: il numero è già suo, emettila quando è pronta.", { numero: String(fattura.numero ?? "") }) });
          navigate(`/azienda/documenti/${fattura.id}/dettaglio`);
        } catch (e: unknown) {
          toast.error(tr(getErrorMessage(e)));
        }
        break;
      case "restore":
        ripristina.mutate(doc.id);
        break;
      case "fattura_ddt":
        navigate(`/azienda/documenti/nuovo?tipo=fattura&from_ddt=${doc.id}`);
        break;
    }
  };

  // ── Type-specific columns logic ─────────────────────────
  const showColStorno = activeTab === "nota_credito";
  const showColFatturaCollegata = activeTab === "ddt";
  const showColTipo = isTrash;
  const showColEliminazione = isTrash;
  const showColScadenza = !showColStorno && !showColFatturaCollegata && !isTrash;

  if (isScopriPlan) return <UpgradeScopriWall type="sdi_invoice" inline />;

  return (
    <>
    {/* Mobile: «contents», i figli stanno nella colonna del contenitore (vedi hub). */}
    <div className="space-y-3 max-sm:contents max-sm:space-y-0">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6 max-sm:-order-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900">{tr("Fatturazione")}</h1>
              <p className="mt-0.5 text-sm text-slate-500">{tr("Gestisci documenti fiscali, SDI, incassi e scadenze operative.")}</p>
            </div>
          </div>
          {sezioni}
          {/* Testata (25/11/2026): in vista solo «Fatture in bozza» e «Nuovo documento», alti 32px.
              Report, abbinamento alle commesse, emesse importate, scontrini e impostazioni stanno nel «⋯»:
              sette bottoni andavano su due righe e tagliavano il titolo («Fatturazion…»). */}
          <div className="flex flex-wrap items-center gap-1.5">
            {elencoEmesse && !esterna && (
              <Button type="button" variant={soloBozzeFatture ? "secondary" : "outline"} size="sm" aria-pressed={soloBozzeFatture}
                className={cn(BOTTONE_SECONDARIO, "max-sm:h-11 max-sm:px-3 max-sm:text-sm")} onClick={() => {
                  setStatoFilter(soloBozzeFatture ? "all" : "bozza", true);
                  azzeraFiltriElenco();
                }}>
                <FileText aria-hidden="true" />
                {tr("Fatture in bozza")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 max-sm:h-11 max-sm:w-11" aria-label={tr("Altre azioni")}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/azienda/documenti/report"><BarChart3 className="mr-2 h-4 w-4" />{tr("Report fiscali")}</Link>
                </DropdownMenuItem>
                {/* Abbinare scrive su fatture e rate: lo fa chi ha «Pagamenti» (regola del database). */}
                {!isCommercialistaMode && effectiveCompany?.id && permissions.canManagePayments && !permissions.solaLettura && (
                  <DropdownMenuItem onSelect={() => setAbbinaAperto(true)}><Link2 className="mr-2 h-4 w-4" />{tr("Abbina alle commesse")}</DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/azienda/documenti/emesse-importate" title={tr("Fatture emesse con un altro programma e importate, mese per mese")}><FileText className="mr-2 h-4 w-4" />{tr("Emesse importate")}</Link>
                </DropdownMenuItem>
                {!isCommercialistaMode && (
                  <DropdownMenuItem asChild>
                    <Link to="/azienda/documenti/scontrini"><ReceiptText className="mr-2 h-4 w-4" />{tr("Scontrini")}</Link>
                  </DropdownMenuItem>
                )}
                {/* Da telefono la fatturazione non si imposta (solo computer o tablet).
                    Chi importa imposta il collegamento al gestionale, non la numerazione. */}
                {!isCommercialistaMode && !isMobile && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={esterna ? "/azienda/impostazioni/fatturazione" : "/azienda/impostazioni/fatturazione-nativa"}><Settings2 className="mr-2 h-4 w-4" />{tr("Impostazioni")}</Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {!isCommercialistaMode && (
              <>
                {puoCreare && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className={cn(BOTTONE_NUOVO, "max-sm:h-11 max-sm:px-3 max-sm:text-sm")}>
                      <Plus className="h-3.5 w-3.5" /> <span className="max-sm:hidden">{tr("Nuovo documento")}</span><span className="sm:hidden">{tr("Nuovo")}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {/* Solo i tipi che il database accetta davvero. Il menu ne
                        offriva sedici, ma documenti_fiscali.tipo ne ammette nove e
                        documento_crea rispondeva «Il tipo di documento non è ancora
                        gestito» alle altre dieci — parcella TD06, accompagnatoria
                        TD24, acconti TD02/TD03, TD25, reverse charge interno TD16,
                        TD21, TD27 e le autofatture estere TD17/TD18/TD19 — dopo
                        aver fatto aprire l'editor. Per riaccenderne una servono,
                        insieme: il vincolo su documenti_fiscali.tipo, l'elenco in
                        documento_crea, la numerazione, documento_segno e una prova
                        del suo XML. */}
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura")}>{tr("Fattura (TD01)")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura_pa")}>{tr("Fattura PA")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=nota_credito")}>{tr("Nota di Credito")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=nota_debito")}>{tr("Nota di Debito")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=proforma")}>{tr("Pro-Forma")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=ddt")}>DDT</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=reverse_charge_interno")}>{tr("Integrazione reverse charge (TD16)")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=integrazione_servizi_estero")}>{tr("Autofattura servizi esteri (TD17)")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=integrazione_beni_ue")}>{tr("Integrazione beni UE (TD18)")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=integrazione_beni_extra_ue")}>{tr("Integrazione art. 17 c.2 (TD19)")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=autofattura")}>{tr("Autofattura (TD20)")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
                {/* Chi fattura con un altro programma: al posto di «Nuovo documento», Sincronizza. */}
                {esterna && effectiveCompany?.id && <GestionaleEsternoAzioni companyId={effectiveCompany.id} />}
              </>
            )}
          </div>
        </div>
      </div>

      {esterna && effectiveCompany?.id && <ImportInCorsoBanner companyId={effectiveCompany.id} />}

      {/* ── Numeri veloci (solo Fatture) ───────────────── */}
      {!isTrash && !soloBozzeFatture && activeTab === "fattura" && (
        <RiepilogoFatture
          mesi={mesiStriscia}
          mesiAnnoPrima={timelineMonthsPrima}
          meseScelto={selectedMonth}
          isMobile={isMobile}
          caricamento={caricaTimeline}
        />
      )}

      {/* Numeri saltati e mesi sospetti nelle emesse (16/11/2026): stavano in cima alle ricevute. */}
      {!isTrash && !soloBozzeFatture && activeTab === "fattura" && effectiveCompany?.id && (
        <div className="max-md:hidden"><CompletezzaFatture companyId={effectiveCompany.id} /></div>
      )}

      {/* ── Tabs ───────────────────────────────────────── */}
      {/* Mobile: il tipo di documento sta nel pannello dei filtri. */}
      <div role="group" aria-label={tr("Filtra per tipo di documento")} className={cn("flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm", soloTabella)}>
        {TIPO_TABS.map((tab) => {
          const count = counts?.[tab.countKey as keyof typeof counts] ?? 0;
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              aria-pressed={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-all whitespace-nowrap",
                "shrink-0",
                isActive
                  ? "bg-orange-50 text-orange-700 font-medium shadow-sm ring-1 ring-orange-100"
                  : "text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
                tab.tabColor && !isActive && tab.tabColor
              )}
            >
              <TabIcon className="h-4 w-4" />
              {tr(tab.label)}
              {(count as number) > 0 && (
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="ml-1 h-5 min-w-[1.25rem] px-1.5 text-[10px]"
                >
                  {count as number}
                </Badge>
              )}
            </button>
          );
        })}
        {strisciaVisibile && (
          <BottoneMesi className="ml-auto max-md:hidden" idStriscia="striscia-mesi-emesse" aperta={striscia.aperta} onClick={striscia.cambia} months={mesiStriscia} selectedMonth={selectedMonth} />
        )}
      </div>

      {/* ── Monthly Timeline ───────────────────────────── */}
      {/* Strip 12 mesi a scorrimento: filtro secondario ingombrante su mobile.
          Solo da tablet in su; su telefono si resta su "tutti i mesi".
          25/11/2026: sta sotto le linguette dei tipi e si apre col bottone «Mesi» (piegata di
          serie quando si guardano tutti i mesi): 142px in meno prima dell'elenco. */}
      {strisciaVisibile && striscia.aperta && (
        <div id="striscia-mesi-emesse" className="hidden md:block">
          <MonthlyTimeline
            months={mesiStriscia}
            selectedMonth={selectedMonth}
            onSelectMonth={(m) => {
              setSelectedMonth(m);
              setFiltriEmesse(v => ({ ...v, dal: "", al: "" }));
              vaiAPagina(0);
              clearSelection();
            }}
            year={timelineYear}
            onYearChange={(y) => {
              setTimelineYear(y);
              setSelectedMonth(null);
              vaiAPagina(0);
              clearSelection();
            }}
          />
        </div>
      )}

      {/* ── Cestino info banner ─────────────────────── */}
      {isTrash && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2 text-sm max-sm:p-2 max-sm:text-xs">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0 max-sm:hidden" />
          <div className="text-amber-800 dark:text-amber-300">
            {tr("Bozze e documenti non fiscali vengono eliminati definitivamente dopo")} <strong>{tr("14 giorni")}</strong><span className="max-sm:hidden">{tr("; puoi ripristinarli prima della scadenza. Fatture, note di credito e DDT restano invece archiviati anche dopo: la conservazione è obbligatoria per legge.")}</span>
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────── */}
      {/* Mobile: ricerca e bottone dei filtri (tipo e stato nel pannello). */}
      <CercaConFiltri
        className={soloVistaCompatta}
        valore={searchRaw}
        onCambia={(v) => { setSearchRaw(v); setPage(0); clearSelection(); }}
        segnaposto={tr("Cerca documenti")}
        filtriAttivi={(activeTab !== "fattura" ? 1 : 0) + (statoFilter !== "all" ? 1 : 0) + nFiltriEmesse}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />
      <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm", soloTabella)}>
        {!isTrash && (
          <Select value={statoFilter} onValueChange={(v) => { setStatoFilter(v); setPage(0); clearSelection(); }}>
            <SelectTrigger aria-label={tr("Filtra per stato")} className="w-[190px] h-8 text-xs">
              <SelectValue placeholder={tr("Stato")} />
            </SelectTrigger>
            <SelectContent>
              {statiFiltro.map(option => <SelectItem key={option.value} value={option.value}>{tr(option.label)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <div className={cn(RICERCA_BARRA, "max-sm:w-full")}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={tr("Cliente, numero, importo, data o note…")}
            aria-label={tr("Cerca fatture per cliente, numero, importo, data o note")}
            value={searchRaw}
            onChange={(e) => { setSearchRaw(e.target.value); setPage(0); clearSelection(); }}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {elencoEmesse && <FiltriFattureEmesse valore={filtriEmesse} cambia={cambiaFiltriEmesse} />}
        {elencoEmesse && !soloBozzeFatture && <Select value={ordinamento} onValueChange={v => { setOrdinamento(v as "progressivo" | "data"); vaiAPagina(0); clearSelection(); }}>
          <SelectTrigger aria-label={tr("Ordina fatture")} className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="progressivo">{tr("Anno e numero ↓")}</SelectItem><SelectItem value="data">{tr("Data emissione ↓")}</SelectItem></SelectContent>
        </Select>}
        {elencoEmesse && <SceltaColonneEmesse {...sceltaColonne} />}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
            <X className="h-3 w-3" /> {tr("Azzera filtri")}
          </Button>
        )}
      </div>
      {nFiltriEmesse > 0 && <div className={soloTabella}><FiltriEmesseAttivi valore={filtriEmesse} cambia={cambiaFiltriEmesse} /></div>}

      {soloBozzeFatture ? (
        <p className="text-xs text-muted-foreground">{tr("Le bozze modificate più di recente sono in cima. Apri una bozza per continuare a compilarla.")}</p>
      ) : !isTrash && !esterna && activeTab === "nota_credito" && (
        <p className="text-xs text-muted-foreground">{tr("Ordine per anno e numero decrescente. Puoi trovare le bozze con il filtro Bozza.")}</p>
      )}

      <div className="hidden justify-end sm:flex lg:hidden">
        <Button type="button" variant="outline" className="h-11" onClick={() => setTabellaSuTablet(v => !v)}>
          {tabellaSuTablet ? tr("Vista compatta") : tr("Vista tabella")}
        </Button>
      </div>

      {/* ── Bulk Actions Bar ───────────────────────────── */}
      {/* Mobile no: niente selezione multipla. */}
      {someSelected && (
        <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2.5", soloTabella)}>
          <span className="text-sm font-medium">{tr(selectedDocs.length === 1 ? "{n} selezionato" : "{n} selezionati", { n: selectedDocs.length })}</span>

          {/* Niente export su telefono. */}
          {!isMobile && (
            <>
              <Button variant="outline" size="sm" onClick={handleBulkExport}>
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                {tr("Esporta XLS")}
              </Button>
              {!esterna && <Button variant="outline" size="sm" onClick={() => void handleBulkExportXml()}>
                <FileText className="h-4 w-4 mr-1.5" />
                {tr("Esporta XML (zip)")}
              </Button>}
            </>
          )}

          {!isTrash && !esterna && (
            <Button variant="outline" size="sm" onClick={() => setBulkPayOpen(true)}>
              <CreditCard className="h-4 w-4 mr-1.5" />
              {tr("Segna pagati")}
            </Button>
          )}

          {!isTrash && esterna && (
            <Button variant="outline" size="sm" disabled={!importateDaIncassare.length} onClick={() => setBulkIncassaOpen(true)}>
              <CreditCard className="h-4 w-4 mr-1.5" />
              {tr("Segna incassate")}{importateDaIncassare.length ? ` (${importateDaIncassare.length})` : ""}
            </Button>
          )}

          {!esterna && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              {tr("Elimina")}
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={clearSelection} className="ml-auto">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────── */}
      {isError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14">
          <p className="text-sm text-muted-foreground">{tr("Errore nel caricamento dei documenti. Riprova.")}</p>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                {tr("Riprovo...")}
              </>
            ) : tr("Riprova")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-slate-700">{tr("Caricamento documenti...")}</p>
            {showSlowLoading && (
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {tr("Ci sta mettendo più del previsto. Puoi riprovare senza perdere i filtri.")}
              </p>
            )}
          </div>
          {showSlowLoading && (
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  {tr("Riprovo...")}
                </>
              ) : tr("Riprova")}
            </Button>
          )}
        </div>
      ) : docs.length === 0 ? (
        // Mobile: una riga di testo, senza riquadro tratteggiato né icona grande.
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:py-6">
          <currentTab.icon className="h-16 w-16 text-muted-foreground/30 mb-4 max-sm:hidden" />
          <p className="text-lg font-medium max-sm:text-sm">{soloBozzeFatture ? tr("Nessuna fattura in bozza") : tr(currentTab.emptyTitle)}</p>
          <p className="text-sm text-muted-foreground mt-1 max-sm:hidden">
            {hasFilters ? tr("Prova a modificare i filtri.") : esterna ? tr("I documenti arrivano dal tuo gestionale a ogni sincronizzazione.") : tr(currentTab.emptyDescription)}
          </p>
          {!hasFilters && !isTrash && puoCreare && (
            <Button className="mt-4 max-sm:hidden" onClick={() => navigate(`/azienda/documenti/nuovo?tipo=${currentTab.tipos?.[0] ?? "fattura"}`)}>
              <Plus className="h-4 w-4 mr-1" /> {currentTab.label === "Fatture" ? tr("Crea la tua prima fattura") : tr("Nuovo {valore}", { valore: currentTab.label.toLowerCase().replace(/i$/, "o") })}
            </Button>
          )}
        </div>
      ) : (
        <>
        {/* Mobile: una riga per documento (cliente, numero · data · scadenza,
            importo e stato), senza casella, colonne, menu e piè con l'export. */}
        <div className={cn("divide-y divide-border overflow-hidden rounded-lg border bg-card", soloVistaCompatta)}>
          {docs.map((doc) => {
            const scadenza = getScadenzaInfo(doc);
            const isDdt = doc.tipo === "ddt";
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => apriDocumento(doc)}
                className="flex min-h-[52px] w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold leading-tight">{doc.cliente_snapshot?.ragione_sociale || "—"}</div>
                  <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                    {doc.numero} · {formatDateShort(doc.data_emissione)}
                    {scadenza?.scaduta && <span className="font-medium text-destructive">{" · "}{tr("scaduta da {giorni} gg", { giorni: String(scadenza.giorni ?? "") })}</span>}
                    {scadenza && !scadenza.scaduta && scadenza.urgente && <span className="text-amber-600">{" · "}{tr("scade in {giorni} gg", { giorni: String(scadenza.giorni ?? "") })}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={cn("text-[13px] font-semibold leading-tight tabular-nums", activeTab === "nota_credito" && "text-destructive")}>
                    {formatCurrency(doc.totale_documento)}
                  </div>
                  <div className="mt-0.5 flex justify-end">
                    {isDdt && !isTrash ? (
                      <span className={cn("text-[11px]", doc.ddt_fatturato ? "text-emerald-600" : "text-amber-600")}>
                        {doc.ddt_fatturato ? tr("Fatturato") : tr("Da fatturare")}
                      </span>
                    ) : (
                      <StatoBadge stato={doc.stato} className="px-1.5 py-0 text-[10px] [&>svg]:hidden" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className={cn("overflow-hidden rounded-lg border", soloTabella)}>
          <BarraScorrimentoOrizzontale contenitore={riquadroTabella} className="mx-3 my-2" />
          <div>
            <Table wrapperRef={setRiquadroTabella} wrapperClassName={elencoEmesse ? "max-h-[70vh] tabella-scorrevole" : undefined} className={elencoEmesse ? "[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap" : undefined}>
              <TableHeader className={elencoEmesse ? "sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]" : undefined}>
                 <TableRow>
                  <TableHead className={elencoEmesse ? `${STICKY_SELEZIONE} z-20 bg-card` : "w-10"} onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label={tr("Seleziona tutti")}
                    />
                  </TableHead>
                  {elencoEmesse ? <IntestazioniEmesse colonne={sceltaColonne.colonne} /> : <>
                  {showColTipo && <TableHead className="w-28">{tr("Tipo")}</TableHead>}
                  {showColEliminazione && <TableHead className="w-36">{tr("Eliminazione")}</TableHead>}
                  <TableHead className="w-28">{tr("Stato")}</TableHead>
                  <TableHead>{tr("Cliente")}</TableHead>
                  {showColStorno && <TableHead className="w-36">{tr("Storna Fattura")}</TableHead>}
                  <TableHead className="w-36">{tr("Data / Numero")}</TableHead>
                  {showColScadenza && <TableHead className="w-40">{tr("Prox. Scadenza")}</TableHead>}
                  {showColFatturaCollegata && <TableHead className="w-36">{tr("Fattura Collegata")}</TableHead>}
                  <TableHead className="text-right w-28">{tr("Importo")}</TableHead>
                  </>}
                  <TableHead className={elencoEmesse ? "sticky right-0 z-10 bg-card w-24" : "w-20"}><span className="sr-only">{tr("Azioni")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const scadenza = getScadenzaInfo(doc);
                  const isDdt = doc.tipo === "ddt";
                  const ddtFatturato = isDdt && !!doc.ddt_fatturato;

                  return (
                    <TableRow
                      key={doc.id}
                      className="group cursor-pointer"
                      onClick={() => apriDocumento(doc)}
                    >
                      {/* Checkbox */}
                      <TableCell className={elencoEmesse ? `${STICKY_SELEZIONE} z-[1] bg-card group-hover:bg-[color-mix(in_srgb,hsl(var(--muted))_50%,hsl(var(--card)))]` : undefined} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(doc.id)}
                          onCheckedChange={() => toggleSelect(doc.id)}
                          aria-label={tr("Seleziona {numero}", { numero: String(doc.numero ?? "") })}
                        />
                      </TableCell>

                      {elencoEmesse ? <CelleEmesse doc={doc} colonne={sceltaColonne.colonne} apri={() => apriDocumento(doc)}
                      incassa={permissions.canManagePayments && (isDocumentoPagabile(doc)||importataPagabile(doc)) ? ()=>{if(doc.origine==="importata")setIncassoImportata(doc);else setPayTarget(doc);} : undefined}
                      collega={permissions.canViewBilling && !["bozza","annullata","stornata"].includes(doc.stato) && doc.totale_da_pagare>0 ? ()=>setCollegaTarget(doc):undefined} /> : <>
                      {/* Tipo (solo cestino) */}
                      {showColTipo && (
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {{ fattura: "Fattura", fattura_pa: "Fattura PA", proforma: "Proforma", nota_credito: "NC", ddt: "DDT", preventivo: "Preventivo", nota_debito: "Nota Debito", autofattura: "Autofattura", fattura_riepilogativa: "Riepilogativa", parcella: "Parcella", fattura_accompagnatoria: "F. Accomp.", integrazione_servizi_estero: "TD17", integrazione_beni_ue: "TD18", integrazione_beni_extra_ue: "TD19", acconto_fattura: "Acconto fattura", acconto_parcella: "Acconto parcella", autoconsumo: "Autoconsumo", autofattura_splafonamento: "TD21", fattura_differita_b: "TD25", reverse_charge_interno: "TD16" }[doc.tipo] ?? doc.tipo}
                          </Badge>
                        </TableCell>
                      )}

                      {/* Giorni rimasti prima dell'eliminazione definitiva (solo cestino) */}
                      {showColEliminazione && (
                        <TableCell>
                          {(() => {
                            if (!doc.deleted_at) return <span className="text-xs text-muted-foreground">—</span>;
                            // Fatture, note e DDT non vengono mai cancellati:
                            // mostrare un conto alla rovescia sarebbe una promessa falsa.
                            if (documentoDaConservare(doc.tipo, doc.stato)) {
                              return (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={tr("Conservazione obbligatoria: resta archiviato anche dopo i 14 giorni")}>
                                  <ShieldCheck className="h-3 w-3" /> {tr("Conservato per legge")}
                                </span>
                              );
                            }
                            const deletedDate = new Date(doc.deleted_at);
                            const expiryDate = new Date(deletedDate.getTime() + 14 * 86400000);
                            const daysLeft = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000));
                            return (
                              <span className={cn(
                                "inline-flex items-center gap-1 text-xs",
                                daysLeft <= 3 ? "text-destructive font-medium" : daysLeft <= 7 ? "text-amber-600" : "text-muted-foreground"
                              )}>
                                <Clock className="h-3 w-3" />
                                {daysLeft === 0 ? tr("Scade oggi") : tr("{daysLeft} giorni rimasti", { daysLeft: String(daysLeft ?? "") })}
                              </span>
                            );
                          })()}
                        </TableCell>
                      )}

                      {/* Stato */}
                      <TableCell>
                        {isDdt && !isTrash ? (
                          <Badge className={cn("text-[10px]", ddtFatturato ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200")}>
                            {ddtFatturato ? tr("✓ Fatturato") : tr("⏳ Da fatturare")}
                          </Badge>
                        ) : doc.origine !== "importata" && faseSdi(doc) ? (
                          // Fattura elettronica: la fase SDI, e accanto l'incasso
                          // quando c'è (una fattura può essere pagata e mai inviata).
                          <div className="flex flex-wrap items-center gap-1">
                            {["pagata", "parzialmente_pagata", "scaduta", "stornata"].includes(doc.stato) && (
                              <StatoBadge stato={doc.stato} />
                            )}
                            <FaseSdiBadge doc={doc} />
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            <StatoBadge stato={doc.stato} />
                            {doc.origine === "importata" && senzaIncasso?.has(doc.id) && (
                              <span className="whitespace-nowrap text-[10px] font-medium text-amber-700 dark:text-amber-400" title={tr("Segnata incassata senza un incasso registrato, una scadenza incassata o un bonifico abbinato")}>{tr("senza incasso")}</span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Cliente */}
                      <TableCell className="text-sm font-medium">
                        {doc.cliente_snapshot?.ragione_sociale || "—"}
                      </TableCell>

                      {/* Storna Fattura (solo NC) */}
                      {showColStorno && (
                        <TableCell>
                          {doc.documento_correlato_id ? (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(doc.origine === "importata" ? `/azienda/documenti/importata/${doc.documento_correlato_id}` : `/azienda/documenti/${doc.documento_correlato_id}/dettaglio`);
                              }}
                            >
                              {tr("Vedi fattura originale")}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Data / Numero */}
                      <TableCell>
                        <span className="text-sm">{formatDateShort(doc.data_emissione)}</span>
                        <br />
                        <span className="text-xs text-muted-foreground font-mono">{doc.numero}</span>
                      </TableCell>

                      {/* Prox. Scadenza (fatture, proforma) */}
                      {showColScadenza && (
                        <TableCell>
                          {scadenza ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-xs",
                                scadenza.scaduta
                                  ? "text-destructive font-medium"
                                  : scadenza.urgente
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground"
                              )}
                            >
                              {scadenza.scaduta ? (
                                <><AlertCircle className="h-3 w-3" /> {tr("Scaduta da {giorni} gg", { giorni: String(scadenza.giorni ?? "") })}</>
                              ) : (
                                <><Clock className="h-3 w-3" /> {tr("Scade in {giorni} gg", { giorni: String(scadenza.giorni ?? "") })}</>
                              )}
                            </span>
                          ) : doc.stato === "pagata" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> {tr("Pagata")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Fattura Collegata (solo DDT) */}
                      {showColFatturaCollegata && (
                        <TableCell>
                          {doc.ddt_fattura_id ? (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/azienda/documenti/${doc.ddt_fattura_id}/dettaglio`);
                              }}
                            >
                              {tr("Vedi fattura")}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Importo */}
                      <TableCell className={cn("text-right font-mono font-semibold text-sm", activeTab === "nota_credito" && "text-destructive")}>
                        {formatCurrency(doc.totale_documento)}
                      </TableCell>
                      </>}

                      {/* Azioni: l'icona «Segna incassata» finché c'è da incassare, il resto nel menu. */}
                      <TableCell className={elencoEmesse ? "sticky right-0 z-[1] bg-card py-2" : undefined} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                        {!isTrash && (doc.origine === "importata" ? importataPagabile(doc) : isDocumentoPagabile(doc)) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={tr("Segna incassata")}
                            aria-label={tr("Segna incassata la fattura {numero}", { numero: String(doc.numero ?? "") })}
                            onClick={() => (doc.origine === "importata" ? setIncassoImportata(doc) : handleAction("pagata", doc))}
                          >
                            <CreditCard className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={tr("Altre azioni")} className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {doc.origine === "importata" ? (
                              // Fattura del gestionale: si consulta e si incassa, non si modifica.
                              <>
                                <DropdownMenuItem onClick={() => apriDocumento(doc)}>
                                  <Eye className="h-4 w-4 mr-2" /> {tr("Visualizza")}
                                </DropdownMenuItem>
                                {importataPagabile(doc) && (
                                  <DropdownMenuItem onClick={() => setIncassoImportata(doc)}>
                                    <CreditCard className="h-4 w-4 mr-2" /> {tr("Segna pagata")}
                                  </DropdownMenuItem>
                                )}
                                {siRiportaDaIncassare(doc) && (
                                  <DropdownMenuItem onClick={() => setDaRiaprire(doc)}>
                                    <RotateCcw className="h-4 w-4 mr-2" /> {tr("Riporta da incassare")}
                                  </DropdownMenuItem>
                                )}
                              </>
                            ) : isTrash && esterna ? (
                              <DropdownMenuItem disabled>{tr("Nel cestino")}</DropdownMenuItem>
                            ) : isTrash ? (
                              <>
                                {/* Si elimina da sola dopo 14 giorni, se la legge non la vuole conservata. */}
                                {siPuoRipristinare(doc) ? (
                                  <DropdownMenuItem onClick={() => handleAction("restore", doc)}>
                                    <RotateCcw className="h-4 w-4 mr-2" /> {tr("Ripristina")}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem disabled>{tr("In archivio: annullata con il suo numero")}</DropdownMenuItem>
                                )}
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => handleAction("view", doc)}>
                                  <Eye className="h-4 w-4 mr-2" /> {tr("Visualizza")}
                                </DropdownMenuItem>
                                {doc.stato === "bozza" && puoCreare && (
                                  <DropdownMenuItem onClick={() => handleAction("edit", doc)}>
                                    <Pencil className="h-4 w-4 mr-2" /> {tr("Modifica")}
                                  </DropdownMenuItem>
                                )}
                                {puoCreare && siPuoDuplicare(doc.tipo) && (
                                  <DropdownMenuItem onClick={() => handleAction("duplicate", doc)}>
                                    <Copy className="h-4 w-4 mr-2" /> {tr("Duplica")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {/* Niente export su telefono. */}
                                {!isMobile && (
                                  <DropdownMenuItem onClick={() => handleAction("pdf", doc)}>
                                    <Download className="h-4 w-4 mr-2" /> {tr("Scarica PDF")}
                                  </DropdownMenuItem>
                                )}
                                {doc.tipo === "ddt" && !esterna && (
                                  <DropdownMenuItem
                                    onClick={() => handleAction("save_pdf", doc)}
                                    disabled={ddtPdf.isUploading}
                                  >
                                    <FileText className="h-4 w-4 mr-2" /> {tr("Salva PDF su documento")}
                                  </DropdownMenuItem>
                                )}
                                {/* Niente export su telefono. */}
                                {!isMobile && !["ddt", "proforma", "preventivo"].includes(doc.tipo) && (
                                  <DropdownMenuItem onClick={() => handleAction("xml", doc)}>
                                    <FileText className="h-4 w-4 mr-2" /> {tr("Scarica XML")}
                                  </DropdownMenuItem>
                                )}

                                {/* Proforma: converti in fattura */}
                                {puoCreare && doc.tipo === "proforma" && doc.stato !== "annullata" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-emerald-600" onClick={() => handleAction("convert_proforma", doc)}>
                                      <FileText className="h-4 w-4 mr-2" /> {tr("Converti in Fattura")}
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {/* DDT: fattura da DDT */}
                                {puoCreare && doc.tipo === "ddt" && !doc.ddt_fatturato && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-emerald-600" onClick={() => handleAction("fattura_ddt", doc)}>
                                      <FileText className="h-4 w-4 mr-2" /> {tr("Fattura da questo DDT")}
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {/* Fatture: NC */}
                                {puoCreare && NC_ALLOWED.includes(doc.stato) && ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria"].includes(doc.tipo) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleAction("nc", doc)}>
                                      <FileWarning className="h-4 w-4 mr-2" /> {tr("Emetti NC")}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {isDocumentoPagabile(doc) && (
                                  <DropdownMenuItem onClick={() => handleAction("pagata", doc)}>
                                    <CreditCard className="h-4 w-4 mr-2" /> {tr("Segna pagata")}
                                  </DropdownMenuItem>
                                )}
                                {/* Storico, annulla incasso, abbina al bonifico. Da telefono no.
                                    Solo fatture native: le importate li hanno nel loro dettaglio. */}
                                {!isMobile && !esterna && haIncassi(doc) && (
                                  <DropdownMenuItem onClick={() => setIncassiId(doc.id)}>
                                    <Landmark className="h-4 w-4 mr-2" /> {tr("Incassi e banca")}
                                  </DropdownMenuItem>
                                )}
                {!esterna && isDocumentoEliminabile(doc) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => handleAction("delete", doc)}>
                      <Trash2 className="h-4 w-4 mr-2" /> {tr("Elimina")}
                    </DropdownMenuItem>
                  </>
                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <DocumentiFooter
            total={total}
            documenti={docs}
            totalImponibile={totals.imp}
            totalIva={totals.iva}
            totalDocumento={totals.tot}
          />
        </div>
        </>
      )}

      {/* ── Pagination ─────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground max-sm:text-xs">{tr("Pagina {page} di {totalPages}", { page: page + 1, totalPages: String(totalPages ?? "") })}</p>
          <div className="flex items-center gap-2">
            <Button aria-label={tr("Pagina precedente")} variant="outline" size="sm" className="max-lg:size-11" disabled={page === 0} onClick={() => { vaiAPagina(page - 1); clearSelection(); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button aria-label={tr("Pagina successiva")} variant="outline" size="sm" className="max-lg:size-11" disabled={page >= totalPages - 1} onClick={() => { vaiAPagina(page + 1); clearSelection(); }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Mobile: tipo di documento (le linguette del desktop) e stato. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={(activeTab !== "fattura" ? 1 : 0) + (statoFilter !== "all" ? 1 : 0) + nFiltriEmesse}
        onAzzera={() => handleTabChange("fattura")}
        risultati={total}
      >
        <GruppoFiltri>
          <SceltaFiltro titolo={tr("Documento")} valore={activeTab} onScegli={handleTabChange}
            scelte={TIPO_TABS.map(({ id, label }) => ({ value: id, label }))} />
          {!isTrash && (
            <SceltaFiltro titolo={tr("Stato")} valore={statoFilter} scelte={statiFiltro}
              onScegli={v => { setStatoFilter(v); setPage(0); clearSelection(); }} />
          )}
          {elencoEmesse && <DettaglioFiltri titolo={tr("Altri filtri")} riepilogo={nFiltriEmesse ? String(nFiltriEmesse) : undefined}>
            <FiltriFattureEmesse valore={filtriEmesse} cambia={cambiaFiltriEmesse} compatto />
          </DettaglioFiltri>}
        </GruppoFiltri>
      </PannelloFiltri>

      {/* ── Delete Confirmation Dialog ───────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.stato === "bozza"
                ? tr("Eliminare il documento?")
                : deleteTarget?.stato === "annullata"
                  ? tr("Eliminare definitivamente?")
                  : tr("Documento non eliminabile")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.stato === "bozza"
                ? <>{tr("Stai per spostare nel cestino il documento")} <strong>{deleteTarget?.numero}</strong>.</>
                : deleteTarget?.stato === "annullata"
                  ? <>{tr("Il documento")} <strong>{deleteTarget?.numero}</strong> {tr("verrà mantenuto nel cestino secondo le regole di conservazione fiscale.")}</>
                  : <>{tr("Il documento")} <strong>{deleteTarget?.numero}</strong> {tr("è emesso: usa una nota di credito per stornarlo.")}</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || updateMutation.isPending}
              onClick={() => {
                if (deleteTarget && isDocumentoEliminabile(deleteTarget)) {
                  deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
                } else {
                  setDeleteTarget(null);
                }
              }}
            >
              {(deleteMutation.isPending || updateMutation.isPending)
                ? tr("Elaborazione...")
                : deleteTarget && isDocumentoEliminabile(deleteTarget)
                  ? tr("Sposta nel cestino")
                  : tr("Chiudi")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CollegaEmessaDialog doc={collegaTarget} onOpenChange={open=>{if(!open)setCollegaTarget(null);}} />

      {/* ── Segna pagata: un incasso vero, con metodo e data ── */}
      <SegnaPagataDialog
        open={!!payTarget}
        onOpenChange={(open) => !open && setPayTarget(null)}
        fatture={payTarget ? [payTarget] : []}
      />

      {/* ── Incassi della fattura: storico, annulla, abbina al bonifico ── */}
      <IncassiFatturaDialog
        doc={incassiId ? docs.find((d) => d.id === incassiId) ?? null : null}
        pagabile={!!incassiId && docs.some((d) => d.id === incassiId && isDocumentoPagabile(d))}
        onOpenChange={(open) => !open && setIncassiId(null)}
      />

      {/* ── Bulk Delete Confirmation ─────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Eliminare {size} documenti?", { size: String(selectedIds.size ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("Solo bozze e documenti già annullati verranno spostati nel cestino. I documenti emessi devono essere stornati con nota di credito.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={handleBulkDelete}
            >
              {deleteMutation.isPending ? tr("Eliminazione...") : tr("Elimina consentiti")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Segna pagate (selezione): un incasso per fattura ── */}
      <SegnaPagataDialog
        open={bulkPayOpen}
        onOpenChange={setBulkPayOpen}
        fatture={pagabiliSelezionate}
        escluse={selectedDocs.length - pagabiliSelezionate.length}
        onFatto={clearSelection}
      />
    </div>

      {effectiveCompany?.id && (
        <SegnaIncassateImportateDialog open={bulkIncassaOpen} onOpenChange={setBulkIncassaOpen} fatture={importateDaIncassare}
          escluse={selectedDocs.length - importateDaIncassare.length} companyId={effectiveCompany.id} onFatto={clearSelection} />
      )}
      {effectiveCompany?.id && (
        <SegnaPagataImportataDialog fattura={incassoImportata} companyId={effectiveCompany.id} onClose={() => setIncassoImportata(null)} />
      )}
      {daRiaprire && (
        <RiportaDaIncassareDialog fattura={daRiaprire} onClose={() => setDaRiaprire(null)} />
      )}
      {effectiveCompany?.id && (
        <AbbinaFattureCommesseDialog
          open={abbinaAperto}
          onOpenChange={setAbbinaAperto}
          companyId={effectiveCompany.id}
        />
      )}
    </>
  );
}

export default function DocumentiFiscaliList() {
  const t = useT();
  return (
    <ErrorBoundary title={t("Errore nella lista documenti fiscali")}>
      <DocumentiFiscaliHub />
    </ErrorBoundary>
  );
}
