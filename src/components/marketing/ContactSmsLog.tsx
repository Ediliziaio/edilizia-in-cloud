import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, ArrowDown, Loader2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ContactSmsLogProps {
  contactId: string;
  companyId: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  queued: { label: "In coda", className: "bg-muted text-muted-foreground" },
  sent: { label: "Inviato", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  delivered: { label: "Consegnato", className: "bg-green-500/15 text-green-600 border-green-500/30" },
  failed: { label: "Fallito", className: "bg-destructive/15 text-destructive border-destructive/30" },
  received: { label: "Ricevuto", className: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
};

export function ContactSmsLog({ contactId, companyId }: ContactSmsLogProps) {
  const queryClient = useQueryClient();
  const queryKey = ["sms_logs", contactId, companyId];

  const { data: logs = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("*")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId && !!companyId,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`sms_logs_contact_${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sms_logs",
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <MessageSquare className="h-8 w-8 opacity-40" />
        <p className="text-sm">Nessun SMS registrato</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {logs.map((log: any) => {
          const isInbound = log.direction === "inbound";
          const status = STATUS_CONFIG[log.status] || STATUS_CONFIG.queued;

          return (
            <div
              key={log.id}
              className={cn(
                "rounded-lg border p-3 text-sm space-y-1.5",
                isInbound ? "bg-violet-500/5 border-violet-500/20" : "bg-card"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isInbound ? (
                    <ArrowDown className="h-3.5 w-3.5 text-violet-500" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5 text-blue-500" />
                  )}
                  <span>{isInbound ? "Ricevuto" : "Inviato"}</span>
                  <span>·</span>
                  <span>{log.from_number} → {log.to_number}</span>
                </div>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", status.className)}>
                  {status.label}
                </Badge>
              </div>

              <p className="text-foreground line-clamp-3">{log.body}</p>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {log.created_at
                    ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: it })
                    : "—"}
                </span>
                {log.cost_eur > 0 && <span>€{Number(log.cost_eur).toFixed(4)}</span>}
              </div>

              {log.error_detail && (
                <p className="text-[11px] text-destructive mt-1">{log.error_detail}</p>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
