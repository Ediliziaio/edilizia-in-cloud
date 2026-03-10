import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Download, Loader2, Receipt, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

const fmtCur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export default function CustomerDocuments() {
  const { user } = useAuth();

  // Order attachments visible to customer
  const { data: attachments = [], isLoading: loadingAtt } = useQuery({
    queryKey: ["customer-documents", "attachments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_attachments")
        .select(`
          id, file_name, file_url, file_type, file_size, created_at,
          order:orders!inner(id, order_code, description, customer_id)
        `)
        .eq("visible_to_customer", true)
        .eq("order.customer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Invoices linked to customer
  const { data: invoices = [], isLoading: loadingInv } = useQuery({
    queryKey: ["customer-documents", "invoices", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, document_type, status, issue_date, total, pdf_url, order_id, orders(order_code)")
        .or(`client_id.eq.${user!.id},order_id.not.is.null`)
        .order("issue_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = loadingAtt || loadingInv;

  async function handleDownloadAttachment(fileUrl: string, fileName: string) {
    try {
      // If it's a storage path, create signed URL
      if (fileUrl.startsWith("order-attachments/")) {
        const { data, error } = await supabase.storage
          .from("order-attachments")
          .createSignedUrl(fileUrl.replace("order-attachments/", ""), 3600);
        if (error) throw error;
        window.open(data.signedUrl, "_blank");
      } else {
        window.open(fileUrl, "_blank");
      }
    } catch {
      toast.error("Errore nel download del file");
    }
  }

  async function handleDownloadInvoice(pdfUrl: string) {
    try {
      if (pdfUrl.startsWith("http")) {
        window.open(pdfUrl, "_blank");
      } else {
        // storage path
        const bucketMatch = pdfUrl.match(/^([^/]+)\/(.*)/);
        if (bucketMatch) {
          const { data, error } = await supabase.storage
            .from(bucketMatch[1])
            .createSignedUrl(bucketMatch[2], 3600);
          if (error) throw error;
          window.open(data.signedUrl, "_blank");
        }
      }
    } catch {
      toast.error("Errore nel download della fattura");
    }
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const invoiceStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Bozza", variant: "secondary" },
    sent: { label: "Inviata", variant: "default" },
    paid: { label: "Pagata", variant: "default" },
    overdue: { label: "Scaduta", variant: "destructive" },
    cancelled: { label: "Annullata", variant: "outline" },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const hasContent = attachments.length > 0 || invoices.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Documenti</h1>

      {!hasContent && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Nessun documento disponibile al momento.</p>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-primary" />
              Fatture e Documenti Fiscali
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invoices.map((inv: any) => {
              const st = invoiceStatusMap[inv.status] || { label: inv.status, variant: "secondary" as const };
              return (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {inv.document_type === "credit_note" ? "Nota di credito" : "Fattura"} {inv.invoice_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.issue_date ? format(new Date(inv.issue_date), "dd MMM yyyy", { locale: it }) : "—"}
                        {inv.orders?.order_code && ` · Ordine ${inv.orders.order_code}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <span className="text-sm font-medium">{fmtCur(inv.total || 0)}</span>
                    {inv.pdf_url && (
                      <Button size="icon" variant="ghost" onClick={() => handleDownloadInvoice(inv.pdf_url)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Order Attachments */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-5 w-5 text-primary" />
              Allegati Ordini
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attachments.map((att: any) => (
              <div key={att.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{att.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ordine {att.order?.order_code || "—"}
                      {att.file_size ? ` · ${formatFileSize(att.file_size)}` : ""}
                      {att.created_at && ` · ${format(new Date(att.created_at), "dd MMM yyyy", { locale: it })}`}
                    </p>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => handleDownloadAttachment(att.file_url, att.file_name)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
