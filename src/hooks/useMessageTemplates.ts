/**
 * useMessageTemplates — CRUD sui template messaggi condivisi (message_templates).
 *
 * Tabella company-scoped (RLS message_templates_company_isolation) con channel
 * enum: email | sms | whatsapp | nota_interna. Usata dai compositori di Clienti,
 * Contatti CRM e Commesse. `message_templates` non è nei types generati → cast.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TemplateChannel } from "@/lib/messageTemplateVars";

export interface MessageTemplateRow {
  id: string;
  company_id: string;
  name: string;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageTemplateInput {
  name: string;
  channel: TemplateChannel;
  subject?: string | null;
  body: string;
  is_active?: boolean;
}

const KEY = "message-templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from("message_templates");

/** Template di esempio (1-click) seminati su richiesta per la company corrente. */
export const STARTER_TEMPLATES: MessageTemplateInput[] = [
  {
    name: "Conferma appuntamento",
    channel: "email",
    subject: "Conferma appuntamento — {{azienda}}",
    body:
      "Gentile {{nome}},\n\nle confermiamo l'appuntamento concordato. Restiamo a disposizione per qualsiasi necessità.\n\nCordiali saluti,\n{{azienda}}",
  },
  {
    name: "Sollecito pagamento",
    channel: "email",
    subject: "Promemoria pagamento — {{commessa}}",
    body:
      "Gentile {{nome}},\n\nle ricordiamo gentilmente il saldo relativo alla commessa {{commessa}}. La preghiamo di provvedere quando possibile.\n\nGrazie,\n{{azienda}}",
  },
  {
    name: "Promemoria appuntamento",
    channel: "sms",
    body: "Ciao {{nome}}, ti ricordiamo l'appuntamento di domani. A presto! {{azienda}}",
  },
  {
    name: "Sopralluogo proposto",
    channel: "whatsapp",
    body:
      "Buongiorno {{nome}}, possiamo proporle un sopralluogo per valutare i lavori. Quando preferisce essere ricontattato/a?",
  },
];

export function useMessageTemplates(channel?: TemplateChannel) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: [KEY, companyId, channel ?? "all"],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MessageTemplateRow[]> => {
      let q = tbl()
        .select("id, company_id, name, channel, subject, body, is_active, created_at, updated_at")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (channel) q = q.eq("channel", channel);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MessageTemplateRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [KEY] });

  const createMutation = useMutation({
    mutationFn: async (input: MessageTemplateInput) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { error } = await tbl().insert({
        company_id: companyId,
        name: input.name.trim(),
        channel: input.channel,
        subject: input.channel === "email" ? (input.subject?.trim() || null) : null,
        body: input.body,
        is_active: input.is_active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Template salvato"); },
    onError: (e) => toast.error("Salvataggio non riuscito", { description: e instanceof Error ? e.message : String(e) }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: MessageTemplateInput }) => {
      const { error } = await tbl()
        .update({
          name: input.name.trim(),
          channel: input.channel,
          subject: input.channel === "email" ? (input.subject?.trim() || null) : null,
          body: input.body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Template aggiornato"); },
    onError: (e) => toast.error("Aggiornamento non riuscito", { description: e instanceof Error ? e.message : String(e) }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tbl().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Template eliminato"); },
    onError: (e) => toast.error("Eliminazione non riuscita", { description: e instanceof Error ? e.message : String(e) }),
  });

  const seedExamplesMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const rows = STARTER_TEMPLATES.map((t) => ({
        company_id: companyId,
        name: t.name,
        channel: t.channel,
        subject: t.channel === "email" ? (t.subject ?? null) : null,
        body: t.body,
        is_active: true,
      }));
      const { error } = await tbl().insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Template di esempio aggiunti"); },
    onError: (e) => toast.error("Impossibile aggiungere gli esempi", { description: e instanceof Error ? e.message : String(e) }),
  });

  return {
    templates,
    isLoading,
    create: (input: MessageTemplateInput) => createMutation.mutateAsync(input),
    update: (id: string, input: MessageTemplateInput) => updateMutation.mutateAsync({ id, input }),
    remove: (id: string) => removeMutation.mutateAsync(id),
    seedExamples: () => seedExamplesMutation.mutateAsync(),
    isMutating: createMutation.isPending || updateMutation.isPending || removeMutation.isPending || seedExamplesMutation.isPending,
  };
}
