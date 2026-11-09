/**
 * Lo storico delle comunicazioni di una riga di `profiles`: email, WhatsApp/SMS
 * e note interne. Serve la scheda cliente e la scheda committente, che sono la
 * stessa riga e devono raccontare la stessa storia.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DOMINIO_SENZA_EMAIL = "@no-email.ediliziaincloud.local";

/** L'email vera, o null per i segnaposto di chi l'email non l'ha data. */
export function emailVera(email: string | null | undefined): string | null {
  const valore = (email ?? "").trim();
  if (!valore || valore.endsWith(DOMINIO_SENZA_EMAIL)) return null;
  return valore;
}

const erroreMorbido = (e: unknown): boolean => {
  const code = (e as { code?: string })?.code;
  return code === "42P01" || code === "42501" || code === "PGRST116" || code === "PGRST301";
};

export function useComunicazioniScheda(id: string | undefined, companyId: string | undefined, email: string | null | undefined) {
  const indirizzo = (() => {
    const e = (email ?? "").trim().toLowerCase();
    return e && e.includes("@") && !e.endsWith(DOMINIO_SENZA_EMAIL) ? e : null;
  })();

  const { data: emailConversazioni = [] } = useQuery({
    queryKey: ["customer-email-timeline", id, companyId, indirizzo],
    enabled: !!companyId && !!indirizzo,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const baseQuery = () =>
        client
          .from("v_my_email_inbox")
          .select("id, thread_id, from_email, from_name, subject, received_at, preview")
          .eq("company_id", companyId!)
          .order("received_at", { ascending: false })
          .limit(15);
      const [fromR, toR] = await Promise.all([
        baseQuery().ilike("from_email", indirizzo!),
        baseQuery().ilike("to_email", indirizzo!),
      ]);
      const all = [...(fromR.data ?? []), ...(toR.data ?? [])];
      // Dedup per thread_id, prendi più recente
      const byThread = new Map<string, typeof all[number]>();
      all.forEach((row: { thread_id?: string; id?: string; received_at?: string }) => {
        const key = (row.thread_id ?? row.id ?? "") as string;
        if (!key) return;
        const prev = byThread.get(key);
        if (!prev || new Date(row.received_at ?? 0).getTime() > new Date(prev.received_at ?? 0).getTime()) {
          byThread.set(key, row);
        }
      });
      return Array.from(byThread.values());
    },
  });

  // WhatsApp, SMS e campagne dalla vista unificata; le email in arrivo stanno
  // già nella lettura qui sopra, e le note in quella qui sotto.
  const { data: messaggi = [] } = useQuery({
    queryKey: ["customer-conversazioni-timeline", id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        f: string,
        a: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await rpc("conversazione_timeline", { p_entita_tipo: "cliente", p_entita_id: id });
      if (error) return []; // fail-soft: la timeline mostra il resto
      type Msg = { canale: string; direzione: string; oggetto: string | null; testo: string | null; ts: string; ref_id: string };
      return ((data as Msg[]) ?? []).filter((m) => !(m.canale === "email" && m.direzione === "in") && m.canale !== "nota");
    },
  });

  const { data: note = [] } = useQuery({
    queryKey: ["customer-diary-timeline", id, companyId],
    enabled: !!id && !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("customer_messages")
        .select("id, body, created_at, sender_role, channel, sender_id")
        .eq("customer_id", id!)
        .eq("company_id", companyId!)
        .eq("channel", "internal")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (erroreMorbido(error)) return [];
        throw error;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((m) => ({
        id: m.id as string,
        content: (m.body ?? "") as string,
        author_name: m.sender_role === "staff" ? "Nota team" : "Nota cliente",
        created_at: m.created_at as string,
      }));
    },
  });

  return { emailConversazioni, messaggi, note };
}

/** Il contatto marketing da cui viene questa anagrafica, se c'è. */
export function useContattoCollegato(contattoId: string | null | undefined) {
  return useQuery({
    queryKey: ["linked-marketing-contact", contattoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, source, lead_score, contact_type, created_at, attr_campaign, tags")
        .eq("id", contattoId!)
        .maybeSingle();
      // Il contatto collegato può essere stato cancellato: maybeSingle ritorna null
      // senza errore; un errore reale invece va propagato, non ingoiato.
      if (error) throw error;
      return data;
    },
    enabled: !!contattoId,
    staleTime: 5 * 60 * 1000,
  });
}
