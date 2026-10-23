import { Fragment, useState, useMemo, useCallback } from "react";
import {
  ODA_STATUS_LABELS as STATUS_LABELS,
  ODA_STATUS_CHIP_VARIANT as STATUS_CHIP_VARIANT,
} from "@/lib/odaStatus";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ShoppingCart, Plus, Search, Truck, ShieldCheck, FileText, Download, ChevronDown,
  FileSpreadsheet, X, Calendar as CalendarIcon, Package, Wallet, Warehouse, Link2, ArrowRight,
  AlertTriangle, Send, Check, Columns3, List,
} from "lucide-react";
import { usePurchaseOrders, type PurchaseOrder } from "@/hooks/usePurchaseOrders";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { formatCurrency } from "@/lib/formatters";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { ODA_ORIGINI, ODA_ORIGINE_INFO, type OdaOrigine } from "@/lib/odaOrigine";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSupplierRfqs } from "@/hooks/useSupplierRfqs";
import { useAcquistiDaOrdinare } from "@/hooks/useAcquistiDaOrdinare";
import {
  costruisciPipeline, filtraOda, giorniRitardoOda, leggiFiltriAcquisti, scriviFiltroAcquisti,
} from "@/lib/acquisti/pipelineAcquisti";
import { PipelineAcquisti } from "@/components/acquisti/PipelineAcquisti";
import {
  QuotePageHeader,
  QuoteChip,
  QuotePrimaryButton,
  type HubTab,
} from "@/components/marketing/preventivi/ui/builderUI";


const VERIFICATION_BADGES: Record<string, { label: string; className: string }> = {
  match: { label: "Verificato", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  partial_match: { label: "Discrepanze", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  mismatch: { label: "Non conforme", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

/**
 * Importo senza centesimi per le card KPI: a sei cifre "365.225,30 €" veniva
 * troncato in "365...." e il numero spariva del tutto. Sui totali di sintesi
 * i centesimi non servono a nessuno.
 */
function euroCompatto(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  // Sopra i centomila la forma per esteso non entra nella card (misurato:
  // servono 102px, ce ne sono 82) e veniva troncata a meta'. Meglio un numero
  // arrotondato ma leggibile che uno preciso e invisibile: il dettaglio
  // esatto e' comunque nella colonna Totale della tabella.
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    ...(Math.abs(v) >= 100_000 ? { notation: "compact" as const } : {}),
  }).format(v);
}

/** Giorni di ritardo di un ordine ad oggi (regola in lib/acquisti/pipelineAcquisti). */
function giorniDiRitardo(o: { status: string; expected_delivery_date: string | null }): number | null {
  return giorniRitardoOda(o, new Date().toLocaleDateString("en-CA"));
}

/**
 * Quanto è arrivato di un ordine, riga per riga: «2/3» vuol dire due righe
 * complete su tre. Senza righe non c'è niente da contare.
 */
function avanzamento(o: PurchaseOrder): { righe: number; complete: number; iniziate: number } | null {
  const righe = (o.purchase_order_items ?? []).filter((r) => Number(r.quantity ?? 0) > 0);
  if (righe.length === 0) return null;
  return {
    righe: righe.length,
    complete: righe.filter((r) => Number(r.quantity_received ?? 0) >= Number(r.quantity ?? 0)).length,
    iniziate: righe.filter((r) => Number(r.quantity_received ?? 0) > 0).length,
  };
}

/**
 * Il valore arrivato di un ordine: tutto se è «ricevuto», altrimenti la quota
 * delle righe già arrivate (quantità ricevuta × prezzo). Prima contava solo gli
 * ordini «ricevuto»: una commessa con ordini parziali al 90% diceva 0%.
 */
function valoreArrivato(o: PurchaseOrder): number {
  const totale = Number(o.total ?? 0);
  if (o.status === "ricevuto") return totale;
  const righe = o.purchase_order_items ?? [];
  let ordinato = 0; let arrivato = 0;
  for (const r of righe) {
    const q = Number(r.quantity ?? 0); const p = Number(r.unit_price ?? 0);
    ordinato += q * p;
    arrivato += Math.min(Number(r.quantity_received ?? 0), q) * p;
  }
  return ordinato > 0 ? totale * (arrivato / ordinato) : 0;
}

const numeroDdt = (o: PurchaseOrder) => o.ddt_ricezione?.[0]?.count ?? 0;

/** Gli stati che pesano come impegno di spesa: mandati al fornitore, non annullati. */
const impegnato = (o: PurchaseOrder) => !["bozza", "annullato"].includes(o.status);

function Arrivato({ o }: { o: PurchaseOrder }) {
  const a = avanzamento(o);
  const ddt = numeroDdt(o);
  if (o.status === "bozza" || o.status === "annullato") return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      {a ? (
        <span className="inline-flex items-center gap-1.5" title={`${a.complete} righe arrivate su ${a.righe}`}>
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200">
            <span
              className={cn("block h-full rounded-full", a.complete === a.righe ? "bg-emerald-500" : "bg-amber-500")}
              style={{ width: `${Math.round(((a.complete + (a.iniziate - a.complete) * 0.5) / a.righe) * 100)}%` }}
            />
          </span>
          <span className="text-xs tabular-nums text-slate-600">{a.complete}/{a.righe}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground" title="Ordine senza righe: non c'è niente da contare">senza righe</span>
      )}
      {ddt > 0 && (
        <span className="text-[11px] text-muted-foreground" title={`${ddt} ${ddt === 1 ? "bolla registrata" : "bolle registrate"}`}>
          · {ddt} DDT
        </span>
      )}
    </div>
  );
}

function CommessaCella({ o }: { o: PurchaseOrder }) {
  if (!o.order_id || !o.orders?.order_code) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link
        to={`/azienda/ordini/${o.order_id}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        <Link2 className="h-3 w-3" />
        {o.orders.order_code}
      </Link>
      {/* il costo di un ordine su una commessa cestinata non finisce in nessun margine visibile */}
      {o.orders.deleted_at && (
        <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700" title="La commessa è nel cestino">
          nel cestino
        </span>
      )}
    </span>
  );
}

function VerificationBadge({ result }: { result: string | null | undefined }) {
  if (!result) return null;
  const cfg = VERIFICATION_BADGES[result];
  if (!cfg) return null;
  return (
    <Badge className={`text-xs border-0 gap-1 ${cfg.className}`}>
      <ShieldCheck className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { orders, isLoading, isError, create } = usePurchaseOrders();
  const { suppliers } = useOperationalSuppliers();
  const { effectiveCompany } = useAuth();
  const perm = usePermissions();
  const { rfqs, contatori, isLoading: rfqInCaricamento } = useSupplierRfqs();
  const materialiQuery = useAcquistiDaOrdinare(effectiveCompany?.id);
  const materiali = useMemo(() => materialiQuery.data ?? [], [materialiQuery.data]);
  const puoAgire = perm.canManagePurchasing || perm.canEditOrders || perm.isAdmin;

  // Vista, filtri e scheda nell'URL: un link copiato riapre la stessa schermata,
  // e le notifiche portano direttamente alla commessa giusta.
  const [params, setParams] = useSearchParams();
  const filtri = useMemo(() => leggiFiltriAcquisti(params), [params]);
  const imposta = useCallback((chiave: string, valore: string | null | boolean) => {
    setParams((prima) => scriviFiltroAcquisti(prima, chiave, valore), { replace: true });
  }, [setParams]);
  const vistaPrincipale = filtri.vista;
  const tab = params.get("stato") ?? "tutti";
  const setTab = (v: string) => imposta("stato", v === "tutti" ? null : v);
  const search = filtri.cerca;
  const setSearch = (v: string) => imposta("cerca", v);
  const [newOpen, setNewOpen] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newDelivery, setNewDelivery] = useState("");
  const [newWarehouseId, setNewWarehouseId] = useState<string | null>(null);
  // Come si sta ordinando: e' la prima domanda del dialog, perche' decide i
  // passaggi successivi (chi compra al banco non deve "inviare" niente).
  const [newOrigine, setNewOrigine] = useState<OdaOrigine | null>(null);
  const [newRiferimento, setNewRiferimento] = useState("");
  // Null e' una scelta legittima: scorte di magazzino e attrezzatura non
  // hanno una commessa, e non devono fingerne una.
  const [newOrderId, setNewOrderId] = useState<string | null>(null);

  // Filtri, tutti in vista: commessa, fornitore, periodo. Prima stavano in
  // un menu a parte (con gli importi min/max, che nessuno usava) e la commessa
  // non c'era: per vedere cosa si è ordinato per un cantiere la si cercava a mano.
  const filterOrder = filtri.commessa ?? "all"; // all | _nessuna | id commessa
  const filterPeriodo = (["30", "90", "anno"].includes(params.get("periodo") ?? "") ? params.get("periodo") : "tutto") as "tutto" | "30" | "90" | "anno";
  const vista: "elenco" | "commessa" = params.get("raggruppa") === "commessa" ? "commessa" : "elenco";
  const [guidaChiusa, setGuidaChiusa] = useState(() => {
    try { return localStorage.getItem("oda-guida-chiusa") === "1"; } catch { return false; }
  });

  const activeFiltersCount =
    (filtri.commessa ? 1 : 0) + (filtri.fornitore ? 1 : 0) + (filtri.fase ? 1 : 0) + (filtri.soloRitardo ? 1 : 0)
    + (filtri.cerca ? 1 : 0) + (vistaPrincipale === "elenco" && filterPeriodo !== "tutto" ? 1 : 0);

  const clearFilters = () => {
    setParams((prima) => {
      const p = new URLSearchParams(prima);
      for (const k of ["commessa", "forn", "fase", "ritardo", "cerca", "periodo"]) p.delete(k);
      return p;
    }, { replace: true });
  };

  // Le scelte dei filtri vengono da ciò che c'è (ordini, richieste, materiali),
  // non da tutta l'anagrafica.
  const commesseInElenco = useMemo(() => {
    const m = new Map<string, { codice: string; cestino: boolean }>();
    for (const o of orders) {
      if (o.order_id && o.orders?.order_code) m.set(o.order_id, { codice: o.orders.order_code, cestino: !!o.orders.deleted_at });
    }
    for (const x of materiali) if (!m.has(x.order_id)) m.set(x.order_id, { codice: x.commessa, cestino: false });
    for (const r of rfqs) if (r.order_id && r.orders?.order_code && !m.has(r.order_id)) m.set(r.order_id, { codice: r.orders.order_code, cestino: false });
    return [...m.entries()].sort((a, b) => a[1].codice.localeCompare(b[1].codice, "it", { numeric: true }));
  }, [orders, materiali, rfqs]);
  const fornitoriInElenco = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) if (o.supplier_id) m.set(o.supplier_id, o.suppliers?.name ?? "Fornitore");
    for (const x of materiali) {
      if (x.supplier_id && !m.has(x.supplier_id)) m.set(x.supplier_id, suppliers.find((s) => s.id === x.supplier_id)?.name ?? "Fornitore");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [orders, materiali, suppliers]);
  // Le fasi: solo quelle con materiali validati, della commessa scelta se c'è.
  const fasiInElenco = useMemo(() => {
    const m = new Map<string, { etichetta: string; codice: string; posizione: number }>();
    for (const x of materiali) {
      if (!x.phase_id || (filtri.commessa && x.order_id !== filtri.commessa)) continue;
      m.set(x.phase_id, { etichetta: filtri.commessa ? x.fase : `${x.commessa} › ${x.fase}`, codice: x.commessa, posizione: x.posizioneFase });
    }
    return [...m.entries()].sort((a, b) => a[1].codice.localeCompare(b[1].codice, "it", { numeric: true }) || a[1].posizione - b[1].posizione);
  }, [materiali, filtri.commessa]);

  const oggi = new Date().toLocaleDateString("en-CA");
  const colonne = useMemo(
    () => costruisciPipeline({ materiali, rfqs, contatori, oda: orders, filtri, oggi }),
    [materiali, rfqs, contatori, orders, filtri, oggi],
  );

  const filtered = useMemo(() => {
    // Filtri comuni (commessa, fornitore, fase, ritardo, ricerca): stessa regola della pipeline.
    let list = filtraOda(orders, materiali, filtri, oggi);
    // "attivi" = mandati al fornitore e non ancora arrivati. Le bozze hanno
    // un tab loro: sono ordini che non esistono ancora per nessuno tranne noi.
    if (tab === "attivi") list = list.filter((o) => ["inviato", "confermato", "parziale"].includes(o.status));
    else if (tab === "bozze") list = list.filter((o) => o.status === "bozza");
    else if (tab === "ricevuti") list = list.filter((o) => o.status === "ricevuto");
    else if (tab === "annullati") list = list.filter((o) => o.status === "annullato");

    if (filterPeriodo !== "tutto") {
      const da = new Date();
      if (filterPeriodo === "anno") da.setMonth(0, 1);
      else da.setDate(da.getDate() - Number(filterPeriodo));
      const daIso = da.toLocaleDateString("en-CA");
      list = list.filter((o) => (o.issue_date ?? "").slice(0, 10) >= daIso);
    }

    return list;
  }, [orders, materiali, filtri, oggi, tab, filterPeriodo]);

  // Per commessa: quanto si è impegnato e quanto è arrivato per ogni cantiere.
  // Gli ordini senza commessa (scorte, attrezzatura) stanno in un gruppo loro.
  const perCommessa = useMemo(() => {
    const gruppi = new Map<string, { id: string | null; codice: string; descrizione: string | null; cestino: boolean; ordini: PurchaseOrder[] }>();
    for (const o of filtered) {
      const chiave = o.order_id ?? "__nessuna";
      const g = gruppi.get(chiave) ?? {
        id: o.order_id,
        codice: o.orders?.order_code ?? "Senza commessa",
        descrizione: o.order_id ? o.orders?.description ?? null : "Scorte di magazzino, attrezzatura, spese generali",
        cestino: !!o.orders?.deleted_at,
        ordini: [],
      };
      g.ordini.push(o);
      gruppi.set(chiave, g);
    }
    return [...gruppi.values()].map((g) => {
      const imp = g.ordini.filter(impegnato);
      return {
        ...g,
        impegnato: imp.reduce((t, o) => t + Number(o.total), 0),
        arrivato: imp.reduce((t, o) => t + valoreArrivato(o), 0),
        inRitardo: g.ordini.filter((o) => giorniDiRitardo(o) !== null).length,
        daMandare: g.ordini.filter((o) => o.status === "bozza").length,
      };
    }).sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.impegnato - a.impegnato));
  }, [filtered]);
  const [gruppiAperti, setGruppiAperti] = useState<Set<string>>(new Set());

  // Export handlers
  const buildExportRows = useCallback(() => {
    return filtered.map((o) => ({
      oda_number: o.oda_number,
      supplier: o.suppliers?.name ?? "",
      order_code: o.orders?.order_code ?? "",
      destination: o.warehouses?.name ?? (o.delivery_warehouse_id ? "Magazzino selezionato" : ""),
      issue_date: format(new Date(o.issue_date), "dd/MM/yyyy"),
      expected_delivery: o.expected_delivery_date ? format(new Date(o.expected_delivery_date), "dd/MM/yyyy") : "",
      status: STATUS_LABELS[o.status] ?? o.status,
      arrivato: (() => { const a = avanzamento(o); return a ? `${a.complete}/${a.righe} righe` : ""; })(),
      total: String(Number(o.total).toFixed(2)),
      verification: o.last_verification?.result ?? "",
    }));
  }, [filtered]);

  const exportColumns = useMemo(() => ([
    { key: "oda_number", label: "N° OdA" },
    { key: "supplier", label: "Fornitore" },
    { key: "order_code", label: "Commessa collegata" },
    { key: "destination", label: "Magazzino destinazione" },
    { key: "issue_date", label: "Data Emissione" },
    { key: "expected_delivery", label: "Consegna Prevista" },
    { key: "status", label: "Stato" },
    { key: "arrivato", label: "Arrivato" },
    { key: "total", label: "Totale €" },
    { key: "verification", label: "Verifica" },
  ]), []);

  const exportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun OdA da esportare", variant: "destructive" });
      return;
    }
    exportToCSV(rows, exportColumns, `oda-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `CSV esportato — ${rows.length} OdA` });
  }, [buildExportRows, exportColumns, toast]);

  const exportXLSX = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun OdA da esportare", variant: "destructive" });
      return;
    }
    await exportToXLSX(rows, exportColumns, `oda-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: `Excel esportato — ${rows.length} OdA` });
  }, [buildExportRows, exportColumns, toast]);

  const exportPDF = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun OdA da esportare", variant: "destructive" });
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text("Ordini d'Acquisto", 40, 40);
      doc.setFontSize(9);
      doc.text(`Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${rows.length} OdA`, 40, 56);

      const cols = [
        { key: "oda_number", label: "N° OdA", w: 70 },
        { key: "supplier", label: "Fornitore", w: 160 },
        { key: "order_code", label: "Ordine", w: 70 },
        { key: "issue_date", label: "Emissione", w: 70 },
        { key: "expected_delivery", label: "Consegna", w: 70 },
        { key: "status", label: "Stato", w: 80 },
        { key: "total", label: "Totale €", w: 80, align: "right" as const },
      ];
      let y = 80;
      let x = 40;
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(40, y - 12, cols.reduce((a, c) => a + c.w, 0), 18, "F");
      cols.forEach((c) => {
        doc.text(c.label, x + 4, y);
        x += c.w;
      });
      y += 14;
      doc.setFont("helvetica", "normal");

      rows.forEach((r, i) => {
        if (y > 540) { doc.addPage(); y = 40; }
        x = 40;
        if (i % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(40, y - 10, cols.reduce((a, c) => a + c.w, 0), 14, "F");
        }
        cols.forEach((c) => {
          const val = String(r[c.key as keyof typeof r] ?? "");
          const maxLen = Math.floor(c.w / 5);
          const trimmed = val.length > maxLen ? val.slice(0, maxLen - 1) + "…" : val;
          if (c.align === "right") {
            const num = Number(val);
            const formatted = !isNaN(num) && val !== "" ? `€ ${num.toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : trimmed;
            doc.text(formatted, x + c.w - 4, y, { align: "right" });
          } else {
            doc.text(trimmed, x + 4, y);
          }
          x += c.w;
        });
        y += 13;
      });

      doc.save(`oda-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: `PDF esportato — ${rows.length} OdA` });
    } catch (e) {
      toast({
        title: "Errore export PDF",
        description: e instanceof Error ? e.message : "Generazione PDF fallita",
        variant: "destructive",
      });
    }
  }, [buildExportRows, toast]);

  // I numeri sulle schede seguono i filtri comuni: «Da mandare 3» per la commessa scelta.
  const counts = useMemo(() => {
    const base = filtraOda(orders, materiali, filtri, oggi);
    const inCorso = base.filter((o) => ["inviato", "confermato", "parziale"].includes(o.status));
    return {
      tutti: base.length,
      bozze: base.filter((o) => o.status === "bozza").length,
      attivi: inCorso.length,
      ricevuti: base.filter((o) => o.status === "ricevuto").length,
      annullati: base.filter((o) => o.status === "annullato").length,
    };
  }, [orders, materiali, filtri, oggi]);

  /**
   * KPI rifatti il 2026-08-06. I precedenti raccontavano poco:
   *   "Collegati commesse" mostrava 41 su 41 — un numero che non varia mai
   *      non e' un indicatore, e' decorazione.
   *   "Valore totale" sommava anche bozze e annullati, cioe' impegni che non
   *      esistono: su questa azienda gonfiava il dato di 38.935 € di bozze.
   *   "Attivi" contava le bozze fra gli ordini attivi, ma una bozza non e'
   *      mai stata mandata a nessuno.
   *
   * E soprattutto mancava il dato che conta: 14 ordini su 41 hanno la
   * consegna prevista gia' passata e la merce non e' mai arrivata. 132.387 €
   * di roba promessa e non consegnata, invisibili in pagina.
   */
  const kpis = useMemo(() => {
    const oggi = new Date().toLocaleDateString("en-CA"); // confronto su data locale
    const inCorso = orders.filter((o) => ["inviato", "confermato", "parziale"].includes(o.status));
    const inRitardo = inCorso.filter(
      (o) => o.expected_delivery_date && o.expected_delivery_date < oggi,
    );
    const bozze = orders.filter((o) => o.status === "bozza");
    const somma = (list: typeof orders) => list.reduce((s, o) => s + Number(o.total), 0);

    return {
      lateCount: inRitardo.length,
      lateTotal: somma(inRitardo),
      draftCount: bozze.length,
      draftTotal: somma(bozze),
      inCorsoCount: inCorso.length,
      inCorsoTotal: somma(inCorso),
      // Impegnato = quello che ho promesso di pagare: esclude bozze
      // (non mandate) e annullati (non dovuti). Stessa regola del margine
      // di commessa, cosi' i due numeri non si contraddicono.
      committedTotal: somma(orders.filter((o) => !["bozza", "annullato"].includes(o.status))),
    };
  }, [orders]);

  const handleCreate = () => {
    if (!newSupplierId || !newOrigine) return;
    create.mutate(
      {
        supplier_id: newSupplierId,
        expected_delivery_date: newDelivery || undefined,
        delivery_warehouse_id: newWarehouseId,
        origine: newOrigine,
        supplier_reference: newRiferimento.trim() || null,
        order_id: newOrderId,
      },
      {
        onSuccess: (data: any) => {
          setNewOpen(false);
          setNewSupplierId("");
          setNewDelivery("");
          setNewWarehouseId(null);
          setNewOrigine(null);
          setNewRiferimento("");
          setNewOrderId(null);
          navigate(`/azienda/ordini-acquisto/${data.id}`);
        },
        onError: () => {
          sonnerToast.error("Errore nella creazione dell'ordine. Riprova.");
        },
      }
    );
  };

  const hubTabs: HubTab[] = [
    { key: "tutti", label: "Tutti", icon: <ShoppingCart className="h-4 w-4" />, count: counts.tutti },
    // «In ritardo» non è più una scheda: è il filtro comune «Solo in ritardo»,
    // che vale anche per la pipeline.
    { key: "bozze", label: "Da mandare", icon: <Send className="h-4 w-4" />, count: counts.bozze },
    { key: "attivi", label: "In arrivo", icon: <Truck className="h-4 w-4" />, count: counts.attivi },
    { key: "ricevuti", label: "Ricevuti", icon: <Package className="h-4 w-4" />, count: counts.ricevuti },
    { key: "annullati", label: "Annullati", icon: <X className="h-4 w-4" />, count: counts.annullati },
  ];

  const rigaOrdine = (o: PurchaseOrder) => (
                <tr
                  key={o.id}
                  className={`border-b hover:bg-muted/30 cursor-pointer ${o.status === "annullato" ? "opacity-50" : ""}`}
                  onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}
                >
                  <td className="p-3 font-mono text-xs font-medium">{o.oda_number}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[180px]">{o.suppliers?.name || "—"}</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs"><CommessaCella o={o} /></td>
                  <td className="p-3 text-muted-foreground">{format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <QuoteChip variant={STATUS_CHIP_VARIANT[o.status] || "default"}>
                        {STATUS_LABELS[o.status] || o.status}
                      </QuoteChip>
                      <VerificationBadge result={o.last_verification?.result} />
                    </div>
                  </td>
                  <td className="p-3"><Arrivato o={o} /></td>
                  <td className="p-3 text-right font-medium">{formatCurrency(Number(o.total))}</td>
                  <td className="p-3 text-sm">
                    {o.expected_delivery_date ? (
                      <>
                        <span className="text-muted-foreground">
                          {format(new Date(o.expected_delivery_date), "dd/MM/yyyy", { locale: it })}
                        </span>
                        {/* Il ritardo va detto, non lasciato calcolare a mente:
                            su questa azienda 14 ordini su 41 erano scaduti e
                            in pagina non si vedeva da nessuna parte. */}
                        {giorniDiRitardo(o) !== null && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {giorniDiRitardo(o)}gg
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
  );

  return (
    <div className="space-y-6 max-sm:space-y-3">
      <QuotePageHeader
        title="Acquisti"
        subtitle="Dai materiali validati all'arrivo in cantiere: offerte, ordini e consegne, commessa per commessa."
        icon={<ShoppingCart className="h-5 w-5" />}
        className="testata-pagina bg-gradient-to-br from-white via-white to-orange-50/40"
        titoloSoloDaComputer
        actions={
          <>
            {/* Telefono no: niente esportazioni. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={cn("max-sm:hidden", vistaPrincipale === "pipeline" && "hidden")}>
                  <Download className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Esporta</span>
                  <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[11px]">OdA filtrati ({filtered.length})</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportCSV}>
                  <FileText className="h-4 w-4 mr-2" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportXLSX}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF}>
                  <FileText className="h-4 w-4 mr-2" /> PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <QuotePrimaryButton onClick={() => setNewOpen(true)} size="sm" className="max-sm:flex-1 max-sm:justify-center">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuovo OdA</span>
              <span className="sm:hidden">Nuovo</span>
            </QuotePrimaryButton>
          </>
        }
      />

      {/* KPI — cliccabili: ognuno filtra la lista sotto, cosi' il numero
          porta direttamente agli ordini che lo compongono. */}
      {/* Telefono no: gli stessi numeri e gli stessi filtri sono nelle schede sotto
          («In ritardo 10», «Da mandare 8»…). */}
      {vistaPrincipale === "elenco" && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-sm:hidden">
        <OperationalKpiCard
          label="In ritardo"
          value={kpis.lateCount}
          icon={AlertTriangle}
          hint={kpis.lateCount > 0 ? euroCompatto(kpis.lateTotal) : "nessuno"}
          tone={kpis.lateCount > 0 ? "red" : "green"}
          onClick={() => imposta("ritardo", !filtri.soloRitardo)}
          active={filtri.soloRitardo}
        />
        <OperationalKpiCard
          label="Da mandare"
          value={kpis.draftCount}
          icon={Send}
          hint={kpis.draftCount > 0 ? euroCompatto(kpis.draftTotal) : "nessuna bozza"}
          tone="amber"
          onClick={() => setTab(tab === "bozze" ? "tutti" : "bozze")}
          active={tab === "bozze"}
        />
        <OperationalKpiCard
          label="In arrivo"
          value={kpis.inCorsoCount}
          icon={Truck}
          hint={euroCompatto(kpis.inCorsoTotal)}
          tone="blue"
          onClick={() => setTab(tab === "attivi" ? "tutti" : "attivi")}
          active={tab === "attivi"}
        />
        <OperationalKpiCard
          label="Impegnato"
          value={euroCompatto(kpis.committedTotal)}
          icon={Wallet}
          hint="senza bozze"
          tone="green"
        />
      </div>

      )}

      {/* "Come funziona" — si legge una volta, poi e' ingombro. Chiudibile,
          con memoria: chi lo ha gia' letto non se lo ritrova ogni giorno in
          testa alla pagina. */}
      {vistaPrincipale === "elenco" && !guidaChiusa && (
      <div className="relative hidden md:grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 pr-10 text-sm shadow-sm lg:grid-cols-3">
        <button
          type="button"
          aria-label="Nascondi la spiegazione"
          onClick={() => {
            setGuidaChiusa(true);
            try { localStorage.setItem("oda-guida-chiusa", "1"); } catch { /* private mode */ }
          }}
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex gap-3">
          <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            <p className="font-semibold">Lista acquisti magazzino</p>
            <p className="text-xs text-muted-foreground">Raccoglie fabbisogni da scorte e commesse: cosa serve comprare.</p>
            <Button asChild variant="link" className="mt-1 h-auto p-0 text-xs">
              <Link to="/azienda/magazzino">
                Apri lista acquisti <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex gap-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Ordine d'acquisto</p>
            <p className="text-xs text-muted-foreground">E' il documento al fornitore con importi, allegati, consegna e verifica DDT.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">Arrivo in inventario</p>
            <p className="text-xs text-muted-foreground">Quando l'OdA risulta ricevuto, la merce viene caricata nel magazzino indicato.</p>
          </div>
        </div>
      </div>
      )}

      {/* Vista e filtri comuni: valgono per la pipeline e per l'elenco, e stanno nell'URL. */}
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Vista">
            {([["pipeline", "Pipeline", Columns3], ["elenco", "Elenco", List]] as const).map(([v, label, Icona]) => (
              <button
                key={v}
                type="button"
                aria-pressed={vistaPrincipale === v}
                onClick={() => imposta("vista", v === "pipeline" ? null : v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
                  vistaPrincipale === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                )}
              >
                <Icona className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca ordine, richiesta, materiale…"
              aria-label="Cerca negli acquisti"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-slate-200 pl-8 text-xs shadow-none"
            />
          </div>
          <Select value={filterOrder} onValueChange={(v) => imposta("commessa", v === "all" ? null : v)}>
            <SelectTrigger aria-label="Commessa" className={cn("h-8 w-auto min-w-[140px] text-xs", filtri.commessa && "border-orange-300 bg-orange-50")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le commesse</SelectItem>
              <SelectItem value="_nessuna">Senza commessa</SelectItem>
              {commesseInElenco.map(([id, c]) => (
                <SelectItem key={id} value={id}>{c.codice}{c.cestino ? " (nel cestino)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtri.fornitore ?? "all"} onValueChange={(v) => imposta("forn", v === "all" ? null : v)}>
            <SelectTrigger aria-label="Fornitore" className={cn("h-8 w-auto min-w-[140px] text-xs", filtri.fornitore && "border-orange-300 bg-orange-50")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fornitori</SelectItem>
              <SelectItem value="_nessuno">Materiali senza fornitore</SelectItem>
              {fornitoriInElenco.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fasiInElenco.length > 0 && (
            <Select value={filtri.fase ?? "all"} onValueChange={(v) => imposta("fase", v === "all" ? null : v)}>
              <SelectTrigger aria-label="Fase" className={cn("h-8 w-auto min-w-[120px] text-xs", filtri.fase && "border-orange-300 bg-orange-50")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le fasi</SelectItem>
                {fasiInElenco.map(([id, f]) => (
                  <SelectItem key={id} value={id}>{f.etichetta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            type="button"
            aria-pressed={filtri.soloRitardo}
            onClick={() => imposta("ritardo", !filtri.soloRitardo)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
              filtri.soloRitardo ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Solo in ritardo
          </button>
          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" /> Azzera
            </Button>
          )}
        </div>

        {vistaPrincipale === "elenco" && (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-lg bg-slate-50 p-0.5">
              {hubTabs.map((item) => {
                const isActive = item.key === tab;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                      isActive
                        ? "bg-orange-50 text-slate-950 shadow-sm ring-1 ring-orange-100"
                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                    )}
                  >
                    <span className={isActive ? "text-orange-500" : "text-slate-400"}>{item.icon}</span>
                    {item.label}
                    {typeof item.count === "number" && (
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                        isActive ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-500"
                      )}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterPeriodo} onValueChange={(v) => imposta("periodo", v === "tutto" ? null : v)}>
                <SelectTrigger aria-label="Periodo" className={cn("h-8 w-auto min-w-[130px] text-xs", filterPeriodo !== "tutto" && "border-orange-300 bg-orange-50")}>
                  <CalendarIcon className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutto">Sempre</SelectItem>
                  <SelectItem value="30">Ultimi 30 giorni</SelectItem>
                  <SelectItem value="90">Ultimi 90 giorni</SelectItem>
                  <SelectItem value="anno">Quest'anno</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex rounded-lg bg-slate-100 p-0.5 max-sm:hidden" role="group" aria-label="Raggruppa">
                {([["elenco", "Elenco"], ["commessa", "Per commessa"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={vista === v}
                    onClick={() => imposta("raggruppa", v === "commessa" ? "commessa" : null)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      vista === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline o tabella */}
      {vistaPrincipale === "pipeline" ? (
        isError || materialiQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Acquisti non caricati del tutto.{" "}
              <button type="button" className="underline" onClick={() => materialiQuery.refetch()}>Riprova</button>
            </AlertDescription>
          </Alert>
        ) : (
          <PipelineAcquisti
            colonne={colonne}
            vedeCosti={perm.canViewCosts || perm.isAdmin}
            puoAgire={puoAgire}
            caricamento={isLoading || rfqInCaricamento || materialiQuery.isLoading}
          />
        )
      ) : isLoading ? (
        <>
          {/* Mobile card skeleton */}
          <div className="divide-y border rounded-lg sm:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
          {/* Desktop table skeleton */}
          <div className="hidden divide-y border rounded-lg sm:block">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        </>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Errore nel caricamento degli ordini. Riprova.</AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">
            {search ? "Nessun OdA trovato per la ricerca" : "Nessun ordine d'acquisto"}
          </p>
          <p className="text-sm text-muted-foreground">
            {search ? "Prova a cambiare i termini di ricerca." : "Crea il primo ordine d'acquisto per gestire i tuoi fornitori."}
          </p>
          {!search && (
            <Button onClick={() => setNewOpen(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> Crea il primo OdA
            </Button>
          )}
        </div>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="sm:hidden divide-y border rounded-lg">
          {filtered.map((o) => (
            <div
              key={o.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted cursor-pointer ${o.status === "annullato" ? "opacity-50" : ""}`}
              onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-medium">{o.oda_number}</span>
                  <QuoteChip variant={STATUS_CHIP_VARIANT[o.status] || "default"}>
                    {STATUS_LABELS[o.status] || o.status}
                  </QuoteChip>
                  <VerificationBadge result={o.last_verification?.result} />
                </div>
                <div className="text-sm font-medium mt-0.5 flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{o.suppliers?.name || "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}</span>
                  {o.expected_delivery_date && <span>· consegna {format(new Date(o.expected_delivery_date), "dd/MM/yyyy", { locale: it })}</span>}
                  {o.orders?.order_code && (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <Link2 className="h-3 w-3" /> Commessa {o.orders.order_code}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-0.5">
                    <Warehouse className="h-3 w-3" />
                    {o.warehouses?.name ?? (o.delivery_warehouse_id ? "Magazzino selezionato" : "Destinazione da decidere")}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-semibold text-sm">{formatCurrency(Number(o.total))}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">N° OdA</th>
              <th className="text-left p-3 font-medium">Fornitore</th>
              <th className="text-left p-3 font-medium">Commessa</th>
              {/* La colonna "Destinazione" e' stata tolta: su 41 ordini nessuno
                  aveva il magazzino impostato, quindi diceva "Da decidere" 41
                  volte su 41. Il dato resta nel dettaglio, dove si imposta. */}
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Stato</th>
              <th className="text-left p-3 font-medium">Arrivato</th>
              <th className="text-right p-3 font-medium">Totale</th>
              <th className="text-left p-3 font-medium">Consegna</th>
            </tr></thead>
            <tbody>
              {vista === "elenco" ? filtered.map(rigaOrdine) : perCommessa.map((g) => {
                const chiave = g.id ?? "__nessuna";
                const aperto = gruppiAperti.has(chiave) || filterOrder !== "all";
                return (
                  <Fragment key={chiave}>
                    <tr
                      className="cursor-pointer border-b bg-slate-50/80 hover:bg-slate-100"
                      onClick={() => setGruppiAperti((prima) => {
                        const dopo = new Set(prima);
                        if (dopo.has(chiave)) dopo.delete(chiave); else dopo.add(chiave);
                        return dopo;
                      })}
                    >
                      <td colSpan={5} className="p-3">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", !aperto && "-rotate-90")} />
                          {g.id ? (
                            <Link to={`/azienda/ordini/${g.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-slate-900 hover:underline">
                              {g.codice}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-700">{g.codice}</span>
                          )}
                          {g.cestino && (
                            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">commessa nel cestino</span>
                          )}
                          {g.descrizione && <span className="min-w-0 truncate text-xs text-muted-foreground">{g.descrizione}</span>}
                          <span className="ml-auto shrink-0 pl-3 text-xs text-slate-600">
                            {g.ordini.length} {g.ordini.length === 1 ? "ordine" : "ordini"}
                            {g.daMandare > 0 && <span className="ml-2 text-amber-700">{g.daMandare} da mandare</span>}
                            {g.inRitardo > 0 && <span className="ml-2 font-semibold text-destructive">{g.inRitardo} in ritardo</span>}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-slate-600" title="Valore degli ordini ricevuti sul totale impegnato">
                        {g.impegnato > 0 ? `${Math.round((g.arrivato / g.impegnato) * 100)}% arrivato` : "—"}
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums" title="Impegnato: ordini mandati, senza bozze e annullati">
                        {formatCurrency(g.impegnato)}
                      </td>
                      <td className="p-3" />
                    </tr>
                    {aperto && g.ordini.map(rigaOrdine)}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* New OdA Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuovo Ordine d'Acquisto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Prima domanda: come stai ordinando. Decide i passaggi che
                l'ordine dovra' fare — chi compra al banco ha gia' la merce e
                non deve passare per "inviato" e "confermato".
                Riquadri con icona invece di cinque paragrafi in colonna: la
                spiegazione lunga compare solo per quello scelto, cosi' la
                scelta si legge in un colpo d'occhio e il resto del form non
                finisce sotto la piega. */}
            <div className="space-y-2">
              <Label>Come lo ordini?</Label>
              <div className="grid grid-cols-2 gap-2">
                {ODA_ORIGINI.map((o) => {
                  const info = ODA_ORIGINE_INFO[o];
                  const Icona = info.icona;
                  const scelta = newOrigine === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setNewOrigine(o)}
                      aria-pressed={scelta}
                      className={cn(
                        "relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all",
                        // L'acquisto al banco e' l'unico che chiude tutto in un
                        // passaggio: sta su una riga sua, non spaiato in fondo.
                        o === "negozio" && "col-span-2",
                        scelta
                          ? "border-orange-400 bg-orange-50 ring-2 ring-orange-200 shadow-sm"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <Icona
                        className={cn("h-4 w-4 shrink-0", scelta ? "text-orange-600" : "text-slate-400")}
                      />
                      <span
                        className={cn(
                          "text-sm font-semibold leading-tight",
                          scelta ? "text-orange-900" : "text-slate-700",
                        )}
                      >
                        {info.titoloBreve}
                      </span>
                      {scelta && <Check className="h-3.5 w-3.5 ml-auto shrink-0 text-orange-600" />}
                    </button>
                  );
                })}
              </div>
              {newOrigine && (
                <p className="text-xs text-slate-500 leading-snug pt-0.5">
                  {ODA_ORIGINE_INFO[newOrigine].descrizione}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Per quale commessa?</Label>
              <CommessaCombobox value={newOrderId} onChange={setNewOrderId} />
              <p className="text-[11px] text-slate-500">
                Se e' per un cantiere, collegalo subito: il costo finira' sulla
                commessa giusta e vedrai quanto stai impegnando.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Fornitore</Label>
              <Select value={newSupplierId} onValueChange={setNewSupplierId}>
                <SelectTrigger><SelectValue placeholder="Seleziona fornitore" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter((s) => s.is_active).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Chi ha comprato online o al banco ha gia' un numero d'ordine o
                uno scontrino: chiederlo qui evita di doverlo cercare dopo. */}
            {newOrigine && ODA_ORIGINE_INFO[newOrigine].riferimentoLabel && (
              <div className="space-y-2">
                <Label>{ODA_ORIGINE_INFO[newOrigine].riferimentoLabel} (opzionale)</Label>
                <Input
                  value={newRiferimento}
                  onChange={(e) => setNewRiferimento(e.target.value)}
                  placeholder="Es. 2026-A-4471"
                />
              </div>
            )}
            {/* Al banco la merce e' gia' arrivata: chiedere quando la
                consegneranno non ha senso. */}
            {newOrigine !== "negozio" && (
              <div className="space-y-2">
                <Label>Data consegna prevista (opzionale)</Label>
                <Input type="date" value={newDelivery} onChange={(e) => setNewDelivery(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label>
                {newOrigine === "negozio" ? "Magazzino in cui scaricare" : "Magazzino di destinazione (opzionale)"}
              </Label>
              <WarehouseSelect
                value={newWarehouseId}
                onChange={setNewWarehouseId}
                nullable
                placeholder="Magazzino predefinito"
              />
            </div>
            {newOrigine && (
              <p className="text-xs text-slate-500">
                Prossimo passo: aggiungi gli articoli, poi «{ODA_ORIGINE_INFO[newOrigine].azione}».
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!newSupplierId || !newOrigine || create.isPending}>
              {create.isPending ? "Creazione..." : "Crea OdA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
