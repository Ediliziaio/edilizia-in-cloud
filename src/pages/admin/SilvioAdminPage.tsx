/**
 * SilvioAdminPage — Landing che mostra briefing del giorno + apre la chat.
 *
 * Flusso:
 *   1. Carica briefing della giornata corrente
 *   2. Se presente → lo mostra con CTA "Apri chat"
 *   3. Se assente → bottone "Genera briefing ora" + CTA chat
 *
 * Architettura: la chat reale vive in /admin/chat con canale silvio-admin
 * (no doppione UI, riuso completo di InternalChat).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Sparkles, AlertTriangle, MessageCircle, Calendar, RefreshCw, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Briefing {
  id: string;
  for_date: string;
  content_md: string;
  highlights: { mrr_eur?: number; n_paying?: number; n_unpaid?: number; ai_cost_mtd_eur?: number } | null;
  generated_by: string | null;
  created_at: string;
}

export default function SilvioAdminPage() {
  const navigate = useNavigate();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-crea canale silvio-admin
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: rpcErr } = await (supabase as any).rpc(
          "ensure_user_silvio_admin_channel"
        );
        if (cancelled) return;

        if (rpcErr) {
          setError(rpcErr.message ?? "Errore creazione canale Silvio Admin");
          return;
        }
        setChannelId(data as string | null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { data: briefing, isLoading: loadingBriefing, refetch: refetchBriefing } = useQuery({
    queryKey: ["silvio-admin-briefing-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("silvio_admin_briefings")
        .select("*")
        .eq("for_date", today)
        .maybeSingle();
      if (error) throw error;
      return data as Briefing | null;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("silvio-admin-briefing", {
        body: { force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Briefing generato!");
      refetchBriefing();
    },
    onError: (e) => toast.error("Errore generazione", { description: String(e) }),
  });

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
            <h2 className="text-lg font-semibold">Errore Silvio Superadmin</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto p-4">
      {/* HEADER — stesso stile arancione di Silvio cliente */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 flex items-center justify-center text-white shrink-0 ring-1 ring-orange-300/40 shadow-sm shadow-orange-300/30">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Silvio</h1>
            <p className="text-xs text-muted-foreground">
              Co-founder AI · cross-tenant · 5 tool Revenue attivi
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/admin/silvio/approvazioni")}
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            Approvazioni
          </Button>
          <Button
            disabled={!channelId}
            onClick={() => channelId && navigate(`/admin/chat?channel=${channelId}`)}
          >
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Apri chat
          </Button>
        </div>
      </div>

      {/* BRIEFING CARD */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              Briefing di oggi
              <span className="text-xs font-normal text-muted-foreground">
                · {format(new Date(), "EEEE d MMMM yyyy", { locale: it })}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generateMutation.isPending ? "animate-spin" : ""}`} />
              {briefing ? "Rigenera" : "Genera ora"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingBriefing ? (
            <Skeleton className="h-48" />
          ) : briefing ? (
            <>
              {/* Highlights snapshot */}
              {briefing.highlights && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <HighlightCard label="MRR" value={`€${(briefing.highlights.mrr_eur ?? 0).toLocaleString("it-IT")}`} />
                  <HighlightCard label="Paying" value={String(briefing.highlights.n_paying ?? 0)} />
                  <HighlightCard
                    label="Insoluti"
                    value={String(briefing.highlights.n_unpaid ?? 0)}
                    tone={(briefing.highlights.n_unpaid ?? 0) > 0 ? "rose" : "default"}
                  />
                  <HighlightCard
                    label="AI Cost MTD"
                    value={`€${(briefing.highlights.ai_cost_mtd_eur ?? 0).toFixed(2)}`}
                  />
                </div>
              )}
              {/* Markdown content */}
              <div
                className="prose prose-sm prose-zinc dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: briefingToHtml(briefing.content_md) }}
              />
              <p className="text-[10px] text-muted-foreground mt-3 pt-3 border-t">
                Generato {format(new Date(briefing.created_at), "HH:mm", { locale: it })} con{" "}
                <code>{briefing.generated_by}</code>
              </p>
            </>
          ) : (
            <div className="text-center py-8">
              <Loader2 className={`h-6 w-6 mx-auto mb-2 ${generateMutation.isPending ? "animate-spin text-orange-500" : "text-muted-foreground/30"}`} />
              <p className="text-sm text-muted-foreground">
                Briefing non ancora generato per oggi.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cron giornaliero alle 06:00 UTC (08:00 IT in estate). Oppure click "Genera ora".
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QUICK CHAT START */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-orange-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Chiedi a Silvio</p>
              <p className="text-xs text-muted-foreground">
                Es. "Quanto è il MRR?" · "Chi è insoluto?" · "Forecast 6 mesi"
              </p>
            </div>
            <Button
              disabled={!channelId}
              onClick={() => channelId && navigate(`/admin/chat?channel=${channelId}`)}
            >
              Apri chat →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HighlightCard({
  label, value, tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "rose" | "emerald";
}) {
  const colorMap: Record<string, string> = {
    default: "",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${colorMap[tone]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

/** Conversione minimale MD→HTML */
function briefingToHtml(md: string): string {
  let html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>");
  html = html
    .split(/\n\n+/)
    .map((para) => {
      if (/^<(h2|h3|ul)/.test(para.trim())) return para;
      if (!para.trim()) return "";
      return `<p>${para.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  return html;
}
