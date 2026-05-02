import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";

export type DiaryEntry =
  | { kind: "event"; data: OrderEvent }
  | { kind: "message"; data: OrderMessage }
  | { kind: "audit"; data: OrderDiaryAudit };

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_name: string | null;
  created_at: string;
}

export interface OrderMessage {
  id: string;
  order_id: string;
  channel: string;
  direction: "out" | "in";
  subject?: string;
  body: string;
  to_name?: string;
  to_email?: string;
  to_phone?: string;
  status: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_reason?: string;
  sent_by_name?: string;
  reply_to_id?: string;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject?: string;
  body: string;
}

export interface OrderDiaryAudit {
  id: string;
  audit_type: "documento" | "foto" | "rapportino" | "firma" | "assistenza";
  title: string;
  description: string;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
  metadata?: Record<string, string | number | boolean | null>;
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function profileName(profile: { first_name?: string | null; last_name?: string | null; email?: string | null } | undefined) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || profile?.email || null;
}

export function useOrderDiary(orderId: string | undefined) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();

  // ── Fetch events ──────────────────────────────────────────────────────────
  const {
    data: events = [],
    isLoading: eventsLoading,
    isError: eventsError,
  } = useQuery({
    queryKey: ["order-events", effectiveCompany?.id, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events" as never)
        .select("*")
        .eq("order_id" as never, orderId as never)
        .eq("company_id" as never, effectiveCompany!.id as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderEvent[];
    },
    enabled: !!orderId && !!effectiveCompany?.id,
    staleTime: 30_000,
  });

  // ── Fetch messages ────────────────────────────────────────────────────────
  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
  } = useQuery({
    queryKey: ["order-messages", effectiveCompany?.id, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages" as never)
        .select("*")
        .eq("order_id" as never, orderId as never)
        .eq("company_id" as never, effectiveCompany!.id as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderMessage[];
    },
    enabled: !!orderId && !!effectiveCompany?.id,
    staleTime: 30_000,
  });

  // ── Fetch templates ───────────────────────────────────────────────────────
  const { data: templates = [] } = useQuery({
    queryKey: ["message-templates", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("message_templates" as never)
        .select("*")
        .eq("company_id" as never, effectiveCompany!.id as never)
        .eq("is_active" as never, true as never)
        .order("name" as never);
      return (data ?? []) as MessageTemplate[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 300_000,
  });

  const {
    data: auditEntries = [],
    isLoading: auditLoading,
    isError: auditError,
  } = useQuery({
    queryKey: ["order-diary-audit", orderId, effectiveCompany?.id],
    queryFn: async () => {
      const [
        attachmentsResult,
        photosResult,
        rapportiniResult,
        signaturesResult,
        ticketsResult,
      ] = await Promise.all([
        supabase
          .from("order_attachments")
          .select("id, file_name, file_type, file_size, uploaded_by, visible_to_customer, created_at")
          .eq("order_id", orderId!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("foto_cantiere")
          .select("id, descrizione, storage_path, uploaded_by, taken_at, created_at, latitudine, longitudine, tags")
          .eq("order_id", orderId!)
          .eq("company_id", effectiveCompany!.id)
          .order("taken_at", { ascending: false }),
        supabase
          .from("campo_rapportini")
          .select("id, user_id, role_type, data_lavoro, ore_lavorate, ore_straordinario, descrizione_lavori, foto_urls, lavoro_completato, percentuale_avanzamento, firma_cliente_at, firma_cliente_nome, created_at")
          .eq("order_id", orderId!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("signature_requests")
          .select("id, signer_name, signer_email, status, tipo_documento, tipo_firmatario, signed_at, created_at, created_by")
          .eq("order_id", orderId!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("tickets")
          .select("id, subject, status, priority, tipo, assigned_to, data_intervento_prevista, data_intervento_effettiva, created_at")
          .eq("order_id", orderId!)
          .eq("company_id", effectiveCompany!.id)
          .order("created_at", { ascending: false }),
      ]);

      const firstError = [
        attachmentsResult.error,
        photosResult.error,
        rapportiniResult.error,
        signaturesResult.error,
        ticketsResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      const userIds = new Set<string>();
      attachmentsResult.data?.forEach((row) => row.uploaded_by && userIds.add(row.uploaded_by));
      photosResult.data?.forEach((row) => row.uploaded_by && userIds.add(row.uploaded_by));
      rapportiniResult.data?.forEach((row) => row.user_id && userIds.add(row.user_id));
      signaturesResult.data?.forEach((row) => row.created_by && userIds.add(row.created_by));
      ticketsResult.data?.forEach((row) => row.assigned_to && userIds.add(row.assigned_to));

      const profileMap = new Map<string, { first_name: string | null; last_name: string | null; email: string | null }>();
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", Array.from(userIds));
        profiles?.forEach((profile) => profileMap.set(profile.id, profile));
      }

      const attachmentEntries: OrderDiaryAudit[] = (attachmentsResult.data ?? []).map((row) => ({
        id: `attachment-${row.id}`,
        audit_type: "documento",
        title: "Documento caricato",
        description: [row.file_name, row.file_type, formatFileSize(row.file_size)].filter(Boolean).join(" · "),
        actor_id: row.uploaded_by,
        actor_name: profileName(profileMap.get(row.uploaded_by)),
        created_at: row.created_at,
        metadata: {
          visibile_cliente: row.visible_to_customer,
          dimensione: formatFileSize(row.file_size),
        },
      }));

      const photoEntries: OrderDiaryAudit[] = (photosResult.data ?? []).map((row) => ({
        id: `photo-${row.id}`,
        audit_type: "foto",
        title: "Foto cantiere caricata",
        description: row.descrizione || row.storage_path.split("/").pop() || "Foto cantiere",
        actor_id: row.uploaded_by,
        actor_name: profileName(profileMap.get(row.uploaded_by)),
        created_at: row.taken_at || row.created_at || new Date().toISOString(),
        metadata: {
          gps: row.latitudine != null && row.longitudine != null,
          tag: row.tags?.join(", ") || null,
        },
      }));

      const rapportinoEntries: OrderDiaryAudit[] = (rapportiniResult.data ?? []).map((row) => ({
        id: `rapportino-${row.id}`,
        audit_type: "rapportino",
        title: row.role_type === "subcontractor" ? "Aggiornamento subappaltatore" : "Aggiornamento operaio",
        description: [
          row.descrizione_lavori || "Rapportino campo",
          row.ore_lavorate != null ? `${row.ore_lavorate}h lavorate` : null,
          row.percentuale_avanzamento != null ? `${row.percentuale_avanzamento}% avanzamento` : null,
          row.foto_urls?.length ? `${row.foto_urls.length} foto` : null,
          row.lavoro_completato ? "lavoro completato" : null,
        ].filter(Boolean).join(" · "),
        actor_id: row.user_id,
        actor_name: profileName(profileMap.get(row.user_id)),
        created_at: row.created_at || row.data_lavoro,
        metadata: {
          data_lavoro: row.data_lavoro,
          firma_cliente: row.firma_cliente_at ? `${row.firma_cliente_nome || "Cliente"} · ${row.firma_cliente_at}` : null,
        },
      }));

      const signatureEntries: OrderDiaryAudit[] = (signaturesResult.data ?? []).map((row) => ({
        id: `signature-${row.id}`,
        audit_type: "firma",
        title: row.status === "signed" ? "Documento firmato" : "Firma richiesta",
        description: [
          row.tipo_documento || "Documento commessa",
          row.signer_name || row.signer_email,
          row.status === "signed" && row.signed_at ? `firmato il ${row.signed_at}` : `stato ${row.status}`,
        ].filter(Boolean).join(" · "),
        actor_id: row.created_by,
        actor_name: profileName(profileMap.get(row.created_by)),
        created_at: row.status === "signed" && row.signed_at ? row.signed_at : row.created_at,
        metadata: {
          firmatario: row.signer_name || row.signer_email,
          stato: row.status,
          tipo_firmatario: row.tipo_firmatario,
        },
      }));

      const ticketEntries: OrderDiaryAudit[] = (ticketsResult.data ?? []).map((row) => ({
        id: `ticket-${row.id}`,
        audit_type: "assistenza",
        title: "Assistenza collegata",
        description: [
          row.subject,
          row.status,
          row.priority ? `priorita ${row.priority}` : null,
          row.data_intervento_effettiva ? `fatta il ${row.data_intervento_effettiva}` : row.data_intervento_prevista ? `prevista il ${row.data_intervento_prevista}` : null,
        ].filter(Boolean).join(" · "),
        actor_id: row.assigned_to,
        actor_name: profileName(profileMap.get(row.assigned_to || "")),
        created_at: row.data_intervento_effettiva || row.data_intervento_prevista || row.created_at,
        metadata: {
          stato: row.status,
          tipo: row.tipo,
        },
      }));

      return [
        ...attachmentEntries,
        ...photoEntries,
        ...rapportinoEntries,
        ...signatureEntries,
        ...ticketEntries,
      ];
    },
    enabled: !!orderId && !!effectiveCompany?.id,
    staleTime: 60_000,
  });

  // ── Supabase Realtime subscription ────────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;
    const channelName = `order-diary-${orderId}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(channelName);

    try {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_messages",
            filter: `order_id=eq.${orderId}`,
          },
          () => { qc.invalidateQueries({ queryKey: ["order-messages", orderId] }); }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_events",
            filter: `order_id=eq.${orderId}`,
          },
          () => { qc.invalidateQueries({ queryKey: ["order-events", orderId] }); }
        )
        .subscribe((status, error) => {
          if (error) {
            logger.warn("Order diary realtime subscription failed", { orderId, status, error });
          }
        });
    } catch (error) {
      logger.warn("Order diary realtime setup failed", { orderId, error });
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, qc]);

  // ── Timeline unificata (merge + sort) ─────────────────────────────────────
  const timeline: DiaryEntry[] = useMemo(() => {
    const evts = events.map(e => ({ kind: "event" as const, data: e, ts: e.created_at }));
    const msgs = messages.map(m => ({ kind: "message" as const, data: m, ts: m.created_at }));
    const audits = auditEntries.map(a => ({ kind: "audit" as const, data: a, ts: a.created_at }));
    return [...evts, ...msgs, ...audits].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [auditEntries, events, messages]);

  // ── Send message mutation ─────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (payload: {
      channel: string;
      to_name: string;
      to_email?: string;
      to_phone?: string;
      subject?: string;
      body: string;
      template_id?: string;
    }) => {
      const { error } = await supabase.functions.invoke("send-order-message", {
        body: { order_id: orderId, ...payload },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
      qc.invalidateQueries({ queryKey: ["order-diary-audit", orderId] });
    },
  });

  // ── Add internal note mutation ────────────────────────────────────────────
  const addNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.functions.invoke("send-order-message", {
        body: { order_id: orderId, channel: "nota_interna", to_name: "", body },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
      qc.invalidateQueries({ queryKey: ["order-diary-audit", orderId] });
    },
  });

  return {
    timeline,
    templates,
    sendMutation,
    addNoteMutation,
    isLoading: eventsLoading || messagesLoading || auditLoading,
    isError: eventsError || messagesError || auditError,
  };
}
