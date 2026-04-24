import { supabase } from "@/integrations/supabase/client";

export interface RenderGalleryMetaSource {
  created_by?: string | null;
  contact_id?: string | null;
  opportunity_id?: string | null;
}

export interface RenderGalleryMeta {
  createdByName: string | null;
  contactName: string | null;
  opportunityName: string | null;
}

const compactName = (...parts: Array<string | null | undefined>) =>
  parts.map((part) => part?.trim()).filter(Boolean).join(" ") || null;

export async function loadRenderGalleryMeta(rows: RenderGalleryMetaSource[]): Promise<{
  byUser: Record<string, string>;
  byContact: Record<string, string>;
  byOpportunity: Record<string, string>;
}> {
  const userIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean) as string[])];
  const contactIds = [...new Set(rows.map((row) => row.contact_id).filter(Boolean) as string[])];
  const opportunityIds = [...new Set(rows.map((row) => row.opportunity_id).filter(Boolean) as string[])];

  const [usersRes, contactsRes, opportunitiesRes] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length
      ? supabase.from("marketing_contacts").select("id, first_name, last_name, company_name, email").in("id", contactIds)
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length
      ? supabase.from("marketing_opportunities").select("id, name").in("id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (contactsRes.error) throw contactsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;

  const byUser: Record<string, string> = {};
  for (const user of usersRes.data ?? []) {
    byUser[user.id] = compactName(user.first_name, user.last_name) || user.email || "Utente";
  }

  const byContact: Record<string, string> = {};
  for (const contact of contactsRes.data ?? []) {
    byContact[contact.id] =
      compactName(contact.first_name, contact.last_name) ||
      contact.company_name ||
      contact.email ||
      "Contatto";
  }

  const byOpportunity: Record<string, string> = {};
  for (const opportunity of opportunitiesRes.data ?? []) {
    byOpportunity[opportunity.id] = opportunity.name || "Opportunità";
  }

  return { byUser, byContact, byOpportunity };
}

export function resolveRenderGalleryMeta(
  row: RenderGalleryMetaSource,
  maps: Awaited<ReturnType<typeof loadRenderGalleryMeta>>,
): RenderGalleryMeta {
  return {
    createdByName: row.created_by ? maps.byUser[row.created_by] ?? null : null,
    contactName: row.contact_id ? maps.byContact[row.contact_id] ?? null : null,
    opportunityName: row.opportunity_id ? maps.byOpportunity[row.opportunity_id] ?? null : null,
  };
}
