import { supabase } from "@/integrations/supabase/client";

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
    page_path: payload.page_path?.trim() || null,
    context_label: payload.context_label?.trim() || null,
  };

  const { data, error } = await supabase.functions.invoke("public-lead-submit", {
    body: normalized,
  });

  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error?: unknown }).error || "Invio non riuscito"));
  }

  return data as { ok: boolean; contact_id?: string; request_id?: string | null };
}
