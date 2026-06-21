/**
 * OrderCommunicationsCard — comunicazioni recenti col cliente della commessa.
 *
 * La commessa è legata al cliente via orders.customer_id → profiles.id (= stesso
 * id della scheda cliente /azienda/clienti/:id). Riusa le stesse fonti della
 * pagina cliente: email da v_my_email_inbox (per indirizzo) + messaggi
 * WhatsApp/SMS dalla RPC conversazione_timeline('cliente', customer_id).
 * Fail-soft su entrambe. Link "Tutte" alla scheda cliente.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Mail, MessageSquare, ArrowRight, Inbox } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const INTERNAL_NO_EMAIL_DOMAIN = "@no-email.ediliziaincloud.local";

interface CommItem {
  id: string;
  canale: string;
  direzione: string;
  titolo: string;
  preview: string;
  ts: string;
}

function canaleIcon(canale: string) {
  return canale === "email" ? Mail : MessageSquare;
}

function canaleLabel(canale: string): string {
  if (canale === "whatsapp") return "WhatsApp";
  if (canale === "sms") return "SMS";
  if (canale === "email") return "Email";
  return canale;
}

interface Props {
  customerId: string | null | undefined;
  customerEmail: string | null | undefined;
  customerName?: string;
}

export function OrderCommunicationsCard({ customerId, customerEmail, customerName }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const emailLookup = (() => {
    const e = (customerEmail ?? "").trim().toLowerCase();
    return e && e.includes("@") && !e.endsWith(INTERNAL_NO_EMAIL_DOMAIN) ? e : null;
  })();

  // ── Email (in arrivo + inviate) per indirizzo del cliente ──────────────────
  const { data: emails = [] } = useQuery({
    queryKey: ["order-comm-email", customerId, companyId, emailLookup],
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

  // ── Messaggi WhatsApp/SMS dalla RPC conversazione_timeline ──────────────────
  const { data: messaggi = [] } = useQuery({
    queryKey: ["order-comm-msg", customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as (
        f: string,
        a: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await rpc("conversazione_timeline", {
        p_entita_tipo: "cliente",
        p_entita_id: customerId,
      });
      if (error) return [];
      type Msg = { canale: string; direzione: string; oggetto: string | null; testo: string | null; ts: string; ref_id: string };
      return ((data as Msg[]) ?? []).filter(
        (m) => !(m.canale === "email" && m.direzione === "in") && m.canale !== "nota",
      );
    },
  });

  const items: CommItem[] = useMemo(() => {
    const fromEmails: CommItem[] = (emails as Array<{ id?: string; from_email?: string; subject?: string; received_at?: string; preview?: string }>).map((e) => ({
      id: `mail-${e.id}`,
      canale: "email",
      direzione: (e.from_email ?? "").toLowerCase() === emailLookup ? "in" : "out",
      titolo: e.subject || "(senza oggetto)",
      preview: e.preview || "",
      ts: e.received_at ?? "",
    }));
    const fromMsg: CommItem[] = (messaggi as Array<{ canale: string; direzione: string; oggetto: string | null; testo: string | null; ts: string; ref_id: string }>).map((m, i) => ({
      id: `msg-${m.ref_id ?? i}`,
      canale: m.canale,
      direzione: m.direzione,
      titolo: m.oggetto || canaleLabel(m.canale),
      preview: m.testo || "",
      ts: m.ts,
    }));
    return [...fromEmails, ...fromMsg]
      .filter((x) => x.ts)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 8);
  }, [emails, messaggi, emailLookup]);

  // Commessa senza cliente collegato → niente comunicazioni da mostrare.
  if (!customerId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-muted-foreground" /> Comunicazioni col cliente
          </CardTitle>
          <CardDescription className="text-xs">
            Questa commessa non è collegata a una scheda cliente: non ci sono comunicazioni da mostrare.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-muted-foreground" /> Comunicazioni col cliente
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-8 shrink-0">
            <Link to={`/azienda/clienti/${customerId}?tab=email`}>
              Tutte <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>
        <CardDescription className="text-xs">
          Email e messaggi recenti con {customerName?.trim() || "il cliente"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-muted-foreground">Nessuna comunicazione recente con questo cliente.</div>
        ) : (
          <div className="divide-y">
            {items.map((it) => {
              const Icon = canaleIcon(it.canale);
              const incoming = it.direzione === "in";
              return (
                <div key={it.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${incoming ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{it.titolo}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {it.ts ? new Date(it.ts).toLocaleDateString("it-IT") : ""}
                      </span>
                    </div>
                    {it.preview && <p className="truncate text-xs text-muted-foreground">{it.preview}</p>}
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
