import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { QUOTE_STATUS_CONFIG } from "@/lib/quoteStatus";
import { useSignatureActions } from "@/hooks/useSignatureActions";
import { SendSignatureDialog } from "@/components/marketing/preventivi/SendSignatureDialog";
import { QuoteSignatureStatusCard } from "@/components/marketing/preventivi/QuoteSignatureStatusCard";
import { VersioniPreventivo } from "@/components/marketing/preventivi/VersioniPreventivo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Pencil, Send, FileDown, Loader2, User, FileText, FileCheck,
  MessageCircle, Copy, HardHat, Package, StickyNote,
} from "lucide-react";
import {
  QuotePageHeader,
  QuoteCard,
  QuoteChip,
} from "@/components/marketing/preventivi/ui/builderUI";

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const { sendForSignature, openWhatsApp, copySignatureLink } = useSignatureActions(id);

  const handleGeneratePdf = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
        body: { quote_id: id },
      });
      if (error) throw error;
      if (data?.signed_url) {
        window.open(data.signed_url, "_blank");
      }
      toast.success("PDF generato con successo");
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "errore";
      toast.error("Errore generazione PDF: " + msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleConvertToCantiere = async () => {
    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("converti-preventivo-cantiere", {
        body: { quote_id: id },
      });
      if (error) throw error;
      toast.success("Preventivo convertito in cantiere con successo!");
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      navigate(`/azienda/ordini/${data.order_id}`);
    } catch (e: unknown) {
      const err = e as { context?: { json?: { error?: string } }; message?: string };
      const msg = err?.context?.json?.error || err?.message || "Errore durante la conversione";
      toast.error("Errore conversione: " + msg);
    } finally {
      setConverting(false);
    }
  };

  const companyId = effectiveCompany?.id;

  const { data: quote, isLoading } = useQuery({
    queryKey: queryKeys.quotes.detail(id),
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id!)
        .eq("company_id", companyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: queryKeys.quotes.items(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: queryKeys.quotes.attachments(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_attachments")
        .select("*, quote_pdf_materials(*)")
        .eq("quote_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: versionCount = 0 } = useQuery<number>({
    queryKey: ["quote_versions_count", id],
    enabled: !!id,
    queryFn: async () => {
      // quote_versions is not in generated types — as any required for this table
      const { count, error } = await (supabase as any)
        .from("quote_versions")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", id!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Preventivo non trovato</p>
        <Button variant="link" onClick={() => navigate("/azienda/marketing/preventivi")}>
          Torna alla lista
        </Button>
      </div>
    );
  }

  const sc = QUOTE_STATUS_CONFIG[quote.status as keyof typeof QUOTE_STATUS_CONFIG] || QUOTE_STATUS_CONFIG.bozza;

  return (
    <div className="space-y-6">
      {/* Header (replica FvPageHeader) */}
      <QuotePageHeader
        numero={quote.quote_number}
        title={quote.title || "Preventivo"}
        subtitle={quote.client_name || undefined}
        icon={<FileCheck className="h-5 w-5" />}
        stato={<Badge variant={sc.variant}>{sc.label}</Badge>}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 hidden md:inline-flex"
              onClick={() => navigate("/azienda/marketing/preventivi")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Lista
            </Button>
            <Button variant="outline" onClick={handleGeneratePdf} disabled={generating} className="h-9">
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
              {generating ? "Generando..." : "Genera PDF"}
            </Button>

            {quote.status === "bozza" && (
              <Button
                variant="outline"
                onClick={() => navigate(`/azienda/marketing/preventivi/${id}/modifica`)}
                className="h-9"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Modifica
              </Button>
            )}

            {(quote.status === "bozza" || quote.status === "inviata") && (
              <button
                type="button"
                onClick={() => setSendDialogOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md text-white transition-all bg-gradient-to-br from-orange-500 to-amber-400 shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(249,115,22,0.4)] h-9"
              >
                <Send className="h-4 w-4" />
                {quote.status === "inviata" ? "Reinvia" : "Invia per Firma"}
              </button>
            )}

            {quote.status === "accettata" && (
              <button
                type="button"
                onClick={handleConvertToCantiere}
                disabled={converting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md text-white transition-all bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,185,129,0.4)] disabled:opacity-50 h-9"
              >
                {converting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <HardHat className="h-4 w-4" />}
                {converting ? "Conversione..." : "Converti in Cantiere"}
              </button>
            )}

            {/* WhatsApp e copia link — visibili solo se il preventivo è stato inviato */}
            {quote.status === "inviata" && quote.signature_token && (
              <>
                <Button
                  variant="outline"
                  className="gap-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 h-9"
                  aria-label="Invia link firma via WhatsApp"
                  onClick={() => openWhatsApp(quote)}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Copia link firma negli appunti"
                  onClick={() => copySignatureLink(quote)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </>
            )}
          </>
        }
      />

      <Tabs defaultValue="offerta">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="offerta" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm gap-1.5">
            <Package className="h-3.5 w-3.5" /> Offerta
          </TabsTrigger>
          <TabsTrigger value="cliente" className="data-[state=active]:bg-white gap-1.5">
            <User className="h-3.5 w-3.5" /> Cliente
          </TabsTrigger>
          <TabsTrigger value="documenti" className="data-[state=active]:bg-white gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Documenti ({attachments.length})
          </TabsTrigger>
          <TabsTrigger value="attivita" className="data-[state=active]:bg-white">Attività</TabsTrigger>
          <TabsTrigger value="versioni" className="gap-1.5 data-[state=active]:bg-white">
            Versioni
            {versionCount > 0 && (
              <QuoteChip variant="orange" className="ml-0.5">{versionCount}</QuoteChip>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offerta" className="space-y-6 mt-4">
          <QuoteCard title="Prodotti e Servizi" icon={<Package className="h-4 w-4" />}>
              {items.length === 0 ? (
                <p className="text-slate-500 text-sm">Nessun prodotto</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prodotto</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="text-right">Qtà</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">Sconto</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {item.description || "—"}
                        </TableCell>
                        <TableCell className="text-right">{item.quantity} {item.unit_of_measure}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right">
                          {item.discount_percent > 0 ? `${item.discount_percent}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right">{item.vat_rate}%</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.line_total || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <div className="mt-4 flex justify-end">
                <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 space-y-1.5 text-sm shadow-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Subtotale</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.subtotal || 0)}</span>
                  </div>
                  {(quote.discount_percent || 0) > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Sconto {quote.discount_percent}%</span>
                      <span className="tabular-nums">-{formatCurrency(quote.discount_amount || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">IVA</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.vat_amount || 0)}</span>
                  </div>
                  <div className="border-t border-slate-200 my-2" />
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-base">Totale</span>
                    <span className="text-2xl tabular-nums text-orange-600">{formatCurrency(quote.total || 0)}</span>
                  </div>
                </div>
              </div>
          </QuoteCard>

          {(quote.notes || quote.description) && (
            <QuoteCard title="Note" icon={<StickyNote className="h-4 w-4" />}>
              <div className="space-y-3 text-sm">
                {quote.description && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Descrizione</p>
                    <p className="text-slate-700">{quote.description}</p>
                  </div>
                )}
                {quote.notes && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Note per il cliente</p>
                    <p className="text-slate-700">{quote.notes}</p>
                  </div>
                )}
              </div>
            </QuoteCard>
          )}
        </TabsContent>

        <TabsContent value="cliente" className="mt-4">
          <QuoteCard
            title="Dati Cliente"
            icon={<User className="h-4 w-4" />}
            action={
              quote.contact_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/azienda/marketing/contatti/${quote.contact_id}`)}
                >
                  <User className="h-4 w-4 mr-2" />
                  Vedi nel CRM
                </Button>
              ) : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nome</p>
                <p className="font-medium text-slate-900">{quote.client_name || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</p>
                <p className="font-medium text-slate-900">{quote.client_email || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Telefono</p>
                <p className="font-medium text-slate-900">{quote.client_phone || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Azienda</p>
                <p className="font-medium text-slate-900">{quote.client_company || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Codice Fiscale</p>
                <p className="font-medium text-slate-900">{quote.client_fiscal_code || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">P.IVA</p>
                <p className="font-medium text-slate-900">{quote.client_vat_number || "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Indirizzo</p>
                <p className="font-medium text-slate-900">{quote.client_address || "—"}</p>
              </div>
            </div>
          </QuoteCard>
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <QuoteCard title="Documenti Allegati" icon={<FileText className="h-4 w-4" />}>
            {attachments.length === 0 ? (
              <p className="text-slate-500 text-sm">Nessun documento allegato</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-orange-50/50 hover:border-orange-200 transition-colors"
                  >
                    <FileText className="h-5 w-5 text-orange-500" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{a.quote_pdf_materials?.name || "—"}</p>
                      <p className="text-xs text-slate-500">{a.quote_pdf_materials?.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </QuoteCard>
        </TabsContent>

        <TabsContent value="attivita" className="mt-4">
          <QuoteSignatureStatusCard
            status={quote.status}
            createdAt={quote.created_at}
            sentAt={quote.sent_at}
            viewedAt={quote.viewed_at}
            signedAt={quote.signed_at}
            signedByName={quote.signed_by_name}
            signedByIp={quote.signed_by_ip}
            refusedAt={quote.refused_at}
            refusedReason={quote.refused_reason}
            expiresAt={quote.expires_at}
          />
        </TabsContent>

        <TabsContent value="versioni" className="mt-4">
          <VersioniPreventivo quoteId={id!} />
        </TabsContent>
      </Tabs>

      {/* Send Signature Dialog */}
      <SendSignatureDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        clientEmail={quote.client_email}
        clientName={quote.client_name}
        quoteNumber={quote.quote_number}
        onSend={(params) => sendForSignature.mutateAsync(params)}
        isSending={sendForSignature.isPending}
      />
    </div>
  );
}
