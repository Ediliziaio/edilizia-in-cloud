import { useState, useMemo } from "react";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BookOpen, Plus, Loader2, Search, Download, ArrowDownLeft, ArrowUpRight,
  TrendingUp, TrendingDown, Wallet, Bot, Trash2, FileText, ExternalLink, RefreshCw,
  ChevronLeft, ChevronRight, MoreHorizontal,
} from "lucide-react";
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";
import { PrimaNotaXBRL } from "@/components/contabilita/PrimaNotaXBRL";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { usePrimaNota } from "@/hooks/usePrimaNota";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { NavyStatCard } from "@/components/costi/KpiCard";

const CATEGORY_LABELS: Record<string, string> = {
  incasso: "Incasso",
  fornitore: "Fornitore",
  costo: "Costo",
  fiscale: "Fiscale",
  stipendi: "Stipendi",
  utenze: "Utenze",
  affitto: "Affitto",
  altro: "Altro",
};

function PrimaNotaInner() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const importMutation = useMutation({
    mutationFn: async (action: "from_banking" | "from_invoices" | "both") => {
      // 2026-05-27 (UX audit): precheck banca collegata per i path che la
      // usano. Prima il toast "Nessuna novità da importare" era ambiguo:
      // l'utente non sapeva se non c'era nulla o se mancava la connessione.
      if (action === "from_banking" || action === "both") {
        const { count } = await supabase
          .from("bank_connections")
          .select("id", { count: "exact", head: true })
          .eq("company_id", effectiveCompany?.id ?? "")
          .eq("status", "active");
        if (!count || count === 0) {
          throw new Error("NO_BANK_CONNECTION");
        }
      }
      const res = await supabase.functions.invoke("sync-prima-nota", {
        body: { company_id: effectiveCompany?.id, action },
      });
      if (res.error) throw res.error;
      return res.data as { total: number; imported_banking: number; imported_invoices: number };
    },
    onSuccess: (data) => {
      if (data.total === 0) {
        toast.info("Nessuna novità da importare");
      } else {
        const parts = [];
        if (data.imported_banking > 0) parts.push(`${data.imported_banking} da banca`);
        if (data.imported_invoices > 0) parts.push(`${data.imported_invoices} da fatture`);
        toast.success(`Importate ${data.total} registrazioni`, { description: parts.join(", ") });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
    },
    onError: (e: Error) => {
      if (e.message === "NO_BANK_CONNECTION") {
        toast.error("Nessuna banca collegata", {
          description: "Collega prima il conto in Tesoreria per importare i movimenti automaticamente.",
          action: {
            label: "Vai a Tesoreria",
            onClick: () => navigate("/azienda/tesoreria?tab=connessioni"),
          },
        });
      } else {
        toast.error("Errore importazione", { description: String(e) });
      }
    },
  });
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [direction, setDirection] = useState<"entrata" | "uscita" | "">("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [autoView, setAutoView] = useState<"tutte" | "auto" | "manuali">("tutte");

  const isAutoFilter = autoView === "auto" ? true : autoView === "manuali" ? false : null;

  // Mobile: direzione, tipo di registrazione e periodo in un pannello dal basso
  // (prima tre righe di controlli, con le date che uscivano dallo schermo).
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const meseCorrente = { da: format(startOfMonth(new Date()), "yyyy-MM-dd"), a: format(endOfMonth(new Date()), "yyyy-MM-dd") };
  const periodiRapidi = [
    { value: "mese", label: "Questo mese", ...meseCorrente },
    { value: "scorso", label: "Mese scorso", da: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), a: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd") },
    { value: "tre", label: "Ultimi 3 mesi", da: format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"), a: meseCorrente.a },
    { value: "anno", label: `Anno ${new Date().getFullYear()}`, da: `${new Date().getFullYear()}-01-01`, a: `${new Date().getFullYear()}-12-31` },
  ];
  const periodoScelto = periodiRapidi.find((p) => p.da === fromDate && p.a === toDate)?.value ?? "altro";
  const nFiltriMobile = [direction !== "", autoView !== "tutte", periodoScelto !== "mese"].filter(Boolean).length;

  const { entries, isLoading, totalCount, totalPages, saldo, isSaldoLoading, monthlyChart, create, remove, fetchAllForExport } = usePrimaNota({
    fromDate,
    toDate,
    direction: direction || undefined,
    search,
    isAuto: isAutoFilter,
  }, page, pageSize);
  const [isExporting, setIsExporting] = useState(false);

  // Running balance (from oldest to newest, then reverse for display)
  const entriesWithBalance = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
    let balance = 0;
    const withBal = sorted.map((e) => {
      balance += e.direction === "entrata" ? e.amount : -e.amount;
      return { ...e, runningBalance: balance };
    });
    return withBal.reverse();
  }, [entries]);

  // Grafico ultimi 6 mesi: alimentato dalla query dedicata `monthlyChart` (tutte
  // le registrazioni degli ultimi 6 mesi), NON dalla lista paginata/filtrata —
  // prima mostrava solo il mese corrente perché leggeva `entries`.
  const chartData = useMemo(() => {
    const now = new Date();
    const rows: { month: string; entrate: number; uscite: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, "yyyy-MM");
      const b = monthlyChart?.[key];
      rows.push({ month: format(d, "MMM yy", { locale: it }), entrate: b?.entrate ?? 0, uscite: b?.uscite ?? 0 });
    }
    return rows;
  }, [monthlyChart]);

  // Esporta TUTTE le righe filtrate (non solo la pagina visibile): prima il CSV
  // conteneva solo i 50 movimenti della pagina corrente → export incompleto.
  const exportCSV = async () => {
    setIsExporting(true);
    try {
      const all = await fetchAllForExport();
      if (all.length === 0) { toast.info("Nessun movimento da esportare"); return; }
      const header = "Data,Direzione,Categoria,Descrizione,Importo,Metodo,Riferimento,Note,Auto\n";
      const rows = all.map((e) =>
        [
          e.entry_date,
          e.direction,
          e.category,
          e.description,
          e.direction === "uscita" ? `-${e.amount}` : e.amount,
          e.payment_method || "",
          e.reference_number || "",
          e.notes || "",
          e.is_auto ? "Sì" : "No",
        ].map((v) => escapeCsvCell(v as string | number, ",")).join(",")
      ).join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prima-nota-${fromDate}-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Errore durante l'export");
    } finally {
      setIsExporting(false);
    }
  };

  // Nei KPI di testata i centesimi non servono e troncano: 0 decimali
  // come nel pannello navy delle Commesse.
  const eurTondo = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(v);
  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Header */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Prima Nota</h1>
              <p className="mt-0.5 text-sm text-slate-500">Registrazioni contabili, movimenti automatici e saldo operativo.</p>
            </div>
          </div>
        <div className="flex gap-2 flex-wrap">
          {/* Mobile: solo «Nuova»; CSV, XBRL e importa automatico al desktop,
              in un menu «⋯» accanto a «Nuova registrazione»: erano tre
              bottoni in fila prima dell'azione principale. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="max-sm:hidden" aria-label="Altre azioni" title="Altre azioni">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => importMutation.mutate("both")}
                disabled={importMutation.isPending}
                title="Importa automaticamente da movimenti bancari riconciliati e fatture pagate"
              >
                {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Importa da banca e fatture
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onSelect={() => { void exportCSV(); }} disabled={isExporting}>
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Esporta CSV
              </DropdownMenuItem>
              <PrimaNotaXBRL
                comeVoceMenu
            entries={entries.map(e => ({
              data: e.entry_date,
              descrizione: e.description,
              importo_dare: e.direction === 'uscita' ? Number(e.amount) : 0,
              importo_avere: e.direction === 'entrata' ? Number(e.amount) : 0,
              conto: e.category,
            }))}
            anno={new Date(fromDate).getFullYear()}
            fetchAll={async () => (await fetchAllForExport()).map(e => ({
              data: e.entry_date,
              descrizione: e.description,
              importo_dare: e.direction === 'uscita' ? Number(e.amount) : 0,
              importo_avere: e.direction === 'entrata' ? Number(e.amount) : 0,
              conto: e.category,
            }))}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setNewOpen(true)} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-8 max-sm:px-3 max-sm:text-xs">
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Nuova Registrazione</span>
            <span className="sm:hidden">Nuova</span>
          </Button>
        </div>
        </div>
      </div>

      {/* Testata navy di famiglia (stessa dei Costi e delle Commesse):
          i tre numeri della cassa in card di vetro, senza troncamenti. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm max-sm:hidden">
        {/* Senza il titoletto «Prima Nota — La cassa, giorno per giorno» e
            senza «periodo filtrato» sotto ogni numero: il periodo è nei
            filtri qui sotto. */}
        <div className="bg-[#173b67] p-4 text-white sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <NavyStatCard
              label="Entrate"
              value={isSaldoLoading ? "..." : eurTondo(saldo?.entrate || 0)}
              icon={TrendingUp}
              tone="text-emerald-200"
            />
            <NavyStatCard
              label="Uscite"
              value={isSaldoLoading ? "..." : eurTondo(saldo?.uscite || 0)}
              icon={TrendingDown}
              tone="text-rose-300"
            />
            <NavyStatCard
              label="Saldo netto"
              value={isSaldoLoading ? "..." : eurTondo(saldo?.saldo || 0)}
              icon={Wallet}
              tone={(saldo?.saldo || 0) >= 0 ? "text-emerald-200" : "text-rose-300"}
            />
          </div>
        </div>
      </div>

      {/* Chart andamento 6 mesi: vetrina → non su mobile (i 3 KPI Entrate/
          Uscite/Saldo sopra bastano). */}
      {!isMobile && chartData.some((d) => d.entrate > 0 || d.uscite > 0) && (
        // Un titolo solo (erano «ANDAMENTO 6 MESI» e «Entrate e uscite di
        // cassa») e il grafico direttamente nel riquadro, non in un secondo
        // riquadro bianco dentro il primo.
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-950">Entrate e uscite, ultimi 6 mesi</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Entrate</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-rose-500" /> Uscite</span>
            </div>
          </div>
          <div className="mt-3 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 2, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" tickFormatter={formatCurrencyCompact} />
                <Tooltip
                  cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                  }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name === "entrate" ? "Entrate" : "Uscite"]}
                  labelFormatter={(label) => `Mese: ${label}`}
                />
                <Bar dataKey="entrate" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} />
                <Bar dataKey="uscite" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Mobile: entrate e uscite del periodo, nome e cifra (al posto del
          riquadro blu con tre numeri, icone e spiegazioni). */}
      <KpiMobili
        className="sm:hidden"
        voci={[
          { label: "Entrate", valore: isSaldoLoading ? "…" : eurTondo(saldo?.entrate || 0), tono: "text-green-700" },
          { label: "Uscite", valore: isSaldoLoading ? "…" : eurTondo(saldo?.uscite || 0), tono: "text-destructive" },
        ]}
      />

      {/* Mobile: ricerca e bottone dei filtri. */}
      <CercaConFiltri
        className="sm:hidden"
        valore={search}
        onCambia={(v) => { setSearch(v); setPage(1); }}
        filtriAttivi={nFiltriMobile}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      {/* Filters */}
      {/* Una riga di filtri senza riquadro attorno; la ricerca non scende sotto
          i 220px (a 1024 si riduceva a «C…») e, se non c'è posto, gli altri
          filtri vanno a capo. */}
      <div className="sm:flex sm:flex-wrap sm:items-center sm:gap-3 max-sm:hidden">
        {/* Search — full width on mobile, flexible on desktop */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-10"
          />
        </div>
        {/* Second row on mobile: toggles + direction */}
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup
            type="single"
            value={autoView}
            onValueChange={(v) => { if (v) { setAutoView(v as typeof autoView); setPage(1); } }}
            className="border rounded-md"
          >
            <ToggleGroupItem value="tutte" className="text-xs h-9 px-3">Tutte</ToggleGroupItem>
            <ToggleGroupItem value="auto" className="text-xs h-9 px-3">
              <Bot className="h-3 w-3 mr-1" /> Auto
            </ToggleGroupItem>
            <ToggleGroupItem value="manuali" className="text-xs h-9 px-3">Manuali</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={direction || "all"}
            onValueChange={(v) => {
              setDirection(v === "all" ? "" : (v as "entrata" | "uscita"));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[110px]"><SelectValue placeholder="Direzione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="entrata">Entrate</SelectItem>
              <SelectItem value="uscita">Uscite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Date range */}
        <div className="flex items-center gap-2">
          <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
          <span className="text-muted-foreground text-sm shrink-0">→</span>
          <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entriesWithBalance.length === 0 ? (
        // Mobile: una riga di testo (c'è «Nuova» in testata).
        <div className="rounded-lg border max-sm:border-0">
          <div className="flex flex-col items-center justify-center py-12 text-center px-4 max-sm:py-4">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-3 max-sm:hidden" />
            <p className="font-medium text-muted-foreground max-sm:text-xs max-sm:font-normal">Nessun movimento trovato</p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-sm:hidden">Prova a modificare i filtri o aggiungi la prima registrazione</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Mobile: una riga da ~52px per movimento (descrizione; data,
              categoria e metodo; importo colorato). Via freccia e cestino. */}
          <div className="sm:hidden divide-y">
            {entriesWithBalance.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold leading-tight truncate">{e.description}</p>
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                    {format(new Date(e.entry_date), "dd/MM", { locale: it })}
                    {e.category && ` · ${CATEGORY_LABELS[e.category] || e.category}`}
                    {e.payment_method && ` · ${e.payment_method}`}
                  </p>
                </div>
                <p className={`shrink-0 text-[13px] font-semibold tabular-nums ${e.direction === "entrata" ? "text-green-700" : "text-destructive"}`}>
                  {e.direction === "uscita" ? "−" : "+"}{formatCurrency(e.amount)}
                </p>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Categoria</th>
                <th className="text-left p-3 font-medium">Descrizione</th>
                <th className="text-right p-3 font-medium">Importo</th>
                {/* Saldo progressivo da 1280: a 1024 la tabella usciva di 20px. */}
                <th className="text-right p-3 font-medium hidden xl:table-cell" title="Saldo progressivo di questa pagina (dal movimento più vecchio al più recente mostrati). Il saldo netto reale del periodo è nella card 'Saldo netto' in alto.">Progr. pag.</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Metodo</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {entriesWithBalance.map((e) => (
                <tr key={e.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {e.is_auto && <span title="Auto-generato"><Bot className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                      {format(new Date(e.entry_date), "dd/MM/yyyy", { locale: it })}
                    </div>
                  </td>
                  <td className="p-3 hidden sm:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {CATEGORY_LABELS[e.category] || e.category}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <p className="font-medium truncate max-w-[260px]">{e.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {e.reference_number && (
                        <span className="text-xs text-muted-foreground">Rif: {e.reference_number}</span>
                      )}
                      {e.suppliers?.name && (
                        <span className="text-xs text-muted-foreground">{e.suppliers.name}</span>
                      )}
                      {e.is_auto && e.auto_source && (
                        <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-600">
                          {e.auto_source === "fattura_emessa" ? "Fattura" :
                           e.auto_source === "incasso_fattura" ? "Incasso" :
                           e.auto_source === "nota_credito" ? "Nota Credito" : e.auto_source}
                        </Badge>
                      )}
                      {e.documenti_fiscali?.id && (
                        <button
                          onClick={() => navigate(`/azienda/documenti/${e.documenti_fiscali!.id}`)}
                          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          {e.documenti_fiscali.tipo === "nota_credito" ? "NC" : "Fatt."} #{e.documenti_fiscali.numero}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={`flex items-center justify-end gap-1 ${e.direction === "entrata" ? "text-green-700" : "text-destructive"}`}>
                      {e.direction === "entrata"
                        ? <ArrowDownLeft className="h-3.5 w-3.5" />
                        : <ArrowUpRight className="h-3.5 w-3.5" />
                      }
                      {e.direction === "uscita" ? "-" : "+"}{formatCurrency(e.amount)}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono hidden xl:table-cell">
                    <span className={e.runningBalance >= 0 ? "" : "text-destructive"}>
                      {formatCurrency(e.runningBalance)}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground capitalize hidden md:table-cell">
                    {e.payment_method || "—"}
                  </td>
                  <td className="p-3">
                    {!e.is_auto && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        aria-label="Elimina movimento di prima nota"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Eliminare il movimento?",
                              description: `Il movimento da ${formatCurrency(e.amount)} verrà rimosso definitivamente dalla prima nota. L'operazione non può essere annullata.`,
                              confirmLabel: "Elimina",
                              variant: "destructive",
                            })
                          ) {
                            remove.mutate(e.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>{/* end hidden sm:block */}
        </div>
      )}

      {/* Pagination — mobile: solo precedente/successiva. Il contenitore c'è
          solo quando la paginazione compare (niente margine vuoto sul desktop). */}
      {!isLoading && totalCount > 25 && (
        <div className="max-sm:hidden">
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
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between sm:hidden">
          <Button variant="outline" size="icon" className="tap-compact h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Pagina precedente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{page} di {totalPages}</span>
          <Button variant="outline" size="icon" className="tap-compact h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Pagina successiva">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile: direzione, registrazioni e periodo. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={nFiltriMobile}
        onAzzera={() => { setDirection(""); setAutoView("tutte"); setFromDate(meseCorrente.da); setToDate(meseCorrente.a); setPage(1); }}
        risultati={isLoading ? undefined : totalCount}
      >
        <PilloleFiltro
          titolo="Periodo"
          valore={periodoScelto}
          onScegli={(v) => {
            const p = periodiRapidi.find((x) => x.value === v);
            if (p) { setFromDate(p.da); setToDate(p.a); setPage(1); }
          }}
          scelte={periodiRapidi.map((p) => ({ value: p.value, label: p.label }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" aria-label="Dal" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 text-xs" />
          <Input type="date" aria-label="Al" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 text-xs" />
        </div>
        <PilloleFiltro
          titolo="Movimenti"
          valore={direction || "all"}
          onScegli={(v) => { setDirection(v === "all" ? "" : (v as "entrata" | "uscita")); setPage(1); }}
          scelte={[
            { value: "all", label: "Tutti" },
            { value: "entrata", label: "Entrate" },
            { value: "uscita", label: "Uscite" },
          ]}
        />
        <PilloleFiltro
          titolo="Registrazioni"
          valore={autoView}
          onScegli={(v) => { setAutoView(v); setPage(1); }}
          scelte={[
            { value: "tutte" as const, label: "Tutte" },
            { value: "auto" as const, label: "Automatiche" },
            { value: "manuali" as const, label: "Manuali" },
          ]}
        />
      </PannelloFiltri>

      {/* Dialog */}
      <NewEntryDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={(p) => create.mutate(p, { onSuccess: () => setNewOpen(false) })}
        isPending={create.isPending}
      />
    </div>
  );
}

export default function PrimaNota() {
  return (
    <ErrorBoundary title="Errore nella prima nota">
      <PrimaNotaInner />
    </ErrorBoundary>
  );
}
