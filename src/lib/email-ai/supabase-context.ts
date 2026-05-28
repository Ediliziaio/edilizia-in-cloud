/**
 * MP-EMAIL-AI-01 — ClassifierContext implementato con supabase-js.
 *
 * Per uso CLIENT-side (React). Per edge function vedi
 * `supabase/functions/_shared/email-ai-classifier-context.ts` (gemello Deno).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClassifierContext,
  CrmMatchHit,
  EmailCategoria,
  EntitaTipo,
  MittenteNotoHit,
} from "./types";

/**
 * Costruisce un ClassifierContext bound a un company_id.
 *
 * Tutte le lookup sono RLS-friendly (vanno via session corrente).
 * Per uso in edge function con service_role, vedi gemello Deno.
 */
export function makeSupabaseClassifierContext(
  supabase: SupabaseClient,
  companyId: string,
): ClassifierContext {
  return {
    lookupMittenteNoto: async (email, dominio) => {
      return lookupMittenteNotoImpl(supabase, companyId, email, dominio);
    },
    matchCRM: async (email, dominio) => {
      return matchCRMImpl(supabase, companyId, email, dominio);
    },
  };
}

// ─── Implementazioni ──────────────────────────────────────────────────────────

async function lookupMittenteNotoImpl(
  supabase: SupabaseClient,
  companyId: string,
  email: string,
  dominio?: string,
): Promise<MittenteNotoHit | null> {
  // 1. Match esatto su email (più preciso)
  const { data: exactMatch } = await supabase
    .from("mittenti_noti")
    .select("categoria, entita_tipo, entita_id")
    .eq("company_id", companyId)
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (exactMatch) {
    return {
      categoria: exactMatch.categoria as EmailCategoria,
      entita_tipo: (exactMatch.entita_tipo as EntitaTipo) ?? null,
      entita_id: (exactMatch.entita_id as string | null) ?? null,
    };
  }

  // 2. Fallback su dominio (solo se non personale: gmail/outlook/yahoo/etc)
  if (dominio && !isPersonalDomain(dominio)) {
    const { data: domainMatch } = await supabase
      .from("mittenti_noti")
      .select("categoria, entita_tipo, entita_id")
      .eq("company_id", companyId)
      .eq("dominio", dominio.toLowerCase())
      .order("hit_count", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (domainMatch) {
      return {
        categoria: domainMatch.categoria as EmailCategoria,
        entita_tipo: (domainMatch.entita_tipo as EntitaTipo) ?? null,
        entita_id: (domainMatch.entita_id as string | null) ?? null,
      };
    }
  }

  return null;
}

async function matchCRMImpl(
  supabase: SupabaseClient,
  companyId: string,
  email: string,
  dominio: string,
): Promise<CrmMatchHit | null> {
  const emailLower = email.toLowerCase();

  // ─── Suppliers (fornitori) ──────────────────────────────────────────────
  // Match esatto su email
  const { data: supplierByEmail } = await (supabase as any)
    .from("suppliers")
    .select("id")
    .eq("company_id", companyId)
    .ilike("email", emailLower)
    .limit(1)
    .maybeSingle();

  if (supplierByEmail) {
    return {
      categoria: "fornitore",
      entita_tipo: "fornitore",
      entita_id: supplierByEmail.id as string,
      matched_field: "email",
    };
  }

  // ─── Employees (operai) ─────────────────────────────────────────────────
  const { data: employeeByEmail } = await (supabase as any)
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .ilike("email", emailLower)
    .limit(1)
    .maybeSingle();

  if (employeeByEmail) {
    return {
      categoria: "operaio",
      entita_tipo: "operaio",
      entita_id: employeeByEmail.id as string,
      matched_field: "email",
    };
  }

  // ─── Customers (clienti) ────────────────────────────────────────────────
  // NOTE: la tabella `customers` NON esiste in questa installazione (2026-05-28).
  // La "Lista Clienti" usa altre RPC/strutture. Quando esisterà una tabella
  // CRM clienti unificata, riabilitare il lookup qui.
  // Per ora i clienti vengono classificati via L3 Haiku + feedback loop manuale.

  // ─── Domain match — solo se NON personale (gmail/outlook/etc) ───────────
  if (!isPersonalDomain(dominio)) {
    // Fornitore via dominio (es. info@fornitore.it)
    const { data: supplierByDomain } = await (supabase as any)
      .from("suppliers")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", `%@${dominio.toLowerCase()}`)
      .limit(1)
      .maybeSingle();

    if (supplierByDomain) {
      return {
        categoria: "fornitore",
        entita_tipo: "fornitore",
        entita_id: supplierByDomain.id as string,
        matched_field: "domain",
      };
    }
  }

  return null;
}

// ─── Personal domains — escludi dal domain-match (gmail/outlook/...) ───────

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.it",
  "hotmail.com",
  "hotmail.it",
  "live.com",
  "live.it",
  "yahoo.com",
  "yahoo.it",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "libero.it",
  "alice.it",
  "tin.it",
  "tiscali.it",
  "virgilio.it",
  "fastwebnet.it",
  "fastweb.it",
  "email.it",
  "tim.it",
  "vodafone.it",
  "wind.it",
  "infinito.it",
  "iol.it",
  "katamail.com",
  "gmx.com",
  "gmx.it",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "tutanota.com",
  "tutamail.com",
  "aol.com",
  "mail.ru",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
]);

export function isPersonalDomain(domain: string): boolean {
  if (!domain) return false;
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}
