import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  FileText,
  Camera,
  Clock,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const intentIcons: Record<string, any> = {
  rapportino: FileText,
  ddt: FileText,
  foto_cantiere: Camera,
  presenze: Clock,
  segnalazione: AlertTriangle,
  domanda: HelpCircle,
  unknown: MessageSquare,
};

const intentLabels: Record<string, string> = {
  rapportino: "Rapportino",
  ddt: "DDT",
  foto_cantiere: "Foto",
  presenze: "Presenze",
  segnalazione: "Segnalazione",
  domanda: "Domanda",
  conferma: "Conferma",
  annulla: "Annulla",
  unknown: "Messaggio",
};

const statusIcons: Record<string, any> = {
  received: Loader2,
  processing: Loader2,
  processed: CheckCircle2,
  failed: XCircle,
  requires_confirmation: Clock,
};

interface WhatsAppActivityFeedProps {
  cantiereId: string;
}

export function WhatsAppActivityFeed({ cantiereId }: WhatsAppActivityFeedProps) {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["wa-activity-feed", cantiereId, companyId],
    queryFn: async () => {
      if (!companyId || !cantiereId) return [];
      const { data } = await supabase
        .from("whatsapp_messages")
        .select(`
          id, wa_message_id, direction, from_phone, message_type,
          content_text, ai_intent, ai_confidence, processing_status,
          linked_record_type, linked_record_id, created_at,
          operaio_id, employees!whatsapp_messages_operaio_id_fkey(first_name, last_name)
        `)
        .eq("company_id", companyId)
        .eq("cantiere_id", cantiereId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!companyId && !!cantiereId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!companyId || !cantiereId) return;
    const channel = supabase
      .channel(`wa-feed-${cantiereId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `cantiere_id=eq.${cantiereId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["wa-activity-feed", cantiereId, companyId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, cantiereId, queryClient]);

  const pendingCount = messages.filter(
    (m: any) => m.processing_status === "received" || m.processing_status === "processing"
  ).length;

  if (isLoading) {
    return null;
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            Attivita WhatsApp
          </CardTitle>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {pendingCount} in elaborazione
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-3">
            {messages.map((msg: any) => {
              const IntentIcon = intentIcons[msg.ai_intent || "unknown"] || MessageSquare;
              const StatusIcon = statusIcons[msg.processing_status] || CheckCircle2;
              const employee = msg.employees;
              const name = employee
                ? `${employee.first_name} ${employee.last_name}`
                : msg.from_phone;

              return (
                <div key={msg.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <IntentIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {intentLabels[msg.ai_intent || "unknown"]}
                      </Badge>
                      <StatusIcon
                        className={`h-3 w-3 flex-shrink-0 ${
                          msg.processing_status === "processed"
                            ? "text-green-500"
                            : msg.processing_status === "failed"
                            ? "text-red-500"
                            : "text-yellow-500 animate-spin"
                        }`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {msg.content_text || `[${msg.message_type}]`}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: it })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
