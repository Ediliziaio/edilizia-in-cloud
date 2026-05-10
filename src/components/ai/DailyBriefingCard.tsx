/**
 * DailyBriefingCard — GAP 3 (Briefing giornaliero per ruolo)
 *
 * Card sticky sopra la dashboard che mostra il briefing AI personalizzato
 * per il ruolo dell'utente: saluto + intro + 3 azioni urgenti + info chiave +
 * suggerimenti.
 *
 * Backend: edge function `ai-briefing-per-ruolo` (esistente).
 *
 * Cache: react-query staleTime=4h (briefing è giornaliero, no need refetch
 * ogni mount). Refresh manuale via bottone "Aggiorna".
 *
 * Stato persisted: il briefing dell'ultima ora viene mostrato anche dopo
 * navigazione tra pagine. Dismiss persiste a livello di sessione browser.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, ArrowRight, Calendar, CheckCircle2, FileText, Info,
  Phone, RefreshCw, Sparkles, Target, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

interface AzioneUrgente {
  icona: "warning" | "task" | "call" | "meeting" | "document";
  azione: string;
  priorita: "alta" | "media" | "bassa";
}

interface InfoChiave {
  label: string;
  valore: string;
  context?: string;
}

interface BriefingPayload {
  saluto: string;
  intro_giornata: string;
  azioni_urgenti: AzioneUrgente[];
  info_chiave: InfoChiave[];
  suggerimenti: string[];
}

interface BriefingResponse {
  success?: boolean;
  briefing?: BriefingPayload;
  ai_meta?: { model?: string; cost_eur?: number };
  error?: string;
}

const ICONA_MAP = {
  warning: AlertTriangle,
  task: Target,
  call: Phone,
  meeting: Calendar,
  document: FileText,
};

const PRIORITA_BADGE: Record<AzioneUrgente["priorita"], string> = {
  alta: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-300",
  media: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300",
  bassa: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
};

const SESSION_DISMISS_KEY = "daily_briefing_dismissed_session";

export function DailyBriefingCard() {
  const { effectiveCompany } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["daily-briefing", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && !dismissed,
    staleTime: 4 * 60 * 60 * 1000, // 4 ore
    gcTime: 12 * 60 * 60 * 1000, // 12 ore in cache
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<BriefingPayload | null> => {
      const { data: result, error: invErr } = await supabase.functions.invoke<BriefingResponse>(
        "ai-briefing-per-ruolo",
        { body: { company_id: effectiveCompany!.id } },
      );
      if (invErr) throw new Error(invErr.message);
      if (!result?.briefing) {
        // Edge function ha ritornato error o struttura inattesa: degrade graceful
        if (result?.error) throw new Error(result.error);
        return null;
      }
      return result.briefing;
    },
    retry: 1,
  });

  const handleDismiss = () => {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, "1"); } catch { /* noop */ }
    setDismissed(true);
  };

  const handleClearDismiss = () => {
    try { sessionStorage.removeItem(SESSION_DISMISS_KEY); } catch { /* noop */ }
    setDismissed(false);
  };

  // Se dismissed, mostra una piccola "Riapri briefing" inline (non invasivo)
  if (dismissed) {
    return (
      <div className="text-xs text-muted-foreground -mt-1 flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-violet-500" />
        Briefing AI nascosto per questa sessione.
        <button
          onClick={handleClearDismiss}
          className="text-primary hover:underline"
        >
          Mostra di nuovo
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 dark:from-violet-950/20 dark:via-background dark:to-indigo-950/20 dark:border-violet-900">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600 animate-pulse" />
            <span className="text-sm font-medium">Silvio AI sta preparando il tuo briefing…</span>
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900">
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            Briefing AI temporaneamente non disponibile
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7">
            <RefreshCw className="h-3 w-3 mr-1" />
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null; // backend ha ritornato briefing null (fail-soft)

  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-violet-950/20 dark:via-background dark:to-indigo-950/20 dark:border-violet-900 overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="shrink-0 h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold leading-tight">{data.saluto}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {data.intro_giornata}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Aggiorna briefing"
              aria-label="Aggiorna briefing"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleDismiss}
              title="Nascondi briefing per questa sessione"
              aria-label="Nascondi briefing"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 3 sezioni in grid: azioni urgenti / info chiave / suggerimenti */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Azioni urgenti */}
          {data.azioni_urgenti.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Azioni urgenti
              </p>
              <ul className="space-y-1.5">
                {data.azioni_urgenti.slice(0, 3).map((a, i) => {
                  const Icon = ICONA_MAP[a.icona] ?? Target;
                  return (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className={cn(
                        "shrink-0 inline-flex h-4 w-4 items-center justify-center rounded border text-[9px]",
                        PRIORITA_BADGE[a.priorita],
                      )}>
                        <Icon className="h-2.5 w-2.5" />
                      </span>
                      <span className="leading-snug">{a.azione}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Info chiave */}
          {data.info_chiave.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Info chiave
              </p>
              <ul className="space-y-1.5">
                {data.info_chiave.slice(0, 4).map((info, i) => (
                  <li key={i} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground truncate">{info.label}</span>
                      <span className="font-mono font-medium tabular-nums shrink-0">{info.valore}</span>
                    </div>
                    {info.context ? (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{info.context}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggerimenti */}
          {data.suggerimenti.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Consigli del giorno
              </p>
              <ul className="space-y-1.5">
                {data.suggerimenti.slice(0, 3).map((s, i) => (
                  <li key={i} className="text-xs leading-snug text-muted-foreground">
                    • {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="border-t pt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-violet-500" />
            Generato da Silvio AI · si aggiorna automaticamente ogni 4 ore
          </span>
          <Link
            to="/azienda/assistente-ai?persona=assistente_imprenditore"
            className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
          >
            Approfondisci con AI
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default DailyBriefingCard;
