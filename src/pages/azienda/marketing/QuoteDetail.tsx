import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Pencil,
  Send,
  CheckCircle,
  XCircle,
  FileDown,
  Loader2,
  User,
  FileText,
  Clock,
  Eye,
} from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  bozza: { label: "Bozza", variant: "secondary", color: "text-muted-foreground" },
  inviata: { label: "Inviata", variant: "default", color: "text-blue-600" },
  accettata: { label: "Accettata", variant: "default", color: "text-green-600" },
  rifiutata: { label: "Rifiutata", variant: "destructive", color: "text-red-600" },
  scaduta: { label: "Scaduta", variant: "outline", color: "text-orange-600" },
};

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ["quote", id] });
    } catch (e: any) {
      toast.error("Errore generazione PDF: " + (e.message || "errore"));
    } finally {
      setGenerating(false);
    }
  };

  const handleSendForSignature = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-quote-signature", {
        body: { quote_id: id },
      });
      if (error) throw error;
      toast.success("Offerta inviata al cliente");
      queryClient.invalidateQueries({ queryKey: ["quote", id] });
    } catch (e: any) {
      toast.error("Errore invio: " + (e.message || "errore"));
    } finally {
      setSending(false);
    }
  };

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["quote-items", id],
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
    queryKey: ["quote-attachments-detail", id],
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

  const sc = statusConfig[quote.status] || statusConfig.bozza;

  // Timeline events
  const timelineEvents = [
    { label: "Creato", date: quote.created_at, icon: FileText },
    quote.sent_at ? { label: "Inviato", date: quote.sent_at, icon: Send } : null,
    quote.viewed_at ? { label: "Visualizzato", date: quote.viewed_at, icon: Eye } : null,
    quote.signed_at
      ? { label: `Firmato da ${quote.signed_by_name || "—"}`, date: quote.signed_at, icon: CheckCircle }
      : null,
    quote.refused_at
      ? { label: "Rifiutato", date: quote.refused_at, icon: XCircle }
      : null,
  ].filter(Boolean) as { label: string; date: string; icon: any }[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/marketing/preventivi")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{quote.quote_number}</h1>
            <Badge variant={sc.variant}>{sc.label}</Badge>
          </div>
          <p className="text-muted-foreground">{quote.title}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Generate PDF */}
          <Button variant="outline" onClick={handleGeneratePdf} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            {generating ? "Generando..." : "Genera PDF"}
          </Button>

          {/* Edit (only draft) */}
          {quote.status === "bozza" && (
            <Button
              variant="outline"
              onClick={() => navigate(`/azienda/marketing/preventivi/${id}/modifica`)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Modifica
            </Button>
          )}

          {/* Send for signature (draft or already sent) */}
          {(quote.status === "bozza" || quote.status === "inviata") && quote.client_email && (
            <Button onClick={handleSendForSignature} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {sending ? "Invio..." : quote.status === "inviata" ? "Reinvia" : "Invia per Firma"}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="offerta">
        <TabsList>
          <TabsTrigger value="offerta">Offerta</TabsTrigger>
          <TabsTrigger value="cliente">Cliente</TabsTrigger>
          <TabsTrigger value="documenti">Documenti ({attachments.length})</TabsTrigger>
          <TabsTrigger value="attivita">Attività</TabsTrigger>
        </TabsList>

        <TabsContent value="offerta" className="space-y-6 mt-4">
          {/* Items table */}
          <Card>
            <CardHeader>
              <CardTitle>Prodotti e Servizi</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nessun prodotto</p>
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
                    {items.map((item: any) => (
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

              {/* Totals */}
              <div className="mt-4 flex justify-end">
                <div className="w-full max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotale</span>
                    <span>{formatCurrency(quote.subtotal || 0)}</span>
                  </div>
                  {(quote.discount_percent || 0) > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Sconto {quote.discount_percent}%</span>
                      <span>-{formatCurrency(quote.discount_amount || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA</span>
                    <span>{formatCurrency(quote.vat_amount || 0)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Totale</span>
                    <span>{formatCurrency(quote.total || 0)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {(quote.notes || quote.description) && (
            <Card>
              <CardHeader>
                <CardTitle>Note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {quote.description && (
                  <div>
                    <p className="text-muted-foreground font-medium">Descrizione</p>
                    <p>{quote.description}</p>
                  </div>
                )}
                {quote.notes && (
                  <div>
                    <p className="text-muted-foreground font-medium">Note per il cliente</p>
                    <p>{quote.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cliente" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Dati Cliente
                </div>
                {quote.contact_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/azienda/marketing/contatti/${quote.contact_id}`)}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Vedi nel CRM
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Nome</p>
                  <p className="font-medium">{quote.client_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{quote.client_email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Telefono</p>
                  <p className="font-medium">{quote.client_phone || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Azienda</p>
                  <p className="font-medium">{quote.client_company || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Codice Fiscale</p>
                  <p className="font-medium">{quote.client_fiscal_code || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">P.IVA</p>
                  <p className="font-medium">{quote.client_vat_number || "—"}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Indirizzo</p>
                  <p className="font-medium">{quote.client_address || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Documenti Allegati</CardTitle>
            </CardHeader>
            <CardContent>
              {attachments.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nessun documento allegato</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{a.quote_pdf_materials?.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{a.quote_pdf_materials?.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attivita" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timelineEvents.map((ev, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-muted p-1.5">
                      <ev.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{ev.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ev.date), "dd MMM yyyy HH:mm", { locale: it })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {quote.refused_reason && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-lg text-sm">
                  <p className="font-medium text-destructive">Motivo rifiuto:</p>
                  <p>{quote.refused_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
