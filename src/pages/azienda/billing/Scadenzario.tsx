import { BOTTONE_NUOVO, BOTTONE_SECONDARIO, RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LINGUETTE_CON_CONTEGGIO, type LinguettaConConteggio } from "@/lib/finance/riepilogoPeriodoTipi";
import { costiDellaCommessa, filtraScadenzario, queryFontiScadenzario, linkFonteScadenza } from "@/lib/finance/fontiScadenzario";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Loader2, Search, ChevronDown, ChevronLeft, ChevronRight, CalendarClock, BarChart3 } from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readAllPages } from "@/lib/personale/readAllPages";
import { EsportaScadenzario } from "@/components/scadenzario/EsportaScadenzario";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { completaCommesseScadenze, completaPerEsportazione, noteFattureScadenze } from "@/lib/finance/commesseScadenza";
import { useScadenzario, type ScadenzarioFilters } from "@/hooks/useScadenzario";
import { invalidaFattureImportate } from "@/components/fatturazione/GestionaleEsterno";
import { AnnullaIncassoDialog } from "@/components/scadenzario/AnnullaIncassoDialog";
import { NavigatoreMese, leggiMese, presetMese } from "@/components/scadenzario/NavigatoreMese";
import { RiepilogoPeriodo, type RiquadroPeriodo } from "@/components/scadenzario/RiepilogoPeriodo";
import { RibaNonRegistrate } from "@/components/scadenzario/RibaNonRegistrate";
import { giornoPrima, useRiepilogoPeriodo } from "@/lib/finance/riepilogoPeriodoScadenzario";
import { useSettimanaScadenzario } from "@/lib/finance/settimanaScadenzario";
import { DistintePagamenti } from "@/components/scadenzario/DistintePagamenti";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import { DEF_SCADENZE } from "@/lib/scadenzario/colonneScadenzario";
import { periodoNomeFile, pezzoNomeFile } from "@/lib/scadenzario/esportaScadenzario";
import { SceltaColonne } from "@/components/tabelle/SceltaColonne";
import { useColonneTabella } from "@/hooks/useColonneTabella";
import { ScadenzaDettaglio } from "@/components/scadenzario/ScadenzaDettaglio";
import MarkPaidDialog from "@/components/scadenzario/MarkPaidDialog";
import NewScadenzaDialog from "@/components/scadenzario/NewScadenzaDialog";
import AdempimentiFiscali from "@/components/scadenzario/AdempimentiFiscali";
import { IncassiPerSettimanaVista } from "@/components/scadenzario/IncassiPerSettimana";
import { TablePagination } from "@/components/ui/table-pagination";
import type { Scadenza } from "@/hooks/useScadenzario";
import { useAuth } from "@/contexts/AuthContext";
import FattureDaRegistrareCard from "@/components/scadenzario/FattureDaRegistrareCard";
import { GraficoEntrateUscite } from "@/components/charts/grafici/GraficoEntrateUscite";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, addDays, addMonths, format } from "date-fns";
import { GRUPPI_METODO, type GruppoMetodo } from "@/lib/finance/metodoScadenza";

import { useIsMobile } from "@/hooks/use-mobile";
import { CercaConFiltri, DateFiltro, DettaglioFiltri, GruppoFiltri, PannelloFiltri, SceltaFiltro } from "@/components/mobile/FiltriMobile";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useSelezioneRighe } from "@/hooks/useSelezioneRighe";
import { BarraSelezioneRighe, ErroriOperazioneRighe } from "@/components/shared/BarraSelezioneRighe";
import { ModificaScadenzaDialog } from "@/components/scadenzario/ModificaScadenzaDialog";
import { percheScadenzaNonModificabile } from "@/lib/finance/modificaScadenza";
import { formatCurrency } from "@/lib/formatters";
import { ALTRI_FILTRI_VUOTI, CampiAltriFiltriScadenzario, FiltriScadenzario, FiltriScadenzarioAttivi, importoDaTesto, nFiltriSoloElenco, type AltriFiltriScadenzario, type ValoriFiltriScadenzario } from "@/components/scadenzario/FiltriScadenzario";
import { SceltaEntitaInline, type OpzioneEntita } from "@/components/scadenzario/SceltaEntitaScadenzario";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
// Il grafico per mese si apre a richiesta (25/11/2026): chiuso, l'elenco parte sotto i numeri.
const CHIAVE_GRAFICO_MESI = "scadenzario.graficoMesiAperto";
const leggiGraficoAperto = () => { try { return localStorage.getItem(CHIAVE_GRAFICO_MESI) === "1"; } catch { return false; } };

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// Periodi rapidi: pochi, quelli che servono a fine mese. «Scadute» è una linguetta; le date dal/al
// compaiono accanto al periodo quando si sceglie «Personalizzato».
const DATE_PRESETS = [
  { label: "Prossimi 30 gg", value: "30gg" },
  { label: "Personalizzato", value: "custom" },
];

// Si apre sul mese corrente, su «Tutte» (28/11/2026): le scelte restano nell'indirizzo, così un ricarico o un
// link tornano alla stessa vista. I valori di partenza non si scrivono.
const VISTE_ELENCO = ["aperte", "tutte", "da_incassare", "da_pagare", "scadute", "pagate", "annullate", "senza_data"];
const presetMeseCorrente = () => { const d = new Date(); return presetMese(d.getFullYear(), d.getMonth() + 1); };
const fineMese = (anno: number, mese: number) => format(endOfMonth(new Date(anno, mese - 1, 1)), "yyyy-MM-dd");

function getDateRange(preset: string, today = new Date()): { from: string; to: string } | null {
  const f = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "oggi":
      return { from: f(today), to: f(today) };
    case "settimana":
      return { from: f(startOfWeek(today, { weekStartsOn: 1 })), to: f(endOfWeek(today, { weekStartsOn: 1 })) };
    case "settimana_prossima": {
      const d = addDays(today, 7);
      return { from: f(startOfWeek(d, { weekStartsOn: 1 })), to: f(endOfWeek(d, { weekStartsOn: 1 })) };
    }
    case "questo_mese":
      return { from: f(startOfMonth(today)), to: f(endOfMonth(today)) };
    case "mese_prossimo": {
      const d = addMonths(today, 1);
      return { from: f(startOfMonth(d)), to: f(endOfMonth(d)) };
    }
    case "30gg":
      return { from: f(today), to: f(addDays(today, 30)) };
    case "90gg":
      return { from: f(today), to: f(addDays(today, 90)) };
    case "trimestre":
      return { from: f(startOfQuarter(today)), to: f(endOfQuarter(today)) };
    default:
      return null;
  }
}

const isoValida = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const annoValido = (a: string | null): a is string => a === "all" || /^\d{4}$/.test(a ?? "");

/** Il periodo scelto come intervallo di date: lo stesso conto per l'elenco, il riepilogo e il ritorno da «Arretrato». */
function rangeDelPeriodo(preset: string, anno: string, dal: string, al: string): { from: string | null; to: string | null } | null {
  const mese = leggiMese(preset);
  if (mese) return { from: `${mese.anno}-${String(mese.mese).padStart(2, "0")}-01`, to: fineMese(mese.anno, mese.mese) };
  if (preset === "custom") return dal || al ? { from: dal || null, to: al || null } : null;
  if (preset && preset !== "all") { const r = getDateRange(preset); return r ? { from: r.from, to: r.to } : null; }
  return anno !== "all" ? { from: `${anno}-01-01`, to: `${anno}-12-31` } : null;
}

type RitornoPeriodo = { preset: string; anno: string; dal: string; al: string; fine: string; from: string | null; to: string | null };
/** «Arretrato» sta nell'indirizzo (arretrato=1, rp/ra/rd/rl = il periodo di partenza): un ricarico o un link tornano allo stesso punto. */
function ritornoDaUrl(p: URLSearchParams): RitornoPeriodo | null {
  if (p.get("arretrato") !== "1") return null;
  const rp = p.get("rp") ?? "", ra = p.get("ra"), rd = p.get("rd") ?? "", rl = p.get("rl") ?? "";
  const preset = rp === "anno" ? "" : rp;
  if (preset && !leggiMese(preset) && preset !== "30gg" && preset !== "custom") return null;
  if ((rd && !isoValida(rd)) || (rl && !isoValida(rl))) return null;
  const anno = annoValido(ra) ? ra : String(new Date().getFullYear());
  const r = rangeDelPeriodo(preset, anno, rd, rl);
  if (!r?.from) return null;
  return { preset, anno, dal: rd, al: rl, fine: giornoPrima(r.from), from: r.from, to: r.to };
}

export default function Scadenzario() {
  const tr = useT();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const permessi = usePermissions();
  const { effectiveCompany, role } = useAuth();
  const companyId = effectiveCompany?.id;
  const vistaCompatta = useIsMobile(1024);
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Si apre su «Tutte» e sul mese corrente (28/11/2026): i riquadri dicono cosa è aperto, scaduto e pagato.
  const [tab, setTab] = useState(() => { const v = params.get("vista"); return v && VISTE_ELENCO.includes(v) ? v : "tutte"; });
  // Strumenti separati dall'elenco: si aprono in un pannello e non cambiano l'impaginazione.
  const [strumento, setStrumento] = useState<"settimane" | "adempimenti" | null>(null);
  const [graficoAperto, setGraficoAperto] = useState(leggiGraficoAperto);
  const alternaGrafico = () => setGraficoAperto((v) => {
    try { localStorage.setItem(CHIAVE_GRAFICO_MESI, v ? "0" : "1"); } catch { /* solo comodità */ }
    return !v;
  });
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<Scadenza | null>(null);
  // 23/11/2026: la rata di una fattura fornitore si paga qui. Prima «Segna pagata» portava alla
  // pagina Costi, e da lì riepilogo, popup e modulo: un'azienda cliente non riusciva a registrare.
  const [pagaCosto, setPagaCosto] = useState<{ costId: string; importo: number } | null>(null);
  const pagaSulPosto = (s: Scadenza) => s.auto_source === "fonte_costo" && !!s.cost_id && permessi.canViewCosts && !permessi.solaLettura;
  const apriPagamento = (s: Scadenza) => {
    if (pagaSulPosto(s) && s.cost_id) {
      setPagaCosto({ costId: s.cost_id, importo: Math.max(0, Number(s.amount) - Number(s.paid_amount ?? 0)) });
      return;
    }
    const href = linkFonteScadenza(s);
    if (href) navigate(href); else setPayDialog(s);
  };
  const [newOpen, setNewOpen] = useState(false);
  // Anno selezionato (default anno corrente): scopa KPI + lista a quell'anno invece
  // di mostrare il cumulato di tutti gli anni. "all" = tutti gli anni.
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(() => { const a = params.get("anno"); return annoValido(a) ? a : String(currentYear); });

  // Advanced filters
  // Quali colonne vede questa azienda, e in che ordine (26/11/2026).
  const colonneScadenze = useColonneTabella("scadenzario", DEF_SCADENZE);
  const chiaviColonneTabella = useMemo(() => colonneScadenze.colonne.map((c) => c.chiave), [colonneScadenze.colonne]);
  // Da «Arretrato» si può tornare al periodo di prima con un clic; il periodo di partenza sta nell'indirizzo.
  const [ritornoPeriodo, setRitornoPeriodo] = useState<RitornoPeriodo | null>(() => ritornoDaUrl(params));
  const [datePreset, setDatePreset] = useState(() => {
    if (ritornoDaUrl(params)) return "custom";
    const p = params.get("periodo");
    return p && (leggiMese(p) || p === "30gg" || p === "custom" || p === "anno") ? (p === "anno" ? "" : p) : presetMeseCorrente();
  });
  const [customFrom, setCustomFrom] = useState(() => { if (ritornoDaUrl(params)) return ""; const d = params.get("dal"); return isoValida(d) ? d : ""; });
  const [customTo, setCustomTo] = useState(() => { const r = ritornoDaUrl(params); if (r) return r.fine; const d = params.get("al"); return isoValida(d) ? d : ""; });
  const [filterMetodo, setFilterMetodo] = useState("");
  // Fornitore e cantiere (id + nome da mostrare): vanno al server come supplier_id / order_id.
  const [filterFornitore, setFilterFornitore] = useState<OpzioneEntita | null>(null);
  const [filterCommessa, setFilterCommessa] = useState<OpzioneEntita | null>(null);

  const [filterAltri, setFilterAltri] = useState<AltriFiltriScadenzario>(ALTRI_FILTRI_VUOTI);
  // Mobile: linguette, periodo e tipo in un pannello dal basso.
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const nAltriFiltri = nFiltriSoloElenco({ metodo: filterMetodo, fornitore: filterFornitore, commessa: filterCommessa, ...filterAltri });
  const nFiltriMobile = nAltriFiltri + Number(tab !== "tutte") + Number(datePreset !== presetMeseCorrente());

  const clearFilters = useCallback(() => {
    setDatePreset(presetMeseCorrente());
    setYearFilter(String(new Date().getFullYear()));
    setRitornoPeriodo(null);
    setCustomFrom("");
    setCustomTo("");
    setFilterMetodo("");
    setFilterFornitore(null);
    setFilterCommessa(null);
    setFilterAltri(ALTRI_FILTRI_VUOTI);
    setPage(1);
  }, []);

  // Derive direction from active tab for server-side filtering
  const tabDirection: 'entrata' | 'uscita' | null = useMemo(() => {
    if (tab === "da_incassare") return "entrata";
    if (tab === "da_pagare") return "uscita";
    return null;
  }, [tab]);

  // Derive status from active tab for server-side filtering
  const tabStatus: string | null = useMemo(() => {
    if (tab === "pagate") return "pagata";
    // Le annullate non stanno in nessun'altra vista: si leggono solo da qui.
    if (tab === "annullate") return "annullata";
    return null;
  }, [tab]);

  // Compute date range for server-side filtering
  const periodoRange = useMemo(() => rangeDelPeriodo(datePreset, yearFilter, customFrom, customTo), [datePreset, yearFilter, customFrom, customTo]);
  const serverDateRange = tab === "senza_data" ? null : periodoRange;

  const valoriFiltri: ValoriFiltriScadenzario = {
    periodo: datePreset, dal: serverDateRange?.from ?? "", al: serverDateRange?.to ?? "",
    metodo: filterMetodo, fornitore: filterFornitore, commessa: filterCommessa, ...filterAltri,
  };
  const cambiaFiltri = (patch: Partial<ValoriFiltriScadenzario>) => {
    if (patch.periodo !== undefined) setDatePreset(patch.periodo);
    if (patch.dal !== undefined) setCustomFrom(patch.dal);
    if (patch.al !== undefined) setCustomTo(patch.al);
    if (patch.metodo !== undefined) setFilterMetodo(patch.metodo);
    if (patch.fornitore !== undefined) setFilterFornitore(patch.fornitore);
    if (patch.commessa !== undefined) setFilterCommessa(patch.commessa);
    const { importoMin, importoMax, soloNote, soloDocumento } = patch;
    if (importoMin !== undefined || importoMax !== undefined || soloNote !== undefined || soloDocumento !== undefined)
      setFilterAltri(a => ({ ...a, ...(importoMin !== undefined && { importoMin }), ...(importoMax !== undefined && { importoMax }), ...(soloNote !== undefined && { soloNote }), ...(soloDocumento !== undefined && { soloDocumento }) }));
    setPage(1);
  };
  const vistaElenco = true;
  const viste = [{ value: "annullate", label: tr("Annullate") }];
  const cambiaPeriodo = (preset: string, anno?: string) => {
    setDatePreset(preset); if (anno) setYearFilter(anno);
    setCustomFrom(""); setCustomTo(""); setRitornoPeriodo(null); setPage(1);
  };

  // La ricerca va al server con un attimo di attesa: prima filtrava solo le
  // righe gia' scaricate, quindi cercare una fattura finita in seconda pagina
  // rispondeva "nessuna scadenza trovata" pur essendoci.
  const [searchServer, setSearchServer] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setSearchServer(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);
  // I costi ripartiti su più commesse non hanno order_id = cantiere: i loro id si cercano sul server
  // prima della lista, e finché non arrivano non si mostra né si esporta un elenco incompleto.
  const costiCommessa = useQuery({
    queryKey: ["scadenzario", "costi-commessa", companyId, filterCommessa?.id],
    queryFn: () => costiDellaCommessa(companyId!, filterCommessa!.id),
    enabled: !!companyId && !!filterCommessa,
    staleTime: 60_000,
  });
  const commessaInAttesa = !!filterCommessa && costiCommessa.isLoading;
  const commessaInErrore = !!filterCommessa && costiCommessa.isError;
  const commessaTroncata = !!filterCommessa && !!costiCommessa.data?.troncato;
  const ricercaInAttesa = search.trim() !== searchServer || commessaInAttesa || commessaInErrore;
  const dateInvertite = tab !== "senza_data" && datePreset === "custom" && !!customFrom && !!customTo && customFrom > customTo;

  // Da incassare e da pagare per mese di scadenza dell'anno scelto (16/11/2026): il grafico
  // sopra l'elenco. Solo da tablet in su e con un anno scelto; le annullate non contano.
  const annoDelGrafico = leggiMese(datePreset)?.anno ?? (yearFilter !== "all" ? Number(yearFilter) : null);
  const conGraficoMesi = !vistaCompatta && annoDelGrafico !== null && tab !== "senza_data" && tab !== "annullate";

  const serverFilters: ScadenzarioFilters = useMemo(() => ({
    includiSenzaData: !datePreset || tab === "senza_data",
    soloSenzaData: tab === "senza_data",
    direction: tabDirection,
    status: tabStatus,
    dateFrom: serverDateRange?.from ?? null,
    dateTo: serverDateRange?.to ?? null,
    search: searchServer || null,
    soloScadute: tab === "scadute",
    soloAperte: tab === "aperte" || tab === "da_incassare" || tab === "da_pagare",
    supplierId: filterFornitore?.id ?? null,
    orderId: filterCommessa?.id ?? null,
    importoMin: importoDaTesto(filterAltri.importoMin), importoMax: importoDaTesto(filterAltri.importoMax),
    soloConNote: filterAltri.soloNote, soloConDocumento: filterAltri.soloDocumento,
    orderCostIds: filterCommessa ? costiCommessa.data?.ids ?? null : null,
    attendi: !!filterCommessa && !costiCommessa.data,
    metodo: filterMetodo && filterMetodo !== "all" ? (filterMetodo as GruppoMetodo) : null,
    // L'anno del grafico viaggia coi totali: i dodici mesi arrivano insieme al
    // riepilogo, da una sola costruzione dello scadenzario (23/11/2026).
    annoGrafico: conGraficoMesi ? annoDelGrafico : null,
  }), [tabDirection, tabStatus, serverDateRange, searchServer, tab, filterMetodo, filterFornitore, filterCommessa, filterAltri, costiCommessa.data, datePreset, conGraficoMesi, annoDelGrafico]);

  const { scadenze, isLoading, isError, refetch, totalCount, totalPages, summary, mesiScadenze: mesiDalServer, markPaid, create, cancel, cancelMany, update, annullaIncasso, updateNotes } = useScadenzario(page, pageSize, serverFilters);
  const [daAnnullare, setDaAnnullare] = useState<Scadenza | null>(null);
  const [daModificare, setDaModificare] = useState<Scadenza | null>(null);
  const [erroriAnnullamento, setErroriAnnullamento] = useState<Array<{ nome: string; motivo: string }>>([]);
  // Il dettaglio segue la riga aggiornata: dopo un incasso si vede il nuovo stato.
  const [dettaglio, setDettaglio] = useState<string | null>(null);
  const scadenzaAperta = dettaglio ? scadenze.find((x) => x.id === dettaglio) ?? null : null;
  const queryClient = useQueryClient();

  // I nomi dei mesi restano qui: dal database arrivano dodici coppie di numeri,
  // da gennaio a dicembre, già sommate.
  const mesiScadenze = useMemo(
    () => mesiDalServer?.map((m, i) => ({ month: MESI_BREVI[i], entrate: Number(m.entrate), uscite: Number(m.uscite) })),
    [mesiDalServer],
  );
  // Il mese scelto nel grafico è il filtro «Personalizzato» di quel mese esatto.
  const meseGrafico = leggiMese(datePreset) ? leggiMese(datePreset)!.mese - 1 : null;
  const scegliMeseGrafico = (i: number) => {
    if (meseGrafico === i) { cambiaPeriodo("", String(annoDelGrafico)); return; }
    cambiaPeriodo(presetMese(annoDelGrafico ?? currentYear, i + 1), String(annoDelGrafico ?? currentYear));
  };
  // Esportazione (28/11/2026): Excel, PDF e CSV di TUTTE le scadenze che rispettano i filtri,
  // non solo la pagina visibile. Righe, colonne e file li costruisce esportaScadenzario.ts.
  const caricaPerEsportazione = async (): Promise<Scadenza[]> => {
    if (!companyId) return [];
    const data = await readAllPages(async (from, to) => filtraScadenzario(queryFontiScadenzario(companyId)
      .select(`*, suppliers(name), invoices(invoice_number, client_company_name, issue_date),
        orders(order_code, description, indirizzo_lavori, client_name, client_company),
        company_costs(name, order_id, allocations, notes, documento_riferimento),
        marketing_contacts(first_name, last_name, company_name)`), serverFilters)
      .order("due_date", { ascending: true, nullsFirst: false }).order("id").range(from, to));
    const complete = await completaCommesseScadenze(companyId, data as unknown as Scadenza[]);
    const complete2 = await completaPerEsportazione(companyId, complete);
    const note = await noteFattureScadenze(companyId, complete2);
    return complete2.map((s) => ({ ...s, note_export: note.get(s.id) ?? "" }) as Scadenza);
  };
  const dataBreve = (iso: string) => iso.split("-").reverse().join("/");
  const nomeMeseEsportazione = (() => { const m = leggiMese(datePreset); return m ? new Date(m.anno, m.mese - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" }) : null; })();
  const periodoEsportazione = tab === "senza_data" ? tr("Senza data")
    : nomeMeseEsportazione ? nomeMeseEsportazione.charAt(0).toUpperCase() + nomeMeseEsportazione.slice(1)
    : serverDateRange?.from && serverDateRange?.to ? `${dataBreve(serverDateRange.from)} - ${dataBreve(serverDateRange.to)}`
    : serverDateRange?.from ? tr("Dal {dal}", { dal: dataBreve(serverDateRange.from) })
    : serverDateRange?.to ? tr("Fino al {al}", { al: dataBreve(serverDateRange.to) })
    : tr("Tutti gli anni");
  const NOMI_VISTA: Record<string, string> = { aperte: "Aperte", tutte: "Tutte", da_incassare: "Da incassare", da_pagare: "Da pagare", scadute: "Scadute", pagate: "Pagate", annullate: "Annullate", senza_data: "Senza data" };
  const filtriEsportazione = [
    tr("Vista: {vista}", { vista: tr(NOMI_VISTA[tab] ?? tab) }),
    ...(filterMetodo ? [tr("Pagamento: {m}", { m: GRUPPI_METODO.find((m) => m.value === filterMetodo)?.label ?? filterMetodo })] : []),
    ...(filterFornitore ? [tr("Fornitore: {f}", { f: filterFornitore.label })] : []),
    ...(filterCommessa ? [tr("Cantiere: {c}", { c: filterCommessa.label })] : []),
    ...(commessaTroncata ? [tr("ATTENZIONE: questo cantiere ha più di 150 costi ripartiti, ne sono inclusi solo 150")] : []),
    ...(importoDaTesto(filterAltri.importoMin) !== null ? [tr("Importo da {i} €", { i: filterAltri.importoMin })] : []),
    ...(importoDaTesto(filterAltri.importoMax) !== null ? [tr("Importo fino a {i} €", { i: filterAltri.importoMax })] : []),
    ...(filterAltri.soloNote ? [tr("Solo con note")] : []),
    ...(filterAltri.soloDocumento ? [tr("Solo con fattura o costo collegato")] : []),
    ...(searchServer ? [tr("Ricerca: «{q}»", { q: searchServer })] : []),
  ];
  // Il fornitore o il cantiere scelto finisce nel nome: dieci distinte di fine mese non si chiamano tutte uguali.
  const nomeFileEsportazione = ["scadenzario", periodoNomeFile(serverDateRange, yearFilter), tab !== "tutte" ? tab : "",
    pezzoNomeFile(filterFornitore?.label), pezzoNomeFile(filterCommessa?.label.split(" · ")[0])].filter(Boolean).join("_");

  const filtered = ricercaInAttesa || dateInvertite ? [] : scadenze;
  const selezione = useSelezioneRighe(filtered, JSON.stringify([companyId, page, pageSize, serverFilters, search]));
  const annullabili = selezione.selezionate.filter((s) => !percheScadenzaNonModificabile(s));
  const escluse = selezione.selezionate.flatMap((s) => {
    const motivo = percheScadenzaNonModificabile(s);
    return motivo ? [{ nome: s.description, motivo }] : [];
  });
  const annullaSelezionate = async () => {
    const righe = [...annullabili];
    if (righe.length === 0 || cancelMany.isPending) return;
    const somma = (verso: string) => righe.filter((s) => s.direction === verso).reduce((n, s) => n + Number(s.amount), 0);
    if (!await confirm({ title: tr("Annullare {n} scadenze?", { n: righe.length }), description: tr("Entrate previste: {entrate}. Uscite previste: {uscite}. {escluse}Le scadenze manuali selezionate usciranno dagli importi ancora aperti. I pagamenti registrati restano invariati.", { entrate: formatCurrency(somma("entrata")), uscite: formatCurrency(somma("uscita")), escluse: escluse.length ? `${tr("{n} righe collegate a documenti o pagamenti restano escluse.", { n: escluse.length })} ` : "" }), confirmLabel: tr("Annulla scadenze"), variant: "destructive" })) return;
    setErroriAnnullamento([]);
    const esito = await cancelMany.mutateAsync(righe);
    selezione.mantieni(esito.errori.map((e) => e.riga.id));
    setErroriAnnullamento(esito.errori.map((e) => ({ nome: e.riga.description, motivo: e.motivo })));
  };
  const annullaSingola = async (s: Scadenza) => {
    if (!await confirm({ title: tr("Annullare questa scadenza?"), description: tr("{description}: {amount}. La scadenza uscirà dagli importi ancora aperti.", { description: String(s.description ?? ""), amount: formatCurrency(s.amount) }), confirmLabel: tr("Annulla scadenza"), variant: "destructive" })) return;
    try { await cancel.mutateAsync(s.id); setDettaglio(null); } catch { /* Il messaggio è gestito dalla mutation. */ }
  };

  // Il riepilogo del periodo (riquadri e numeri delle linguette) segue gli stessi filtri dell'elenco:
  // periodo, fornitore, cantiere, modalità, ricerca. Per «Senza data» guarda comunque il periodo scelto.
  const inArretrato = !!ritornoPeriodo && datePreset === "custom" && !customFrom && customTo === ritornoPeriodo.fine;
  const filtriRiepilogo = useMemo<ScadenzarioFilters>(() => ({
    ...serverFilters,
    // In arretrato i riquadri restano quelli del periodo di partenza: l'elenco cambia, i numeri no.
    dateFrom: (inArretrato ? ritornoPeriodo!.from : periodoRange?.from) ?? null,
    dateTo: (inArretrato ? ritornoPeriodo!.to : periodoRange?.to) ?? null,
    includiSenzaData: !(inArretrato ? ritornoPeriodo!.preset : datePreset), annoGrafico: null,
  }), [serverFilters, periodoRange, datePreset, inArretrato, ritornoPeriodo]);
  // «Personalizzato» senza date è «tutto il tempo»: non si legge, i riquadri aspettano le date.
  const senzaDatePersonalizzato = !filtriRiepilogo.dateFrom && !filtriRiepilogo.dateTo && (inArretrato ? ritornoPeriodo!.preset : datePreset) === "custom";
  const riepilogoQuery = useRiepilogoPeriodo(companyId, filtriRiepilogo, !ricercaInAttesa && !dateInvertite && !senzaDatePersonalizzato);
  const riepilogo = ricercaInAttesa || dateInvertite || senzaDatePersonalizzato ? undefined : riepilogoQuery.data;
  const settimanaQuery = useSettimanaScadenzario(companyId, filtriRiepilogo, !ricercaInAttesa && !dateInvertite);
  // In arretrato i riquadri restano quelli del mese, ma l'elenco mostra il periodo «fino al…»:
  // i numeri del mese sulle linguette direbbero «Scadute (23)» sopra 211 righe. Lì niente numero.
  const nLinguetta = (k: LinguettaConConteggio): number | undefined => inArretrato ? undefined : riepilogo?.linguette[k];
  const conta = (n: number | undefined) => n === undefined ? "" : `\u00a0(${n})`;
  // 28/11/2026, collaudo: un fornitore tutto pagato apriva su «Aperte» vuota senza dire che in
  // «Pagate» ce n'erano dieci. Se la vista è vuota e «Tutte» no, un clic porta lì.
  const nTutte = nLinguetta("tutte") ?? 0;
  const rimandoVuoto = tab !== "tutte" && (LINGUETTE_CON_CONTEGGIO as readonly string[]).includes(tab) && nTutte > 0
    ? { testo: tr("Vedi le {n} scadenze in «Tutte»", { n: nTutte }), onClick: () => { setTab("tutte"); setPage(1); } }
    : undefined;

  // Le scelte restano nell'indirizzo (sostituendo la voce di cronologia): ricarico e link tornano alla stessa vista.
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "tutte") p.set("vista", tab);
    if (datePreset !== presetMeseCorrente()) p.set("periodo", datePreset || "anno");
    if (yearFilter !== String(currentYear)) p.set("anno", yearFilter);
    if (customFrom) p.set("dal", customFrom);
    if (customTo) p.set("al", customTo);
    if (inArretrato && ritornoPeriodo) {
      p.set("arretrato", "1"); p.set("rp", ritornoPeriodo.preset || "anno"); p.set("ra", ritornoPeriodo.anno);
      if (ritornoPeriodo.dal) p.set("rd", ritornoPeriodo.dal);
      if (ritornoPeriodo.al) p.set("rl", ritornoPeriodo.al);
    }
    if (p.toString() !== params.toString()) setParams(p, { replace: true });
  }, [tab, datePreset, yearFilter, customFrom, customTo, currentYear, params, setParams, inArretrato, ritornoPeriodo]);

  const oggiIso = format(new Date(), "yyyy-MM-dd");
  const tornaAlMese = () => {
    if (!ritornoPeriodo) return;
    setDatePreset(ritornoPeriodo.preset); setYearFilter(ritornoPeriodo.anno);
    setCustomFrom(ritornoPeriodo.dal); setCustomTo(ritornoPeriodo.al); setRitornoPeriodo(null); setTab("tutte"); setPage(1);
  };
  const riquadroAttivo: RiquadroPeriodo | null = inArretrato ? "arretrato"
    : tab === "tutte" ? "scade" : tab === "pagate" ? "pagato" : tab === "aperte" ? "aperto" : null;
  const scegliRiquadro = (r: RiquadroPeriodo) => {
    if (r === "arretrato") {
      const inizio = periodoRange?.from;
      if (!inizio || inArretrato) return;
      setRitornoPeriodo({ preset: datePreset, anno: yearFilter, dal: customFrom, al: customTo, fine: giornoPrima(inizio), from: periodoRange?.from ?? null, to: periodoRange?.to ?? null });
      setDatePreset("custom"); setCustomFrom(""); setCustomTo(giornoPrima(inizio));
      setTab(inizio > oggiIso ? "aperte" : "scadute"); setPage(1);
      return;
    }
    if (inArretrato) tornaAlMese();
    setTab(r === "scade" ? "tutte" : r === "pagato" ? "pagate" : "aperte"); setPage(1);
  };
  const anni = Array.from({ length: 6 }, (_, i) => String(currentYear - i));
  const meseAttuale = leggiMese(datePreset);
  const periodiRapidi = DATE_PRESETS.map((p) => ({ ...p, label: tr(p.label) }));
  const periodiAnno = [
    ...(meseAttuale && datePreset !== presetMeseCorrente() ? [{ value: datePreset, label: new Date(meseAttuale.anno, meseAttuale.mese - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" }) }] : []),
    { value: presetMeseCorrente(), label: tr("Questo mese") },
    ...anni.map(anno => ({ value: `anno:${anno}`, label: tr("Tutto il {anno}", { anno }) })),
    { value: "anno:all", label: tr("Tutti gli anni") },
  ];
  const visteCompatte = [
    { value: "tutte", label: tr("Tutte") },
    { value: "aperte", label: tr("Aperte") },
    { value: "da_incassare", label: tr("Da incassare") },
    { value: "da_pagare", label: tr("Da pagare") },
    { value: "scadute", label: tr("Scadute") },
    { value: "pagate", label: tr("Pagate") },
    ...viste,
    { value: "strumento:settimane", label: tr("Per settimana") },
    { value: "strumento:adempimenti", label: tr("Adempimenti fiscali") },
    ...((summary?.senza_data_count || tab === "senza_data") ? [{ value: "senza_data", label: tr("Senza data") }] : []),
  ];
  const nSenzaData = summary?.senza_data_count ?? 0;
  const conDatiMesi = !!mesiScadenze?.some((m) => m.entrate > 0 || m.uscite > 0);
  const conDistinte = !!companyId && !permessi.solaLettura && (permessi.canManagePayments || role === "company_admin" || role === "super_admin");
  const exportDisabilitato = isLoading || isError || ricercaInAttesa || dateInvertite;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold max-sm:text-lg">{tr("Scadenzario")}</h1>
        </div>
        {/* Il navigatore del mese sta sempre qui, da telefono su una riga sua. */}
        <div className="flex min-w-0 items-center gap-2 max-lg:order-last max-lg:w-full">
          <NavigatoreMese className="max-lg:flex-1" etichettaFissa={inArretrato && ritornoPeriodo ? tr("Arretrato al {data}", { data: ritornoPeriodo.fine.split("-").reverse().join("/") }) : undefined} preset={datePreset} anno={yearFilter}
            onMese={(a, m) => cambiaPeriodo(presetMese(a, m), String(a))}
            onAnno={(a) => cambiaPeriodo("", a)}
            onProssimi30={() => cambiaPeriodo("30gg")}
            onPersonalizzato={() => { cambiaPeriodo("custom"); }} />
          {inArretrato && ritornoPeriodo && (
            <Button size="sm" variant="secondary" className="h-8 shrink-0 gap-1 px-2.5 text-xs max-lg:h-10" onClick={tornaAlMese}>
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />{tr("Torna al mese")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {companyId && conDistinte && vistaCompatta && <div className="lg:hidden"><DistintePagamenti key={companyId} companyId={companyId} /></div>}
          <div className="lg:hidden">
            <EsportaScadenzario colonneTabella={chiaviColonneTabella} carica={caricaPerEsportazione} azienda={effectiveCompany?.name ?? undefined}
              periodo={periodoEsportazione} descrizioneFiltri={filtriEsportazione} nomeFile={nomeFileEsportazione}
              disabilitato={exportDisabilitato} />
          </div>
          <Button size="sm" onClick={() => setNewOpen(true)} className={cn(BOTTONE_NUOVO, "max-lg:min-h-11 max-sm:px-3 max-sm:text-sm")}>
            <Plus className="h-3.5 w-3.5" /> <span className="max-sm:hidden">{tr("Nuova Scadenza")}</span><span className="sm:hidden">{tr("Nuova")}</span>
          </Button>
        </div>
      </div>

      {nSenzaData > 0 && vistaCompatta && (
        // Da computer è un bottone nella riga delle viste (25/11/2026): la fascia occupava 58px.
        <div className="flex flex-wrap items-center gap-2 rounded-lg border text-sm lg:hidden">
          <span className="max-lg:hidden">{tr("{nSenzaData} importi aperti senza data. Completa la data nella commessa o nel costo.", { nSenzaData: String(nSenzaData ?? "") })}</span>
          {tab === "senza_data" ? (
            <Button size="sm" variant="ghost" className="lg:h-8 lg:px-2.5 lg:text-xs max-lg:min-h-11 max-lg:w-full max-lg:justify-start"
              onClick={() => { setTab("aperte"); setPage(1); }}>
              <ChevronLeft aria-hidden="true" className="mr-1.5 size-4 lg:hidden" />
              {tr("Torna alle aperte")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="lg:h-8 lg:px-2.5 lg:text-xs max-lg:min-h-11 max-lg:w-full max-lg:justify-between max-lg:border-0"
              onClick={() => { clearFilters(); setTab("senza_data"); }}>
              <span className="hidden lg:inline">{tr("Mostra senza data")}</span>
              <span className="flex items-center gap-2 lg:hidden">
                <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
                {tr("{n} senza data", { n: nSenzaData })}
              </span>
              <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground lg:hidden" />
            </Button>
          )}
        </div>
      )}

      {/* Riepilogo del periodo (28/11/2026): sostituisce i quattro riquadri dell'anno, che dicevano cifre
          diverse dalle linguette per la stessa domanda. Ogni riquadro è un filtro dell'elenco. */}
      <RiepilogoPeriodo riepilogo={riepilogo} inErrore={riepilogoQuery.isError} attivo={riquadroAttivo}
        inAggiornamento={!!riepilogo && riepilogoQuery.isPlaceholderData} inAttesaDate={senzaDatePersonalizzato}
        settimana={ricercaInAttesa || dateInvertite ? undefined : settimanaQuery.data}
        settimanaInErrore={settimanaQuery.isError}
        conArretrato={!!(inArretrato ? ritornoPeriodo?.from : periodoRange?.from)} onScegli={scegliRiquadro} />

      {graficoAperto && conGraficoMesi && conDatiMesi && (
        <GraficoEntrateUscite
          dati={mesiScadenze}
          titolo={tr("Incassi e pagamenti per mese di scadenza, {yearFilter}", { yearFilter: String(annoDelGrafico ?? "") })}
          nomeEntrate={tr("Incassi")}
          nomeUscite={tr("Pagamenti")}
          notaPeriodo={tr("scadenze del {anno}", { anno: String(annoDelGrafico ?? "") })}
          onMese={scegliMeseGrafico}
          meseScelto={meseGrafico}
        />
      )}


      {/* Fatture passive caricate in chat (Silvio) da confermare */}
      <FattureDaRegistrareCard companyId={companyId} />

      {/* Mobile: ricerca e bottone dei filtri (linguette, periodo e tipo nel pannello). */}
      <CercaConFiltri
        className="lg:hidden"
        segnaposto={tr("Cerca scadenze")}
        valore={search}
        onCambia={(v) => { setSearch(v); setPage(1); }}
        filtriAttivi={nFiltriMobile}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      <div className="space-y-2 max-lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Tabs className="min-w-0 flex-1 overflow-x-auto" value={tab} onValueChange={v => { setTab(v); setPage(1); }}>
            <TabsList className="inline-flex h-8 w-max justify-start gap-0.5 p-0.5 [&>button]:px-2.5 [&>button]:text-xs">
              <TabsTrigger value="tutte">{tr("Tutte")}<span className="hidden 2xl:inline">{conta(nLinguetta("tutte"))}</span></TabsTrigger>
              <TabsTrigger value="aperte">{tr("Aperte")}<span className="hidden 2xl:inline">{conta(nLinguetta("aperte"))}</span></TabsTrigger>
              <TabsTrigger value="da_incassare">{tr("Da Incassare")}<span className="hidden 2xl:inline">{conta(nLinguetta("da_incassare"))}</span></TabsTrigger>
              <TabsTrigger value="da_pagare">{tr("Da Pagare")}<span className="hidden 2xl:inline">{conta(nLinguetta("da_pagare"))}</span></TabsTrigger>
              <TabsTrigger value="scadute">{tr("Scadute")}{(nLinguetta("scadute") ?? 0) > 0 && <span className="ml-1 font-semibold text-destructive">({nLinguetta("scadute")})</span>}</TabsTrigger>
              <TabsTrigger value="pagate">{tr("Pagate")}<span className="hidden 2xl:inline">{conta(nLinguetta("pagate"))}</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant={tab === "annullate" ? "secondary" : "outline"} size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs" aria-label={tr("Altre viste dello scadenzario")}>
              {tab === "annullate" ? tr("Annullate") : tr("Altre viste")}<ChevronDown className="h-3.5 w-3.5" />
            </Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { setTab("annullate"); setPage(1); }}>{tr("Annullate")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setStrumento("settimane")}>{tr("Per settimana")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setStrumento("adempimenti")}>{tr("Adempimenti fiscali")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {nSenzaData > 0 && !vistaCompatta && (tab === "senza_data" ? (
            <Button size="sm" variant="ghost" className={cn(BOTTONE_SECONDARIO, "shrink-0")} onClick={() => { setTab("aperte"); setPage(1); }}>
              <ChevronLeft aria-hidden="true" />{tr("Torna alle aperte")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className={cn(BOTTONE_SECONDARIO, "shrink-0")}
              title={tr("{nSenzaData} importi aperti senza data. Completa la data nella commessa o nel costo.", { nSenzaData: String(nSenzaData ?? "") })}
              onClick={() => { clearFilters(); setTab("senza_data"); }}>
              <CalendarClock aria-hidden="true" className="text-amber-600" />{tr("{n} senza data", { n: nSenzaData })}
            </Button>
          ))}
          {conGraficoMesi && conDatiMesi && (
            <Button size="sm" variant={graficoAperto ? "secondary" : "outline"} className={cn(BOTTONE_SECONDARIO, "shrink-0")}
              aria-expanded={graficoAperto} title={tr("Andamento nei mesi")} onClick={alternaGrafico}>
              <BarChart3 aria-hidden="true" />{tr("Grafico")}
            </Button>
          )}
          {companyId && conDistinte && !vistaCompatta && <DistintePagamenti key={companyId} companyId={companyId} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn(RICERCA_BARRA, "max-sm:w-full")}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={tr("Cerca nello scadenzario")} placeholder={tr("Cerca cliente, fornitore o descrizione…")} value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} className="h-8 pl-8 text-xs" />
          </div>
          {vistaElenco && <>
            {companyId && <FiltriScadenzario valore={valoriFiltri} anno={yearFilter} companyId={companyId} periodi={periodiRapidi} senzaPeriodo senzaDate={inArretrato}
              cambia={cambiaFiltri} azzera={clearFilters} />}
            {/* Solo da computer: sotto i 1024px lo scadenzario è una riga per scadenza, senza colonne. */}
            <span className="hidden lg:inline-flex"><SceltaColonne colonne={colonneScadenze} /></span>
            <EsportaScadenzario compatto colonneTabella={chiaviColonneTabella} carica={caricaPerEsportazione} azienda={effectiveCompany?.name ?? undefined}
              periodo={periodoEsportazione} descrizioneFiltri={filtriEsportazione} nomeFile={nomeFileEsportazione}
              disabilitato={exportDisabilitato} />
          </>}
        </div>
        {vistaElenco && <FiltriScadenzarioAttivi valore={valoriFiltri} cambia={cambiaFiltri} azzera={clearFilters} />}
        {/* L'errore del cantiere lo dice una volta sola, al posto dell'elenco (con «Riprova»). */}
        {vistaElenco && commessaTroncata && <p role="alert" className="text-xs text-amber-700">{tr("Questo cantiere ha più di 150 costi ripartiti: elenco ed esportazione ne includono solo 150.")}</p>}
        {vistaElenco && nAltriFiltri > 0 && !isLoading && !ricercaInAttesa && <p className="text-xs text-muted-foreground">
          {tr("{n} scadenze trovate. Riquadri e linguette seguono gli stessi filtri dell'elenco.", { n: totalCount })}
        </p>}
      </div>

      {companyId && <RibaNonRegistrate companyId={companyId} dal={periodoRange?.from ?? null} al={periodoRange?.to ?? null} cerca={searchServer}
        fornitoreId={filterFornitore?.id ?? null}
        abilitato={filterMetodo === "riba" && permessi.canViewBilling && !filterCommessa && tab !== "annullate" && tab !== "pagate"} />}

      {(
        dateInvertite ? (
          <p role="alert" className="text-sm text-destructive">{tr("La data finale deve essere uguale o successiva a quella iniziale.")}</p>
        ) : commessaInErrore ? (
          <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{tr("Non riesco a leggere i costi di questo cantiere.")}</p>
            <Button variant="outline" size="sm" onClick={() => void costiCommessa.refetch()}>{tr("Riprova")}</Button>
          </div>
        ) : isLoading || ricercaInAttesa ? (
          <div role="status" aria-label={tr("Caricamento scadenze")} className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{tr("Non riesco a caricare le scadenze. Riprova senza modificare i filtri.")}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{tr("Riprova scadenze")}</Button>
          </div>
        ) : (
          <>
            {!permessi.solaLettura && selezione.selezionate.length > 0 && <BarraSelezioneRighe nome={tr("le scadenze")} selezionate={selezione.selezionate.length} consentite={annullabili.length}
              tutte={selezione.tutte} parziale={selezione.parziale}
              entrate={annullabili.filter((s) => s.direction === "entrata").reduce((n, s) => n + Number(s.amount), 0)}
              uscite={annullabili.filter((s) => s.direction === "uscita").reduce((n, s) => n + Number(s.amount), 0)}
              azione={tr("Annulla selezionate")} inCorso={cancelMany.isPending} escluse={escluse} onPagina={selezione.pagina} onAzione={() => void annullaSelezionate()} />}
            <ErroriOperazioneRighe errori={erroriAnnullamento} />
            <ScadenzarioTable
              rimandoVuoto={rimandoVuoto}
              colonne={colonneScadenze.colonne}
              scadenze={filtered}
              onNota={(s, nota) => updateNotes(s.id, nota)}
              onMarkPaid={apriPagamento}
              pagaSulPosto={pagaSulPosto}
              onCancel={(id) => { const s = scadenze.find((x) => x.id === id); if (s) void annullaSingola(s); }}
              onModifica={!permessi.solaLettura ? setDaModificare : undefined}
              selezionate={selezione.ids}
              onSeleziona={!permessi.solaLettura ? selezione.alterna : undefined}
              onSelezionaPagina={!permessi.solaLettura ? selezione.pagina : undefined}
              tutteSelezionate={selezione.tutte}
              selezioneParziale={selezione.parziale}
              inCorso={cancelMany.isPending || cancel.isPending || update.isPending}
              onAnnullaIncasso={setDaAnnullare}
              onAdd={() => setNewOpen(true)}
              onRowClick={(s) => setDettaglio(s.id)}
            />
            {/* Mobile: solo precedente/successiva (via righe per pagina e salti). Il
                contenitore c'è solo quando la paginazione compare, per non
                lasciare un margine vuoto sul desktop. */}
            {totalCount > 25 && (
              <div className="max-lg:hidden">
                <TablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={totalCount}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                />
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between lg:hidden">
                <Button variant="outline" size="icon" className="size-11" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={tr("Pagina precedente")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">{tr("{n} di {totale}", { n: String(page ?? ""), totale: String(totalPages ?? "") })}</span>
                <Button variant="outline" size="icon" className="size-11" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label={tr("Pagina successiva")}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )
      )}

      {/* Filtri di telefono e tablet. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={nFiltriMobile}
        onAzzera={() => { setTab("tutte"); clearFilters(); }}
        risultati={isLoading || ricercaInAttesa || dateInvertite ? undefined : totalCount}
      >
        <GruppoFiltri>
          <SceltaFiltro titolo={tr("Vista")} valore={tab} scelte={visteCompatte}
            onScegli={v => {
              if (v.startsWith("strumento:")) { setFiltriMobileAperti(false); setStrumento(v.slice(10) as "settimane" | "adempimenti"); return; }
              setTab(v); setPage(1);
            }} />
          {inArretrato && ritornoPeriodo && tab !== "senza_data" && (
            <Button type="button" variant="secondary" className="h-11 w-full justify-between" onClick={tornaAlMese}>
              {tr("Arretrato al {data}", { data: ritornoPeriodo.fine.split("-").reverse().join("/") })}
              <span className="flex items-center gap-1 text-xs"><ChevronLeft aria-hidden="true" className="size-4" />{tr("Torna al mese")}</span>
            </Button>
          )}
          {!inArretrato && tab !== "senza_data" && (
            <SceltaFiltro titolo={tr("Periodo")} valore={datePreset || `anno:${yearFilter}`}
              scelte={[...periodiAnno, ...periodiRapidi]}
              onScegli={v => {
                if (v.startsWith("anno:")) cambiaPeriodo("", v.slice(5));
                else if (leggiMese(v)) cambiaPeriodo(v, String(leggiMese(v)!.anno));
                else cambiaPeriodo(v);
              }} />
          )}
          {!inArretrato && tab !== "senza_data" && datePreset === "custom" && (
            <DateFiltro dal={customFrom} al={customTo}
              cambiaDal={dal => cambiaFiltri({ dal })} cambiaAl={al => cambiaFiltri({ al })} />
          )}
          {vistaElenco && <DettaglioFiltri titolo={tr("Altri filtri")} riepilogo={nAltriFiltri ? String(nAltriFiltri) : undefined}>
            <SceltaFiltro titolo={tr("Pagamento")} valore={filterMetodo || "all"}
              onScegli={v => cambiaFiltri({ metodo: v === "all" ? "" : v })}
              scelte={[{ value: "all", label: tr("Tutti") }, ...GRUPPI_METODO.map((g) => ({ ...g, label: tr(g.label) }))]} />
            <DettaglioFiltri titolo={tr("Fornitore")} riepilogo={filterFornitore?.label}>
              {companyId && <SceltaEntitaInline tipo="fornitore" companyId={companyId} valore={filterFornitore} onScegli={fornitore => cambiaFiltri({ fornitore })} />}
            </DettaglioFiltri>
            <DettaglioFiltri titolo={tr("Cantiere")} riepilogo={filterCommessa?.label}>
              {companyId && <SceltaEntitaInline tipo="cantiere" companyId={companyId} valore={filterCommessa} onScegli={commessa => cambiaFiltri({ commessa })} />}
            </DettaglioFiltri>
            <CampiAltriFiltriScadenzario valore={valoriFiltri} cambia={cambiaFiltri} compatto />
          </DettaglioFiltri>}
        </GruppoFiltri>
      </PannelloFiltri>

      {/* Strumenti separati dall'elenco: «Per settimana» e «Adempimenti fiscali» si aprono accanto, senza cambiare la pagina. */}
      <Sheet open={strumento === "settimane"} onOpenChange={(o) => !o && setStrumento(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader><SheetTitle>{tr("Incassi per settimana")}</SheetTitle></SheetHeader>
          <div className="mt-4"><IncassiPerSettimanaVista cerca={search} /></div>
        </SheetContent>
      </Sheet>
      <Sheet open={strumento === "adempimenti"} onOpenChange={(o) => !o && setStrumento(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader><SheetTitle>{tr("Adempimenti fiscali")}</SheetTitle></SheetHeader>
          <div className="mt-4">{strumento === "adempimenti" && <AdempimentiFiscali />}</div>
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      {scadenzaAperta && (
        <ScadenzaDettaglio
          scadenza={scadenzaAperta}
          onClose={() => setDettaglio(null)}
          onMarkPaid={(x) => { setDettaglio(null); apriPagamento(x); }}
          pagaSulPosto={pagaSulPosto}
          onAnnullaIncasso={(x) => { setDettaglio(null); setDaAnnullare(x); }}
          onNota={(x, nota) => updateNotes(x.id, nota)}
          onModifica={!permessi.solaLettura ? (s) => { setDettaglio(null); setDaModificare(s); } : undefined}
          onAnnullaScadenza={!permessi.solaLettura ? (s) => void annullaSingola(s) : undefined}
        />
      )}
      {pagaCosto && <ExpensePaymentDialog key={pagaCosto.costId} costId={pagaCosto.costId} importoProposto={pagaCosto.importo}
        apriInRegistrazione onClose={() => setPagaCosto(null)} />}
      <MarkPaidDialog
        scadenza={payDialog}
        open={!!payDialog}
        onOpenChange={(o) => !o && setPayDialog(null)}
        onConfirm={(p) => {
          markPaid.mutate(p, { onSuccess: () => setPayDialog(null) });
        }}
        isPending={markPaid.isPending}
      />
      {daModificare && <ModificaScadenzaDialog key={`${daModificare.id}-${daModificare.updated_at}`} scadenza={daModificare} onClose={() => setDaModificare(null)} isPending={update.isPending}
        onConfirm={async (dati) => { await update.mutateAsync({ riga: daModificare, dati }); setDaModificare(null); }} />}
      <AnnullaIncassoDialog
        scadenza={daAnnullare}
        onClose={() => setDaAnnullare(null)}
        isPending={annullaIncasso.isPending}
        onConfirm={(id) => annullaIncasso.mutate(id, {
          onSuccess: () => {
            invalidaFattureImportate(queryClient, effectiveCompany?.id);
            setDaAnnullare(null);
          },
        })}
      />
      <NewScadenzaDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={(p) => {
          create.mutate(p, { onSuccess: () => setNewOpen(false) });
        }}
        isPending={create.isPending}
      />
    </div>
  );
}
