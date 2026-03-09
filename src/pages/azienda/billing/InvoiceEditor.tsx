import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, Trash2, Save, Send, Loader2, AlertTriangle, Download } from "lucide-react";

interface InvoiceLine {
  id?: string;
  description: string;
  product_code: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate: number;
  tax_nature: string;
  line_net: number;
  line_tax: number;
  line_gross: number;
  sort_order: number;
}

const emptyLine = (): InvoiceLine => ({
  description: "", product_code: "", unit: "pz", quantity: 1, unit_price: 0,
  discount_percent: 0, tax_rate: 22, tax_nature: "", line_net: 0, line_tax: 0, line_gross: 0, sort_order: 0,
});

function calcLine(l: InvoiceLine): InvoiceLine {
  const net = l.quantity * l.unit_price * (1 - l.discount_percent / 100);
  const tax = net * l.tax_rate / 100;
  return { ...l, line_net: Math.round(net * 100) / 100, line_tax: Math.round(tax * 100) / 100, line_gross: Math.round((net + tax) * 100) / 100 };
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const isNew = !id;
  const duplicateId = searchParams.get("duplicate");

  const [form, setForm] = useState({
    document_type: "invoice" as string,
    status: "draft",
    client_company_name: "",
    client_vat_number: "",
    client_fiscal_code: "",
    client_address: "",
    client_city: "",
    client_zip: "",
    client_country: "IT",
    client_pec: "",
    client_sdi_code: "",
    client_email: "",
    client_id: null as string | null,
    issue_date: format(new Date(), "yyyy-MM-dd"),
    due_date: format(addDays(new Date(), 30), "yyyy-MM-dd"),
    payment_method: "bank_transfer",
    payment_terms: "30 giorni data fattura",
    bank_iban: "",
    notes: "",
    footer_text: "",
    invoice_number: "",
    order_id: null as string | null,
    quote_id: null as string | null,
  });
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  // Load existing invoice
  const { data: existing } = useQuery({
    queryKey: ["invoice", id || duplicateId],
    queryFn: async () => {
      const targetId = id || duplicateId;
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", targetId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!(id || duplicateId),
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      document_type: existing.document_type || "invoice",
      status: duplicateId ? "draft" : existing.status || "draft",
      client_company_name: existing.client_company_name || "",
      client_vat_number: existing.client_vat_number || "",
      client_fiscal_code: existing.client_fiscal_code || "",
      client_address: existing.client_address || "",
      client_city: existing.client_city || "",
      client_zip: existing.client_zip || "",
      client_country: existing.client_country || "IT",
      client_pec: existing.client_pec || "",
      client_sdi_code: existing.client_sdi_code || "",
      client_email: existing.client_email || "",
      client_id: existing.client_id,
      issue_date: duplicateId ? format(new Date(), "yyyy-MM-dd") : existing.issue_date || "",
      due_date: existing.due_date || "",
      payment_method: existing.payment_method || "bank_transfer",
      payment_terms: existing.payment_terms || "",
      bank_iban: existing.bank_iban || "",
      notes: existing.notes || "",
      footer_text: existing.footer_text || "",
      invoice_number: duplicateId ? "" : existing.invoice_number || "",
      order_id: duplicateId ? null : existing.order_id,
      quote_id: duplicateId ? null : existing.quote_id,
    });
    const existingLines = (existing.invoice_lines || [])
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((l: any) => ({
        id: duplicateId ? undefined : l.id,
        description: l.description || "",
        product_code: l.product_code || "",
        unit: l.unit || "pz",
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount_percent: Number(l.discount_percent || 0),
        tax_rate: Number(l.tax_rate),
        tax_nature: l.tax_nature || "",
        line_net: Number(l.line_net),
        line_tax: Number(l.line_tax),
        line_gross: Number(l.line_gross),
        sort_order: l.sort_order || 0,
      }));
    if (existingLines.length > 0) setLines(existingLines);
  }, [existing, duplicateId]);

  // Contact search
  const [contactSearch, setContactSearch] = useState("");
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts_search", companyId, contactSearch],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, company_name, vat_number, fiscal_code, address, city, zip, email")
        .eq("company_id", companyId!)
        .ilike("company_name", `%${contactSearch}%`)
        .limit(10);
      return data || [];
    },
    enabled: !!companyId && contactSearch.length >= 2,
  });

  const selectContact = (c: any) => {
    setForm((f) => ({
      ...f,
      client_id: c.id,
      client_company_name: c.company_name || `${c.first_name} ${c.last_name}`,
      client_vat_number: c.vat_number || "",
      client_fiscal_code: c.fiscal_code || "",
      client_address: c.address || "",
      client_city: c.city || "",
      client_zip: c.zip || "",
      client_email: c.email || "",
    }));
    setContactSearch("");
  };

  const updateLine = useCallback((idx: number, field: string, value: any) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[idx] = calcLine({ ...updated[idx], [field]: value });
      return updated;
    });
  }, []);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.line_net, 0);
    const tax = lines.reduce((s, l) => s + l.line_tax, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const isLocked = !["draft"].includes(form.status) && !isNew && !duplicateId;
  const missingSdi = !form.client_sdi_code && !form.client_pec;

  const saveMutation = useMutation({
    mutationFn: async (opts: { emitNumber?: boolean; sendToProvider?: boolean }) => {
      setSaving(true);
      let invoiceNumber = form.invoice_number;
      let progressiveNumber: number | undefined;

      if (opts.emitNumber && !invoiceNumber) {
        const { data: numData, error: numErr } = await supabase.rpc("generate_invoice_number", {
          p_company_id: companyId!,
        });
        if (numErr) throw numErr;
        const row = (numData as any)?.[0] || numData;
        invoiceNumber = row.invoice_number;
        progressiveNumber = row.progressive_number;
      }

      const invoiceData = {
        company_id: companyId!,
        document_type: form.document_type,
        status: opts.emitNumber ? "issued" : "draft",
        client_id: form.client_id,
        client_company_name: form.client_company_name,
        client_vat_number: form.client_vat_number || null,
        client_fiscal_code: form.client_fiscal_code || null,
        client_address: form.client_address || null,
        client_city: form.client_city || null,
        client_zip: form.client_zip || null,
        client_country: form.client_country,
        client_pec: form.client_pec || null,
        client_sdi_code: form.client_sdi_code || null,
        client_email: form.client_email || null,
        issue_date: form.issue_date,
        due_date: form.due_date || null,
        payment_method: form.payment_method,
        payment_terms: form.payment_terms || null,
        bank_iban: form.bank_iban || null,
        notes: form.notes || null,
        footer_text: form.footer_text || null,
        invoice_number: invoiceNumber || null,
        progressive_number: progressiveNumber,
        order_id: form.order_id,
        quote_id: form.quote_id,
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total: totals.total,
        created_by: user?.id,
        updated_at: new Date().toISOString(),
      };

      let invoiceId = id;

      if (isNew || duplicateId) {
        const { data: ins, error } = await supabase.from("invoices").insert(invoiceData).select("id").single();
        if (error) throw error;
        invoiceId = ins.id;
      } else {
        const { error } = await supabase.from("invoices").update(invoiceData).eq("id", id!);
        if (error) throw error;
        // Delete old lines
        await supabase.from("invoice_lines").delete().eq("invoice_id", id!);
      }

      // Insert lines
      const lineRows = lines
        .filter((l) => l.description.trim())
        .map((l, i) => calcLine({ ...l, sort_order: i }))
        .map((l) => ({
          invoice_id: invoiceId!,
          description: l.description,
          product_code: l.product_code || null,
          unit: l.unit,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_percent: l.discount_percent,
          tax_rate: l.tax_rate,
          tax_nature: l.tax_nature || null,
          line_net: l.line_net,
          line_tax: l.line_tax,
          line_gross: l.line_gross,
          sort_order: l.sort_order,
        }));

      if (lineRows.length > 0) {
        const { error: lErr } = await supabase.from("invoice_lines").insert(lineRows);
        if (lErr) throw lErr;
      }

      // Send to provider
      if (opts.sendToProvider && invoiceId) {
        await supabase.functions.invoke("billing-sync", {
          body: { invoice_id: invoiceId, action: "push_to_provider" },
        });
      }

      return invoiceId;
    },
    onSuccess: (invoiceId) => {
      toast.success("Fattura salvata");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      if (isNew || duplicateId) navigate(`/azienda/fatturazione/${invoiceId}`, { replace: true });
    },
    onError: (e) => toast.error("Errore nel salvataggio", { description: String(e) }),
    onSettled: () => setSaving(false),
  });

  const downloadPdf = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoice_id: id },
      });
      if (error) throw error;
      const html = data?.html;
      if (!html) throw new Error("Empty response");
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 500);
      }
    } catch (e) {
      toast.error("Errore generazione PDF", { description: String(e) });
    }
  };

  const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/fatturazione")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isNew ? "Nuova Fattura" : duplicateId ? "Duplica Fattura" : `Fattura ${form.invoice_number || ""}`}
        </h1>
        {isLocked && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
            Fattura emessa — non modificabile
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* FORM — 3 cols */}
        <div className="lg:col-span-3 space-y-6">
          {/* Intestazione */}
          <Card>
            <CardHeader><CardTitle className="text-base">Intestazione</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo documento</Label>
                  <Select value={form.document_type} onValueChange={(v) => setForm((f) => ({ ...f, document_type: v }))} disabled={isLocked}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoice">Fattura</SelectItem>
                      <SelectItem value="proforma">Proforma</SelectItem>
                      <SelectItem value="credit_note">Nota di credito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>N° Fattura</Label>
                  <Input value={form.invoice_number} disabled placeholder="Generato all'emissione" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data emissione</Label>
                  <Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} disabled={isLocked} />
                </div>
                <div>
                  <Label>Scadenza</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} disabled={isLocked} className="flex-1" />
                  </div>
                  {!isLocked && (
                    <div className="flex gap-1 mt-1">
                      {[30, 60, 90].map((d) => (
                        <Button key={d} variant="outline" size="sm" className="text-xs h-6 px-2"
                          onClick={() => setForm((f) => ({ ...f, due_date: format(addDays(new Date(f.issue_date), d), "yyyy-MM-dd") }))}>
                          +{d}gg
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card>
            <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!isLocked && (
                <div className="relative">
                  <Input placeholder="Cerca cliente..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
                  {contacts.length > 0 && contactSearch.length >= 2 && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                      {contacts.map((c: any) => (
                        <div key={c.id} className="px-3 py-2 hover:bg-muted cursor-pointer text-sm" onClick={() => selectContact(c)}>
                          {c.company_name || `${c.first_name} ${c.last_name}`} {c.vat_number && `— ${c.vat_number}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Ragione sociale *</Label>
                  <Input value={form.client_company_name} onChange={(e) => setForm((f) => ({ ...f, client_company_name: e.target.value }))} disabled={isLocked} />
                </div>
                <div>
                  <Label>P.IVA</Label>
                  <Input value={form.client_vat_number} onChange={(e) => setForm((f) => ({ ...f, client_vat_number: e.target.value }))} disabled={isLocked} />
                </div>
                <div>
                  <Label>Codice Fiscale</Label>
                  <Input value={form.client_fiscal_code} onChange={(e) => setForm((f) => ({ ...f, client_fiscal_code: e.target.value }))} disabled={isLocked} />
                </div>
                <div className="col-span-2">
                  <Label>Indirizzo</Label>
                  <Input value={form.client_address} onChange={(e) => setForm((f) => ({ ...f, client_address: e.target.value }))} disabled={isLocked} />
                </div>
                <div>
                  <Label>Città</Label>
                  <Input value={form.client_city} onChange={(e) => setForm((f) => ({ ...f, client_city: e.target.value }))} disabled={isLocked} />
                </div>
                <div>
                  <Label>CAP</Label>
                  <Input value={form.client_zip} onChange={(e) => setForm((f) => ({ ...f, client_zip: e.target.value }))} disabled={isLocked} />
                </div>
                <div>
                  <Label>Codice SDI</Label>
                  <Input value={form.client_sdi_code} onChange={(e) => setForm((f) => ({ ...f, client_sdi_code: e.target.value }))} disabled={isLocked} maxLength={7} placeholder="7 caratteri" />
                </div>
                <div>
                  <Label>PEC</Label>
                  <Input value={form.client_pec} onChange={(e) => setForm((f) => ({ ...f, client_pec: e.target.value }))} disabled={isLocked} />
                </div>
              </div>
              {missingSdi && form.client_company_name && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4" /> Codice SDI o PEC necessari per la fattura elettronica
                </div>
              )}
            </CardContent>
          </Card>

          {/* Righe */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Righe fattura</CardTitle>
              {!isLocked && (
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4 mr-1" /> Riga</Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border-b pb-3">
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-xs">Descrizione</Label>
                      <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} disabled={isLocked} className="text-sm" />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs">Q.tà</Label>
                      <Input type="number" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} disabled={isLocked} className="text-sm" />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs">U.M.</Label>
                      <Input value={line.unit} onChange={(e) => updateLine(idx, "unit", e.target.value)} disabled={isLocked} className="text-sm" />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <Label className="text-xs">Prezzo unit.</Label>
                      <Input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(idx, "unit_price", Number(e.target.value))} disabled={isLocked} className="text-sm" />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs">Sc.%</Label>
                      <Input type="number" value={line.discount_percent} onChange={(e) => updateLine(idx, "discount_percent", Number(e.target.value))} disabled={isLocked} className="text-sm" />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs">IVA%</Label>
                      <Select value={String(line.tax_rate)} onValueChange={(v) => updateLine(idx, "tax_rate", Number(v))} disabled={isLocked}>
                        <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="22">22%</SelectItem>
                          <SelectItem value="10">10%</SelectItem>
                          <SelectItem value="4">4%</SelectItem>
                          <SelectItem value="0">0%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 sm:col-span-1 text-right">
                      <Label className="text-xs">Totale</Label>
                      <p className="text-sm font-medium pt-2">{fmtEur(line.line_gross)}</p>
                    </div>
                    {!isLocked && lines.length > 1 && (
                      <div className="col-span-1">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeLine(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Separator className="my-4" />
              <div className="flex flex-col items-end gap-1 text-sm">
                <div className="flex gap-8"><span className="text-muted-foreground">Imponibile:</span> <span className="font-medium w-24 text-right">{fmtEur(totals.subtotal)}</span></div>
                <div className="flex gap-8"><span className="text-muted-foreground">IVA:</span> <span className="font-medium w-24 text-right">{fmtEur(totals.tax)}</span></div>
                <Separator className="w-48 my-1" />
                <div className="flex gap-8 text-base"><span className="font-semibold">TOTALE:</span> <span className="font-bold w-24 text-right">{fmtEur(totals.total)}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Pagamento & Note */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pagamento e note</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Metodo pagamento</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))} disabled={isLocked}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bonifico bancario</SelectItem>
                      <SelectItem value="cash">Contanti</SelectItem>
                      <SelectItem value="check">Assegno</SelectItem>
                      <SelectItem value="credit_card">Carta di credito</SelectItem>
                      <SelectItem value="rid">RID</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>IBAN</Label>
                  <Input value={form.bank_iban} onChange={(e) => setForm((f) => ({ ...f, bank_iban: e.target.value }))} disabled={isLocked} />
                </div>
              </div>
              <div>
                <Label>Note interne (non visibili sulla fattura)</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>Note piè di pagina (visibili sulla fattura)</Label>
                <Textarea value={form.footer_text} onChange={(e) => setForm((f) => ({ ...f, footer_text: e.target.value }))} rows={2} disabled={isLocked} />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {!isLocked && (
            <div className="flex gap-3">
              <Button variant="outline" disabled={saving || !form.client_company_name} onClick={() => saveMutation.mutate({})}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salva Bozza
              </Button>
              <Button disabled={saving || !form.client_company_name} onClick={() => saveMutation.mutate({ emitNumber: true })}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Emetti Fattura
              </Button>
              <Button variant="secondary" disabled={saving || !form.client_company_name} onClick={() => saveMutation.mutate({ emitNumber: true, sendToProvider: true })}>
                <Send className="h-4 w-4 mr-2" /> Emetti e Invia
              </Button>
            </div>
          )}
        </div>

        {/* PREVIEW — 2 cols */}
        <div className="lg:col-span-2">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">Anteprima</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-4">
              {/* Mini invoice preview */}
              <div className="border rounded-md p-4 bg-white space-y-3">
                <div className="flex justify-between">
                  <div>
                    <p className="font-bold text-sm">{effectiveCompany?.name || "Azienda"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">
                      {form.document_type === "credit_note" ? "NOTA DI CREDITO" : form.document_type === "proforma" ? "PROFORMA" : "FATTURA"}
                    </p>
                    <p>N° {form.invoice_number || "—"}</p>
                    <p>Data: {form.issue_date}</p>
                    {form.due_date && <p>Scadenza: {form.due_date}</p>}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-muted-foreground text-[10px]">Destinatario</p>
                  <p className="font-semibold">{form.client_company_name || "—"}</p>
                  {form.client_vat_number && <p>P.IVA: {form.client_vat_number}</p>}
                  {form.client_address && <p>{form.client_address}</p>}
                  {form.client_city && <p>{form.client_city} {form.client_zip}</p>}
                </div>
                <Separator />
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1">Descrizione</th>
                      <th className="text-right py-1">Q.tà</th>
                      <th className="text-right py-1">Prezzo</th>
                      <th className="text-right py-1">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.filter((l) => l.description).map((l, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1">{l.description}</td>
                        <td className="text-right">{l.quantity}</td>
                        <td className="text-right">{fmtEur(l.unit_price)}</td>
                        <td className="text-right">{fmtEur(l.line_gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-right space-y-0.5">
                  <p>Imponibile: {fmtEur(totals.subtotal)}</p>
                  <p>IVA: {fmtEur(totals.tax)}</p>
                  <p className="font-bold text-sm">TOTALE: {fmtEur(totals.total)}</p>
                </div>
                {form.payment_method && (
                  <>
                    <Separator />
                    <p className="text-muted-foreground">Pagamento: {form.payment_method}</p>
                    {form.bank_iban && <p>IBAN: {form.bank_iban}</p>}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
