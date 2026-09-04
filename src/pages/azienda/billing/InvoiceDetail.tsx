import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Mail, Loader2, RefreshCw, ExternalLink, Link2, Briefcase } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();

  const { data: invoice, isLoading } = useQuery({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!effectiveCompany?.id,
  });

  const { data: linkedTransactions } = useQuery({
    queryKey: queryKeys.invoices.reconciliations(id),
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

  // Commesse dell'azienda — per collegare la fattura a una commessa (utile soprattutto
  // per le fatture importate da gestionali esterni, che non nascono da una commessa).
  const queryClient = useQueryClient();
  const [linkingOrder, setLinkingOrder] = useState(false);
  const { data: orders } = useQuery({
    queryKey: ["orders-for-invoice-link", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_code, description, client_company, client_name, status")
        .eq("company_id", effectiveCompany!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const linkedOrder = useMemo(
    () => (invoice?.order_id ? orders?.find((o) => o.id === invoice.order_id) ?? null : null),
    [orders, invoice],
  );

  // Suggerimento per cliente (solo se univoco): match per nome azienda/cliente, normalizzato.
  const suggestedOrder = useMemo(() => {
    if (!invoice || invoice.order_id || !orders?.length) return null;
    const norm = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = norm(invoice.client_company_name);
    if (target.length < 3) return null;
    const matches = orders.filter((o) => {
      const a = norm(o.client_company), b = norm(o.client_name);
      return (a && (a === target || a.includes(target) || target.includes(a))) ||
             (b && (b === target || b.includes(target) || target.includes(b)));
    });
    return matches.length === 1 ? matches[0] : null;
  }, [invoice, orders]);

  async function linkOrder(orderId: string | null) {
    if (!id || !effectiveCompany?.id) return;
    setLinkingOrder(true);
    const { error } = await supabase.from("invoices").update({ order_id: orderId }).eq("id", id).eq("company_id", effectiveCompany.id);
    setLinkingOrder(false);
    if (error) { toast.error("Errore nel collegamento della commessa"); return; }
    toast.success(orderId ? "Commessa collegata" : "Commessa scollegata");
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
  }

  const lines = useMemo(() => {
    if (!invoice?.invoice_lines) return [];
    return [...(invoice.invoice_lines as any[])]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [invoice]);

  const totals = useMemo(() => {
    const lineSubtotal = lines.reduce((s, l) => s + Number(l.line_net || 0), 0);
    const lineTax = lines.reduce((s, l) => s + Number(l.line_tax || 0), 0);
    // Fall back to invoice-level totals when line_tax is missing (e.g. pre-fix imports)
    const subtotal = lineSubtotal > 0 ? lineSubtotal : Number(invoice?.subtotal || 0);
    const tax = lineTax > 0 ? lineTax : Number(invoice?.tax_amount || 0);
    const total = subtotal + tax || Number(invoice?.total || 0);
    return { subtotal, tax, total };
  }, [lines, invoice]);

  const fmtEur = (n: number) => formatCurrency(n);

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

  // Alla apertura della dialog precompiliamo destinatario, oggetto e un MESSAGGIO
  // TEMPLATE professionale (modificabile), così l'invio non parte da un campo vuoto.
  // Solo se i campi sono ancora vuoti: non sovrascrive le modifiche dell'utente.
  useEffect(() => {
    if (!emailOpen || !invoice) return;
    const docLabel = invoice.document_type === "credit_note" ? "Nota di credito"
      : invoice.document_type === "proforma" ? "Proforma" : "Fattura";
    if (invoice.client_email) setEmailTo((p) => p || invoice.client_email);
    const azienda = effectiveCompany?.name || "";
    setEmailSubject((p) => p || `${docLabel} N° ${invoice.invoice_number || "—"}${azienda ? ` — ${azienda}` : ""}`);
    setEmailMessage((p) => {
      if (p) return p;
      const dataEm = invoice.issue_date ? format(new Date(invoice.issue_date), "dd/MM/yyyy", { locale: it }) : "";
      const importo = formatCurrency(Number(invoice.total || 0));
      const scadenza = invoice.due_date ? format(new Date(invoice.due_date), "dd/MM/yyyy", { locale: it }) : "";
      return [
        `Gentile ${invoice.client_company_name || "Cliente"},`,
        ``,
        `in allegato trovate la ${docLabel.toLowerCase()} N° ${invoice.invoice_number || "—"}${dataEm ? ` del ${dataEm}` : ""} per un importo di ${importo}.`,
        scadenza ? `Vi ricordiamo che il termine di pagamento è il ${scadenza}.` : ``,
        `Per qualsiasi necessità restiamo a vostra disposizione.`,
        ``,
        `Cordiali saluti,`,
        azienda || `Lo staff`,
      ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
    });
  }, [emailOpen, invoice, effectiveCompany?.name]);

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
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => navigate("/azienda/fatturazione")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          Fattura {invoice.invoice_number || "—"}
        </h1>
        <Badge variant="secondary" className={cfg.color}>{cfg.emoji} {cfg.label}</Badge>
        <div className="flex items-center gap-2 ml-auto">
          {/* Niente export su telefono. */}
          {!isMobile && (
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-2" /> Scarica PDF
            </Button>
          )}
          <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Mail className="h-4 w-4 mr-2" /> Invia via Email
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto max-h-[90vh] overflow-y-auto">
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
                  <Label>Messaggio (template precompilato, modificabile)</Label>
                  <Textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Aggiungi un messaggio..." rows={9} className="resize-y" />
                  <p className="text-xs text-muted-foreground mt-1">Il riepilogo della fattura (righe e totali) viene aggiunto automaticamente sotto il messaggio.</p>
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
                      <tr key={l.id ?? `${l.description}-${i}`} className="border-b">
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

          {/* Commessa — collega la fattura a una commessa (manuale + auto-suggerimento per cliente).
              Utile soprattutto per le fatture importate da gestionali esterni, prive di commessa. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" /> Commessa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoice.order_id ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{linkedOrder?.order_code || "Commessa collegata"}</p>
                    {linkedOrder?.description && <p className="text-xs text-muted-foreground truncate">{linkedOrder.description}</p>}
                  </div>
                  <Button variant="ghost" size="sm" disabled={linkingOrder} onClick={() => linkOrder(null)}>Scollega</Button>
                </div>
              ) : (
                <>
                  {suggestedOrder && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                      <div className="min-w-0 text-sm">
                        <span className="text-muted-foreground text-xs">Suggerita: </span>
                        <span className="font-medium">{suggestedOrder.order_code || suggestedOrder.client_company}</span>
                      </div>
                      <Button size="sm" disabled={linkingOrder} onClick={() => linkOrder(suggestedOrder.id)}>Collega</Button>
                    </div>
                  )}
                  <Select onValueChange={(v) => linkOrder(v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Collega a una commessa…" /></SelectTrigger>
                    <SelectContent>
                      {(orders || []).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_code ? `${o.order_code} — ` : ""}{o.description || o.client_company || o.client_name || o.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Le fatture da gestionali esterni non hanno una commessa: collegala qui, oppure scrivi il codice commessa nell'oggetto della fattura sul gestionale per il collegamento automatico all'import.
                  </p>
                </>
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
