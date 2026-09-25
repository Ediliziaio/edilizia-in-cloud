import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Euro } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";

interface Props {
  contactId: string;
  companyId: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Bozza", variant: "secondary" },
  sent: { label: "Inviata", variant: "default" },
  delivered: { label: "Consegnata", variant: "default" },
  paid: { label: "Pagata", variant: "outline" },
  overdue: { label: "Scaduta", variant: "destructive" },
  cancelled: { label: "Annullata", variant: "secondary" },
};

export function ContactInvoicesPanel({ contactId, companyId }: Props) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["contact-invoices", contactId],
    queryFn: async () => {
      // Find invoices linked to this contact via client_email or contact_id
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, issue_date, due_date, total, paid_amount, status, client_company_name, type")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .order("issue_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as {
        id: string;
        invoice_number: string | null;
        issue_date: string | null;
        due_date: string | null;
        total: number;
        paid_amount: number | null;
        status: string;
        client_company_name: string | null;
        type: string;
      }[];
    },
    enabled: !!contactId && !!companyId,
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  return (
    <div className="space-y-3">
      {/* Summary KPIs */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <p className="text-[9px] text-muted-foreground">Fatturato</p>
            <p className="text-xs font-semibold">€{totalInvoiced.toLocaleString("it-IT", { minimumFractionDigits: 0 })}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <p className="text-[9px] text-muted-foreground">Incassato</p>
            <p className="text-xs font-semibold text-emerald-600">€{totalPaid.toLocaleString("it-IT", { minimumFractionDigits: 0 })}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-center">
            <p className="text-[9px] text-muted-foreground">Da incassare</p>
            <p className="text-xs font-semibold text-amber-600">€{totalOutstanding.toLocaleString("it-IT", { minimumFractionDigits: 0 })}</p>
          </div>
        </div>
      )}

      {/* Invoice list */}
      <div className="space-y-1.5">
        {invoices.map((inv) => {
          const st = STATUS_MAP[inv.status] || { label: inv.status, variant: "secondary" as const };
          const remaining = (inv.total || 0) - (inv.paid_amount || 0);
          return (
            <Link
              key={inv.id}
              to={`/azienda/fatturazione/${inv.id}`}
              className="block rounded-lg border p-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium truncate">
                    {inv.invoice_number || "—"}
                  </span>
                </div>
                <Badge variant={st.variant} className="text-[9px] h-4 px-1.5 shrink-0">
                  {st.label}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {inv.issue_date ? format(new Date(inv.issue_date), "dd MMM yyyy", { locale: it }) : "—"}
                </span>
                <div className="flex items-center gap-1">
                  <Euro className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium">
                    {(inv.total || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </span>
                  {remaining > 0 && inv.status !== "paid" && (
                    <span className="text-[9px] text-amber-600 ml-1">
                      (res. €{remaining.toLocaleString("it-IT", { minimumFractionDigits: 0 })})
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        {invoices.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-6">Nessuna fattura collegata</p>
        )}
      </div>
    </div>
  );
}
