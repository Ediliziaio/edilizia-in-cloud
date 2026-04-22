// ============================================================================
// resolveTemplate — DB-first lookup con fallback silenzioso a code
// ============================================================================
// Cerca in `platform_email_templates` una riga attiva per
// `(template_key, role_variant)`. Se non c'è ritorna null → il chiamante
// (renderTemplate.ts) fa fallback al renderer hardcoded in code.
//
// Pattern conservativo: QUALSIASI errore DB (connessione, RLS, schema mismatch)
// ritorna null. L'invio email non può fallire per colpa di questa tabella
// "opzionale": il renderer hardcoded è la ground truth di riferimento.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PlatformTemplateOverride {
  subject: string;
  html_body: string;
  text_body: string | null;
  version: number;
}

/**
 * Lookup del template attivo per (template_key, role_variant).
 *
 * Ordine di fallback:
 *   1. Esatto match (template_key, role_variant) con enabled=true
 *   2. Se role_variant è passato ma non trovato → default (role_variant IS NULL)
 *   3. Nessuna riga → null (il caller userà il fallback code)
 *
 * Errori DB ingoiati: ritornano null. Il log va a console.error ma
 * l'email continua ad essere inviata via code.
 */
export async function resolveTemplate(
  adminClient: SupabaseClient,
  templateKey: string,
  roleVariant?: string | null,
): Promise<PlatformTemplateOverride | null> {
  try {
    // Step 1: match esatto per variant (se specificato)
    if (roleVariant) {
      const variantRes = await (adminClient as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                eq: (c: string, v: boolean) => {
                  maybeSingle: () => Promise<{ data: PlatformTemplateOverride | null; error: unknown }>;
                };
              };
            };
          };
        };
      })
        .from("platform_email_templates")
        .select("subject, html_body, text_body, version")
        .eq("template_key", templateKey)
        .eq("role_variant", roleVariant)
        .eq("enabled", true)
        .maybeSingle();

      if (variantRes.data) return variantRes.data;
    }

    // Step 2: default (role_variant IS NULL)
    const defaultRes = await (adminClient as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            is: (c: string, v: null) => {
              eq: (c: string, v: boolean) => {
                maybeSingle: () => Promise<{ data: PlatformTemplateOverride | null; error: unknown }>;
              };
            };
          };
        };
      };
    })
      .from("platform_email_templates")
      .select("subject, html_body, text_body, version")
      .eq("template_key", templateKey)
      .is("role_variant", null)
      .eq("enabled", true)
      .maybeSingle();

    return defaultRes.data ?? null;
  } catch (err) {
    // Conservative: qualunque errore → fallback silenzioso al code.
    // Logga per debug ma non interrompe l'invio.
    console.error(`[resolveTemplate] lookup failed for ${templateKey}:`, err);
    return null;
  }
}
