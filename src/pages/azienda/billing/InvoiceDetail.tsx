import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Download, Mail, Loader2, RefreshCw, ExternalLink, Link2 } from "lucide-react";

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

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: linkedTransactions } = useQuery({
    queryKey: ["invoice-reconciliations", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_reconciliations")
        .select("*, bank_transactions:transaction_id(id, booking_date, amount, description, creditor_name, debtor_name, bank_accounts:account_id(display_name))")
        .eq("invoice_id", id!)
        .is("unmatched_at", null)
        .order("matched_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const lines = useMemo(() => {
    if (!invoice?.invoice_lines) return [];
    return [...(invoice.invoice_lines as any[])]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [invoice]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + Number(l.line_net || 0), 0);
    const tax = lines.reduce((s, l) => s + Number(l.line_tax || 0), 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

  // PDF download
  const downloadPdf = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoice_id: id },
      });
      if (error) throw error;
      const html = data?.html;
      if (!html) throw new Error("Empty response");
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    } catch (e) {
      toast.error("Errore generazione PDF", { description: String(e) });
    }
  };

  // Email send
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (emailOpen && invoice?.client_email) setEmailTo(invoice.client_email);
  }, [emailOpen, invoice?.client_email]);

  const sendInvoiceEmail = async () => {
    if (!emailTo) { toast.error("Inserisci un indirizzo email"); return; }
    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoice_id: id, to_email: emailTo, subject: emailSubject || undefined, message: emailMessage || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Email inviata", { description: `Fattura inviata a ${emailTo}` });
      setEmailOpen(false);
      setEmailMessage("");
    } catch (e) {
      toast.error("Errore invio email", { description: String(e) });
    } finally {
      setSendingEmail(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!invoice) {
    return <div className="text-center py-12 text-muted-foreground">Fattura non trovata.</div>;
  }

  const cfg = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/fatturazione")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          Fattura {invoice.invoice_number || "—"}
        </h1>
        <Badge variant="secondary" className={cfg.color}>{cfg.emoji} {cfg.label}</Badge>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <Download className="h-4 w-4 mr-2" /> Scarica PDF
          </Button>
          <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Mail className="h-4 w-4 mr-2" /> Invia via Email
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invia fattura via email</DialogTitle>
                <DialogDescription>Il cliente riceverà un'email con i dettagli della fattura.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Email destinatario *</Label>
                  <Input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="cliente@esempio.it" />
                </div>
                <div>
                  <Label>Oggetto (opzionale)</Label>
                  <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder={`Fattura N° ${invoice.invoice_number || "—"}`} />
                </div>
                <div>
                  <Label>Messaggio personalizzato (opzionale)</Label>
                  <Textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Aggiungi un messaggio..." rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEmailOpen(false)}>Annulla</Button>
                <Button onClick={sendInvoiceEmail} disabled={sendingEmail || !emailTo}>
                  {sendingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Invia
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sync status */}
          {invoice.external_provider && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Importata da {PROVIDER_LABELS[invoice.external_provider] || invoice.external_provider}</p>
                    <p className="text-xs text-muted-foreground">
                      ID esterno: {invoice.external_id || "—"}
                      {(invoice as any).last_synced_at && ` · Ultimo sync: ${format(new Date((invoice as any).last_synced_at), "dd/MM/yyyy HH:mm", { locale: it })}`}
                    </p>
                  </div>
                  {invoice.external_id && (
                    <Badge variant="outline" className="text-xs">
                      <ExternalLink className="h-3 w-3 mr-1" /> Sincronizzata
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Client info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Ragione sociale</p>
                  <p className="font-medium">{invoice.client_company_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">P.IVA</p>
                  <p>{invoice.client_vat_number || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Codice Fiscale</p>
                  <p>{invoice.client_fiscal_code || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Indirizzo</p>
                  <p>{[invoice.client_address, invoice.client_city, invoice.client_zip].filter(Boolean).join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Codice SDI</p>
                  <p>{invoice.client_sdi_code || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">PEC</p>
                  <p>{invoice.client_pec || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lines */}
          <Card>
            <CardHeader><CardTitle className="text-base">Righe fattura</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Descrizione</th>
                      <th className="text-right py-2 font-medium">Q.tà</th>
                      <th className="text-right py-2 font-medium">Prezzo</th>
                      <th className="text-right py-2 font-medium">IVA%</th>
                      <th className="text-right py-2 font-medium">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="py-2">{l.description}</td>
                        <td className="text-right py-2">{l.quantity} {l.unit}</td>
                        <td className="text-right py-2">{fmtEur(Number(l.unit_price))}</td>
                        <td className="text-right py-2">{l.tax_rate}%</td>
                        <td className="text-right py-2 font-medium">{fmtEur(Number(l.line_gross))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

          {/* Linked bank transactions */}
          {linkedTransactions && linkedTransactions.length > 0 && (
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-green-600" /> Pagamenti bancari collegati
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {linkedTransactions.map((rec: any) => {
                    const tx = rec.bank_transactions;
                    return (
                      <div key={rec.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                        <div>
                          <p className="font-medium">{tx?.description || "Transazione"}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx?.booking_date} · {tx?.creditor_name || tx?.debtor_name || ""} · {(tx?.bank_accounts as any)?.display_name || ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">{fmtEur(Number(rec.matched_amount))}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {rec.match_type === "auto" ? "Auto" : "Manuale"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment & Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pagamento e note</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Metodo di pagamento</p>
                  <p>{invoice.payment_method || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">IBAN</p>
                  <p className="font-mono text-xs">{invoice.bank_iban || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Termini di pagamento</p>
                  <p>{invoice.payment_terms || "—"}</p>
                </div>
              </div>
              {invoice.notes && (
                <div className="mt-4">
                  <p className="text-muted-foreground text-xs">Note</p>
                  <p className="text-sm mt-1">{invoice.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - preview */}
        <div>
          <Card className="sticky top-6">
            <CardHeader><CardTitle className="text-base">Riepilogo</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-4">
              <div className="border rounded-md p-4 bg-background space-y-3">
                <div className="flex justify-between">
                  <p className="font-bold text-sm">{effectiveCompany?.name || "Azienda"}</p>
                  <div className="text-right">
                    <p className="font-bold text-sm">
                      {invoice.document_type === "credit_note" ? "NOTA DI CREDITO" : invoice.document_type === "proforma" ? "PROFORMA" : "FATTURA"}
                    </p>
                    <p>N° {invoice.invoice_number || "—"}</p>
                    <p>Data: {invoice.issue_date || "—"}</p>
                    {invoice.due_date && <p>Scadenza: {invoice.due_date}</p>}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-muted-foreground text-[10px]">Destinatario</p>
                  <p className="font-semibold">{invoice.client_company_name || "—"}</p>
                  {invoice.client_vat_number && <p>P.IVA: {invoice.client_vat_number}</p>}
                </div>
                <Separator />
                <div className="text-right space-y-0.5">
                  <p>Imponibile: {fmtEur(totals.subtotal)}</p>
                  <p>IVA: {fmtEur(totals.tax)}</p>
                  <p className="font-bold text-sm">TOTALE: {fmtEur(totals.total)}</p>
                </div>
                {invoice.payment_method && (
                  <>
                    <Separator />
                    <p className="text-muted-foreground">Pagamento: {invoice.payment_method}</p>
                    {invoice.bank_iban && <p>IBAN: {invoice.bank_iban}</p>}
                  </>
                )}
              </div>

              {/* Dates */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data emissione</span>
                  <span>{invoice.issue_date ? format(new Date(invoice.issue_date), "dd/MM/yyyy", { locale: it }) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scadenza</span>
                  <span>{invoice.due_date ? format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: it }) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Importo pagato</span>
                  <span className="font-medium">{fmtEur(Number(invoice.paid_amount || 0))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
