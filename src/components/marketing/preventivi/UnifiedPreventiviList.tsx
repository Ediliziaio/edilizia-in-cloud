/**
 * UnifiedPreventiviList — vista unica "Preventivi" cross-modulo.
 *
 * Aggrega in una sola tabella:
 *   - quotes (Classico)
 *   - sr_progetti (Serramenti)
 *   - v_fv_progetti_dashboard (Fotovoltaico)
 *
 * Layout:
 *   1. KPI Hero (4 metriche principali)
 *   2. Striscia avanzata navy (4 metriche aggiuntive)
 *   3. Grafici: Trend 6 mesi + Donut distribuzione per tipo
 *   4. Toolbar: search + Filtra + Export + counter
 *   5. Sub-tab stati
 *   6. Chip filtri attivi
 *   7. Tabella unificata (7 colonne) con paginazione + mobile cards
 *
 * Mapping stati cross-modulo → 5 unified states (bozza, in_corso, vinto, perso, altro).
 * Filtri persistenti in URL (?stato=…&tipo=…) per refresh/back-friendly.
 */
import { rigaDatiFiscali, TIPI_CLIENTE, tipoCliente, type TipoCliente } from "@/lib/preventivatore/datiFiscaliCliente";
import { DuplicaLavoroDialog } from "@/components/orders/DuplicaLavoroDialog";
import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { neutralizeXlsxCell } from "@/lib/csvExport";
import { messaggioEsportazioneNonRiuscita, registraEsportazioneCrm } from "@/lib/export/esportazioniCrm";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useModuliVendita } from "@/lib/moduli-vendita";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, ChevronRight, ChevronLeft, FileText, RectangleVertical, Sun,
  Inbox, X, Target, TrendingUp, Clock, FileCheck2, Euro,
  SlidersHorizontal, Download, Loader2, Hammer, Bath, Home, Wind, Zap, Flame, LayoutGrid, Waves,
  Trash2, MoreHorizontal, ExternalLink, Copy, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTONE_SECONDARIO } from "@/components/orders/TestataScheda";
import { OperationalViewSwitch } from "@/components/orders/OperationalViewSwitch";
import { SceltaColonne } from "@/components/tabelle/SceltaColonne";
import { useColonneTabella } from "@/hooks/useColonneTabella";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PreventiviPipeline } from "./PreventiviPipeline";
import { salvaSpostamentoPreventivo } from "@/lib/preventivi/salvaSpostamentoPipeline";
import { BottoneGrafici } from "@/components/shared/BottoneGrafici";
import { useGraficiRicordati } from "@/hooks/useGraficiRicordati";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import { UnifiedFiltersSheet, type UnifiedFilters, DEFAULT_FILTERS } from "./UnifiedFiltersSheet";
import {
  mapClassicoStato,
  mapSerramentiStato,
  mapFotovoltaicoStato,
  mapRistrutturazioneStato,
  type UnifiedStato,
} from "@/lib/preventivi/statoUnificato";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { useTableSelection } from "@/hooks/useTableSelection";
import { UnifiedBulkToolbar, eliminaComputi, spostaNelCestino } from "./UnifiedBulkToolbar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  appartieneAllaVista, contaPerStato, eBozzaVuota, eDaSeguire, eInScadenza, etichettaEta, etichettaScadenza, giorniDa,
  vistaDaTesto, type VistaElenco,
} from "@/lib/preventivi/elencoPreventivi";
import { CercaConFiltri, DettaglioFiltri, GruppoFiltri, PannelloFiltri, RigaMobile, SceltaFiltro } from "@/components/mobile/FiltriMobile";
import { eRigaDiModulo } from "@/lib/moduli/quoteBridge";
import { importoPreventivoFv, type ImportoPreventivoFvInput } from "@/lib/fotovoltaico/importoPreventivo";
import { elencaComputiCloud, type RiepilogoComputoCloud } from "@/lib/computo/cloudComputo";
import { elencaComputiPreventivo } from "@/lib/computo/editorNativo";
import { totaleElencoComputo } from "@/lib/computo/economiaComputo";
import { useT, intlCampo, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

const GraficiPreventivi = lazy(() => import("./GraficiPreventivi"));

export type PreventivoTipo = "classico" | "serramenti" | "fotovoltaico" | "ristrutturazione" | "bagni" | "tetti" | "climatizzazione" | "elettrico" | "termoidraulico" | "pavimenti" | "piscine" | "computo";
export type { UnifiedStato };

export interface UnifiedRow {
  id: string;
  tipo: PreventivoTipo;
  numero: string;
  /** Una riga di descrizione sotto il numero (il titolo del computo), quando il numero da solo non dice cosa sia. */
  titolo?: string | null;
  cliente: string;
  email?: string | null;
  telefono?: string | null;
  /** Per un'azienda o un ente pubblico, la persona di riferimento: non si vede in colonna ma si trova cercando. */
  referente?: string | null;
  /** Privato, azienda o ente pubblico, e i dati fiscali: si cercano e vanno nell'Excel (31/10/2026). */
  clienteTipo?: TipoCliente;
  fiscale?: string | null;
  /** Fin quando vale l'offerta, e quando il cliente l'ha aperta (preventivo classico, 31/10/2026). */
  scadenza?: string | null;
  apertoIl?: string | null;
  commerciale_id: string | null;
  commerciale_nome: string | null;
  stato_unif: UnifiedStato;
  stato_raw: string;
  totale: number | null;
  data: string;
  href: string;
}

export const TIPO_LABEL: Record<PreventivoTipo, { label: string; className: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
  classico:         { label: "Classico",         className: "bg-slate-100 text-slate-700 border-slate-200",   color: "#64748b", Icon: FileText },
  serramenti:       { label: "Serramenti",       className: "bg-orange-100 text-orange-700 border-orange-200", color: "#f97316", Icon: RectangleVertical },
  fotovoltaico:     { label: "Fotovoltaico",     className: "bg-amber-100 text-amber-800 border-amber-200",    color: "#f59e0b", Icon: Sun },
  ristrutturazione: { label: "Ristrutturazione", className: "bg-teal-100 text-teal-700 border-teal-200",       color: "#0d9488", Icon: Hammer },
  bagni:            { label: "Bagni",            className: "bg-cyan-100 text-cyan-700 border-cyan-200",       color: "#0891b2", Icon: Bath },
  tetti:            { label: "Tetti",            className: "bg-stone-100 text-stone-700 border-stone-200",    color: "#78716c", Icon: Home },
  climatizzazione:  { label: "Climatizzazione",  className: "bg-sky-100 text-sky-700 border-sky-200",          color: "#0284c7", Icon: Wind },
  elettrico:        { label: "Elettrico",        className: "bg-amber-100 text-amber-700 border-amber-200",    color: "#d97706", Icon: Zap },
  termoidraulico:   { label: "Termoidraulico",   className: "bg-rose-100 text-rose-700 border-rose-200",       color: "#e11d48", Icon: Flame },
  pavimenti:        { label: "Pavimenti",        className: "bg-teal-100 text-teal-700 border-teal-200",       color: "#0d9488", Icon: LayoutGrid },
  piscine:          { label: "Piscine",          className: "bg-blue-100 text-blue-700 border-blue-200",       color: "#2563eb", Icon: Waves },
  computo:          { label: "Computo",          className: "bg-indigo-100 text-indigo-700 border-indigo-200", color: "#4f46e5", Icon: Calculator },
};

export const STATO_UNIF_LABEL: Record<UnifiedStato, { label: string; className: string }> = {
  bozza:    { label: "Bozza",    className: "bg-slate-100 text-slate-700 border-slate-200" },
  in_corso: { label: "In corso", className: "bg-blue-50 text-eic-navy-deep border-blue-200" },
  vinto:    { label: "Vinto",    className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  perso:    { label: "Perso",    className: "bg-rose-100 text-rose-700 border-rose-200" },
  altro:    { label: "Altro",    className: "bg-slate-100 text-slate-500 border-slate-200" },
};

// Le mappature di stato cross-modulo (mapClassicoStato/mapSerramentiStato/
// mapFotovoltaicoStato) vivono in @/lib/preventivi/statoUnificato — single
// source rispecchiata dalla vista DB v_preventivi_unificati.

const PAGE_SIZE = 50;
const COLONNE_PREVENTIVI = [
  { chiave: "numero", etichetta: "Numero", fissa: true },
  { chiave: "cliente", etichetta: "Cliente" },
  { chiave: "oggetto", etichetta: "Oggetto" },
  { chiave: "tipo", etichetta: "Tipo" },
  { chiave: "commerciale", etichetta: "Commerciale" },
  { chiave: "stato", etichetta: "Stato" },
  { chiave: "situazione", etichetta: "Situazione" },
  { chiave: "totale", etichetta: "Totale" },
  { chiave: "scadenza", etichetta: "Scadenza" },
  { chiave: "aggiornato", etichetta: "Aggiornato" },
  { chiave: "referente", etichetta: "Referente", spentaDiSerie: true },
  { chiave: "fiscale", etichetta: "Dati fiscali", spentaDiSerie: true },
];

/** Candidati, non identità certe: nomi vuoti non vanno mai raggruppati. */
function nominativo(r: UnifiedRow): string {
  const nome = r.cliente.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
  return nome === "—" || nome === "-" ? "" : nome;
}

/** Format date sicuro: ritorna "—" se la stringa non è una data valida. */
type ClienteDellaRiga = { cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null };
const eEnte = (r: ClienteDellaRiga) => (r.cliente_tipo === "azienda" || r.cliente_tipo === "pa") && !!r.cliente_ragione_sociale?.trim();
/** In colonna Cliente: la ragione sociale di un'azienda o di un ente pubblico, altrimenti nome e cognome (31/10/2026). */
function nomeClienteRiga(r: ClienteDellaRiga): string {
  return eEnte(r) ? r.cliente_ragione_sociale!.trim() : [r.cliente_nome, r.cliente_cognome].filter(Boolean).join(" ") || "—";
}
/** «P.IVA … · C.F. …» del cliente: si cerca, e va nell'Excel. */
function fiscaleRiga(r: ClienteDellaRiga): string | null {
  return rigaDatiFiscali({ tipo: tipoCliente(r.cliente_tipo), codiceFiscale: r.cliente_codice_fiscale, partitaIva: r.cliente_partita_iva }) || null;
}
/** La persona dietro l'azienda o l'ente: si trova cercando. */
function referenteRiga(r: ClienteDellaRiga): string | null {
  return eEnte(r) ? [r.cliente_nome, r.cliente_cognome].filter(Boolean).join(" ") || null : null;
}

function formatDateSafe(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy", { locale: dateFnsCampo() });
}

export function UnifiedPreventiviList({ onApriCestino }: { onApriCestino?: () => void } = {}) {
  const tr = useT();
  const navigate = useNavigate();
  const isMobile = useIsMobile(1024);
  // Telefono: stato, tipo e ordine in un pannello dal basso (erano una barra
  // con cestino e contatore, una riga di chip e una riga di schede di stato).
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const companyId = useEffectiveCompanyId();
  // Numero, cliente e totale dei preventivi: si esportano solo con «Esporta
  // Clienti» (gli amministratori ce l'hanno sempre). Il database lo ricontrolla.
  const { canExportClients, onlyAssigned, canEditPreventivi } = usePermissions();
  const queryClient = useQueryClient();
  const sel = useTableSelection();
  const { moduli } = useModuliVendita();
  const [searchParams, setSearchParams] = useSearchParams();
  const colonne = useColonneTabella("preventivi", COLONNE_PREVENTIVI);
  const [scrollTabella, setScrollTabella] = useState<HTMLDivElement | null>(null);
  const [visualizzazione, setVisualizzazione] = useState<"elenco" | "pipeline">(
    () => searchParams.get("visualizzazione") === "pipeline" ? "pipeline" : "elenco",
  );
  const [clienteCorrelato, setClienteCorrelato] = useState<UnifiedRow | null>(null);

  // ─── Stato locale: filtri + UI ─────────────────────────────────────────
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statoTab, setStatoTab] = useState<UnifiedStato | "all">(
    (searchParams.get("stato") as UnifiedStato | "all") || "all"
  );
  const [filters, setFilters] = useState<UnifiedFilters>(() => ({
    ...DEFAULT_FILTERS,
    tipi: (searchParams.get("tipi")?.split(",").filter(Boolean) as PreventivoTipo[]) ?? [],
    commercialeId: searchParams.get("comm") ?? "all",
    sort: (searchParams.get("sort") as UnifiedFilters["sort"]) ?? "recent",
  }));
  const [vista, setVista] = useState<VistaElenco>(() => vistaDaTesto(searchParams.get("vista")));
  const { role, user } = useAuth();
  // Elimina chi modifica i preventivi (12/11/2026), non solo l'amministratore.
  const puoEliminare = role === "super_admin" || role === "company_admin" || canEditPreventivi;
  const [daCestinare, setDaCestinare] = useState<UnifiedRow | null>(null);
  const [inDuplicazione, setInDuplicazione] = useState<string | null>(null);

  const [ristrutturazioneDaDuplicare, setRistrutturazioneDaDuplicare] = useState<string | null>(null);

  /** Tipi che si sanno duplicare dall'elenco: la copia nasce in bozza, senza firme né invii, e si apre per adattarla. */
  const sapDuplicare = (r: UnifiedRow) => canEditPreventivi && (r.tipo === "classico" || r.tipo === "serramenti" || r.tipo === "fotovoltaico" || r.tipo === "ristrutturazione");
  const duplica = async (r: UnifiedRow) => {
    if (inDuplicazione || !companyId) return;
    if (r.tipo === "ristrutturazione") {
      if (canEditPreventivi) setRistrutturazioneDaDuplicare(r.id);
      return;
    }
    setInDuplicazione(r.id);
    try {
      let vai: string;
      if (r.tipo === "classico") {
        const { duplicaPreventivo } = await import("@/lib/quotes/duplicaPreventivo");
        const { avvisoSchedeNonAllegate } = await import("@/lib/quotes/allegatiPreventivo");
        const { id, nonAllegate } = await duplicaPreventivo(r.id, companyId, { comeRevisione: false });
        const avviso = avvisoSchedeNonAllegate(nonAllegate);
        if (avviso) toast.warning(tr("Preventivo duplicato: {conteggio}", { conteggio: String(avviso.conteggio ?? "") }), { description: avviso.descrizione, duration: 10000 });
        vai = `/azienda/marketing/preventivi/${id}/modifica`;
      } else if (r.tipo === "serramenti") {
        const { duplicaProgetto } = await import("@/lib/serramenti/api");
        const { newId } = await duplicaProgetto(r.id, { comeRevisione: false });
        vai = `/azienda/serramenti/${newId}/modifica`;
      } else {
        const { data, error } = await supabase.rpc("fv_duplica_progetto" as never, { p_progetto_id: r.id } as never);
        if (error || !data) throw error ?? new Error("La copia non è stata creata");
        vai = `/azienda/marketing/fotovoltaico/${String(data)}`;
      }
      void queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith("unified-prev") });
      toast.success(tr("Preventivo duplicato"), { description: tr("La copia parte in bozza: aprila e adattala.") });
      navigate(vai);
    } catch (e) {
      toast.error(tr("Duplicazione non riuscita"), { description: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    } finally {
      setInDuplicazione(null);
    }
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Statistiche e grafici col bottone «Grafici» nella barra (25/11/2026): era un riquadro apribile
  // alto 46px fra i numeri e la ricerca. Si caricano solo quando si aprono, come prima.
  const [insightsOpen, setInsightsOpen] = useGraficiRicordati("preventivi-elenco");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Sync URL ←→ stato filtri principali (debounced minimal: solo on commit)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set("q", search); else next.delete("q");
    if (statoTab !== "all") next.set("stato", statoTab); else next.delete("stato");
    if (filters.tipi.length > 0) next.set("tipi", filters.tipi.join(",")); else next.delete("tipi");
    if (filters.commercialeId !== "all") next.set("comm", filters.commercialeId); else next.delete("comm");
    if (filters.sort !== "recent") next.set("sort", filters.sort); else next.delete("sort");
    if (vista !== "tutte") next.set("vista", vista); else next.delete("vista");
    if (visualizzazione === "pipeline") next.set("visualizzazione", "pipeline"); else next.delete("visualizzazione");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statoTab, filters.tipi, filters.commercialeId, filters.sort, vista, visualizzazione]);

  const serramentiEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "serramenti")?.isEnabled ?? false,
    [moduli],
  );
  const fotovoltaicoEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "fotovoltaico")?.isEnabled ?? false,
    [moduli],
  );
  const ristrutturazioneEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "ristrutturazione")?.isEnabled ?? false,
    [moduli],
  );
  const bagniEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "bagni")?.isEnabled ?? false,
    [moduli],
  );
  const tettiEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "tetti")?.isEnabled ?? false,
    [moduli],
  );
  const climatizzazioneEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "climatizzazione")?.isEnabled ?? false,
    [moduli],
  );
  const elettricoEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "elettrico")?.isEnabled ?? false,
    [moduli],
  );
  const termoidraulicoEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "termoidraulico")?.isEnabled ?? false,
    [moduli],
  );
  const pavimentiEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "pavimenti")?.isEnabled ?? false,
    [moduli],
  );
  const piscineEnabled = useMemo(
    () => moduli.find((m) => m.modulo.slug === "piscine")?.isEnabled ?? false,
    [moduli],
  );

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data: quotesData = [], isLoading: loadingQuotes } = useQuery({
    queryKey: ["unified-prev-quotes", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, title, description, client_name, client_company, client_email, client_phone, client_tipo, client_fiscal_code, client_vat_number, expires_at, viewed_at, status, total, salesperson_id, created_at, updated_at, revision_number, source")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      // Le righe «modulo:…» sono il documento di firma di un preventivo di
      // modulo, che l'elenco mostra già dalla sua tabella: contarle qui lo
      // faceva comparire due volte, una come «Classico» vuoto.
      return (data as Array<{
        id: string; quote_number: string; title?: string | null; description?: string | null; client_name: string | null; client_company?: string | null; client_email?: string | null; client_phone?: string | null; client_tipo?: string | null; client_fiscal_code?: string | null; client_vat_number?: string | null; expires_at?: string | null; viewed_at?: string | null;
        status: string; total: number | null; salesperson_id: string | null;
        created_at: string; updated_at: string | null;
        revision_number: number | null; source: string | null;
      }>).filter((q) => !eRigaDiModulo(q.source));
    },
  });

  // I preventivi con computo (29/10/2026): le bozze salvate nel gestionale e quelle solo su questo computer,
  // con stato e totale dal loro documento di firma («modulo:computo:<bozza>») quando c'è. Prima stavano in un
  // riquadro a parte in cima alla pagina, che occupava spazio e non si filtrava.
  const { data: computoData = [] } = useQuery({
    queryKey: ["unified-prev-computi", companyId, user?.id],
    enabled: !!companyId,
    queryFn: async () => {
      const [cloud, firme] = await Promise.all([
        elencaComputiCloud(companyId!).catch((): RiepilogoComputoCloud[] => []),
        supabase.from("quotes").select("source, quote_number, status, total, updated_at").eq("company_id", companyId!).like("source", "modulo:computo:%").is("deleted_at", null).limit(500),
      ]);
      const firma = new Map(((firme.data ?? []) as Array<{ source: string; quote_number: string | null; status: string; total: number | null; updated_at: string | null }>).map(q => [q.source.slice("modulo:computo:".length), q]));
      const visti = new Set(cloud.map(c => c.id));
      const locali = user?.id ? (() => { try { return elencaComputiPreventivo(localStorage, companyId!, user.id).filter(l => !visti.has(l.id)); } catch { return []; } })() : [];
      return [
        ...cloud.map(c => ({ id: c.id, titolo: c.titolo, cliente: c.committente, voci: c.numeroVoci ?? 0, data: c.updatedAt, firma: firma.get(c.id) ?? null, locale: false, importo: c.totale })),
        // La bozza sul computer non ha una data: senza firma resta «—» e va in fondo, invece di sembrare toccata oggi.
        // L'importo si calcola dalla bozza intera, che qui c'è (come il totale salvato dei computi nel gestionale).
        ...locali.map(l => {
          const f = firma.get(l.id) ?? null;
          return { id: l.id, titolo: l.bozza.titolo, cliente: l.bozza.committente, voci: l.bozza.voci.length, data: f?.updated_at ?? "", firma: f, locale: true,
            importo: totaleElencoComputo(l.bozza) };
        }),
      ];
    },
  });

  const { data: serramentiData = [], isLoading: loadingSerramenti } = useQuery({
    queryKey: ["unified-prev-serramenti", companyId],
    enabled: !!companyId && serramentiEnabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("sr_progetti")
        .select("id, code, intervento_titolo, cantiere_indirizzo, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale_min, totale_max, consulente_id, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string; intervento_titolo?: string | null; cantiere_indirizzo?: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale_min: number | null; totale_max: number | null;
        consulente_id: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: fvData = [], isLoading: loadingFv } = useQuery({
    queryKey: ["unified-prev-fv", companyId],
    enabled: !!companyId && fotovoltaicoEnabled,
    queryFn: async () => {
      // Query alla TABLE (non alla view v_fv_progetti_dashboard) perché la view
      // non espone created_by. Ricaviamo cliente_nome con nested join su
      // marketing_contacts (FK fv_progetti.cliente_id → marketing_contacts.id).
      // Filtriamo annullato=false per matchare il comportamento della view originale.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("fv_progetti")
        .select(`
          id, numero, stato, indirizzo, prezzo_vendita_iva_inclusa, prezzo_vendita_manuale, kit_bundle_id, kit_prezzo, iva_aliquota,
          created_by, created_at, updated_at, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva,
          cliente:marketing_contacts(first_name, last_name)
        `)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("annullato", false)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      type ClienteJoin = { first_name: string | null; last_name: string | null } | null;
      type Row = ImportoPreventivoFvInput & {
        id: string; numero: string; stato: string; indirizzo?: string | null;
        prezzo_vendita_iva_inclusa: number | null;
        created_by: string | null;
        created_at: string; updated_at: string | null;
        cliente: ClienteJoin;
        cliente_nome?: string | null; cliente_cognome?: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
      };
      return ((data ?? []) as Row[]).map((r) => ({
        id: r.id,
        numero: r.numero,
        indirizzo: r.indirizzo,
        email: r.cliente_email, telefono: r.cliente_telefono,
        stato: r.stato,
        // Il totale come lo dice la pagina del preventivo: la bozza col prezzo a corpo o col kit non ha ancora il
        // totale calcolato (lo scrive solo il calcolo finanziario) e l'elenco mostrava «—».
        importo: importoPreventivoFv(r),
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
        // Prima il cliente scritto nel preventivo (e la ragione sociale, se è un'azienda o un ente), poi il contatto collegato.
        cliente_nome: nomeClienteRiga({ cliente_nome: r.cliente_nome ?? null, cliente_cognome: r.cliente_cognome ?? null, cliente_tipo: r.cliente_tipo, cliente_ragione_sociale: r.cliente_ragione_sociale }).replace(/^—$/, "")
          || (r.cliente ? [r.cliente.first_name, r.cliente.last_name].filter(Boolean).join(" ") || null : null),
        referente: referenteRiga({ cliente_nome: r.cliente_nome ?? null, cliente_cognome: r.cliente_cognome ?? null, cliente_tipo: r.cliente_tipo, cliente_ragione_sociale: r.cliente_ragione_sociale }),
        fiscale: fiscaleRiga({ cliente_nome: null, cliente_cognome: null, cliente_tipo: r.cliente_tipo, cliente_codice_fiscale: r.cliente_codice_fiscale, cliente_partita_iva: r.cliente_partita_iva }),
        clienteTipo: tipoCliente(r.cliente_tipo),
      }));
    },
  });

  const { data: ristrutturazioneData = [], isLoading: loadingRistrutturazione } = useQuery({
    queryKey: ["unified-prev-ristrutturazione", companyId],
    enabled: !!companyId && ristrutturazioneEnabled,
    queryFn: async () => {
      // Tabella rst_* non ancora nei tipi generati → query via (supabase as any),
      // stesso pattern di sr_progetti. La vista DB v_preventivi_unificati
      // (migration locale 20271001010000) rispecchia questo merge lato server.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("rst_progetti")
        .select("id, code, tipo_intervento, cantiere_indirizzo, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; tipo_intervento?: string | null; cantiere_indirizzo?: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: bagniData = [], isLoading: loadingBagni } = useQuery({
    queryKey: ["unified-prev-bagni", companyId],
    enabled: !!companyId && bagniEnabled,
    queryFn: async () => {
      // Tabella bgn_* non ancora nei tipi generati → query via (supabase as any),
      // stesso pattern di rst_progetti.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("bgn_progetti")
        .select("id, code, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: tettiData = [], isLoading: loadingTetti } = useQuery({
    queryKey: ["unified-prev-tetti", companyId],
    enabled: !!companyId && tettiEnabled,
    queryFn: async () => {
      // Tabella tet_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("tet_progetti")
        .select("id, code, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: climatizzazioneData = [], isLoading: loadingClimatizzazione } = useQuery({
    queryKey: ["unified-prev-climatizzazione", companyId],
    enabled: !!companyId && climatizzazioneEnabled,
    queryFn: async () => {
      // Tabella clm_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("clm_progetti")
        .select("id, code, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: elettricoData = [], isLoading: loadingElettrico } = useQuery({
    queryKey: ["unified-prev-elettrico", companyId],
    enabled: !!companyId && elettricoEnabled,
    queryFn: async () => {
      // Tabella ele_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("ele_progetti")
        .select("id, code, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: termoidraulicoData = [], isLoading: loadingTermoidraulico } = useQuery({
    queryKey: ["unified-prev-termoidraulico", companyId],
    enabled: !!companyId && termoidraulicoEnabled,
    queryFn: async () => {
      // Tabella idr_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("idr_progetti")
        .select("id, code, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: pavimentiData = [], isLoading: loadingPavimenti } = useQuery({
    queryKey: ["unified-prev-pavimenti", companyId],
    enabled: !!companyId && pavimentiEnabled,
    queryFn: async () => {
      // Tabella pav_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pav_progetti")
        .select("id, code, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        // La colonna deleted_at c'è dal 30/08/2026 (20280248000000_pav_progetti_cestino): senza
        // il filtro un progetto pavimenti spostato nel Cestino restava in elenco e nei KPI.
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: piscineData = [], isLoading: loadingPiscine } = useQuery({
    queryKey: ["unified-prev-piscine", companyId],
    enabled: !!companyId && piscineEnabled,
    queryFn: async () => {
      // Tabella pis_* non ancora nei tipi generati → query via (supabase as any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pis_progetti")
        .select("id, code, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, cliente_tipo, cliente_ragione_sociale, cliente_codice_fiscale, cliente_partita_iva, stato, totale, created_by, created_at, updated_at")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; code: string | null; cliente_nome: string | null; cliente_cognome: string | null; cliente_email?: string | null; cliente_telefono?: string | null; cliente_tipo?: string | null; cliente_ragione_sociale?: string | null; cliente_codice_fiscale?: string | null; cliente_partita_iva?: string | null;
        stato: string; totale: number | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["unified-prev-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
    },
  });
  const { data: salespeople = [] } = useQuery({
    queryKey: ["unified-prev-salespeople", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const commercialeNameById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => {
      m.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id.slice(0, 6));
    });
    salespeople.forEach((s) => m.set(s.id, `${s.first_name} ${s.last_name}`));
    return m;
  }, [profiles, salespeople]);

  const commercialiOptions = useMemo(() => {
    return Array.from(commercialeNameById.entries()).map(([id, name]) => ({ id, name }));
  }, [commercialeNameById]);

  // ─── Merge unificato ─────────────────────────────────────────────────────
  const allRows: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    for (const q of quotesData) {
      rows.push({
        id: q.id, tipo: "classico",
        numero: (q.quote_number ?? "—") + (q.revision_number ? ` · Rev. ${q.revision_number}` : ""),
        titolo: q.title?.trim() || q.description?.trim() || null,
        // Un'azienda o un ente pubblico in colonna col suo nome (un preventivo di prima con l'azienda scritta conta come azienda).
        cliente: (q.client_tipo !== "privato" && q.client_company?.trim()) || q.client_name || "—",
        email: q.client_email, telefono: q.client_phone,
        referente: q.client_tipo !== "privato" && q.client_company?.trim() ? q.client_name : null,
        scadenza: q.expires_at ?? null, apertoIl: q.viewed_at ?? null,
        ...(() => {
          // Un preventivo di prima senza tipo è un'azienda se ha ragione sociale o partita IVA, come nel preventivo.
          const t = q.client_tipo ? tipoCliente(q.client_tipo) : q.client_company?.trim() || q.client_vat_number?.trim() ? "azienda" : "privato";
          return { clienteTipo: t, fiscale: rigaDatiFiscali({ tipo: t, codiceFiscale: q.client_fiscal_code, partitaIva: q.client_vat_number }) || null };
        })(),
        commerciale_id: q.salesperson_id,
        commerciale_nome: q.salesperson_id ? commercialeNameById.get(q.salesperson_id) ?? null : null,
        stato_unif: mapClassicoStato(q.status),
        stato_raw: q.status,
        totale: q.total != null ? Number(q.total) : null,
        data: q.updated_at ?? q.created_at,
        href: `/azienda/marketing/preventivi/${q.id}`,
      });
    }
    for (const s of serramentiData) {
      const totale = s.totale_min && s.totale_max
        ? (Number(s.totale_min) + Number(s.totale_max)) / 2
        : null;
      rows.push({
        id: s.id, tipo: "serramenti",
        numero: s.code ?? "—",
        titolo: [s.intervento_titolo, s.cantiere_indirizzo].filter(Boolean).join(" · ") || null,
        cliente: nomeClienteRiga(s), referente: referenteRiga(s), fiscale: fiscaleRiga(s), clienteTipo: tipoCliente(s.cliente_tipo),
        email: s.cliente_email, telefono: s.cliente_telefono,
        commerciale_id: s.consulente_id,
        commerciale_nome: s.consulente_id ? commercialeNameById.get(s.consulente_id) ?? null : null,
        stato_unif: mapSerramentiStato(s.stato),
        stato_raw: s.stato,
        totale,
        data: s.updated_at ?? s.created_at,
        href: `/azienda/serramenti/${s.id}/modifica`,
      });
    }
    for (const f of fvData) {
      rows.push({
        id: f.id, tipo: "fotovoltaico",
        numero: f.numero ?? "—",
        titolo: f.indirizzo?.trim() || null,
        cliente: f.cliente_nome ?? "—", referente: f.referente, fiscale: f.fiscale, clienteTipo: f.clienteTipo,
        email: f.email, telefono: f.telefono,
        commerciale_id: f.created_by,
        commerciale_nome: f.created_by ? commercialeNameById.get(f.created_by) ?? null : null,
        stato_unif: mapFotovoltaicoStato(f.stato),
        stato_raw: f.stato,
        totale: f.importo != null ? Number(f.importo) : null,
        data: f.updated_at ?? f.created_at,
        href: `/azienda/marketing/fotovoltaico/${f.id}`,
      });
    }
    for (const r of ristrutturazioneData) {
      rows.push({
        id: r.id, tipo: "ristrutturazione",
        numero: r.code ?? "—",
        titolo: [r.tipo_intervento, r.cantiere_indirizzo].filter(Boolean).join(" · ") || null,
        cliente: nomeClienteRiga(r), referente: referenteRiga(r), fiscale: fiscaleRiga(r), clienteTipo: tipoCliente(r.cliente_tipo),
        email: r.cliente_email, telefono: r.cliente_telefono,
        commerciale_id: r.created_by,
        commerciale_nome: r.created_by ? commercialeNameById.get(r.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(r.stato),
        stato_raw: r.stato,
        totale: r.totale != null ? Number(r.totale) : null,
        data: r.updated_at ?? r.created_at,
        href: `/azienda/ristrutturazione/${r.id}/modifica`,
      });
    }
    for (const b of bagniData) {
      rows.push({
        id: b.id, tipo: "bagni",
        numero: b.code ?? "—",
        cliente: nomeClienteRiga(b), referente: referenteRiga(b), fiscale: fiscaleRiga(b), clienteTipo: tipoCliente(b.cliente_tipo),
        email: b.cliente_email, telefono: b.cliente_telefono,
        commerciale_id: b.created_by,
        commerciale_nome: b.created_by ? commercialeNameById.get(b.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(b.stato),
        stato_raw: b.stato,
        totale: b.totale != null ? Number(b.totale) : null,
        data: b.updated_at ?? b.created_at,
        href: `/azienda/bagni/${b.id}/modifica`,
      });
    }
    for (const t of tettiData) {
      rows.push({
        id: t.id, tipo: "tetti",
        numero: t.code ?? "—",
        cliente: nomeClienteRiga(t), referente: referenteRiga(t), fiscale: fiscaleRiga(t), clienteTipo: tipoCliente(t.cliente_tipo),
        email: t.cliente_email, telefono: t.cliente_telefono,
        commerciale_id: t.created_by,
        commerciale_nome: t.created_by ? commercialeNameById.get(t.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(t.stato),
        stato_raw: t.stato,
        totale: t.totale != null ? Number(t.totale) : null,
        data: t.updated_at ?? t.created_at,
        href: `/azienda/tetti/${t.id}/modifica`,
      });
    }
    for (const c of climatizzazioneData) {
      rows.push({
        id: c.id, tipo: "climatizzazione",
        numero: c.code ?? "—",
        cliente: nomeClienteRiga(c), referente: referenteRiga(c), fiscale: fiscaleRiga(c), clienteTipo: tipoCliente(c.cliente_tipo),
        email: c.cliente_email, telefono: c.cliente_telefono,
        commerciale_id: c.created_by,
        commerciale_nome: c.created_by ? commercialeNameById.get(c.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(c.stato),
        stato_raw: c.stato,
        totale: c.totale != null ? Number(c.totale) : null,
        data: c.updated_at ?? c.created_at,
        href: `/azienda/climatizzazione/${c.id}/modifica`,
      });
    }
    for (const e of elettricoData) {
      rows.push({
        id: e.id, tipo: "elettrico",
        numero: e.code ?? "—",
        cliente: nomeClienteRiga(e), referente: referenteRiga(e), fiscale: fiscaleRiga(e), clienteTipo: tipoCliente(e.cliente_tipo),
        email: e.cliente_email, telefono: e.cliente_telefono,
        commerciale_id: e.created_by,
        commerciale_nome: e.created_by ? commercialeNameById.get(e.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(e.stato),
        stato_raw: e.stato,
        totale: e.totale != null ? Number(e.totale) : null,
        data: e.updated_at ?? e.created_at,
        href: `/azienda/elettrico/${e.id}/modifica`,
      });
    }
    for (const td of termoidraulicoData) {
      rows.push({
        id: td.id, tipo: "termoidraulico",
        numero: td.code ?? "—",
        cliente: nomeClienteRiga(td), referente: referenteRiga(td), fiscale: fiscaleRiga(td), clienteTipo: tipoCliente(td.cliente_tipo),
        email: td.cliente_email, telefono: td.cliente_telefono,
        commerciale_id: td.created_by,
        commerciale_nome: td.created_by ? commercialeNameById.get(td.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(td.stato),
        stato_raw: td.stato,
        totale: td.totale != null ? Number(td.totale) : null,
        data: td.updated_at ?? td.created_at,
        href: `/azienda/termoidraulico/${td.id}/modifica`,
      });
    }
    for (const pv of pavimentiData) {
      rows.push({
        id: pv.id, tipo: "pavimenti",
        numero: pv.code ?? "—",
        cliente: nomeClienteRiga(pv), referente: referenteRiga(pv), fiscale: fiscaleRiga(pv), clienteTipo: tipoCliente(pv.cliente_tipo),
        email: pv.cliente_email, telefono: pv.cliente_telefono,
        commerciale_id: pv.created_by,
        commerciale_nome: pv.created_by ? commercialeNameById.get(pv.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(pv.stato),
        stato_raw: pv.stato,
        totale: pv.totale != null ? Number(pv.totale) : null,
        data: pv.updated_at ?? pv.created_at,
        href: `/azienda/pavimenti/${pv.id}/modifica`,
      });
    }
    for (const ps of piscineData) {
      rows.push({
        id: ps.id, tipo: "piscine",
        numero: ps.code ?? "—",
        cliente: nomeClienteRiga(ps), referente: referenteRiga(ps), fiscale: fiscaleRiga(ps), clienteTipo: tipoCliente(ps.cliente_tipo),
        email: ps.cliente_email, telefono: ps.cliente_telefono,
        commerciale_id: ps.created_by,
        commerciale_nome: ps.created_by ? commercialeNameById.get(ps.created_by) ?? null : null,
        stato_unif: mapRistrutturazioneStato(ps.stato),
        stato_raw: ps.stato,
        totale: ps.totale != null ? Number(ps.totale) : null,
        data: ps.updated_at ?? ps.created_at,
        href: `/azienda/piscine/${ps.id}/modifica`,
      });
    }
    for (const c of computoData) {
      rows.push({
        id: c.id, tipo: "computo",
        numero: c.firma?.quote_number || "Computo",
        // «solo su questo PC» nel titolo, non nella colonna Commerciale, che sotto i 1280 px non si vede.
        titolo: [c.titolo.trim() || "Computo metrico", c.voci ? `${c.voci} ${c.voci === 1 ? "voce" : "voci"}` : null, c.locale ? "solo su questo PC" : null].filter(Boolean).join(" · "),
        cliente: c.cliente.trim() || "—",
        commerciale_id: null, commerciale_nome: null,
        stato_unif: c.firma ? mapClassicoStato(c.firma.status) : "bozza",
        stato_raw: c.firma?.status ?? "bozza",
        totale: c.firma?.total != null ? Number(c.firma.total) : c.importo,
        data: c.data,
        href: `/azienda/marketing/preventivi/computo?bozza=${c.id}`,
      });
    }
    return rows;
  }, [computoData, quotesData, serramentiData, fvData, ristrutturazioneData, bagniData, tettiData, climatizzazioneData, elettricoData, termoidraulicoData, pavimentiData, piscineData, commercialeNameById]);
  const perNominativo = useMemo(() => {
    const gruppi = new Map<string, UnifiedRow[]>();
    for (const r of allRows) {
      const nome = nominativo(r);
      if (nome) {
        const presenti = gruppi.get(nome);
        if (presenti) presenti.push(r); else gruppi.set(nome, [r]);
      }
    }
    return gruppi;
  }, [allRows]);
  const correlatiCliente = clienteCorrelato ? perNominativo.get(nominativo(clienteCorrelato)) ?? [] : [];

  // ─── KPI globali (su dataset completo) ───────────────────────────────────
  const kpi = useMemo(() => {
    const by = (k: UnifiedStato) => allRows.filter((r) => r.stato_unif === k);
    const bozze = by("bozza");
    const inCorso = by("in_corso");
    const vinte = by("vinto");
    const perse = by("perso");

    const ricavoVinte = vinte.reduce((acc, r) => acc + (r.totale ?? 0), 0);
    const pipeline = inCorso.reduce((acc, r) => acc + (r.totale ?? 0), 0);
    const valorePerse = perse.reduce((acc, r) => acc + (r.totale ?? 0), 0);
    const decisioni = vinte.length + perse.length;
    const tassoConv = decisioni > 0 ? Math.round((vinte.length / decisioni) * 100) : null;
    const offerteAttive = inCorso.length + vinte.length + perse.length;
    const valoreMedio = offerteAttive > 0 ? (pipeline + ricavoVinte + valorePerse) / offerteAttive : 0;
    const ticketMedio = vinte.length > 0 ? ricavoVinte / vinte.length : 0;

    return {
      total: allRows.length,
      bozzeCount: bozze.length,
      inCorsoCount: inCorso.length,
      vintaCount: vinte.length,
      persoCount: perse.length,
      ricavoVinte, pipeline,
      tassoConv, valoreMedio, ticketMedio,
    };
  }, [allRows]);

  // ─── Filtri applicati ────────────────────────────────────────────────────
  // Edge cases gestiti:
  //  - importoMin/Max NaN → ignorato (no false negatives)
  //  - importoMin > importoMax → swap automatico (UX-forgiving)
  //  - dateFrom > dateTo → swap automatico
  //  - data riga malformata → tieni la riga (no falso esclusione)
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let importoMinN = filters.importoMin === "" ? null : Number(filters.importoMin);
    let importoMaxN = filters.importoMax === "" ? null : Number(filters.importoMax);
    if (importoMinN != null && !Number.isFinite(importoMinN)) importoMinN = null;
    if (importoMaxN != null && !Number.isFinite(importoMaxN)) importoMaxN = null;
    if (importoMinN != null && importoMaxN != null && importoMinN > importoMaxN) {
      [importoMinN, importoMaxN] = [importoMaxN, importoMinN];
    }
    let dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    let dateTo = filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : null;
    if (dateFrom && isNaN(dateFrom.getTime())) dateFrom = null;
    if (dateTo && isNaN(dateTo.getTime())) dateTo = null;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      [dateFrom, dateTo] = [dateTo, dateFrom];
    }

    const adesso = new Date();
    let out = allRows.filter((r) => {
      if (statoTab !== "all" && r.stato_unif !== statoTab) return false;
      if (!appartieneAllaVista(r, vista, adesso)) return false;
      if (filters.tipi.length > 0 && !filters.tipi.includes(r.tipo)) return false;
      if (filters.commercialeId !== "all") {
        if (filters.commercialeId === "none") {
          if (r.commerciale_id) return false;
        } else if (r.commerciale_id !== filters.commercialeId) return false;
      }
      if (filters.stati.length > 0 && !filters.stati.includes(r.stato_unif)) return false;
      if (importoMinN != null && (r.totale ?? 0) < importoMinN) return false;
      if (importoMaxN != null && (r.totale ?? 0) > importoMaxN) return false;
      if (dateFrom || dateTo) {
        const data = new Date(r.data);
        if (!isNaN(data.getTime())) {
          if (dateFrom && data < dateFrom) return false;
          if (dateTo && data > dateTo) return false;
        }
      }
      if (s) {
        const blob = `${r.numero} ${r.titolo ?? ""} ${r.cliente} ${r.referente ?? ""} ${r.fiscale ?? ""} ${r.commerciale_nome ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });

    // Sort. tsSafe: data malformata → 0 (le mando in fondo)
    const tsOf = (s: string) => {
      const t = new Date(s).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    out = [...out].sort((a, b) => {
      switch (filters.sort) {
        case "oldest":     return tsOf(a.data) - tsOf(b.data);
        case "client_desc": return b.cliente.localeCompare(a.cliente);
        case "value_desc": return (b.totale ?? 0) - (a.totale ?? 0);
        case "value_asc":  return (a.totale ?? 0) - (b.totale ?? 0);
        case "code_asc":   return a.numero.localeCompare(b.numero);
        case "code_desc":  return b.numero.localeCompare(a.numero);
        case "client_asc": return a.cliente.localeCompare(b.cliente);
        case "recent":
        default:
          return tsOf(b.data) - tsOf(a.data);
      }
    });
    return out;
  }, [allRows, search, statoTab, filters, vista]);

  // Reset pagina su cambio filtri (reset intenzionale di stato derivato).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [search, statoTab, filters, vista]);

  // ─── Paginazione ─────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // ─── Conta filtri attivi (esclusi search + statoTab che sono inline) ────
  const advancedFiltersCount = useMemo(() => {
    let n = 0;
    if (filters.tipi.length > 0) n++;
    if (filters.commercialeId !== "all") n++;
    if (filters.stati.length > 0) n++;
    if (filters.importoMin !== "") n++;
    if (filters.importoMax !== "") n++;
    if (filters.dateFrom !== "") n++;
    if (filters.dateTo !== "") n++;
    if (filters.sort !== "recent") n++;
    return n;
  }, [filters]);

  const hasAnyFilter = search !== "" || statoTab !== "all" || vista !== "tutte" || advancedFiltersCount > 0;
  // Telefono: il numero sul bottone dei filtri.
  const filtriMobileAttivi = (statoTab !== "all" ? 1 : 0) + (vista !== "tutte" ? 1 : 0) + advancedFiltersCount;

  const reset = () => {
    setSearch("");
    setStatoTab("all");
    setVista("tutte");
    setFilters(DEFAULT_FILTERS);
  };

  // ─── Export Excel (cross-modulo) ─────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!canExportClients || !companyId) return;
    if (filtered.length === 0) {
      toast.error(tr("Nessun preventivo da esportare"));
      return;
    }
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Edilizia in Cloud";
      wb.created = new Date();
      const ws = wb.addWorksheet("Preventivi", { properties: { defaultRowHeight: 18 } });

      ws.columns = [
        { header: "Numero",       key: "numero",       width: 18 },
        { header: "Cliente",      key: "cliente",      width: 28 },
        { header: "Tipo",         key: "tipo",         width: 14 },
        { header: "Tipo cliente", key: "tipoCliente",  width: 16 },
        { header: "Dati fiscali", key: "fiscale",      width: 34 },
        { header: "Commerciale",  key: "commerciale",  width: 22 },
        { header: "Stato",        key: "stato",        width: 14 },
        { header: "Stato originale", key: "statoRaw",  width: 16 },
        { header: "Totale (€)",   key: "totale",       width: 14, style: { numFmt: '#,##0.00' } },
        { header: "Data",         key: "data",         width: 14, style: { numFmt: 'dd/mm/yyyy' } },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

      filtered.forEach((r) => {
        ws.addRow({
          numero: neutralizeXlsxCell(r.numero),
          cliente: neutralizeXlsxCell(r.cliente),
          tipo: TIPO_LABEL[r.tipo].label,
          tipoCliente: r.clienteTipo ? TIPI_CLIENTE.find(t => t.valore === r.clienteTipo)?.etichetta ?? "" : "",
          fiscale: neutralizeXlsxCell(r.fiscale ?? ""),
          commerciale: neutralizeXlsxCell(r.commerciale_nome ?? ""),
          stato: STATO_UNIF_LABEL[r.stato_unif].label,
          statoRaw: neutralizeXlsxCell(r.stato_raw),
          totale: r.totale ?? 0,
          data: new Date(r.data),
        });
      });

      const buf = await wb.xlsx.writeBuffer();
      // Prima il registro, poi il file: senza registrazione non parte.
      await registraEsportazioneCrm({
        companyId,
        oggetto: "preventivi",
        formato: "xlsx",
        righe: filtered.length,
        filtri: {
          ricerca: search,
          stato: statoTab === "all" ? null : statoTab,
          tipi: filters.tipi,
          stati: filters.stati,
          commerciale: filters.commercialeId === "all" ? null : filters.commercialeId,
          importo_min: filters.importoMin,
          importo_max: filters.importoMax,
          dal: filters.dateFrom,
          al: filters.dateTo,
          perimetro: onlyAssigned ? "solo i propri" : "tutta l'azienda",
        },
      });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preventivi-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tr("Esportati {n} preventivi", { n: filtered.length }));
    } catch (e) {
      console.error("[unified-prev] export failed", e);
      toast.error(messaggioEsportazioneNonRiuscita(e));
    } finally {
      setExporting(false);
    }
  };

  const isLoading = loadingQuotes || loadingSerramenti || loadingFv || loadingRistrutturazione || loadingBagni || loadingTetti || loadingClimatizzazione || loadingElettrico || loadingTermoidraulico || loadingPavimenti || loadingPiscine;

  const tabCounts = {
    all: allRows.length,
    bozza: kpi.bozzeCount,
    in_corso: kpi.inCorsoCount,
    vinto: kpi.vintaCount,
    perso: kpi.persoCount,
    // Stati che non rientrano nei quattro principali (es. archiviati): senza
    // questo la somma delle schede non tornava con «Tutti».
    altro: contaPerStato(allRows).altro ?? 0,
  };
  const adessoElenco = new Date();
  const conteggiVista = {
    da_seguire: allRows.filter((r) => eDaSeguire(r, adessoElenco)).length,
    bozze_vuote: allRows.filter((r) => eBozzaVuota(r)).length,
    in_scadenza: allRows.filter((r) => eInScadenza(r, adessoElenco)).length,
  };
  // Tipi presenti con quanti sono: i bottoni rapidi sopra la tabella.
  const tipiConteggio = (Object.keys(TIPO_LABEL) as PreventivoTipo[])
    .map((t) => ({ tipo: t, n: allRows.filter((r) => r.tipo === t).length }))
    .filter((x) => x.n > 0);
  const bozzeVuoteVisibili = filtered.filter((r) => eBozzaVuota(r));
  const cestinaSingolo = async () => {
    const riga = daCestinare;
    setDaCestinare(null);
    if (!riga || !companyId) return;
    const computo = riga.tipo === "computo";
    const { deleted, errors } = computo ? await eliminaComputi([riga.id], companyId, user?.id) : await spostaNelCestino([riga], companyId);
    if (errors.length) toast.error(computo ? tr("Non sono riuscito a eliminarlo: {errore}", { errore: String(errors[0]) }) : tr("Non sono riuscito a spostarlo nel cestino: {errore}", { errore: String(errors[0]) }));
    else if (deleted === 0) toast.warning(tr("Non eliminato: non hai i permessi su questo preventivo. Chiedi al titolare dell'azienda di darti l'accesso."));
    else toast.success(computo ? tr("Computo eliminato") : tr("Spostato nel cestino — recuperabile per 30 giorni"));
    void queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith("unified-prev") });
  };
  const freccia = (primo: UnifiedFilters["sort"], secondo: UnifiedFilters["sort"]) =>
    filters.sort === primo ? " ↓" : filters.sort === secondo ? " ↑" : "";
  const ordinaAria = (primo: UnifiedFilters["sort"], secondo: UnifiedFilters["sort"]): "ascending" | "descending" | "none" =>
    filters.sort === primo ? "descending" : filters.sort === secondo ? "ascending" : "none";
  // Intestazione cliccabile: un clic ordina, il secondo inverte.
  const ordinaPer = (primo: UnifiedFilters["sort"], secondo: UnifiedFilters["sort"]) =>
    setFilters({ ...filters, sort: filters.sort === primo ? secondo : primo });
  // Telefono: nel pannello solo i tipi che ci sono davvero in lista.
  const tipiPresenti = Array.from(new Set(allRows.map((r) => r.tipo)));

  return (
    <div className="space-y-3">
      {/* ─── KPI Hero 4 cards — solo desktop: su mobile i conteggi sono già nei tab
          di stato qui sotto, e quattro card di numeri piccoli occupano mezzo schermo. ─── */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-2 sm:gap-3">
        <KpiCard label={tr("Bozze")} value={kpi.bozzeCount} hint={tr("da completare")} attivo={statoTab === "bozza"} onClick={() => setStatoTab(statoTab === "bozza" ? "all" : "bozza")} icon={<FileText className="h-4 w-4" />} tone="slate" />
        <KpiCard label={tr("In corso")} value={kpi.inCorsoCount} attivo={statoTab === "in_corso"} onClick={() => setStatoTab(statoTab === "in_corso" ? "all" : "in_corso")} hint={[kpi.pipeline > 0 ? tr("{importo} in trattativa", { importo: formatCurrency(kpi.pipeline) }) : tr("nessuna pipeline"), conteggiVista.in_scadenza > 0 ? tr("{n} in scadenza", { n: conteggiVista.in_scadenza }) : null].filter(Boolean).join(" · ")} icon={<TrendingUp className="h-4 w-4" />} tone="blue" />
        <KpiCard label={tr("Vinte")} value={kpi.vintaCount} attivo={statoTab === "vinto"} onClick={() => setStatoTab(statoTab === "vinto" ? "all" : "vinto")} hint={kpi.tassoConv !== null ? tr("{tassoConv}% delle chiuse", { tassoConv: String(kpi.tassoConv ?? "") }) : "—"} icon={<FileCheck2 className="h-4 w-4" />} tone="emerald" />
        <KpiCard label={tr("Ricavo firmato")} value={importoKpi(kpi.ricavoVinte)} titolo={formatCurrency(kpi.ricavoVinte)} hint={kpi.vintaCount > 0 ? tr("ticket medio {ticketMedio}", { ticketMedio: formatCurrency(kpi.ticketMedio) }) : tr("nessuna firmata")} icon={<Euro className="h-4 w-4" />} tone="orange" />
      </div>

      {/* ─── Telefono: ricerca e bottone dei filtri ─── */}
      <CercaConFiltri
        className="lg:hidden [&_input]:h-11 [&_input]:text-base [&_button]:h-11 [&_button]:w-11"
        valore={search}
        onCambia={setSearch}
        segnaposto={tr("Cerca preventivi")}
        filtriAttivi={filtriMobileAttivi}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={filtriMobileAttivi + Number(!!search)}
        onAzzera={reset}
        risultati={isLoading ? undefined : filtered.length}
      >
        <GruppoFiltri>
          <SceltaFiltro<UnifiedStato | "all"> titolo={tr("Stato")} valore={statoTab} onScegli={setStatoTab} scelte={[
            { value: "all", label: tr("Tutti") },
            { value: "bozza", label: tr("Bozze") },
            { value: "in_corso", label: tr("In corso") },
            { value: "vinto", label: tr("Vinti") },
            { value: "perso", label: tr("Persi") },
            ...(tabCounts.altro > 0 || statoTab === "altro" ? [{ value: "altro" as const, label: tr("Altri") }] : []),
          ]} />
          <SceltaFiltro<VistaElenco> titolo={tr("Da fare")} valore={vista} onScegli={setVista} scelte={[
            { value: "tutte", label: tr("Tutti") },
            { value: "da_seguire", label: tr("Da seguire") },
            { value: "in_scadenza", label: tr("In scadenza") },
            { value: "bozze_vuote", label: tr("Bozze vuote") },
          ]} />
          <DettaglioFiltri titolo={tr("Altri filtri")} riepilogo={advancedFiltersCount ? String(advancedFiltersCount) : undefined}>
            {(tipiPresenti.length > 1 || filters.tipi.length > 0) && (
              <SceltaFiltro titolo={tr("Tipo")} valore={filters.tipi.length > 1 ? "multipli" : filters.tipi[0] ?? "tutti"}
                onScegli={v => {
                  if (v !== "multipli") setFilters(f => ({ ...f, tipi: v === "tutti" ? [] : [v] }));
                }}
                scelte={[
                  { value: "tutti", label: tr("Tutti") },
                  ...(filters.tipi.length > 1 ? [{ value: "multipli" as const, label: tr("{n} selezionati", { n: filters.tipi.length }) }] : []),
                  ...Array.from(new Set([...tipiPresenti, ...filters.tipi])).map(t => ({ value: t, label: tr(TIPO_LABEL[t].label) })),
                ]} />
            )}
            <SceltaFiltro titolo={tr("Ordine")} valore={filters.sort} onScegli={v => setFilters(f => ({ ...f, sort: v }))}
              scelte={(Object.keys(SORT_LABEL) as UnifiedFilters["sort"][]).map(value => ({ value, label: tr(SORT_LABEL[value]) }))} />
            <button type="button" className="min-h-12 w-full px-3 text-left text-sm font-medium text-primary hover:bg-muted/40"
              onClick={() => { setFiltriMobileAperti(false); setFiltersOpen(true); }}>
              {tr("Filtri avanzati")}
            </button>
          </DettaglioFiltri>
        </GruppoFiltri>
      </PannelloFiltri>

      {/* Ricerca e filtri restano nello stesso posto nelle due viste. */}
      <div className="hidden items-center gap-2 overflow-x-auto pb-1 lg:flex">
        <div className="relative min-w-[190px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={tr("Cerca preventivi")} placeholder={tr("Cerca numero, cliente o commerciale…")} value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        <UniformSelect aria-label={tr("Stato preventivo")} value={statoTab} onChange={e => setStatoTab(e.target.value as UnifiedStato | "all")} className="h-8 w-auto min-w-[115px] text-xs">
          <option value="all">{tr("Tutti gli stati")} · {tabCounts.all}</option>
          {(["bozza", "in_corso", "vinto", "perso", "altro"] as UnifiedStato[]).map(stato => <option key={stato} value={stato}>{tr(STATO_UNIF_LABEL[stato].label)} · {tabCounts[stato]}</option>)}
        </UniformSelect>
        <UniformSelect aria-label={tr("Tipo preventivo")} value={filters.tipi.length > 1 ? "multipli" : filters.tipi[0] ?? "tutti"} onChange={e => setFilters({ ...filters, tipi: e.target.value === "tutti" ? [] : [e.target.value as PreventivoTipo] })} className="h-8 w-auto min-w-[110px] text-xs">
          <option value="tutti">{tr("Tutti i tipi")}</option>
          {filters.tipi.length > 1 && <option value="multipli" disabled>{tr("{n} selezionati", { n: filters.tipi.length })}</option>}
          {Array.from(new Set([...tipiPresenti, ...filters.tipi])).map(tipo => <option key={tipo} value={tipo}>{tr(TIPO_LABEL[tipo].label)}</option>)}
        </UniformSelect>
        <UniformSelect aria-label={tr("Da fare")} value={vista} onChange={e => setVista(e.target.value as VistaElenco)} className="h-8 w-auto min-w-[110px] text-xs">
          <option value="tutte">{tr("Tutti")}</option>
          <option value="da_seguire">{tr("Da seguire")} · {conteggiVista.da_seguire}</option>
          <option value="in_scadenza">{tr("In scadenza")} · {conteggiVista.in_scadenza}</option>
          <option value="bozze_vuote">{tr("Bozze vuote")} · {conteggiVista.bozze_vuote}</option>
        </UniformSelect>
        <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={() => setFiltersOpen(true)} aria-label={tr("Filtri")}><SlidersHorizontal className="size-3.5" /> {tr("Filtri")}{advancedFiltersCount > 0 && <Badge className="h-5 px-1.5 text-[10px]">{advancedFiltersCount}</Badge>}</Button>
        {!isMobile && canExportClients && <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={handleExportExcel} disabled={exporting || !filtered.length} aria-label={tr("Esporta Excel")} title={tr("Esporta Excel")}>{exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}</Button>}
        {onApriCestino && <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={onApriCestino} aria-label={tr("Cestino")} title={tr("Cestino")}><Trash2 className="size-3.5" /></Button>}
        {hasAnyFilter && <Button variant="ghost" size="sm" onClick={reset} className={BOTTONE_SECONDARIO} aria-label={tr("Azzera filtri")}><X className="size-3.5" /></Button>}
        <BottoneGrafici aperti={insightsOpen} onCambia={setInsightsOpen} />
        <OperationalViewSwitch value={visualizzazione} onChange={setVisualizzazione} label="Vista preventivi" />
        {visualizzazione === "elenco" && <SceltaColonne colonne={colonne} compatto />}
        <span role="status" className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{tr("{n} preventivi", { n: filtered.length })}</span>
      </div>
      <div className="flex items-center justify-end lg:hidden"><OperationalViewSwitch value={visualizzazione} onChange={setVisualizzazione} label="Vista preventivi" /></div>
      {vista === "bozze_vuote" && puoEliminare && bozzeVuoteVisibili.length > 0 && <Button variant="outline" size="sm" onClick={() => sel.toggleAll(bozzeVuoteVisibili.map(r => `${r.tipo}:${r.id}`))}>{tr(bozzeVuoteVisibili.every(r => sel.isSelected(`${r.tipo}:${r.id}`)) ? "Deseleziona le {n} bozze vuote" : "Seleziona le {n} bozze vuote", { n: bozzeVuoteVisibili.length })}</Button>}

      {!isMobile && insightsOpen && <section aria-label={tr("Andamento e statistiche dei preventivi")} className="space-y-4 rounded-xl border bg-card p-4 max-lg:hidden">
      {/* ─── Striscia navy avanzata: solo desktop. Su mobile è superflua — i 4 KPI
          sopra bastano e conversione/pipeline sono già nei loro hint. ─── */}
      {!isMobile && (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-eic-navy to-[#2C5184] px-3 py-2 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AdvKpi icon={<Target className="h-4 w-4 text-orange-300" />} label={tr("Tasso conversione")} value={kpi.tassoConv !== null ? `${kpi.tassoConv}%` : "—"} hint={kpi.vintaCount + kpi.persoCount > 0 ? tr("{vintaCount}/{vintaCount2} con risposta", { vintaCount: String(kpi.vintaCount ?? ""), vintaCount2: kpi.vintaCount + kpi.persoCount }) : undefined} />
          <AdvKpi icon={<TrendingUp className="h-4 w-4 text-orange-300" />} label={tr("Pipeline attiva")} value={formatCurrency(kpi.pipeline)} hint={tr(kpi.inCorsoCount === 1 ? "{n} offerta" : "{n} offerte", { n: kpi.inCorsoCount })} />
          <AdvKpi icon={<FileText className="h-4 w-4 text-orange-300" />} label={tr("Valore medio")} value={formatCurrency(kpi.valoreMedio)} hint={tr(kpi.total - kpi.bozzeCount === 1 ? "su {n} offerta" : "su {n} offerte", { n: kpi.total - kpi.bozzeCount })} />
          <AdvKpi icon={<Clock className="h-4 w-4 text-orange-300" />} label={tr("Cross-modulo")} value={`${allRows.length}`} hint={[
            quotesData.length > 0 ? tr("{n} classici", { n: quotesData.length }) : null,
            serramentiData.length > 0 ? tr("{n} serramenti", { n: serramentiData.length }) : null,
            fvData.length > 0 ? tr("{n} fotovoltaico", { n: fvData.length }) : null,
            ristrutturazioneData.length > 0 ? tr("{n} ristrutturazione", { n: ristrutturazioneData.length }) : null,
            bagniData.length > 0 ? tr("{n} bagni", { n: bagniData.length }) : null,
            tettiData.length > 0 ? tr("{n} tetti", { n: tettiData.length }) : null,
            climatizzazioneData.length > 0 ? tr("{n} climatizzazione", { n: climatizzazioneData.length }) : null,
            elettricoData.length > 0 ? tr("{n} elettrico", { n: elettricoData.length }) : null,
            termoidraulicoData.length > 0 ? tr("{n} termoidraulico", { n: termoidraulicoData.length }) : null,
            pavimentiData.length > 0 ? tr("{n} pavimenti", { n: pavimentiData.length }) : null,
            piscineData.length > 0 ? tr("{n} piscine", { n: piscineData.length }) : null,
          ].filter(Boolean).join(" · ") || tr("totale preventivi")} />
        </div>
      </div>
      )}

      <Suspense fallback={<p role="status" className="flex h-48 items-center justify-center text-sm text-muted-foreground">{tr("Caricamento dei grafici…")}</p>}>
        <GraficiPreventivi righe={allRows} ricavoFirmato={kpi.ricavoVinte} distribuzione={tipiConteggio.map(({ tipo, n }) => ({
          name: tr(TIPO_LABEL[tipo].label),
          color: TIPO_LABEL[tipo].color,
          value: n,
        }))} />
      </Suspense>

      </section>}

      {/* ─── Chip filtri attivi (telefono: il numero sta sul bottone) ─── */}
      {advancedFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5 max-lg:hidden">
          {filters.tipi.length > 0 && (
            <FilterChip label={tr("Tipi: {elenco}", { elenco: filters.tipi.map((t) => tr(TIPO_LABEL[t].label)).join(", ") })} onClear={() => setFilters({ ...filters, tipi: [] })} />
          )}
          {filters.commercialeId !== "all" && (
            <FilterChip
              label={tr("Comm: {nome}", { nome: filters.commercialeId === "none" ? tr("non assegnato") : commercialeNameById.get(filters.commercialeId) ?? "—" })}
              onClear={() => setFilters({ ...filters, commercialeId: "all" })}
            />
          )}
          {filters.stati.length > 0 && (
            <FilterChip label={tr("Stati: {elenco}", { elenco: filters.stati.map((s) => tr(STATO_UNIF_LABEL[s].label)).join(", ") })} onClear={() => setFilters({ ...filters, stati: [] })} />
          )}
          {filters.importoMin !== "" && <FilterChip label={tr("Min: €{importoMin}", { importoMin: String(filters.importoMin ?? "") })} onClear={() => setFilters({ ...filters, importoMin: "" })} />}
          {filters.importoMax !== "" && <FilterChip label={tr("Max: €{importoMax}", { importoMax: String(filters.importoMax ?? "") })} onClear={() => setFilters({ ...filters, importoMax: "" })} />}
          {filters.dateFrom !== "" && <FilterChip label={tr("Da: {fonti}", { fonti: String(filters.dateFrom ?? "") })} onClear={() => setFilters({ ...filters, dateFrom: "" })} />}
          {filters.dateTo !== "" && <FilterChip label={tr("A: {data}", { data: filters.dateTo })} onClear={() => setFilters({ ...filters, dateTo: "" })} />}
          {filters.sort !== "recent" && <FilterChip label={tr("Ordine: {prezzo}", { prezzo: tr(SORT_LABEL[filters.sort]) })} onClear={() => setFilters({ ...filters, sort: "recent" })} />}
        </div>
      )}

      {/* ─── Tabella ─── */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : allRows.length === 0 ? (
            <div className="p-10 text-center max-lg:p-5">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2 max-lg:hidden" />
              <p className="text-sm font-medium">{tr("Nessun preventivo ancora")}</p>
              <p className="text-xs text-muted-foreground mt-1 max-lg:hidden">
                {tr("Crea il primo preventivo dal bottone in alto.")}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center max-lg:p-5">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2 max-lg:hidden" />
              <p className="text-sm font-medium">{tr("Nessun risultato con i filtri attuali")}</p>
              <div className="flex gap-2 justify-center mt-3">
                <Button variant="outline" size="sm" onClick={() => isMobile ? setFiltriMobileAperti(true) : setFiltersOpen(true)} className="text-xs gap-1">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> {tr("Modifica filtri")}
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="text-xs gap-1">
                  <X className="h-3.5 w-3.5" /> {tr("Azzera tutto")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <UnifiedBulkToolbar
                selectedRows={filtered.filter((r) => sel.isSelected(`${r.tipo}:${r.id}`))}
                companyId={companyId}
                onClear={sel.clear}
                onDone={() => { sel.clear(); void queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith('unified-prev') }); }}
                puoModificare={canEditPreventivi}
              />
              {visualizzazione === "pipeline" ? (
                <PreventiviPipeline righe={filtered} selezionata={sel.isSelected} alterna={sel.toggle} correlati={setClienteCorrelato}
                  puoModificare={canEditPreventivi} puoEliminare={puoEliminare} puoDuplicare={sapDuplicare} inDuplicazione={inDuplicazione}
                  duplica={r => void duplica(r)} cestina={setDaCestinare} sposta={async (riga, destinazione) => {
                    if (!companyId || !canEditPreventivi) throw new Error(tr("Spostamento non disponibile"));
                    try { await salvaSpostamentoPreventivo(companyId, riga, destinazione); }
                    catch (error) {
                      toast.error(tr("Spostamento non riuscito"), { description: error instanceof Error ? tr(error.message) : tr("Lo stato è cambiato o non hai i permessi. Aggiorna l’elenco.") });
                      void queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("unified-prev") });
                      throw error;
                    }
                    await queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("unified-prev") });
                    toast.success(tr("Preventivo spostato in {fase}", { fase: tr(STATO_UNIF_LABEL[destinazione].label) }));
                  }} />
              ) : (
              <div className="hidden lg:block">
                <BarraScorrimentoOrizzontale contenitore={scrollTabella} className="mx-3 my-2" />
                <Table wrapperRef={setScrollTabella} className="min-w-max text-xs [&_td]:px-3 [&_th]:px-3 [&_td]:py-2">
                  <TableHeader><TableRow className="bg-slate-50/60">
                    <TableHead className="w-10"><Checkbox checked={pageRows.length > 0 && pageRows.every(r => sel.isSelected(`${r.tipo}:${r.id}`))} onCheckedChange={() => sel.toggleAll(pageRows.map(r => `${r.tipo}:${r.id}`))} aria-label={tr("Seleziona pagina")} /></TableHead>
                    {colonne.colonne.map(col => {
                      const ordinamenti: Record<string, [UnifiedFilters["sort"], UnifiedFilters["sort"]]> = { numero: ["code_asc", "code_desc"], cliente: ["client_asc", "client_desc"], totale: ["value_desc", "value_asc"], aggiornato: ["recent", "oldest"] };
                      const ordine = ordinamenti[col.chiave];
                      return <TableHead key={col.chiave} className={cn("whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-slate-600", col.chiave === "totale" && "text-right")} aria-sort={ordine ? ordinaAria(...ordine) : undefined}>
                        {ordine ? <button type="button" onClick={() => ordinaPer(...ordine)}>{tr(col.etichetta)}{freccia(...ordine)}</button> : tr(col.etichetta)}
                      </TableHead>;
                    })}
                    <TableHead className="w-10"><span className="sr-only">{tr("Azioni")}</span></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{pageRows.map(r => {
                    const tipo = TIPO_LABEL[r.tipo];
                    const stato = STATO_UNIF_LABEL[r.stato_unif];
                    const nCorrelati = perNominativo.get(nominativo(r))?.length ?? 0;
                    const situazione = eDaSeguire(r, adessoElenco) ? tr("Fermo da {n} giorni", { n: giorniDa(r.data, adessoElenco) ?? "" }) : eBozzaVuota(r) ? tr("Da completare") : etichettaScadenza(r, adessoElenco) || (r.stato_unif === "in_corso" && r.tipo === "classico" ? (r.apertoIl ? tr("Aperto dal cliente") : tr("Non ancora aperto")) : "—");
                    return <TableRow key={`${r.tipo}:${r.id}`} className="cursor-pointer hover:bg-orange-50/40" onClick={() => navigate(r.href)}>
                      <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={sel.isSelected(`${r.tipo}:${r.id}`)} onCheckedChange={() => sel.toggle(`${r.tipo}:${r.id}`)} aria-label={tr("Seleziona {nome}", { nome: r.numero })} /></TableCell>
                      {colonne.colonne.map(col => {
                        const values: Record<string, React.ReactNode> = {
                          numero: <span className="font-mono font-semibold text-orange-600">{r.numero}</span>,
                          cliente: <div className="flex max-w-[240px] items-center gap-2"><span className="truncate" title={r.cliente}>{r.cliente}</span>{nCorrelati > 1 && <button type="button" className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:underline" onClick={e => { e.stopPropagation(); setClienteCorrelato(r); }} aria-label={tr("{n} preventivi con il nome {nome}", { n: nCorrelati, nome: r.cliente })}>{nCorrelati}</button>}</div>,
                          oggetto: <span className="block max-w-[260px] truncate" title={r.titolo ?? undefined}>{r.titolo || "—"}</span>,
                          tipo: <Badge variant="outline" className={cn("whitespace-nowrap font-medium", tipo.className)}>{tr(tipo.label)}</Badge>,
                          commerciale: r.commerciale_nome ?? "—",
                          stato: <Badge variant="outline" className={cn("whitespace-nowrap font-medium", stato.className)}>{tr(stato.label)}</Badge>,
                          situazione: <span className="block max-w-[180px] truncate" title={situazione}>{situazione}</span>,
                          totale: r.totale != null ? formatCurrency(r.totale) : "—",
                          scadenza: formatDateSafe(r.scadenza),
                          aggiornato: etichettaEta(r.data, adessoElenco) ?? formatDateSafe(r.data),
                          referente: r.referente ?? "—",
                          fiscale: r.fiscale ?? "—",
                        };
                        return <TableCell key={col.chiave} className={cn("whitespace-nowrap", col.chiave === "totale" && "text-right font-medium tabular-nums")} title={col.chiave === "aggiornato" ? formatDateSafe(r.data) : undefined}>{values[col.chiave]}</TableCell>;
                      })}
                      <TableCell onClick={e => e.stopPropagation()}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7" aria-label={tr("Azioni per {nome}", { nome: r.numero })}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(r.href)}><ChevronRight className="mr-2 size-3.5" />{tr("Apri")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(r.href, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 size-3.5" />{tr("Apri in una nuova scheda")}</DropdownMenuItem>
                        {nCorrelati > 1 && <DropdownMenuItem onClick={() => setClienteCorrelato(r)}>{tr("Altri preventivi con questo nome")}</DropdownMenuItem>}
                        {sapDuplicare(r) && <DropdownMenuItem disabled={inDuplicazione === r.id} onClick={() => void duplica(r)}><Copy className="mr-2 size-3.5" />{tr("Duplica")}</DropdownMenuItem>}
                        {puoEliminare && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setDaCestinare(r)}><Trash2 className="mr-2 size-3.5" />{r.tipo === "computo" ? tr("Elimina") : tr("Sposta nel cestino")}</DropdownMenuItem></>}
                      </DropdownMenuContent></DropdownMenu></TableCell>
                    </TableRow>;
                  })}</TableBody>
                </Table>
              </div>
              )}

              {/* Telefono: una riga per preventivo (cliente; numero, tipo e data;
                  importo e stato a destra). Erano schede da tre righe con due
                  etichette colorate e l'icona del commerciale: quattro a schermo. */}
              <div className={cn("lg:hidden divide-y divide-border", visualizzazione === "pipeline" && "hidden")}>
                {pageRows.map((r) => {
                  const tipoCfg = TIPO_LABEL[r.tipo];
                  const statoCfg = STATO_UNIF_LABEL[r.stato_unif];
                  const senzaCliente = !r.cliente || r.cliente.trim() === "—" || r.cliente.trim() === "-";
                  const coloreStato =
                    r.stato_unif === "vinto" ? "text-emerald-700"
                    : r.stato_unif === "perso" ? "text-rose-600"
                    : r.stato_unif === "in_corso" ? "text-blue-700"
                    : "text-muted-foreground";
                  return (
                    <div key={`${r.tipo}-${r.id}`} className="flex items-center">
                    {/* Sul telefono si seleziona come da computer (12/11/2026): la barra in alto
                        segna come persi o sposta nel cestino. Area di tocco 44 px. */}
                    <label className="flex h-11 w-11 shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={sel.isSelected(`${r.tipo}:${r.id}`)}
                        onCheckedChange={() => sel.toggle(`${r.tipo}:${r.id}`)}
                        aria-label={tr("Seleziona {nome}", { nome: String(r.numero ?? "") })}
                      />
                    </label>
                    <div className="min-w-0 flex-1"><RigaMobile
                      onClick={() => navigate(r.href)}
                      // Senza cliente il titolo è il numero (una riga «—» non si riconosce).
                      titolo={senzaCliente ? r.numero : r.cliente}
                      sottotitolo={[senzaCliente ? null : r.numero,
                        eInScadenza(r, adessoElenco) ? etichettaScadenza(r, adessoElenco) : null,
                        r.titolo && r.titolo !== r.cliente ? r.titolo : tr(tipoCfg.label)].filter(Boolean).join(" · ")}
                      valore={r.totale != null && r.totale > 0 ? formatCurrency(r.totale) : "—"}
                      stato={<span className={coloreStato}>{tr(statoCfg.label)}</span>}
                    /></div>
                    {r.tipo === "ristrutturazione" && canEditPreventivi && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={tr("Altre azioni per {nome}", { nome: String(r.numero ?? "") })}>
                            <MoreHorizontal aria-hidden="true" className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="min-h-11" disabled={inDuplicazione === r.id} onSelect={() => void duplica(r)}>
                            <Copy className="mr-2 size-4" /> {tr("Duplica preventivo")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    </div>
                  );
                })}
              </div>

              {visualizzazione === "elenco" && totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 p-3 border-t bg-slate-50/40">
                  <span className="text-xs text-muted-foreground">{tr("{da}–{a} di {totale}", { da: (currentPage - 1) * PAGE_SIZE + 1, a: Math.min(currentPage * PAGE_SIZE, filtered.length), totale: filtered.length })}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-11 w-11 p-0"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1} aria-label={tr("Pagina precedente")}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs px-2 tabular-nums">{tr("Pag {currentPage} / {totalPages}", { currentPage: String(currentPage ?? ""), totalPages: String(totalPages ?? "") })}</span>
                    <Button variant="outline" size="sm" className="h-11 w-11 p-0"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages} aria-label={tr("Pagina successiva")}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!clienteCorrelato} onOpenChange={open => { if (!open) setClienteCorrelato(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{tr("Preventivi per {nome}", { nome: clienteCorrelato?.cliente ?? "" })}</DialogTitle>
            <DialogDescription>{tr("Documenti con lo stesso nominativo. Verifica il cliente: nomi uguali possono riferirsi a persone diverse. Ogni preventivo resta indipendente.")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] divide-y overflow-y-auto">
            {correlatiCliente.map(r => <button key={`${r.tipo}:${r.id}`} type="button" onClick={() => navigate(r.href)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/40">
              <span className="min-w-0 flex-1"><span className="block font-medium">{r.numero} · {tr(TIPO_LABEL[r.tipo].label)}</span><span className="block truncate text-xs text-muted-foreground">{r.titolo || tr("Oggetto non indicato")} · {formatDateSafe(r.data)}</span></span>
              <Badge variant="outline" className={STATO_UNIF_LABEL[r.stato_unif].className}>{tr(STATO_UNIF_LABEL[r.stato_unif].label)}</Badge>
              <span className="whitespace-nowrap text-sm font-medium">{r.totale != null ? formatCurrency(r.totale) : "—"}</span><ChevronRight className="size-4 shrink-0" />
            </button>)}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daCestinare} onOpenChange={(o) => { if (!o) setDaCestinare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{daCestinare?.tipo === "computo" ? tr("Elimina il computo {titolo}", { titolo: daCestinare?.titolo ?? "" }) : tr("Sposta {numero} nel cestino", { numero: String(daCestinare?.numero ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription>
              {daCestinare?.tipo === "computo"
                ? tr("I computi non hanno il cestino: si elimina definitivamente e non si recupera. Il preventivo firmato, se c'è, resta.")
                : tr("Sparisce dalla lista e resta recuperabile dal Cestino per 30 giorni. Dopo, l'eliminazione è definitiva.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction onClick={cestinaSingolo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {daCestinare?.tipo === "computo" ? tr("Elimina") : tr("Sposta nel cestino")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DuplicaLavoroDialog tipo="rst" sourceId={ristrutturazioneDaDuplicare ?? ""}
        open={!!ristrutturazioneDaDuplicare}
        onOpenChange={(open) => { if (!open) setRistrutturazioneDaDuplicare(null); }}
        onDuplicato={(id) => {
          void queryClient.invalidateQueries({ queryKey: ["unified-prev-ristrutturazione", companyId] });
          navigate(`/azienda/ristrutturazione/${id}/modifica`);
        }} />

      {/* ─── Sheet filtri laterale ─── */}
      <UnifiedFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onApply={setFilters}
        commerciali={commercialiOptions}
        serramentiEnabled={serramentiEnabled}
        fotovoltaicoEnabled={fotovoltaicoEnabled}
        ristrutturazioneEnabled={ristrutturazioneEnabled}
        bagniEnabled={bagniEnabled}
        tettiEnabled={tettiEnabled}
        climatizzazioneEnabled={climatizzazioneEnabled}
        elettricoEnabled={elettricoEnabled}
        termoidraulicoEnabled={termoidraulicoEnabled}
        pavimentiEnabled={pavimentiEnabled}
        piscineEnabled={piscineEnabled}
        totalResults={filtered.length}
      />
    </div>
  );
}

/* ─── Sort labels (esportati per chip) ──────────────────────────────────── */
const SORT_LABEL: Record<UnifiedFilters["sort"], string> = {
  recent: "Più recenti",
  oldest: "Più vecchi",
  value_desc: "Importo ↓",
  value_asc: "Importo ↑",
  code_asc: "Codice A→Z",
  code_desc: "Codice Z→A",
  client_asc: "Cliente A→Z",
  client_desc: "Cliente Z→A",
};

/* ─── Componenti interni ────────────────────────────────────────────────── */

type KpiTone = "slate" | "blue" | "emerald" | "orange";
const KPI_TONE: Record<KpiTone, { border: string; iconBg: string; iconColor: string; valueColor: string }> = {
  slate:   { border: "border-l-slate-400",   iconBg: "bg-slate-100",   iconColor: "text-slate-600",   valueColor: "text-slate-900" },
  blue:    { border: "border-l-blue-500",    iconBg: "bg-blue-100",    iconColor: "text-blue-700",    valueColor: "text-blue-700" },
  emerald: { border: "border-l-emerald-500", iconBg: "bg-emerald-100", iconColor: "text-emerald-700", valueColor: "text-emerald-700" },
  orange:  { border: "border-l-orange-500",  iconBg: "bg-orange-100",  iconColor: "text-orange-600",  valueColor: "text-orange-600" },
};

/** Dal milione in su la cifra intera non entra nel riquadro («19.796.108,5…»): «19,8 mln €», e l'intera al passaggio del mouse. */
function importoKpi(v: number): string {
  return Math.abs(v) >= 1_000_000 ? `${new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 1 }).format(v / 1_000_000)} mln €` : formatCurrency(v);
}

function KpiCard({
  label, value, hint, icon, tone = "slate", titolo, onClick, attivo,
}: { label: string; value: string | number; hint?: string; icon: React.ReactNode; tone?: KpiTone; titolo?: string; onClick?: () => void; attivo?: boolean }) {
  const t = useT();
  const c = KPI_TONE[tone];
  // Con onClick il riquadro filtra l'elenco per quello stato (un secondo clic toglie il filtro).
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!attivo : undefined}
      className={cn("relative block w-full min-w-0 bg-white border-l-4 rounded-lg shadow-sm px-3 py-2 text-left", c.border,
        onClick && "transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        attivo && "ring-2 ring-slate-300")}
      title={titolo ?? (onClick ? (attivo ? t("Mostra tutti i preventivi") : t("Mostra solo: {label}", { label: label.toLowerCase() })) : undefined)}
    >
      <span className={cn("absolute right-2 top-2 h-6 w-6 rounded-md flex items-center justify-center", c.iconBg, c.iconColor)}>{icon}</span>
      <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate pr-7 leading-tight">{label}</p>
      {/* Tra 768 e 1280 a 24px gli importi si tagliavano («318.478,…»). */}
      <p className={cn("text-lg font-bold leading-tight mt-0.5 tabular-nums truncate", c.valueColor)}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate leading-tight">{hint}</p>}
    </Tag>
  );
}

function AdvKpi({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">{label}</p>
        <p className="text-lg font-bold text-white tabular-nums truncate">{value}</p>
        {hint && <p className="text-[10px] text-slate-300 truncate">{hint}</p>}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 text-[11px] px-2.5 py-1 transition-colors"
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  );
}
