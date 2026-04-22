// ============================================================================
// emailTemplates — re-export tipato del registry condiviso
// ============================================================================
// Re-esporta TEMPLATE_META da `supabase/functions/_shared/email-templates/placeholders.ts`
// così che UI React e Edge Functions Deno usino lo stesso source of truth.
//
// Il file originale è pure-TS (niente Deno) proprio per questo: gli import
// HTTP (esm.sh) avrebbero rotto la build Vite. Qualunque nuovo placeholder
// definito là è immediatamente disponibile qui.
// ============================================================================

export {
  TEMPLATE_META,
  EDITABLE_TEMPLATE_KEYS,
  getTemplateMeta,
  type TemplateMeta,
  type PlaceholderDef,
} from "../../supabase/functions/_shared/email-templates/placeholders";

export {
  applyPlaceholders,
  extractPlaceholderKeys,
  htmlToPlainText,
} from "../../supabase/functions/_shared/email-templates/applyPlaceholders";
