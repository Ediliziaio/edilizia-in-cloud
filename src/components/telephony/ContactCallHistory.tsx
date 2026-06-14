import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WebCallButton } from "./WebCallButton";
import { AiCallButton } from "./AiCallButton";
import { Phone, ArrowUpRight, ArrowDownLeft, Bot, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactCallHistoryProps {
  contactId?: string | null;
  phone?: string | null;
  name?: string | null;
  /** Mostra i pulsanti di chiamata rapida in alto (default true). */
  showActions?: boolean;
  className?: string;
}

interface UnifiedCall {
  id: string;
  kind: "human" | "ai";
  direction: string;
  number: string | null;
  who: string | null;       // operatore (umana) o "Agente AI"
  status: string;
  duration_seconds: number;
  started_at: string;
  recording_url: string | null;
  summary?: string | null;  // sintesi chiamata AI
}

function fmtDur(s: number) { if (!s) return "—"; const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function statusLabel(s: string) {
  if (["completed", "completata"].includes(s)) return "Completata";
  if (["active", "in_progress", "ringing"].includes(s)) return "In corso";
  if (["failed", "no_answer", "rifiutata"].includes(s)) return "Non risposta";
  return s;
}

/**
 * Storico chiamate (umane via centralino + AI via agente) per un contatto/cliente,
 * con chiamata rapida. Sincronizza le telefonate nel contesto del contatto.
 */
export function ContactCallHistory({ contactId, phone, name, showActions = true, className }: ContactCallHistoryProps) {
  const companyId = useEffectiveCompanyId();
  const suffix = (phone || "").replace(/\D/g, "").slice(-9);

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["contact-call-history", companyId, contactId, suffix],
    enabled: !!companyId && (!!contactId || !!suffix),
    refetchInterval: 20_000,
    queryFn: async () => {
      const out: UnifiedCall[] = [];

      // Chiamate umane (centralino). Aggancia sia quelle marcate col contatto
      // (contact_id) sia quelle riconosciute solo dal numero (es. chiamate dalla
      // scheda cliente), così lo storico è completo in ogni contesto.
      let hq = supabase
        .from("human_call_logs" as never)
        .select("id, direction, to_number, from_number, status, duration_seconds, started_at, user_name, recording_url")
        .eq("company_id", companyId!)
        .order("started_at", { ascending: false })
        .limit(30);
      if (contactId && suffix) hq = hq.or(`contact_id.eq.${contactId},to_number.ilike.%${suffix}%`);
      else if (contactId) hq = hq.eq("contact_id", contactId);
      else if (suffix) hq = hq.ilike("to_number", `%${suffix}%`);
      const { data: human } = await hq;
      (human ?? []).forEach((r: Record<string, unknown>) => out.push({
        id: `h-${r.id}`,
        kind: "human",
        direction: (r.direction as string) || "outbound",
        number: (r.to_number as string) || (r.from_number as string) || null,
        who: (r.user_name as string) || null,
        status: (r.status as string) || "",
        duration_seconds: (r.duration_seconds as number) || 0,
        started_at: r.started_at as string,
        recording_url: (r.recording_url as string) || null,
      }));

      // Chiamate AI (agente) — solo se abbiamo il contact_id
      if (contactId) {
        const { data: ai } = await supabase
          .from("ai_agent_conversations" as never)
          .select("id, call_direction, status, duration_seconds, started_at, summary")
          .eq("company_id", companyId!)
          .eq("contact_id", contactId)
          .order("started_at", { ascending: false })
          .limit(30);
        (ai ?? []).forEach((r: Record<string, unknown>) => out.push({
          id: `a-${r.id}`,
          kind: "ai",
          direction: (r.call_direction as string) || "outbound",
          number: phone || null,
          who: "Agente AI",
          status: (r.status as string) || "",
          duration_seconds: (r.duration_seconds as number) || 0,
          started_at: r.started_at as string,
          recording_url: null,
          summary: (r.summary as string) || null,
        }));
      }

      out.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
      return out.slice(0, 40);
    },
  });

  const hasTarget = !!contactId || !!phone;
  const total = useMemo(() => calls.length, [calls]);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4 text-primary" /> Chiamate
          {total > 0 && <span className="text-xs font-normal text-muted-foreground">({total})</span>}
        </CardTitle>
        {showActions && hasTarget && (
          <div className="flex items-center gap-1.5">
            <WebCallButton phone={phone} name={name} contactId={contactId} label="Chiama" size="sm" variant="outline" className="h-8" />
            <AiCallButton phone={phone} contactId={contactId} contactName={name} label="AI" size="sm" variant="outline" className="h-8" />
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : calls.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">Nessuna chiamata registrata.</p>
        ) : (
          <ul className="divide-y">
            {calls.map((c) => {
              const outbound = c.direction !== "inbound";
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    c.kind === "ai" ? "bg-primary/10 text-primary" : outbound ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {c.kind === "ai" ? <Bot className="h-4 w-4" /> : outbound ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-medium">{c.kind === "ai" ? "Chiamata AI" : (outbound ? "In uscita" : "In entrata")}</span>
                      {c.who && c.kind === "human" && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><User className="h-3 w-3" />{c.who}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDate(c.started_at)}</p>
                    {c.summary && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/90 italic">"{c.summary}"</p>
                    )}
                  </div>
                  {c.recording_url && (
                    <audio controls preload="none" src={c.recording_url} className="h-8 w-32 shrink-0" />
                  )}
                  <div className="shrink-0 text-right">
                    <Badge variant="outline" className="text-[10px]">{statusLabel(c.status)}</Badge>
                    <p className="mt-0.5 text-xs text-muted-foreground">{fmtDur(c.duration_seconds)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
