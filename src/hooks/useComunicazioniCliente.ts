import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Indirizzo segnaposto dei clienti senza email: non si cerca. */
const INTERNAL_NO_EMAIL_DOMAIN = "@no-email.ediliziaincloud.local";

/** L'indirizzo con cui cercare la posta del cliente, o null se non ne ha uno vero. */
export function emailDaCercare(customerEmail: string | null | undefined): string | null {
  const e = (customerEmail ?? "").trim().toLowerCase();
  return e && e.includes("@") && !e.endsWith(INTERNAL_NO_EMAIL_DOMAIN) ? e : null;
}

export interface EmailCliente {
  id?: string;
  thread_id?: string;
  from_email?: string;
  subject?: string;
  received_at?: string;
  preview?: string;
}

export interface MessaggioCliente {
  canale: string;
  direzione: string;
  oggetto: string | null;
  testo: string | null;
  ts: string;
  ref_id: string;
}

/**
 * Email scambiate con il cliente (in arrivo e inviate), una per conversazione.
 *
 * Un solo posto per questa richiesta: la scheda «Comunicazioni» e il registro
 * «Attività» della commessa la facevano ciascuna per conto proprio, con chiavi
 * diverse, e l'apertura della commessa partiva con la stessa richiesta due volte.
 * Con la stessa chiave React Query la fa una volta e la condivide.
 */
export function useEmailCliente(customerId: string | null | undefined, companyId: string | undefined, emailLookup: string | null) {
  return useQuery<EmailCliente[]>({
    queryKey: ["cliente-comunicazioni-email", customerId, companyId, emailLookup],
    enabled: !!companyId && !!emailLookup,
    staleTime: 60_000,
    retry: 1,
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
      const all = [...(fromR.data ?? []), ...(toR.data ?? [])] as EmailCliente[];
      const perConversazione = new Map<string, EmailCliente>();
      all.forEach((r) => {
        const key = (r.thread_id ?? r.id ?? "") as string;
        if (!key) return;
        const prec = perConversazione.get(key);
        if (!prec || new Date(r.received_at ?? 0).getTime() > new Date(prec.received_at ?? 0).getTime()) {
          perConversazione.set(key, r);
        }
      });
      return Array.from(perConversazione.values());
    },
  });
}

/** Messaggi WhatsApp, SMS e campagne del cliente (la posta in arrivo è già nelle email). */
export function useMessaggiCliente(customerId: string | null | undefined) {
  return useQuery<MessaggioCliente[]>({
    queryKey: ["cliente-comunicazioni-msg", customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    retry: 1,
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
      return ((data as MessaggioCliente[]) ?? []).filter(
        (m) => !(m.canale === "email" && m.direzione === "in") && m.canale !== "nota",
      );
    },
  });
}
