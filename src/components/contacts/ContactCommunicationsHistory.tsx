/**
 * ContactCommunicationsHistory — cronologia unificata delle comunicazioni
 * (SMS · WhatsApp · Email) inviate/ricevute con un contatto, per dargli
 * tracciabilità dove serve (es. tab Attività dell'opportunità).
 *
 * Legge le tabelle esistenti filtrando per telefono/email del contatto:
 *   - sms_messages       (to_number ~ telefono)
 *   - whatsapp_messages  (to_phone ~ telefono)
 *   - email_outbox       (to_emails @> [email], inviate)
 * Nessuna nuova tabella: solo lettura.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Smartphone, MessageSquare, Mail, ArrowUpRight, ArrowDownLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  companyId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  email?: string | null;
  className?: string;
}

type CommChannel = "sms" | "whatsapp" | "email";
interface CommItem {
  id: string;
  channel: CommChannel;
  direction: "outbound" | "inbound";
  text: string;
  at: string; // ISO
  status?: string | null;
}

const CH_META: Record<CommChannel, { label: string; Icon: typeof Mail; color: string }> = {
  sms:      { label: "SMS",      Icon: Smartphone,    color: "text-blue-600" },
  whatsapp: { label: "WhatsApp", Icon: MessageSquare, color: "text-emerald-600" },
  email:    { label: "Email",    Icon: Mail,          color: "text-violet-600" },
};

export function ContactCommunicationsHistory({ companyId, contactId, phone, email, className }: Props) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const tail = digits.length >= 8 ? digits.slice(-9) : ""; // ultime cifre = match robusto sui formati (+39, 39, 0…)
  const mail = (email ?? "").trim().toLowerCase();

  const { data: smsRows = [], isLoading: l1 } = useQuery({
    queryKey: ["comm-sms", companyId, tail, contactId],
    enabled: !!companyId && (!!tail || !!contactId),
    staleTime: 30_000,
    queryFn: async (): Promise<CommItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("sms_messages")
        .select("id, direction, status, to_number, body, sent_at, created_at, trigger_ref")
        .eq("company_id", companyId).order("created_at", { ascending: false }).limit(30);
      q = tail ? q.ilike("to_number", `%${tail}%`) : q.eq("trigger_ref", contactId);
      const { data, error } = await q;
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: `sms_${r.id}`, channel: "sms" as const,
        direction: r.direction === "inbound" ? "inbound" : "outbound",
        text: r.body ?? "", at: r.sent_at ?? r.created_at, status: r.status,
      }));
    },
  });

  const { data: waRows = [], isLoading: l2 } = useQuery({
    queryKey: ["comm-wa", companyId, tail],
    enabled: !!companyId && !!tail,
    staleTime: 30_000,
    queryFn: async (): Promise<CommItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("whatsapp_messages")
        .select("id, direction, to_phone, from_phone, content_text, created_at")
        .eq("company_id", companyId).or(`to_phone.ilike.%${tail}%,from_phone.ilike.%${tail}%`)
        .order("created_at", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: `wa_${r.id}`, channel: "whatsapp" as const,
        direction: r.direction === "inbound" ? "inbound" : "outbound",
        text: r.content_text ?? "", at: r.created_at,
      }));
    },
  });

  const { data: emailRows = [], isLoading: l3 } = useQuery({
    queryKey: ["comm-email", companyId, mail],
    enabled: !!companyId && !!mail,
    staleTime: 30_000,
    queryFn: async (): Promise<CommItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("email_outbox")
        .select("id, subject, body_text, status, sent_at, created_at")
        .eq("company_id", companyId).contains("to_emails", [mail])
        .order("created_at", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: `em_${r.id}`, channel: "email" as const, direction: "outbound" as const,
        text: r.subject ? `${r.subject}${r.body_text ? " — " + r.body_text : ""}` : (r.body_text ?? ""),
        at: r.sent_at ?? r.created_at, status: r.status,
      }));
    },
  });

  const items = useMemo(() => {
    return [...smsRows, ...waRows, ...emailRows]
      .filter((i) => i.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 40);
  }, [smsRows, waRows, emailRows]);

  const loading = l1 || l2 || l3;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" /> Comunicazioni (SMS · WhatsApp · Email)
      </p>
      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carico…</div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">Nessuna comunicazione registrata con questo contatto.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => {
            const meta = CH_META[i.channel];
            const Icon = meta.Icon;
            const out = i.direction === "outbound";
            return (
              <li key={i.id} className="flex items-start gap-2 rounded-lg border p-2 text-xs">
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", meta.color)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">{meta.label}</span>
                    <span className={cn("inline-flex items-center gap-0.5 text-[10px]", out ? "text-blue-600" : "text-emerald-600")}>
                      {out ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                      {out ? "inviato" : "ricevuto"}
                    </span>
                    {i.status && <span className="text-[10px] text-muted-foreground">· {i.status}</span>}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(i.at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 mt-0.5 break-words">{i.text || "—"}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ContactCommunicationsHistory;
