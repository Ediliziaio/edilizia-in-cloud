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

// Supabase URL caps `IN ()` filters at a few thousand items in practice (and
// the URL itself caps near ~16 KB). Chunking keeps each request bounded for
// gallerie con migliaia di sessioni.
const META_BATCH_SIZE = 500;

async function fetchInBatches<T>(
  ids: string[],
  fetcher: (chunk: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += META_BATCH_SIZE) {
    const chunk = ids.slice(i, i + META_BATCH_SIZE);
    const { data, error } = await fetcher(chunk);
    if (error) throw new Error(error.message);
    if (data) out.push(...data);
  }
  return out;
}

export async function loadRenderGalleryMeta(rows: RenderGalleryMetaSource[]): Promise<{
  byUser: Record<string, string>;
  byContact: Record<string, string>;
  byOpportunity: Record<string, string>;
}> {
  const userIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean) as string[])];
  const contactIds = [...new Set(rows.map((row) => row.contact_id).filter(Boolean) as string[])];
  const opportunityIds = [...new Set(rows.map((row) => row.opportunity_id).filter(Boolean) as string[])];

  type ProfileRow = { id: string; first_name: string | null; last_name: string | null; email: string | null };
  type ContactRow = { id: string; first_name: string | null; last_name: string | null; company_name: string | null; email: string | null };
  type OpportunityRow = { id: string; name: string | null };

  const [users, contacts, opportunities] = await Promise.all([
    fetchInBatches<ProfileRow>(userIds, (chunk) =>
      supabase.from("profiles").select("id, first_name, last_name, email").in("id", chunk),
    ),
    fetchInBatches<ContactRow>(contactIds, (chunk) =>
      supabase.from("marketing_contacts").select("id, first_name, last_name, company_name, email").in("id", chunk),
    ),
    fetchInBatches<OpportunityRow>(opportunityIds, (chunk) =>
      supabase.from("marketing_opportunities").select("id, name").in("id", chunk),
    ),
  ]);

  const byUser: Record<string, string> = {};
  for (const user of users) {
    byUser[user.id] = compactName(user.first_name, user.last_name) || user.email || "Utente";
  }

  const byContact: Record<string, string> = {};
  for (const contact of contacts) {
    byContact[contact.id] =
      compactName(contact.first_name, contact.last_name) ||
      contact.company_name ||
      contact.email ||
      "Contatto";
  }

  const byOpportunity: Record<string, string> = {};
  for (const opportunity of opportunities) {
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
