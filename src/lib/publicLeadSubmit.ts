import { supabase } from "@/integrations/supabase/client";
import { trackPixel } from "@/lib/meta/fbcTracker";
import { sessionId } from "@/lib/analytics/siteTracker";

export type PublicLeadPayload = {
  nome: string;
  email: string;
  telefono: string;
  azienda: string;
  messaggio?: string | null;
  source: string;
  marketing_consent?: boolean;
  tags?: string[];
  render_slug?: string | null;
  page_path?: string | null;
  context_label?: string | null;
  /** Codice referral del partner (catturato da ReferralLanding in localStorage). */
  referral_code?: string | null;
  /** Sessione di navigazione: collega la richiesta al percorso sul sito. */
  session_id?: string | null;
};

export async function submitPublicLeadToCrm(payload: PublicLeadPayload) {
  const normalized = {
    ...payload,
    nome: payload.nome.trim(),
    email: payload.email.trim().toLowerCase(),
    telefono: payload.telefono.trim(),
    azienda: payload.azienda.trim(),
    messaggio: payload.messaggio?.trim() || null,
    marketing_consent: Boolean(payload.marketing_consent),
    tags: Array.from(new Set((payload.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))),
    render_slug: payload.render_slug?.trim() || null,
    // La pagina di provenienza la mandava solo 1 form su 4, e la funzione la
    // scrive già nell'attività e nella mail di avviso: la si riempie qui, una
    // volta per tutte, così vale anche per i form che verranno.
    page_path:
      payload.page_path?.trim() ||
      (typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : null) ||
      null,
    context_label: payload.context_label?.trim() || null,
    referral_code: payload.referral_code?.trim() || null,
    session_id:
      payload.session_id?.trim() ||
      (typeof window !== "undefined" ? sessionId() : null) ||
      null,
  };

  const { data, error } = await supabase.functions.invoke("public-lead-submit", {
    body: normalized,
  });

  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error?: unknown }).error || "Invio non riuscito"));
  }

  // Meta Pixel — Lead: choke-point di TUTTI i form pubblici (demo, modali,
  // landing). Scatta solo a invio confermato e solo sul sito marketing
  // (no-op altrove). content_name = sorgente del lead per segmentare in Ads.
  trackPixel("Lead", {
    content_name: normalized.source || "public_form",
    content_category: "lead",
  });

  return data as { ok: boolean; contact_id?: string; request_id?: string | null };
}

/**
 * Aggancia un lead appena inviato al partner referral (best-effort).
 *
 * Va chiamata DOPO submitPublicLeadToCrm (il contatto-lead deve già esistere).
 * È fire-and-forget: non deve mai rompere la UX del form, quindi assorbe ogni
 * errore. L'attribuzione vera la fa l'edge function referral-attach-lead, che
 * risolve il partner dal codice e annota il contatto.
 */
export async function attachReferralToLead(email: string, referralCode: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = referralCode.trim();
  if (!cleanEmail || !cleanCode) return;
  try {
    await supabase.functions.invoke("referral-attach-lead", {
      body: { email: cleanEmail, referral_code: cleanCode },
    });
  } catch (err) {
    // Non blocchiamo: l'attribuzione è un nice-to-have, il lead è già salvo.
    console.warn("[referral] attach failed:", err);
  }
}
