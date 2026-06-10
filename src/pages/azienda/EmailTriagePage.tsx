/**
 * EmailTriagePage — GAP 7 (Email Triage AI)
 *
 * Pagina admin azienda: lista email ricevute via webhook + classificazione AI.
 * Filtri per category/priority + drill-down per email.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Inbox, Mail, AlertCircle, Briefcase, Receipt, ShieldAlert, FileText, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailRow {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  ai_category: string | null;
  ai_priority: string | null;
  ai_summary: string | null;
  ai_suggested_action: string | null;
  status: string;
}

const CATEGORY_LABEL: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  lead: { label: "Lead", color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: Briefcase },
  cliente_esistente: { label: "Cliente", color: "bg-blue-100 text-blue-700 border-blue-300", icon: Mail },
  fornitore: { label: "Fornitore", color: "bg-violet-100 text-violet-700 border-violet-300", icon: Briefcase },
  fattura: { label: "Fattura", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Receipt },
  pratica_amministrativa: { label: "Pratica", color: "bg-orange-100 text-orange-700 border-orange-300", icon: FileText },
  spam: { label: "Spam", color: "bg-rose-100 text-rose-700 border-rose-300", icon: ShieldAlert },
  altro: { label: "Altro", color: "bg-slate-100 text-slate-700 border-slate-300", icon: Mail },
  pending: { label: "In attesa", color: "bg-muted text-muted-foreground", icon: Sparkles },
};

const PRIORITY_BADGE: Record<string, string> = {
  alta: "bg-rose-500 text-white",
  media: "bg-amber-500 text-white",
  bassa: "bg-slate-400 text-white",
  nessuna: "bg-muted text-muted-foreground",
};

type FilterTab = "all" | "lead" | "cliente_esistente" | "fattura" | "pending" | "alta_priorita";

export default function EmailTriagePage() {
  const { effectiveCompany } = useAuth();
  const [tab, setTab] = useState<FilterTab>("all");

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["email-inbox", effectiveCompany?.id, tab],
    enabled: !!effectiveCompany?.id,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<EmailRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("email_inbox")
        .select("id, from_email, from_name, subject, received_at, ai_category, ai_priority, ai_summary, ai_suggested_action, status")
        .eq("company_id", effectiveCompany!.id)
        .order("received_at", { ascending: false })
        .limit(100);
      if (tab === "alta_priorita") q = q.eq("ai_priority", "alta");
      else if (tab !== "all") q = q.eq("ai_category", tab);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EmailRow[];
    },
  });

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Inbox className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Email Triage AI</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI legge le email in ingresso, le classifica (lead/cliente/fattura/spam) e suggerisce l'azione.
          </p>
        </div>
      </div>

      <Card className="bg-violet-50/50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-violet-600" />
            Setup webhook (one-time)
          </CardTitle>
          <CardDescription className="text-xs space-y-1">
            <p>
              Per attivare l'ingest automatico, configura un servizio inbound email (Resend/Mailgun/Postmark)
              con webhook su <code className="bg-muted px-1 rounded">POST /functions/v1/email-triage-ai</code>{" "}
              + header <code className="bg-muted px-1 rounded">x-inbound-secret: $INBOUND_EMAIL_SECRET</code>.
            </p>
            <p>
              Aggiungi <code className="bg-muted px-1 rounded">inbound_email_address</code> in companies con
              l'indirizzo a cui forwardare le email aziendali. Tu fai forward da Gmail/Outlook a quell'address.
            </p>
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">Tutte ({emails.length})</TabsTrigger>
          <TabsTrigger value="alta_priorita">⚠️ Alta priorità</TabsTrigger>
          <TabsTrigger value="lead">Lead</TabsTrigger>
          <TabsTrigger value="cliente_esistente">Clienti</TabsTrigger>
          <TabsTrigger value="fattura">Fatture</TabsTrigger>
          <TabsTrigger value="pending">Da triagiare</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nessuna email per questo filtro.</p>
              <p className="text-xs mt-1">
                Le email arrivano qui solo se hai configurato il webhook inbound (vedi sopra).
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {emails.map((email) => {
                const cat = CATEGORY_LABEL[email.ai_category ?? "pending"] ?? CATEGORY_LABEL.pending;
                const Icon = cat.icon;
                return (
                  <div key={email.id} className="p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center",
                        cat.color,
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-medium truncate">
                            {email.from_name ?? email.from_email}
                          </p>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(email.received_at).toLocaleString("it-IT", {
                              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                          {email.ai_priority && email.ai_priority !== "nessuna" && (
                            <Badge className={cn("text-[10px] h-4 px-1.5", PRIORITY_BADGE[email.ai_priority])}>
                              {email.ai_priority}
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", cat.color)}>
                            {cat.label}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate mb-0.5">
                          {email.subject ?? "(no subject)"}
                        </p>
                        {email.ai_summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                            <Sparkles className="h-3 w-3 inline mr-1 text-violet-500" />
                            {email.ai_summary}
                          </p>
                        )}
                        {email.ai_suggested_action && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Azione suggerita: <code className="bg-muted px-1 rounded">{email.ai_suggested_action}</code>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
