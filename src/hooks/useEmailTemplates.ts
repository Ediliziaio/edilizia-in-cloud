// ============================================================================
// useEmailTemplates — CRUD per platform_email_templates (super_admin)
// ============================================================================
// Tipo locale perché types.ts di Supabase non è ancora rigenerato dopo la
// migration 20261001001000 (pattern coerente con EmailSuppressionsTable).
// ============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Tipi locali (types.ts legacy, non rigenerato) ───────────────────────────
/**
 * Design JSON dell'editor visuale (Unlayer/react-email-editor).
 * Struttura interna opaca — la libreria sa leggere/scrivere il proprio formato.
 * Salvato come `unknown` per evitare tight coupling con la versione di Unlayer.
 */
export type EmailTemplateDesignJson = Record<string, unknown>;

export interface EmailTemplateRow {
  id: string;
  template_key: string;
  role_variant: string | null;
  subject: string;
  html_body: string;
  text_body: string | null;
  /**
   * Design del visual builder. Se NON null l'editor apre in modalità visuale.
   * Se null (template legacy) apre solo in modalità HTML raw.
   */
  design_json: EmailTemplateDesignJson | null;
  enabled: boolean;
  version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface EmailTemplateUpsert {
  template_key: string;
  role_variant?: string | null;
  subject: string;
  html_body: string;
  text_body?: string | null;
  design_json?: EmailTemplateDesignJson | null;
  enabled?: boolean;
  notes?: string | null;
}

const QUERY_KEY = ["admin-email-templates"] as const;

/**
 * Lista di tutti i template personalizzati in DB.
 * I template senza riga in DB usano il default di codice — la UI li mostra
 * comunque mergiando la lista con EDITABLE_TEMPLATE_KEYS.
 */
export function useEmailTemplates() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<EmailTemplateRow[]> => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{
              data: EmailTemplateRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      })
        .from("platform_email_templates")
        .select("*")
        .order("template_key", { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useUpsertEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EmailTemplateUpsert): Promise<EmailTemplateRow> => {
      // Insert o update basato su (template_key, role_variant)
      // Usando upsert con onConflict sulla unique constraint.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (
            row: Record<string, unknown>,
            opts: { onConflict: string },
          ) => {
            select: () => {
              single: () => Promise<{
                data: EmailTemplateRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("platform_email_templates")
        .upsert(
          {
            template_key: input.template_key,
            role_variant: input.role_variant ?? null,
            subject: input.subject,
            html_body: input.html_body,
            text_body: input.text_body ?? null,
            design_json: input.design_json ?? null,
            enabled: input.enabled ?? true,
            notes: input.notes ?? null,
          },
          { onConflict: "template_key,role_variant" },
        )
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Upsert non ha restituito la riga salvata");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Template salvato");
    },
    onError: (err: Error) => {
      toast.error(`Errore salvataggio: ${err.message}`);
    },
  });
}

/**
 * Rimuove la personalizzazione per una coppia (template_key, role_variant).
 * Dopo il delete il resolver torna al fallback hardcoded in code.
 */
export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          delete: () => {
            eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("platform_email_templates")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Personalizzazione rimossa — il template torna al default");
    },
    onError: (err: Error) => {
      toast.error(`Errore rimozione: ${err.message}`);
    },
  });
}

/**
 * Chiama la edge function admin-preview-email-template per ottenere
 * l'HTML renderizzato completo (layout + branding + placeholder sostituiti).
 */
export interface PreviewResult {
  subject: string;
  html: string;
  text: string;
}

export function usePreviewEmailTemplate() {
  return useMutation({
    mutationKey: ["admin-preview-email-template"],
    meta: { silent: true },
    mutationFn: async (input: {
      subject: string;
      htmlBody: string;
      textBody?: string | null;
      mockProps?: Record<string, string>;
      roleVariant?: string | null;
    }): Promise<PreviewResult> => {
      const { data, error } = await supabase.functions.invoke(
        "admin-preview-email-template",
        {
          body: {
            subject: input.subject,
            htmlBody: input.htmlBody,
            textBody: input.textBody ?? null,
            mockProps: input.mockProps ?? {},
            roleVariant: input.roleVariant ?? null,
          },
        },
      );
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Nessun dato ricevuto dalla preview");
      const d = data as Partial<PreviewResult> & { error?: string };
      if (d.error) throw new Error(d.error);
      if (typeof d.subject !== "string" || typeof d.html !== "string") {
        throw new Error("Risposta preview incompleta");
      }
      return {
        subject: d.subject,
        html: d.html,
        text: d.text ?? "",
      };
    },
  });
}

// ============================================================================
// History / Rollback
// ============================================================================
export interface EmailTemplateHistoryRow {
  id: string;
  template_id: string;
  template_key: string;
  role_variant: string | null;
  subject: string;
  html_body: string;
  text_body: string | null;
  design_json: EmailTemplateDesignJson | null;
  enabled: boolean;
  version: number;
  notes: string | null;
  changed_at: string;
  changed_by: string | null;
  change_type: "update" | "restore" | "delete";
}

/**
 * Storico revisioni per un template. `templateId` può essere null (es.
 * template non ancora salvato → nessuna history da leggere).
 */
export function useEmailTemplateHistory(templateId: string | null) {
  return useQuery({
    queryKey: ["admin-email-template-history", templateId] as const,
    enabled: !!templateId,
    queryFn: async (): Promise<EmailTemplateHistoryRow[]> => {
      if (!templateId) return [];
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{
                  data: EmailTemplateHistoryRow[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      })
        .from("platform_email_template_history")
        .select("*")
        .eq("template_id", templateId)
        .order("changed_at", { ascending: false })
        .limit(50);

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

/**
 * Ripristina una versione storica come contenuto corrente del template.
 * Usa la RPC `restore_email_template_from_history` che:
 *   - Aggiorna il template corrente con lo snapshot
 *   - Il trigger crea automaticamente una nuova riga history per la versione
 *     che abbiamo appena soppiantato (change_type='restore')
 */
export function useRollbackEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (historyId: string): Promise<EmailTemplateRow> => {
      const { data, error } = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: EmailTemplateRow | null;
          error: { message: string } | null;
        }>;
      }).rpc("restore_email_template_from_history", { p_history_id: historyId });

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Rollback non ha restituito la riga ripristinata");
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["admin-email-template-history", row.id] });
      toast.success(`Template ripristinato alla versione ${row.version}`);
    },
    onError: (err: Error) => {
      toast.error(`Errore rollback: ${err.message}`);
    },
  });
}

// ============================================================================
// Platform email signature (super_admin, platform_settings)
// ============================================================================
export interface PlatformEmailSignature {
  from_name: string;
  footer_text: string;
  support_mail: string;
  signature_text: string;
  signature_html: string;
}

const SIGNATURE_KEYS = [
  "email_default_from_name",
  "email_default_footer_text",
  "email_default_support_mail",
  "email_signature_text",
  "email_signature_html",
] as const;

const SIGNATURE_QUERY_KEY = ["admin-platform-email-signature"] as const;

export function usePlatformEmailSignature() {
  return useQuery({
    queryKey: SIGNATURE_QUERY_KEY,
    queryFn: async (): Promise<PlatformEmailSignature> => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (c: string, v: readonly string[]) => Promise<{
              data: Array<{ key: string; value: string }> | null;
              error: { message: string } | null;
            }>;
          };
        };
      })
        .from("platform_settings")
        .select("key, value")
        .in("key", SIGNATURE_KEYS);

      if (error) throw new Error(error.message);
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      return {
        from_name: map.get("email_default_from_name") ?? "",
        footer_text: map.get("email_default_footer_text") ?? "",
        support_mail: map.get("email_default_support_mail") ?? "",
        signature_text: map.get("email_signature_text") ?? "",
        signature_html: map.get("email_signature_html") ?? "",
      };
    },
    staleTime: 30_000,
  });
}

export function useUpsertPlatformEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlatformEmailSignature): Promise<void> => {
      const rows = [
        { key: "email_default_from_name", value: input.from_name },
        { key: "email_default_footer_text", value: input.footer_text },
        { key: "email_default_support_mail", value: input.support_mail },
        { key: "email_signature_text", value: input.signature_text },
        { key: "email_signature_html", value: input.signature_html },
      ];
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (
            r: Array<{ key: string; value: string }>,
            o: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("platform_settings")
        .upsert(rows, { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SIGNATURE_QUERY_KEY });
      toast.success("Firma di piattaforma aggiornata");
    },
    onError: (err: Error) => {
      toast.error(`Errore salvataggio firma: ${err.message}`);
    },
  });
}
