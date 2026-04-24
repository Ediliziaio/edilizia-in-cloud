import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { format } from "date-fns";
import { SuppliersConfig } from "@/components/settings/SuppliersConfig";
import { SuppliersOperational } from "@/pages/azienda/Suppliers";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Truck, Download, ChevronDown, FileText, FileSpreadsheet, Users, Euro,
} from "lucide-react";

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
  const isAdmin = role === "company_admin" || role === "super_admin";
  const [tab, setTab] = useState("anagrafica");

  useEffect(() => {
    if (!isAdmin) navigate("/azienda", { replace: true });
  }, [isAdmin, navigate]);

  // Supplier list per l'export + KPI header (separata dal componente figlio
  // per evitare coupling con il suo stato interno di filtri).
  // Bug fix: rimossi `payment_terms_days` e `default_payment_method` che
  // non esistono su suppliers (lo schema ha solo `payment_method`).
  // Prima la query falliva silenziosamente e i KPI mostravano tutti 0
  // mentre la tabella interna (che seleziona *) mostrava i dati.
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-export", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, product_category, vat_number, fiscal_code, email, phone, address, city, province, postal_code, country, is_foreign, is_active, notes, payment_method, created_at")
        .eq("company_id", effectiveCompany.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin && !!effectiveCompany?.id,
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
      address: s.address ?? "",
      postal_code: s.postal_code ?? "",
      city: s.city ?? "",
      province: s.province ?? "",
      country: s.country ?? "IT",
      payment_method: s.payment_method ?? "",
      notes: (s.notes ?? "").replace(/\n/g, " / "),
      created_at: s.created_at ? format(new Date(s.created_at), "dd/MM/yyyy") : "",
    }));
  }, [suppliers]);

  const exportColumns = useMemo(() => ([
    { key: "name", label: "Ragione Sociale" },
    { key: "tipo", label: "Tipo" },
    { key: "attivo", label: "Attivo" },
    { key: "product_category", label: "Categoria" },
    { key: "vat_number", label: "P.IVA" },
    { key: "fiscal_code", label: "CF" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Telefono" },
    { key: "address", label: "Indirizzo" },
    { key: "postal_code", label: "CAP" },
    { key: "city", label: "Città" },
    { key: "province", label: "Prov." },
    { key: "country", label: "Paese" },
    { key: "payment_method", label: "Metodo pagamento" },
    { key: "notes", label: "Note" },
    { key: "created_at", label: "Data inserimento" },
  ]), []);

  const exportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast({ title: "Nessun fornitore", variant: "destructive" }); return; }
    exportToCSV(rows, exportColumns, `fornitori-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `CSV esportato — ${rows.length} fornitori` });
  }, [buildExportRows, exportColumns, toast]);

  const exportXLSX = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast({ title: "Nessun fornitore", variant: "destructive" }); return; }
    await exportToXLSX(rows, exportColumns, `fornitori-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: `Excel esportato — ${rows.length} fornitori` });
  }, [buildExportRows, exportColumns, toast]);

  const exportPDF = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast({ title: "Nessun fornitore", variant: "destructive" }); return; }
    try {
      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(`${effectiveCompany?.name ?? "Azienda"} — Fornitori`, 40, 40);
      doc.setFontSize(9);
      doc.text(`Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${rows.length} fornitori`, 40, 56);

      const cols = [
        { key: "name", label: "Nome", w: 160 },
        { key: "product_category", label: "Categoria", w: 110 },
        { key: "vat_number", label: "P.IVA", w: 90 },
        { key: "email", label: "Email", w: 150 },
        { key: "phone", label: "Telefono", w: 90 },
        { key: "city", label: "Città", w: 90 },
        { key: "province", label: "Pr", w: 30 },
        { key: "tipo", label: "Tipo", w: 55 },
        { key: "attivo", label: "Attivo", w: 50 },
      ];
      let y = 80;
      let x = 40;
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(40, y - 12, cols.reduce((a, c) => a + c.w, 0), 18, "F");
      cols.forEach((c) => { doc.text(c.label, x + 4, y); x += c.w; });
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
          doc.text(trimmed, x + 4, y);
          x += c.w;
        });
        y += 13;
      });

      doc.save(`fornitori-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: `PDF esportato — ${rows.length} fornitori` });
    } catch (e) {
      toast({ title: "Errore export PDF", description: e instanceof Error ? e.message : "Generazione PDF fallita", variant: "destructive" });
    }
  }, [buildExportRows, effectiveCompany?.name, toast]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header con pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Fornitori</h1>
            <p className="text-sm text-muted-foreground">
              Anagrafica, listini, metodi di pagamento e performance dei tuoi fornitori.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Esporta</span>
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[11px]">Tutti i fornitori ({suppliers.length})</DropdownMenuLabel>
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
        </div>
      </div>

      {/* KPI quick */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border-l-4 border-l-primary bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Totale</p>
            <Truck className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="rounded-lg border-l-4 border-l-emerald-500 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Attivi</p>
            <Users className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold mt-1">{stats.attivi}</p>
        </div>
        <div className="rounded-lg border-l-4 border-l-blue-500 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Italiani</p>
            <Badge variant="outline" className="h-4 text-[9px] px-1">IT</Badge>
          </div>
          <p className="text-xl font-bold mt-1">{stats.italiani}</p>
        </div>
        <div className="rounded-lg border-l-4 border-l-amber-500 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Esteri</p>
            <Euro className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold mt-1">{stats.esteri}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="operativo">Operativo</TabsTrigger>
        </TabsList>
        <TabsContent value="anagrafica" className="mt-4">
          <SuppliersConfig />
        </TabsContent>
        <TabsContent value="operativo" className="mt-4">
          <SuppliersOperational />
        </TabsContent>
      </Tabs>
    </div>
  );
}
