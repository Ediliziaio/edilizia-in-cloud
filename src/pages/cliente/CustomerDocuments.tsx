import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Download, Loader2, Receipt, FileCheck } from "lucide-react";
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
    queryKey: queryKeys.customerDocuments.attachments(user?.id),
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
    queryKey: queryKeys.customerDocuments.invoices(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, document_type, status, issue_date, total, pdf_url, order_id, orders(order_code)")
        .eq("client_id", user!.id)
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

  const invoiceStatusMap: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: "Bozza", color: "text-slate-600", bg: "bg-slate-100" },
    sent: { label: "Inviata", color: "text-blue-700", bg: "bg-blue-50" },
    paid: { label: "Pagata", color: "text-emerald-700", bg: "bg-emerald-50" },
    overdue: { label: "Scaduta", color: "text-red-700", bg: "bg-red-50" },
    cancelled: { label: "Annullata", color: "text-gray-500", bg: "bg-gray-100" },
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
      <h1 className="text-xl font-bold tracking-tight">Documenti</h1>

      {!hasContent && (
        <div className="bg-background border border-border/60 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground">Nessun documento disponibile al momento.</p>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Fatture e Documenti Fiscali
          </p>
          <div className="bg-background border border-border/60 rounded-2xl divide-y divide-border/40">
            {invoices.map((inv: any) => {
              const st = invoiceStatusMap[inv.status] || { label: inv.status, color: "text-slate-600", bg: "bg-slate-100" };
              return (
                <div key={inv.id} className="flex items-center justify-between p-4 gap-3 first:rounded-t-2xl last:rounded-b-2xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Receipt className="h-5 w-5 text-blue-600" />
                    </div>
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
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>
                      {st.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{fmtCur(inv.total || 0)}</span>
                    {inv.pdf_url && (
                      <button
                        onClick={() => handleDownloadInvoice(inv.pdf_url)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order Attachments */}
      {attachments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Allegati Ordini
          </p>
          <div className="bg-background border border-border/60 rounded-2xl divide-y divide-border/40">
            {attachments.map((att: any) => (
              <div key={att.id} className="flex items-center justify-between p-4 gap-3 first:rounded-t-2xl last:rounded-b-2xl">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{att.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ordine {att.order?.order_code || "—"}
                      {att.file_size ? ` · ${formatFileSize(att.file_size)}` : ""}
                      {att.created_at && ` · ${format(new Date(att.created_at), "dd MMM yyyy", { locale: it })}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadAttachment(att.file_url, att.file_name)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors shrink-0"
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
