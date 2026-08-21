import { useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, MoreVertical, FileText, CreditCard, Loader2, RefreshCw, Link2, Eye, BarChart3, Download, Cloud, FileCode, Inbox, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import BillingReports from "./BillingReports";

/**
 * Freschezza dell'ultima sincronizzazione: tempo relativo leggibile
 * ("12 min fa", "3 h fa", "2 gg fa") + flag `stale` se il dato ha più di 24h,
 * così l'utente capisce a colpo d'occhio se le fatture sono aggiornate.
 */
function syncFreshness(iso?: string | null): { label: string; stale: boolean } | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return null;
  const min = Math.floor(diffMs / 60_000);
  let label: string;
  if (min < 1) label = "adesso";
  else if (min < 60) label = `${min} min fa`;
  else if (min < 1440) label = `${Math.floor(min / 60)} h fa`;
  else label = `${Math.floor(min / 1440)} gg fa`;
  return { label, stale: diffMs > 24 * 3_600_000 };
}

/**
 * Stato "effettivo" per il badge: una fattura non pagata/annullata con scadenza
 * passata viene mostrata come Scaduta — coerente coi KPI e con la UX di Fatture
 * in Cloud — anche se il gestionale d'origine la riporta ancora come "Emessa".
 */
function effectiveStatus(inv: { status: string; due_date?: string | null; paid_amount?: number | null; total?: number | null }): string {
  if (["paid", "cancelled", "draft"].includes(inv.status)) return inv.status;
  const residuo = Number(inv.total ?? 0) - Number(inv.paid_amount ?? 0);
  if (inv.due_date && new Date(inv.due_date) < new Date() && residuo > 0.005) return "overdue";
  return inv.status;
}

/** Giorni di ritardo rispetto alla scadenza (positivo = scaduta), o null se non scaduta. */
function giorniScaduta(due?: string | null): number | null {
  if (!due) return null;
  const days = Math.floor((Date.now() - new Date(due).getTime()) / 86_400_000);
  return days > 0 ? days : null;
}

const MONTH_ABBR = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

type DocTab = "fatture" | "note_credito" | "proforma" | "cestino";

/** Filtro per il tab tipo-documento (stile Fatture in Cloud). Le annullate vivono nel Cestino. */
function matchDocTab(inv: { document_type?: string | null; status: string }, tab: DocTab): boolean {
  if (tab === "cestino") return inv.status === "cancelled";
  if (inv.status === "cancelled") return false;
  if (tab === "note_credito") return inv.document_type === "credit_note";
  if (tab === "proforma") return inv.document_type === "proforma";
  // "fatture": fattura/ricevuta (tutto ciò che non è NC/proforma/annullata)
  return inv.document_type !== "credit_note" && inv.document_type !== "proforma";
}

/** Iniziali del cliente per l'avatar (max 2 lettere). */
function clienteInitials(name?: string | null): string {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Importo + chiarezza incasso (UX Fatture in Cloud): mostra il totale e una
 * riga di stato pagamento — "Saldata" (verde), "Residuo €X" (ambra, acconto
 * parziale) — o "Nota di credito" (storno, in rosso col segno meno).
 */
function ImportoInfo({ inv }: { inv: { total?: number | null; paid_amount?: number | null; status: string; document_type?: string | null } }) {
  const total = Number(inv.total || 0);
  const paid = Number(inv.paid_amount || 0);
  const isCredit = inv.document_type === "credit_note";
  const fullyPaid = !isCredit && (inv.status === "paid" || (paid > 0 && total - paid <= 0.005));
  const partial = !isCredit && !fullyPaid && paid > 0.005;
  return (
    <>
      <div className={`font-medium ${isCredit ? "text-rose-600" : ""}`}>
        {isCredit ? "−" : ""}{formatCurrency(total)}
      </div>
      {isCredit ? (
        <div className="text-[10px] text-muted-foreground">Nota di credito</div>
      ) : fullyPaid ? (
        <div className="text-[10px] font-medium text-green-600">Saldata</div>
      ) : partial ? (
        <div className="text-[10px] font-medium text-amber-600">Residuo {formatCurrency(total - paid)}</div>
      ) : null}
    </>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  draft:     { label: "Bozza",       color: "bg-muted text-muted-foreground",       emoji: "📝" },
  issued:    { label: "Emessa",      color: "bg-blue-100 text-blue-800",            emoji: "📤" },
  sent:      { label: "Inviata SDI", color: "bg-orange-100 text-orange-800",        emoji: "📨" },
  delivered: { label: "Consegnata",  color: "bg-teal-100 text-teal-800",            emoji: "✅" },
  paid:      { label: "Pagata",      color: "bg-green-100 text-green-800",          emoji: "💰" },
  overdue:   { label: "Scaduta",     color: "bg-destructive/10 text-destructive",   emoji: "⏰" },
  cancelled: { label: "Annullata",   color: "bg-muted text-muted-foreground line-through", emoji: "❌" },
};

const PROVIDER_LABELS: Record<string, string> = {
  fattureincloud: "Fatture in Cloud",
  fattura24: "Fattura24",
  aruba: "Aruba",
  invoicetronic: "Invoicetronic",
};

export default function InvoicesList() {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const currentYear = String(new Date().getFullYear());
  const [yearFilter, setYearFilter] = useState(currentYear);
  // Striscia mesi stile Fatture in Cloud: "01".."12" | "prec" | "succ" | null (tutto l'anno).
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  // Tab tipo documento stile Fatture in Cloud.
  const [docTab, setDocTab] = useState<DocTab>("fatture");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        // ⚠️ Selezionare SOLO colonne esistenti: PostgREST ritorna 400 sull'INTERA query
        // se anche una sola colonna non esiste (NON undefined) → la lista resta vuota.
        // Nomi reali verificati a schema: tax_amount (non vat_amount), document_type (non
        // invoice_type), external_provider (non provider), external_xml_url (non xml_url).
        // currency/customer_id NON esistono → rimosse.
        .select("id, company_id, invoice_number, document_type, status, issue_date, due_date, total, subtotal, tax_amount, order_id, notes, external_id, pdf_url, external_xml_url, created_at, updated_at, client_company_name, paid_amount, external_provider, external_status")
        .eq("company_id", companyId!)
        // Le fatture cestinate (soft delete) restavano in lista E nei KPI:
        // il totale "da incassare" contava documenti annullati, e cliccandoli
        // il dettaglio — che invece filtra deleted_at — diceva "non trovata".
        .is("deleted_at", null)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    // Con cache PWA persistente i dati vecchi venivano serviti senza refetch:
    // forziamo il refetch a ogni apertura pagina così le fatture importate dal
    // gestionale (o dal cron) compaiono subito.
    refetchOnMount: "always",
  });

  // Check if provider is connected
  const { data: integration } = useQuery({
    queryKey: ["billing_integration", companyId],
    queryFn: async () => {
      // select chirurgico — la UI usa last_sync_at + provider (badge intestazione e
      // invoke billing-import: senza, provider arrivava undefined alla function)
      const { data, error } = await supabase
        .from("billing_integrations")
        .select("id, last_sync_at, provider")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      // L'errore non va ingoiato: se la lettura fallisce la pagina mostrava
      // "Connetti il tuo gestionale" a chi ce l'ha già collegato, con
      // Sincronizza disabilitato e nessuna spiegazione.
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    refetchOnMount: "always",
  });

  const markPaidMutation = useMutation({
    mutationFn: async (inv: { id: string; total: number; externalProvider?: string | null }) => {
      // Salda il RESIDUO (totale − già incassato): evita di sovra-pagare il
      // ledger se esistono acconti. paid_amount e status='paid' sono ricalcolati
      // dai trigger su invoice_payments → NON aggiornarli a mano (doppia scrittura).
      const { data: cur } = await supabase
        .from("invoices").select("paid_amount").eq("id", inv.id).maybeSingle();
      const residuo = Math.round((inv.total - Number(cur?.paid_amount ?? 0)) * 100) / 100;
      if (residuo <= 0) return { writeback: "skipped" as const }; // già saldata
      const { error } = await supabase.from("invoice_payments").insert({
        invoice_id: inv.id,
        company_id: companyId!,
        amount: residuo,
        payment_date: new Date().toLocaleDateString("en-CA"),
        payment_method: "bank_transfer",
      });
      if (error) throw error;

      // Write-back: se la fattura arriva da un gestionale, registra il pagamento
      // anche lì (best-effort: l'incasso in app resta salvato comunque).
      let writeback: "ok" | "scope" | "error" | "skipped" = "skipped";
      if (inv.externalProvider === "fattureincloud") {
        try {
          const { data: pr, error: pErr } = await supabase.functions.invoke("billing-payment-push", {
            body: { invoice_id: inv.id },
          });
          writeback = pErr ? "error" : pr?.error === "scope" ? "scope" : pr?.ok ? "ok" : "skipped";
        } catch { writeback = "error"; }
      }
      return { writeback };
    },
    onSuccess: (res) => {
      if (res?.writeback === "ok") {
        toast.success("Pagata — sincronizzata su Fatture in Cloud");
      } else if (res?.writeback === "scope") {
        toast.warning("Pagata in EdiliziaInCloud", {
          description: "Non aggiornata su Fatture in Cloud: manca il permesso di scrittura. Riconnetti FIC autorizzando la scrittura.",
        });
      } else if (res?.writeback === "error") {
        toast.warning("Pagata in app", {
          description: "Aggiornamento su Fatture in Cloud non riuscito, riprova più tardi.",
        });
      } else {
        toast.success("Fattura segnata come pagata");
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const [syncing, setSyncing] = useState(false);
  const syncInvoices = async () => {
    if (!integration) {
      toast.error("Nessun provider connesso", { description: "Vai nelle impostazioni per connettere il tuo gestionale." });
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-import", {
        body: { provider: integration.provider, company_id: companyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const rec = data?.received;
      const recTxt = rec && (rec.imported || rec.updated) ? ` · ${(rec.imported || 0) + (rec.updated || 0)} ricevute` : "";
      toast.success("Sincronizzazione completata", {
        description: `${data?.imported || 0} importate, ${data?.updated || 0} aggiornate${data?.failed ? `, ${data.failed} fallite` : ""}${recTxt}`,
      });
      // Aggiorna SIA la lista fatture SIA l'integrazione (ultimo sync). Senza il
      // secondo invalidate l'header restava su un orario di sync vecchio e, con la
      // cache PWA persistente, la pagina sembrava "non sincronizzata". refetchType
      // 'all' forza il refetch anche se i dati sono ancora nello staleTime.
      await queryClient.invalidateQueries({ queryKey: ["invoices"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["billing_integration"], refetchType: "all" });
    } catch (e) {
      toast.error("Errore sincronizzazione", { description: String(e) });
    } finally {
      setSyncing(false);
    }
  };

  // Anni disponibili (dalle date fattura) per il filtro, decrescenti.
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const i of invoices) if (i.issue_date) set.add(i.issue_date.slice(0, 4));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  // Anno di riferimento per la striscia mesi: l'anno selezionato, o il più recente con dati.
  const stripYear = yearFilter !== "all" ? yearFilter : (years[0] ?? String(new Date().getFullYear()));

  // Striscia mesi stile Fatture in Cloud: per ogni mese dell'ANNO selezionato n° documenti
  // e totale €. Niente "Preced./Success." (si naviga gli anni col selettore in alto).
  const monthStrip = useMemo(() => {
    const cells: Record<string, { count: number; total: number }> = {};
    for (let m = 1; m <= 12; m++) cells[String(m).padStart(2, "0")] = { count: 0, total: 0 };
    for (const i of invoices) {
      if (!i.issue_date || !matchDocTab(i, docTab)) continue;
      if (i.issue_date.slice(0, 4) !== stripYear) continue; // solo l'anno selezionato
      const cell = cells[i.issue_date.slice(5, 7)];
      if (cell) { cell.count++; cell.total += Number(i.total || 0); }
    }
    return cells;
  }, [invoices, stripYear, docTab]);

  // Totale dell'anno per l'intestazione della panoramica.
  const stripTotal = useMemo(
    () => Object.values(monthStrip).reduce((a, c) => ({ count: a.count + c.count, total: a.total + c.total }), { count: 0, total: 0 }),
    [monthStrip]
  );

  // Conteggi per i tab tipo-documento (sempre sull'intero set, indipendenti dai filtri).
  const docCounts = useMemo(() => {
    const c = { fatture: 0, note_credito: 0, proforma: 0, cestino: 0 };
    const base = yearFilter === "all" ? invoices : invoices.filter((i) => i.issue_date?.startsWith(yearFilter));
    for (const i of base) {
      if (i.status === "cancelled") c.cestino++;
      else if (i.document_type === "credit_note") c.note_credito++;
      else if (i.document_type === "proforma") c.proforma++;
      else c.fatture++;
    }
    return c;
  }, [invoices, yearFilter]);

  const filtered = useMemo(() => {
    let list = invoices.filter((i) => matchDocTab(i, docTab));
    // Filtro per anno (selettore in alto) + eventuale mese cliccato nella panoramica.
    if (yearFilter !== "all") list = list.filter((i) => i.issue_date?.startsWith(yearFilter));
    if (monthFilter) list = list.filter((i) => i.issue_date?.startsWith(`${stripYear}-${monthFilter}`));
    // FIX: il filtro usava lo status GREZZO, ma "overdue" è uno stato calcolato
    // (una fattura scaduta ha status 'issued'/'sent' + scadenza passata) → la tab
    // "Scadute" non filtrava nulla. Ora usa lo stato effettivo + pseudo-filtri
    // "unpaid" (da incassare) e "paid" che cattura anche i saldi per acconto.
    if (statusFilter !== "all") {
      list = list.filter((i) => {
        const residuo = Number(i.total ?? 0) - Number(i.paid_amount ?? 0);
        if (statusFilter === "unpaid") {
          return !["paid", "cancelled"].includes(i.status) && residuo > 0.005;
        }
        if (statusFilter === "overdue") return effectiveStatus(i) === "overdue";
        if (statusFilter === "paid") {
          return i.status === "paid" || (Number(i.paid_amount ?? 0) > 0.005 && residuo <= 0.005);
        }
        return i.status === statusFilter;
      });
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((i) =>
        (i.invoice_number || "").toLowerCase().includes(s) ||
        (i.client_company_name || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [invoices, docTab, yearFilter, monthFilter, stripYear, statusFilter, search]);

  // Raggruppamento per MESE (decrescente), con totale e conteggio per mese.
  // Le fatture sono già ordinate per data desc dalla query.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const inv of filtered) {
      const key = inv.issue_date ? inv.issue_date.slice(0, 7) : "0000-00"; // YYYY-MM
      const arr = map.get(key);
      if (arr) arr.push(inv); else map.set(key, [inv]);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => {
        const label = key === "0000-00"
          ? "Senza data"
          : format(new Date(`${key}-01T00:00:00`), "MMMM yyyy", { locale: it });
        const total = rows.reduce((s, i) => s + Number(i.total || 0), 0);
        return { key, label: label.charAt(0).toUpperCase() + label.slice(1), rows, total };
      });
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // Le note di credito sono storni, NON crediti da incassare: escluse dai KPI €.
    // KPI riferiti all'ANNO selezionato (non al cumulato di tutti gli anni / "Preced.").
    const base = yearFilter === "all" ? invoices : invoices.filter((i) => i.issue_date?.startsWith(yearFilter));
    const billable = base.filter((i) => i.document_type !== "credit_note");
    const receivable = billable
      .filter((i) => ["issued", "sent", "delivered", "overdue"].includes(i.status))
      .reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);
    const overdue = billable.filter((i) => {
      if (["paid", "cancelled"].includes(i.status)) return false;
      return i.due_date && new Date(i.due_date) < now;
    });
    const overdueAmount = overdue.reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);
    const issuedThisMonth = base.filter(
      (i) => i.issue_date?.startsWith(thisMonth) && i.document_type === "invoice" && i.status !== "cancelled"
    ).length;
    return { receivable, overdueCount: overdue.length, overdueAmount, issuedThisMonth, total: base.length };
  }, [invoices, yearFilter]);

  // RECUPERO CREDITI — cosa mancava: la pagina diceva "36 scadute 38k" ma non
  // QUANTO è vecchio il credito né CHI deve pagarti. Qui: bucket di aging
  // (0-30 / 31-60 / 60+ giorni) sul residuo scaduto + top debitori cliccabili
  // (click → cerca quel cliente nella lista). Rispetta il filtro anno corrente.
  const recupero = useMemo(() => {
    const now = Date.now();
    const base = (yearFilter === "all" ? invoices : invoices.filter((i) => i.issue_date?.startsWith(yearFilter)))
      .filter((i) => i.document_type !== "credit_note" && !["paid", "cancelled", "draft"].includes(i.status));
    const buckets = { b30: 0, b60: 0, b60p: 0 };
    const perCliente = new Map<string, { residuo: number; maxDays: number; n: number }>();
    for (const i of base) {
      if (!i.due_date) continue;
      const residuo = Number(i.total || 0) - Number(i.paid_amount || 0);
      if (residuo <= 0.005) continue;
      const days = Math.floor((now - new Date(i.due_date).getTime()) / 86_400_000);
      if (days <= 0) continue; // solo scadute
      if (days <= 30) buckets.b30 += residuo;
      else if (days <= 60) buckets.b60 += residuo;
      else buckets.b60p += residuo;
      const key = i.client_company_name || "—";
      const cur = perCliente.get(key) ?? { residuo: 0, maxDays: 0, n: 0 };
      cur.residuo += residuo;
      cur.maxDays = Math.max(cur.maxDays, days);
      cur.n += 1;
      perCliente.set(key, cur);
    }
    const totale = buckets.b30 + buckets.b60 + buckets.b60p;
    const topDebitori = Array.from(perCliente.entries())
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.residuo - a.residuo)
      .slice(0, 5);
    return { buckets, totale, topDebitori };
  }, [invoices, yearFilter]);

  const fmtEur = (n: number) => formatCurrency(n);

  return (
    <div className="space-y-6">
      {/* No provider banner */}
      {!isLoading && !integration && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="font-medium">Connetti il tuo gestionale di fatturazione</p>
                <p className="text-sm text-muted-foreground">Collega Fatture in Cloud, Fattura24, Aruba o Invoicetronic per importare automaticamente le fatture.</p>
              </div>
            </div>
            <Button variant="outline" className="shrink-0" onClick={() => navigate("/azienda/impostazioni/fatturazione")}>
              Configura
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header — in colonna su mobile: con provider connesso la riga superava i 375px */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Fatturazione</h1>
          {integration && (
            <Badge variant="outline" className="ml-2 text-xs">
              {PROVIDER_LABELS[integration.provider] || integration.provider}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={yearFilter}
            onChange={(e) => { setYearFilter(e.target.value); setMonthFilter(null); }}
            aria-label="Anno"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">Tutti gli anni</option>
            {Array.from(new Set([currentYear, ...years])).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {integration?.last_sync_at && (() => {
            const f = syncFreshness(integration.last_sync_at);
            if (!f) return null;
            return (
              <span
                className={`inline-flex items-center gap-1 text-xs ${f.stale ? "text-amber-600 font-medium" : "text-muted-foreground"}`}
                title={`Ultima sincronizzazione: ${format(new Date(integration.last_sync_at!), "dd/MM/yyyy HH:mm", { locale: it })}`}
              >
                {f.stale && <AlertTriangle className="h-3 w-3 shrink-0" />}
                Sync {f.label}
              </span>
            );
          })()}
          <Button onClick={syncInvoices} disabled={syncing || !integration}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizza
          </Button>
        </div>
      </div>

      {/* Top-level view tabs */}
      <Tabs defaultValue="fatture" className="w-full">
        <TabsList>
          <TabsTrigger value="fatture" className="gap-1.5">
            <FileText className="h-4 w-4" /> Fatture
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fatture" className="space-y-6 mt-4">
          {/* KPI Cards — "Da incassare" e "Fatture scadute" sono azionabili:
              cliccandole filtrano la lista (pattern GHL, il numero diventa un
              punto d'ingresso invece di una decorazione). Toggle: ri-cliccare
              torna a "Tutte". */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => setStatusFilter((f) => (f === "unpaid" ? "all" : "unpaid"))}
              className="text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-pressed={statusFilter === "unpaid"}
            >
              <Card className={`h-full transition-colors hover:border-primary/50 ${statusFilter === "unpaid" ? "border-primary ring-1 ring-primary/30" : ""}`}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Da incassare</p>
                  <p className="text-xl font-bold">{fmtEur(kpis.receivable)}</p>
                </CardContent>
              </Card>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter((f) => (f === "overdue" ? "all" : "overdue"))}
              className="text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-pressed={statusFilter === "overdue"}
            >
              <Card className={`h-full transition-colors ${kpis.overdueCount > 0 ? "border-destructive" : ""} ${statusFilter === "overdue" ? "ring-1 ring-destructive/40" : "hover:border-destructive/50"}`}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Fatture scadute</p>
                  <p className="text-xl font-bold text-destructive">{kpis.overdueCount} ({fmtEur(kpis.overdueAmount)})</p>
                </CardContent>
              </Card>
            </button>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Emesse questo mese</p>
                <p className="text-xl font-bold">{kpis.issuedThisMonth}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Totale fatture {yearFilter !== "all" ? yearFilter : ""}</p>
                <p className="text-xl font-bold">{kpis.total}</p>
              </CardContent>
            </Card>
          </div>

          {/* RECUPERO CREDITI — appare solo se c'è credito scaduto. Traduce il
              numero rosso "36 scadute" in azione: quanto è vecchio il credito
              (aging) e chi ti deve di più (top debitori cliccabili). */}
          {recupero.totale > 0.005 && (
            <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Recupero crediti · {fmtEur(recupero.totale)} scaduti
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("overdue")}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Vedi tutte →
                  </button>
                </div>
                {/* Aging: barra proporzionale 0-30 / 31-60 / 60+ giorni */}
                <div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                    {[
                      { v: recupero.buckets.b30, c: "bg-amber-400" },
                      { v: recupero.buckets.b60, c: "bg-orange-500" },
                      { v: recupero.buckets.b60p, c: "bg-rose-600" },
                    ].map((s, idx) => s.v > 0 && (
                      <div key={idx} className={s.c} style={{ width: `${(s.v / recupero.totale) * 100}%` }} />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />0-30 gg <span className="font-semibold tabular-nums">{fmtEur(recupero.buckets.b30)}</span></span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />31-60 gg <span className="font-semibold tabular-nums">{fmtEur(recupero.buckets.b60)}</span></span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-600" />oltre 60 gg <span className="font-semibold tabular-nums">{fmtEur(recupero.buckets.b60p)}</span></span>
                  </div>
                </div>
                {/* Top debitori — click filtra la lista su quel cliente */}
                {recupero.topDebitori.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <p className="text-xs font-medium text-muted-foreground">Chi ti deve di più</p>
                    {recupero.topDebitori.map((d) => (
                      <button
                        key={d.nome}
                        type="button"
                        onClick={() => { setSearch(d.nome); setStatusFilter("overdue"); }}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
                        title={`Filtra le fatture di ${d.nome}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200/70 text-[10px] font-semibold text-amber-800">
                            {clienteInitials(d.nome)}
                          </span>
                          <span className="truncate">{d.nome}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-rose-600 font-medium">{d.maxDays} gg</span>
                          <span className="font-semibold tabular-nums">{fmtEur(d.residuo)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab tipo documento (stile Fatture in Cloud) */}
          <div className="flex flex-wrap items-center gap-1 border-b">
            {([
              { key: "fatture" as DocTab, label: "Fatture", n: docCounts.fatture },
              { key: "note_credito" as DocTab, label: "Note di Credito", n: docCounts.note_credito },
              { key: "proforma" as DocTab, label: "Pro forma", n: docCounts.proforma },
              { key: "cestino" as DocTab, label: "Cestino", n: docCounts.cestino },
            ]).map(({ key, label, n }) => {
              const active = docTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setDocTab(key); setMonthFilter(null); }}
                  className={
                    "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
                    (active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")
                  }
                >
                  {label}
                  <span className={"ml-1.5 text-xs " + (active ? "text-primary" : "text-muted-foreground/70")}>{n}</span>
                </button>
              );
            })}
          </div>

          {/* Striscia mesi (stile Fatture in Cloud): n° doc + € per mese dell'anno, cliccabile per filtrare */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                Panoramica {stripYear} · <span className="text-foreground font-semibold">{stripTotal.count}</span> doc · <span className="text-foreground font-semibold tabular-nums">{formatCurrency(stripTotal.total)}</span>
              </span>
              {monthFilter && (
                <button type="button" onClick={() => setMonthFilter(null)} className="text-xs text-primary hover:underline">
                  Mostra tutto l'anno
                </button>
              )}
            </div>
            <div className="rounded-lg border bg-card overflow-x-auto">
              <div className="flex min-w-max divide-x">
                {(MONTH_ABBR.map((m, idx) => ({ key: String(idx + 1).padStart(2, "0"), label: m }))).map(({ key, label }) => {
                  const cell = monthStrip[key] || { count: 0, total: 0 };
                  const active = monthFilter === key;
                  const empty = cell.count === 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={empty}
                      onClick={() => {
                        setYearFilter(stripYear);
                        setMonthFilter((prev) => (prev === key ? null : key));
                      }}
                      className={
                        "flex-1 min-w-[62px] px-2 py-2 text-center transition-colors border-b-2 " +
                        (active
                          ? "bg-primary/5 border-b-primary"
                          : empty
                            ? "border-b-transparent cursor-default"
                            : "border-b-transparent hover:bg-muted/50")
                      }
                    >
                      <div className={"text-[11px] font-medium " + (active ? "text-primary" : empty ? "text-muted-foreground/40" : "")}>{label}</div>
                      <div className={"text-[10px] " + (empty ? "text-muted-foreground/30" : "text-muted-foreground")}>{cell.count} doc</div>
                      <div className={"text-[11px] font-semibold tabular-nums " + (empty ? "text-muted-foreground/30" : active ? "text-primary" : "")}>
                        {cell.total ? formatCurrency(cell.total) : "0 €"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">Tutte</TabsTrigger>
                <TabsTrigger value="draft">Bozze</TabsTrigger>
                <TabsTrigger value="issued">Emesse</TabsTrigger>
                <TabsTrigger value="sent">Inviate</TabsTrigger>
                <TabsTrigger value="paid">Pagate</TabsTrigger>
                <TabsTrigger value="overdue">Scadute</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca cliente o numero..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            /* Skeleton che conserva il layout della tabella (niente più spinner
               solitario che fa "saltare" la pagina al caricamento). */
            <div className="rounded-lg border divide-y">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            /* Empty state ricco: icona + testo guida + CTA contestuale
               (Sincronizza se connesso, Connetti se manca il provider,
               Azzera filtri se sono i filtri a nascondere tutto). */
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                {invoices.length === 0 ? <Inbox className="h-7 w-7 text-muted-foreground" /> : <Search className="h-7 w-7 text-muted-foreground" />}
              </div>
              {invoices.length === 0 ? (
                integration ? (
                  <>
                    <div>
                      <p className="font-medium">Nessuna fattura importata</p>
                      <p className="text-sm text-muted-foreground">Sincronizza per importare le fatture da {PROVIDER_LABELS[integration.provider] || "il tuo gestionale"}.</p>
                    </div>
                    <Button onClick={syncInvoices} disabled={syncing}>
                      {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Sincronizza ora
                    </Button>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">Nessuna fattura</p>
                      <p className="text-sm text-muted-foreground">Connetti un gestionale (Fatture in Cloud, Aruba…) per importare le fatture.</p>
                    </div>
                    <Button variant="outline" onClick={() => navigate("/azienda/impostazioni/fatturazione")}>
                      <Link2 className="h-4 w-4 mr-2" /> Connetti un gestionale
                    </Button>
                  </>
                )
              ) : (
                <>
                  <div>
                    <p className="font-medium">Nessun risultato</p>
                    <p className="text-sm text-muted-foreground">Nessuna fattura corrisponde ai filtri selezionati.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setStatusFilter("all"); setSearch(""); setMonthFilter(null); }}>
                    Azzera filtri
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
            {/* Mobile card list — raggruppata per mese */}
            <div className="sm:hidden space-y-4">
              {grouped.map((g) => (
                <div key={g.key} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/60 border-b">
                    <span className="text-sm font-semibold">{g.label}</span>
                    <span className="text-xs text-muted-foreground">{g.rows.length} fatt. · {formatCurrency(g.total)}</span>
                  </div>
                  <div className="divide-y">
                    {g.rows.map((inv) => {
                      const cfg = STATUS_CONFIG[effectiveStatus(inv)] || STATUS_CONFIG.draft;
                      return (
                        <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted cursor-pointer" onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs">{inv.invoice_number || "—"}</span>
                              <Badge variant="secondary" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                              {inv.external_provider && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                  <Cloud className="h-2.5 w-2.5" />{PROVIDER_LABELS[inv.external_provider] || inv.external_provider}
                                </span>
                              )}
                            </div>
                            <p className="font-medium text-sm mt-0.5 truncate">{inv.client_company_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {inv.issue_date ? format(new Date(inv.issue_date), "dd/MM/yy", { locale: it }) : "—"}
                              {(() => {
                                const gg = !["paid", "cancelled"].includes(inv.status) ? giorniScaduta(inv.due_date) : null;
                                if (gg) return <span className="font-medium text-rose-600"> · scaduta da {gg} gg</span>;
                                return inv.due_date ? ` · scad. ${format(new Date(inv.due_date), "dd/MM/yy", { locale: it })}` : "";
                              })()}
                            </p>
                          </div>
                          <div className="text-right shrink-0 text-sm">
                            <ImportoInfo inv={inv} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table — intestazioni di mese con subtotale */}
            <div className="hidden sm:block rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Numero</th>
                    <th className="text-left p-3 font-medium">Cliente</th>
                    <th className="text-left p-3 font-medium">Data</th>
                    <th className="text-left p-3 font-medium">Scadenza</th>
                    <th className="text-right p-3 font-medium">Importo</th>
                    <th className="text-left p-3 font-medium">Stato</th>
                    <th className="text-left p-3 font-medium">Origine</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="bg-muted/40 border-b">
                        <td colSpan={4} className="px-3 py-2 font-semibold text-sm">{g.label}</td>
                        <td className="px-3 py-2 text-right font-semibold text-sm">{fmtEur(g.total)}</td>
                        <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">{g.rows.length} fatture</td>
                      </tr>
                      {g.rows.map((inv) => {
                        const cfg = STATUS_CONFIG[effectiveStatus(inv)] || STATUS_CONFIG.draft;
                        return (
                          <tr key={inv.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}>
                            <td className="p-3 font-mono text-xs">{inv.invoice_number || "—"}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                  {clienteInitials(inv.client_company_name)}
                                </span>
                                <span className="font-medium">{inv.client_company_name || "—"}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{inv.issue_date ? format(new Date(inv.issue_date), "dd/MM/yy", { locale: it }) : "—"}</td>
                            <td className="p-3">
                              {(() => {
                                const gg = !["paid", "cancelled"].includes(inv.status) ? giorniScaduta(inv.due_date) : null;
                                return gg
                                  ? <span className="text-xs font-medium text-rose-600">Scaduta da {gg} {gg === 1 ? "giorno" : "giorni"}</span>
                                  : <span className="text-muted-foreground">{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yy", { locale: it }) : "—"}</span>;
                              })()}
                            </td>
                            <td className="p-3 text-right"><ImportoInfo inv={inv} /></td>
                            <td className="p-3">
                              <div className="flex flex-col gap-1 items-start">
                                <Badge variant="secondary" className={cfg.color}>{cfg.emoji} {cfg.label}</Badge>
                                {/* Esito SDI: si accende SOLO quando il provider popola
                                    external_status. Scartata/errore = alert rosso da
                                    correggere (fattura non consegnata = non pagata). */}
                                {(() => {
                                  const sdi = (inv.external_status || "").toLowerCase();
                                  if (!sdi) return null;
                                  const rejected = /scart|error|rifiut|ns|ec02/.test(sdi);
                                  const delivered = /conseg|deliver|rc|ec01|accett/.test(sdi);
                                  return (
                                    <span className={`inline-flex items-center gap-1 text-[10px] ${rejected ? "text-rose-600 font-medium" : delivered ? "text-green-600" : "text-muted-foreground"}`}>
                                      {rejected && <AlertTriangle className="h-2.5 w-2.5" />}
                                      SDI: {inv.external_status}
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="p-3">
                              {inv.external_provider ? (
                                <Badge variant="outline" className="text-xs gap-1 font-normal">
                                  <Cloud className="h-3 w-3 text-muted-foreground" />
                                  {PROVIDER_LABELS[inv.external_provider] || inv.external_provider}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Locale</span>
                              )}
                            </td>
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}>
                                    <Eye className="h-4 w-4 mr-2" /> Visualizza
                                  </DropdownMenuItem>
                                  {inv.pdf_url && (
                                    <DropdownMenuItem onClick={() => window.open(inv.pdf_url!, "_blank", "noopener")}>
                                      <Download className="h-4 w-4 mr-2" /> Scarica PDF
                                    </DropdownMenuItem>
                                  )}
                                  {inv.external_xml_url && (
                                    <DropdownMenuItem onClick={() => window.open(inv.external_xml_url!, "_blank", "noopener")}>
                                      <FileCode className="h-4 w-4 mr-2" /> XML (SDI)
                                    </DropdownMenuItem>
                                  )}
                                  {!["paid", "cancelled"].includes(inv.status) && (
                                    <DropdownMenuItem onClick={() => markPaidMutation.mutate({ id: inv.id, total: Number(inv.total), externalProvider: inv.external_provider })}>
                                      <CreditCard className="h-4 w-4 mr-2" /> Segna come pagata
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <BillingReports embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
