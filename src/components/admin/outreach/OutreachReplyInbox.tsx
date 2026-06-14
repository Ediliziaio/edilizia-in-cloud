import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Inbox, Mail, MessageSquare, Phone, Check, CheckCheck, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { isMissingTableError, MigrationGate } from "./_shared";

/**
 * Inbox risposte unificata (Fase 1) — outreach_replies della migrazione
 * 20270815000000. È la priorità #1 della giornata: le risposte calde vanno
 * lavorate e trasformate in opportunità. Gate finché la migrazione non è applicata.
 */

const T_REPLIES = "outreach_replies";

interface Reply {
  id: string; channel: string; from_email: string | null; from_phone: string | null;
  subject: string | null; snippet: string | null; status: string; received_at: string;
  contact_id: string | null;
}

const CH_ICON: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageSquare, sms: Phone };

export function OutreachReplyInbox({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"unread" | "all">("unread");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const q = useQuery({
    queryKey: ["outreach-replies", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.from(T_REPLIES).select("*").eq("company_id", companyId).order("received_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Reply[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from(T_REPLIES).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach-replies", companyId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  if (q.isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.error && isMissingTableError(q.error)) {
    return <MigrationGate title="Inbox risposte — pronto" unlocks={[
      "Risposte email/WhatsApp/SMS in un unico posto, legate a contatto e sequenza.",
      "La priorità #1 della giornata: rispondi e chiudi le trattative calde.",
      "Un clic per trasformare una risposta in opportunità nel CRM.",
    ]} />;
  }
  if (q.error) return <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-red-600"><AlertTriangle className="h-4 w-4" /> Errore: {q.error instanceof Error ? q.error.message : "imprevisto"}</CardContent></Card>;

  const all = q.data ?? [];
  const unreadCount = all.filter((r) => r.status === "unread").length;
  const rows = filter === "unread" ? all.filter((r) => r.status === "unread") : all;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-5 w-5 text-orange-500" /> Risposte da lavorare
          {unreadCount > 0 && <Badge className="bg-orange-500">{unreadCount}</Badge>}
        </CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant={filter === "unread" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("unread")}>Da leggere</Button>
          <Button size="sm" variant={filter === "all" ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setFilter("all")}>Tutte</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filter === "unread" ? "Nessuna risposta da leggere. 🎉" : "Nessuna risposta ancora."}
          </p>
        ) : rows.map((r) => {
          const Icon = CH_ICON[r.channel] ?? Mail;
          const unread = r.status === "unread";
          return (
            <div key={r.id} className={`flex items-start gap-3 rounded-lg border p-3 ${unread ? "border-orange-200 bg-orange-50/30" : ""}`}>
              <div className="mt-0.5 rounded-lg bg-muted p-1.5"><Icon className="h-4 w-4 text-muted-foreground" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>{r.from_email || r.from_phone || "—"}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(r.received_at)}</span>
                  {r.status === "handled" && <Badge variant="secondary" className="text-[10px]">gestita</Badge>}
                </div>
                {r.subject && <div className="truncate text-sm">{r.subject}</div>}
                {r.snippet && <p className="line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {unread && <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setStatus.mutate({ id: r.id, status: "read" })}><Check className="h-3.5 w-3.5" /> Letta</Button>}
                {r.status !== "handled" && <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setStatus.mutate({ id: r.id, status: "handled" })}><CheckCheck className="h-3.5 w-3.5" /> Gestita</Button>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: it });
  } catch {
    return "";
  }
}
