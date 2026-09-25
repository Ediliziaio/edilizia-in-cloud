/**
 * OrderActivityFeed — feed cronologico UNIFICATO della commessa.
 *
 * Unisce in un'unica lista (ordinata per data desc):
 *  (a) le comunicazioni col cliente — stesse fonti di OrderCommunicationsCard:
 *      email da v_my_email_inbox (per indirizzo) + WhatsApp/SMS dalla RPC
 *      conversazione_timeline('cliente', customer_id);
 *  (b) le attività/task della commessa — stessa fonte di LinkedTasks:
 *      tasks filtrate su order_id + company_id.
 *
 * Sostituisce le card separate OrderCommunicationsCard + LinkedTasks (versione
 * di sola lettura del feed). Fail-soft: errori mostrano un retry, mai spinner
 * infinito o empty-state silenzioso su errore.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Mail, MessageCircle, MessageSquare, CheckSquare, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

const INTERNAL_NO_EMAIL_DOMAIN = "@no-email.ediliziaincloud.local";
const MAX_ITEMS = 12;

export type FeedItemKind = "email" | "whatsapp" | "sms" | "task" | "sopralluogo";

/** Forma comune a cui vengono normalizzate comunicazioni e attività. */
export interface OrderActivityFeedItem {
  id: string;
  kind: FeedItemKind;
  title: string;
  subtitle?: string;
  date: string;
  direction?: "in" | "out";
}

export interface OrderActivityFeedProps {
  orderId: string;
  customerId: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
}

const KIND_STYLE: Record<FeedItemKind, { icon: typeof Mail; chip: string }> = {
  email: { icon: Mail, chip: "bg-blue-500/10 text-blue-600" },
  whatsapp: { icon: MessageCircle, chip: "bg-emerald-500/10 text-emerald-600" },
  sms: { icon: MessageSquare, chip: "bg-slate-500/10 text-slate-600" },
  task: { icon: CheckSquare, chip: "bg-amber-500/10 text-amber-600" },
  sopralluogo: { icon: Activity, chip: "bg-orange-500/10 text-orange-600" },
};

function canaleLabel(canale: string): string {
  if (canale === "whatsapp") return "WhatsApp";
  if (canale === "sms") return "SMS";
  if (canale === "email") return "Email";
  return canale;
}

function shortDate(ts: string): string {
  return ts ? new Date(ts).toLocaleDateString("it-IT") : "";
}

export function OrderActivityFeed({ orderId, customerId, customerEmail, customerName }: OrderActivityFeedProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const emailLookup = (() => {
    const e = (customerEmail ?? "").trim().toLowerCase();
    return e && e.includes("@") && !e.endsWith(INTERNAL_NO_EMAIL_DOMAIN) ? e : null;
  })();

  // ── Email (in arrivo + inviate) per indirizzo del cliente ─────────────────
  const emailQ = useQuery({
    queryKey: ["order-feed-email", customerId, companyId, emailLookup],
    enabled: !!companyId && !!emailLookup,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const base = () =>
        client
          .from("v_my_email_inbox")
          .select("id, thread_id, from_email, subject, received_at, preview")
          .eq("company_id", companyId)
          .order("received_at", { ascending: false })
          .limit(10);
      const [fromR, toR] = await Promise.all([
        base().ilike("from_email", emailLookup!),
        base().ilike("to_email", emailLookup!),
      ]);
      const all = [...(fromR.data ?? []), ...(toR.data ?? [])];
      const byThread = new Map<string, { id?: string; thread_id?: string; from_email?: string; subject?: string; received_at?: string; preview?: string }>();
      all.forEach((r: { id?: string; thread_id?: string; received_at?: string }) => {
        const key = (r.thread_id ?? r.id ?? "") as string;
        if (!key) return;
        const prev = byThread.get(key);
        if (!prev || new Date(r.received_at ?? 0).getTime() > new Date(prev.received_at ?? 0).getTime()) {
          byThread.set(key, r);
        }
      });
      return Array.from(byThread.values());
    },
  });

  // ── Messaggi WhatsApp/SMS dalla RPC conversazione_timeline ────────────────
  const messaggiQ = useQuery({
    queryKey: ["order-feed-msg", customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        f: string,
        a: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await rpc("conversazione_timeline", {
        p_entita_tipo: "cliente",
        p_entita_id: customerId,
      });
      if (error) throw new Error(error.message);
      type Msg = { canale: string; direzione: string; oggetto: string | null; testo: string | null; ts: string; ref_id: string };
      return ((data as Msg[]) ?? []).filter(
        (m) => !(m.canale === "email" && m.direzione === "in") && m.canale !== "nota",
      );
    },
  });

  // ── Attività/task della commessa (stessa fonte di LinkedTasks) ────────────
  const tasksQ = useQuery({
    queryKey: queryKeys.tasks.linked(`order-${orderId}`),
    enabled: !!companyId && !!orderId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, created_at, order_id")
        .eq("company_id", companyId!)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        title: string | null;
        status: string | null;
        priority: string | null;
        due_date: string | null;
        created_at: string | null;
      }>;
    },
  });

  const items: OrderActivityFeedItem[] = useMemo(() => {
    const emails = (emailQ.data ?? []) as Array<{ id?: string; from_email?: string; subject?: string; received_at?: string; preview?: string }>;
    const messaggi = (messaggiQ.data ?? []) as Array<{ canale: string; direzione: string; oggetto: string | null; testo: string | null; ts: string; ref_id: string }>;
    const tasks = tasksQ.data ?? [];

    const fromEmails: OrderActivityFeedItem[] = emails.map((e) => ({
      id: `mail-${e.id}`,
      kind: "email",
      direction: (e.from_email ?? "").toLowerCase() === emailLookup ? "in" : "out",
      title: e.subject || "(senza oggetto)",
      subtitle: e.preview || undefined,
      date: e.received_at ?? "",
    }));

    const fromMsg: OrderActivityFeedItem[] = messaggi.map((m, i) => {
      const kind: FeedItemKind = m.canale === "whatsapp" ? "whatsapp" : m.canale === "sms" ? "sms" : "email";
      return {
        id: `msg-${m.ref_id ?? i}`,
        kind,
        direction: m.direzione === "in" ? "in" : "out",
        title: m.oggetto || canaleLabel(m.canale),
        subtitle: m.testo || undefined,
        date: m.ts,
      };
    });

    const fromTasks: OrderActivityFeedItem[] = tasks.map((t) => {
      const done = t.status === "completata";
      const parts = [done ? "Completata" : "Attività", t.priority || undefined].filter(Boolean);
      return {
        id: `task-${t.id}`,
        kind: "task",
        title: t.title || "Attività",
        subtitle: parts.join(" · ") || undefined,
        date: t.due_date || t.created_at || "",
      };
    });

    return [...fromEmails, ...fromMsg, ...fromTasks]
      .filter((x) => x.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, MAX_ITEMS);
  }, [emailQ.data, messaggiQ.data, tasksQ.data, emailLookup]);

  const isLoading =
    (emailQ.isFetching || messaggiQ.isFetching || tasksQ.isFetching) && items.length === 0;
  const isError = emailQ.isError || messaggiQ.isError || tasksQ.isError;

  const retry = () => {
    emailQ.refetch();
    messaggiQ.refetch();
    tasksQ.refetch();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Comunicazioni e attività
        </CardTitle>
        <CardDescription className="text-xs max-sm:hidden">
          Tutto quello fatto col cliente e su questa commessa.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-start gap-2 px-4 pb-4">
            <p className="text-sm text-muted-foreground">Impossibile caricare. Riprova.</p>
            <Button variant="outline" size="sm" className="h-8" onClick={retry}>
              Riprova
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-muted-foreground">
            Nessuna comunicazione o attività ancora
            {customerName?.trim() ? ` con ${customerName.trim()}` : ""}.
          </div>
        ) : (
          <div className="divide-y">
            {items.map((it) => {
              const style = KIND_STYLE[it.kind];
              const Icon = style.icon;
              return (
                <div key={it.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.chip}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{it.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {shortDate(it.date)}
                      </span>
                    </div>
                    {it.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
