import { FornitoreEditor } from "@/components/suppliers/FornitoreEditor";
import {
  payloadFornitore,
  type Supplier,
  type SupplierFormData,
} from "@/lib/suppliers/anagraficaFornitore";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { format } from "date-fns";
import { SuppliersConfig } from "@/components/settings/SuppliersConfig";
import { SuppliersOperational } from "@/pages/azienda/Suppliers";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { userErrorMessage } from "@/lib/userErrorMessage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Truck,
  Download,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Users,
  Euro,
  AlertCircle,
  BarChart3,
  History,
  Clock,
  TrendingUp,
} from "lucide-react";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value || 0);

export function SupplierReportsPanel() {
  const { suppliers, isLoading, isError, refetch } = useOperationalSuppliers();

  const report = useMemo(() => {
    const active = suppliers.filter((supplier) => supplier.is_active).length;
    const inactive = suppliers.length - active;
    const totalOda = suppliers.reduce(
      (sum, supplier) => sum + (supplier.oda_total ?? 0),
      0,
    );
    const openPayments = suppliers.reduce(
      (sum, supplier) => sum + (supplier.scadenze_importo ?? 0),
      0,
    );
    const totalOrders = suppliers.reduce(
      (sum, supplier) => sum + (supplier.oda_count ?? 0),
      0,
    );
    const topBySpend = [...suppliers]
      .sort((a, b) => (b.oda_total ?? 0) - (a.oda_total ?? 0))
      .slice(0, 8);
    const withOpenPayments = [...suppliers]
      .filter((supplier) => (supplier.scadenze_importo ?? 0) > 0)
      .sort((a, b) => (b.scadenze_importo ?? 0) - (a.scadenze_importo ?? 0))
      .slice(0, 8);
    const byCategory = suppliers.reduce<
      Record<string, { count: number; spend: number }>
    >((acc, supplier) => {
      const key = supplier.product_category || "Senza categoria";
      acc[key] = acc[key] ?? { count: 0, spend: 0 };
      acc[key].count += 1;
      acc[key].spend += supplier.oda_total ?? 0;
      return acc;
    }, {});

    return {
      active,
      inactive,
      totalOda,
      openPayments,
      totalOrders,
      avgOrder: totalOrders > 0 ? totalOda / totalOrders : 0,
      topBySpend,
      withOpenPayments,
      byCategory: Object.entries(byCategory)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 6),
    };
  }, [suppliers]);

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Caricamento report fornitori...
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Report fornitori non disponibile</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Non è stato possibile leggere acquisti e scadenze. Nessun totale viene
          mostrato come zero.
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Acquisti OdA</CardDescription>
            <CardTitle>{formatMoney(report.totalOda)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Scadenze aperte</CardDescription>
            <CardTitle>{formatMoney(report.openPayments)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ordini acquisto</CardDescription>
            <CardTitle>{report.totalOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valore medio OdA</CardDescription>
            <CardTitle>{formatMoney(report.avgOrder)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            {/* I riquadri sono titoli di secondo livello: il primo è quello della pagina. */}
            <CardTitle
              aria-level={2}
              className="flex items-center gap-2 text-base"
            >
              <TrendingUp className="h-4 w-4" />
              Chi compriamo di più
            </CardTitle>
            <CardDescription>
              I fornitori con più ordini d'acquisto: utile per trattare i
              prezzi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.topBySpend.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun ordine di acquisto collegato ai fornitori.
              </p>
            ) : (
              report.topBySpend.map((supplier, index) => (
                <div
                  key={supplier.id}
                  className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md border p-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:gap-3"
                >
                  <span className="text-sm font-semibold text-muted-foreground">
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{supplier.name}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {supplier.product_category || "Senza categoria"} ·{" "}
                      {supplier.oda_count ?? 0} OdA
                    </p>
                  </div>
                  <p className="col-start-2 text-sm font-semibold sm:col-auto sm:text-base">
                    {formatMoney(supplier.oda_total ?? 0)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle aria-level={2} className="text-base">
              Scadenze aperte
            </CardTitle>
            <CardDescription>
              Fornitori con pagamenti ancora da chiudere.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.withOpenPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna scadenza fornitore aperta.
              </p>
            ) : (
              report.withOpenPayments.map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex min-w-0 flex-col items-start gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{supplier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {supplier.scadenze_aperte ?? 0} scadenze
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold sm:text-base">
                    {formatMoney(supplier.scadenze_importo ?? 0)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} className="text-base">
            Categorie fornitore
          </CardTitle>
          <CardDescription>
            Distribuzione per categoria, con valore OdA aggregato.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {report.byCategory.map((category) => (
            <div key={category.category} className="rounded-md border p-3">
              <p className="font-medium">{category.category}</p>
              <p className="text-xs text-muted-foreground">
                {category.count} fornitori
              </p>
              <p className="mt-2 text-lg font-semibold">
                {formatMoney(category.spend)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Come si legge l'azione nel registro. Il database la scrive in inglese e in più modi
 * (`supplier.updated`, `create_supplier`, `merge`): qui diventa una parola italiana.
 * Un'azione che non si riconosce si legge «altro», mai l'inglese così com'è.
 */
function etichettaAzioneFornitore(azione: string): string {
  const a = azione.toLowerCase();
  if (a.includes("merge")) return "unito";
  if (/creat|insert/.test(a)) return "creato";
  if (/delet|remov|elimin/.test(a)) return "eliminato";
  if (/updat|edit|modific/.test(a)) return "modificato";
  return "altro";
}

function SupplierAuditPanel({ companyId }: { companyId?: string }) {
  const {
    data: logs = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["supplier-audit-log", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // «suppliers» (plurale) è come scrive il database oggi; «supplier» è come scriveva prima e come scrive l'unione
      // dei fornitori. Leggendo solo «supplier» il registro mostrava soltanto le righe più vecchie
      // (il 10/10/2026: 13 su 373).
      const { data, error } = await supabase
        .from("company_activity_log")
        .select(
          "id, action, target_id, target_type, target_label, details, created_at, user_id, actor_name",
        )
        .eq("company_id", companyId)
        .in("target_type", ["suppliers", "supplier"])
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Caricamento registro…
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Registro non disponibile</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Non sono riuscito a leggere le modifiche ai fornitori.
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Cosa è cambiato
        </CardTitle>
        <CardDescription>
          Creazioni, modifiche, eliminazioni e unioni dei fornitori, con la
          data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nessuna attività fornitore registrata.
          </div>
        ) : (
          logs.map((log) => {
            const details = (log.details ?? {}) as Record<string, unknown>;
            // Il nome del fornitore sta nel registro stesso: il codice interno (target_id) non serve a chi legge.
            const supplierName = String(
              details.name ??
                details.target_name ??
                log.target_label ??
                details.source_name ??
                "Fornitore",
            );
            const azione = etichettaAzioneFornitore(log.action);
            return (
              <div
                key={log.id}
                className="grid gap-2 rounded-md border p-3 md:grid-cols-[160px_1fr] md:items-center"
              >
                <div>
                  <Badge variant="outline">{azione}</Badge>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{supplierName}</p>
                  {azione === "unito" && (
                    <p className="text-xs text-muted-foreground">
                      Il doppione «{String(details.source_name ?? "senza nome")}
                      » è passato a questo fornitore.
                    </p>
                  )}
                  {log.actor_name && (
                    <p className="text-xs text-muted-foreground">
                      da {log.actor_name}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Wrapper Fornitori — header + export cross-tab.
 *
 * L'export avviene SEMPRE sul catalogo completo fornitori (non sui
 * filtri interni alle tab Anagrafica/Operativo) perché i filtri sono
 * stato locale del componente figlio e non rilevanti per un export
 * massivo.
 *
 * Formati: CSV, Excel (XLSX), PDF. PDF è una tabella landscape A4
 * ordinata per nome con tutti i campi principali.
 */
export default function SettingsSuppliers() {
  const { role, effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  // Chi può solo guardare vede l'elenco, gli ordini e i report, ma nessun comando che scrive
  // (il database li rifiuterebbe: la policy di `suppliers` chiede can_edit_settings_suppliers).
  // Boolean(): i componenti sotto hanno `true` come valore di partenza, e un permesso mancante (undefined) non deve
  // diventare «sì».
  const puoModificare = Boolean(
    role === "company_admin" ||
    role === "super_admin" ||
    permissions.canEditSettingsSuppliers,
  );
  const canView =
    puoModificare || Boolean(permissions.canViewSettingsSuppliers);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ["anagrafica", "operativo", "report", "audit"].includes(
    searchParams.get("tab") ?? "",
  )
    ? searchParams.get("tab")!
    : "anagrafica";
  const setTab = (value: string) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", value);
      next.delete("fornitore");
      return next;
    });
  const vaiFornitore = (id: string | null) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", "operativo");
      if (id) next.set("fornitore", id);
      else next.delete("fornitore");
      return next;
    });
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const queryClient = useQueryClient();
  const crea = useMutation({
    mutationFn: async (dati: SupplierFormData) => {
      if (!puoModificare || !effectiveCompany?.id)
        throw new Error("Non puoi aggiungere fornitori.");
      const { data: created, error } = await supabase
        .from("suppliers")
        .insert({ ...payloadFornitore(dati), company_id: effectiveCompany.id })
        .select("id")
        .single();
      if (error) throw error;
      return created.id;
    },
    onSuccess: async (id) => {
      await invalidaFornitori(queryClient);
      setNuovoAperto(false);
      toast({ title: "Fornitore creato" });
      vaiFornitore(id);
    },
    onError: (error) =>
      toast({
        title: "Fornitore non creato",
        description: userErrorMessage(
          error,
          "Non sono riuscito a salvare il fornitore. Riprova.",
        ),
        variant: "destructive",
      }),
  });

  useEffect(() => {
    if (!permissions.isLoading && !canView)
      navigate("/azienda", { replace: true });
  }, [canView, navigate, permissions.isLoading]);

  // Supplier list per l'export + KPI header (separata dal componente figlio
  // per evitare coupling con il suo stato interno di filtri).
  // Bug fix: rimossi `payment_terms_days` e `default_payment_method` che
  // non esistono su suppliers (lo schema ha solo `payment_method`).
  // Prima la query falliva silenziosamente e i KPI mostravano tutti 0
  // mentre la tabella interna (che seleziona *) mostrava i dati.
  const {
    data: suppliers = [],
    isLoading: suppliersExportIsLoading,
    isError: suppliersExportIsError,
    error: suppliersExportError,
    refetch: refetchExport,
  } = useQuery({
    queryKey: ["suppliers-export", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      return loadCatalogPages<Supplier>((from, to) =>
        supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", effectiveCompany.id)
          .order("name")
          .order("id")
          .range(from, to),
      );
    },
    enabled: canView && !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  const stats = useMemo(() => {
    const total = suppliers.length;
    const attivi = suppliers.filter((s) => s.is_active).length;
    const esteri = suppliers.filter((s) => s.is_foreign).length;
    const italiani = total - esteri;
    return { total, attivi, italiani, esteri };
  }, [suppliers]);

  const buildExportRows = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return suppliers.map((s: any) => ({
      name: s.name ?? "",
      tipo: s.is_foreign ? "Estero" : "Italiano",
      attivo: s.is_active ? "Sì" : "No",
      product_category: s.product_category ?? "",
      vat_number: s.vat_number ?? "",
      fiscal_code: s.fiscal_code ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      contact_name: s.contact_name ?? "",
      contact_role: s.contact_role ?? "",
      contact_email: s.contact_email ?? "",
      contact_phone: s.contact_phone ?? "",
      iban: s.iban ?? "",
      bank_name: s.bank_name ?? "",
      lead_time_days: s.lead_time_days ?? "",
      min_order_amount: s.min_order_amount ?? "",
      credit_limit: s.credit_limit ?? "",
      rating: s.rating ?? "",
      website: s.website ?? "",

      address: s.address ?? "",
      postal_code: s.postal_code ?? "",
      city: s.city ?? "",
      province: s.province ?? "",
      country: s.country ?? "IT",
      payment_method: s.payment_method ?? "",
      notes: (s.notes ?? "").replace(/\n/g, " / "),
      created_at: s.created_at
        ? format(new Date(s.created_at), "dd/MM/yyyy")
        : "",
    }));
  }, [suppliers]);

  const exportColumns = useMemo(
    () => [
      { key: "name", label: "Ragione Sociale" },
      { key: "tipo", label: "Tipo" },
      { key: "attivo", label: "Attivo" },
      { key: "product_category", label: "Categoria" },
      { key: "vat_number", label: "P.IVA" },
      { key: "fiscal_code", label: "CF" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Telefono" },
      { key: "contact_name", label: "Referente" },
      { key: "contact_role", label: "Ruolo referente" },
      { key: "contact_email", label: "Email referente" },
      { key: "contact_phone", label: "Telefono referente" },
      { key: "iban", label: "IBAN" },
      { key: "bank_name", label: "Banca" },
      { key: "lead_time_days", label: "Consegna indicativa (giorni)" },
      { key: "min_order_amount", label: "Ordine minimo" },
      { key: "credit_limit", label: "Fido concordato" },
      { key: "rating", label: "Valutazione" },
      { key: "website", label: "Sito web" },

      { key: "address", label: "Indirizzo" },
      { key: "postal_code", label: "CAP" },
      { key: "city", label: "Città" },
      { key: "province", label: "Prov." },
      { key: "country", label: "Paese" },
      { key: "payment_method", label: "Metodo pagamento" },
      { key: "notes", label: "Note" },
      { key: "created_at", label: "Data inserimento" },
    ],
    [],
  );

  const exportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun fornitore", variant: "destructive" });
      return;
    }
    exportToCSV(
      rows,
      exportColumns,
      `fornitori-${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
    toast({ title: `CSV esportato — ${rows.length} fornitori` });
  }, [buildExportRows, exportColumns, toast]);

  const exportXLSX = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun fornitore", variant: "destructive" });
      return;
    }
    await exportToXLSX(
      rows,
      exportColumns,
      `fornitori-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    );
    toast({ title: `Excel esportato — ${rows.length} fornitori` });
  }, [buildExportRows, exportColumns, toast]);

  const exportPDF = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun fornitore", variant: "destructive" });
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });
      doc.setFontSize(14);
      doc.text(`${effectiveCompany?.name ?? "Azienda"} — Fornitori`, 40, 40);
      doc.setFontSize(9);
      doc.text(
        `Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${rows.length} fornitori`,
        40,
        56,
      );

      const cols = [
        { key: "name", label: "Fornitore", w: 160 },
        { key: "product_category", label: "Categoria", w: 75 },
        { key: "contact_name", label: "Referente", w: 115 },
        { key: "contact_email", label: "Email referente", w: 150 },
        { key: "contact_phone", label: "Telefono referente", w: 95 },
        { key: "city", label: "Città", w: 85 },
        { key: "attivo", label: "Attivo", w: 45 },
      ];
      let y = 80;
      let x = 40;
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(
        40,
        y - 12,
        cols.reduce((a, c) => a + c.w, 0),
        18,
        "F",
      );
      cols.forEach((c) => {
        doc.text(c.label, x + 4, y);
        x += c.w;
      });
      y += 14;
      doc.setFont("helvetica", "normal");

      rows.forEach((r, i) => {
        if (y > 540) {
          doc.addPage();
          y = 40;
        }
        x = 40;
        if (i % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(
            40,
            y - 10,
            cols.reduce((a, c) => a + c.w, 0),
            14,
            "F",
          );
        }
        cols.forEach((c) => {
          const val = String(r[c.key as keyof typeof r] ?? "");
          const maxLen = Math.floor(c.w / 5);
          const trimmed =
            val.length > maxLen ? val.slice(0, maxLen - 1) + "…" : val;
          doc.text(trimmed, x + 4, y);
          x += c.w;
        });
        y += 13;
      });

      doc.save(`fornitori-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: `PDF esportato — ${rows.length} fornitori` });
    } catch (e) {
      toast({
        title: "Errore export PDF",
        description: e instanceof Error ? e.message : "Generazione PDF fallita",
        variant: "destructive",
      });
    }
  }, [buildExportRows, effectiveCompany, toast]);

  if (!canView) return null;

  const menuEsporta = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Esporta fornitori"
          disabled={suppliersExportIsLoading || suppliersExportIsError}
        >
          <Download className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">Esporta</span>
          <ChevronDown className="hidden h-3.5 w-3.5 ml-1 sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px]">
          Tutti i fornitori ({suppliers.length})
        </DropdownMenuLabel>
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
  );

  return (
    // flex+gap invece di space-y: la testata nascosta da 768 lasciava lo
    // spazio sopra i numeri (lo stesso 24px tra i blocchi sul telefono).
    <div className="flex flex-col gap-6">
      {!puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Fornitori" />}
      {/* KPI quick */}
      {suppliersExportIsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Statistiche fornitori non disponibili</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3 text-xs">
            {userErrorMessage(
              suppliersExportError,
              "Non è stato possibile caricare i numeri e i dati da esportare.",
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refetchExport()}
            >
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {tab === "anagrafica" &&
        !suppliersExportIsLoading &&
        !suppliersExportIsError && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border-l-4 border-l-primary bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Totale
                </p>
                <Truck className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-bold mt-1">{stats.total}</p>
            </div>
            <div className="rounded-lg border-l-4 border-l-emerald-500 bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Attivi
                </p>
                <Users className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-xl font-bold mt-1">{stats.attivi}</p>
            </div>
            <div className="hidden rounded-lg border-l-4 border-l-blue-500 bg-card p-3 sm:block">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Italiani
                </p>
                <Badge variant="outline" className="h-4 text-[9px] px-1">
                  IT
                </Badge>
              </div>
              <p className="text-xl font-bold mt-1">{stats.italiani}</p>
            </div>
            <div className="hidden rounded-lg border-l-4 border-l-amber-500 bg-card p-3 sm:block">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Esteri
                </p>
                <Euro className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-xl font-bold mt-1">{stats.esteri}</p>
            </div>
          </div>
        )}

      {tab !== "anagrafica" && puoModificare && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={suppliersExportIsLoading || suppliersExportIsError}
            onClick={() => setNuovoAperto(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuovo fornitore
          </Button>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        {/* Un solo comando di export, accanto alle schede anche sul telefono. */}
        <div className="flex min-w-0 items-start justify-between gap-2 md:items-center md:gap-3">
          <TabsList className="grid h-auto min-w-0 flex-1 grid-cols-2 sm:grid-cols-4 md:flex md:flex-none [&>button]:whitespace-normal">
            <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
            <TabsTrigger value="operativo">Ordini e pagamenti</TabsTrigger>
            <TabsTrigger value="report">
              <BarChart3 className="mr-1.5 hidden h-4 w-4 sm:block" />
              Acquisti
            </TabsTrigger>
            <TabsTrigger value="audit">
              <History className="mr-1.5 hidden h-4 w-4 sm:block" />
              Cosa è cambiato
            </TabsTrigger>
          </TabsList>
          <div className="shrink-0">{menuEsporta}</div>
        </div>
        <TabsContent value="anagrafica" className="mt-4">
          <SuppliersConfig
            puoModificare={puoModificare}
            onApriFornitore={vaiFornitore}
          />
        </TabsContent>
        <TabsContent value="operativo" className="mt-4">
          <SuppliersOperational
            puoModificare={puoModificare}
            incorporato
            fornitoreId={searchParams.get("fornitore")}
            onSeleziona={vaiFornitore}
          />
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <SupplierReportsPanel />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <SupplierAuditPanel companyId={effectiveCompany?.id} />
        </TabsContent>
      </Tabs>
      <FornitoreEditor
        aperta={nuovoAperto && puoModificare}
        fornitore={null}
        esteroIniziale={false}
        fornitori={suppliers}
        categorieEsistenti={[
          ...new Set(
            suppliers
              .map((s) => s.product_category)
              .filter((c): c is string => !!c),
          ),
        ]}
        salvataggio={crea.isPending}
        onChiudi={() => setNuovoAperto(false)}
        onSalva={(dati) => crea.mutate(dati)}
      />
    </div>
  );
}
