import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
const statusLabels: Record<string, string> = {
  sent: "Inviata",
  delivered: "Consegnata",
  queued: "In coda",
  failed: "Fallita",
  bounced: "Respinta",
};
export function CompanyDeliveryHistory({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["company-email-delivery-history", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_delivery_log")
        .select("id, recipient, subject, status, template_type, sent_at")
        .eq("company_id", companyId)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Email inviate dalla piattaforma
        </CardTitle>
        <CardDescription>
          Ultimi 20 invii, comprese email automatiche, inviti e messaggi di
          servizio. Separati dalle comunicazioni annotate dall’operatore.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p role="status">Caricamento invii…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>Impossibile caricare gli invii email.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Riprova
            </Button>
          </div>
        ) : query.data?.length ? (
          <ul className="divide-y">
            {query.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">
                    {row.subject || "Senza oggetto"}
                  </p>
                  <p className="break-all text-muted-foreground">
                    {row.recipient}
                  </p>
                </div>
                <Badge
                  variant={
                    row.status === "failed" || row.status === "bounced"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {statusLabels[row.status] ?? row.status}
                </Badge>
                <time className="text-xs text-muted-foreground">
                  {row.sent_at
                    ? new Date(row.sent_at).toLocaleString("it-IT")
                    : "Data non disponibile"}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessun invio email registrato.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
