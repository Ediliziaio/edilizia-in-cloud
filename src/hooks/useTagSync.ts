import { supabase } from "@/integrations/supabase/client";

/**
 * Merge opportunity tags into the linked contact's tags.
 * New tags are added; existing tags are preserved.
 */
export async function syncTagsToContact(contactId: string, newTags: string[]) {
  if (!contactId || newTags.length === 0) return;

  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("tags")
    .eq("id", contactId)
    .single();

  if (!contact) return;

  const merged = [...new Set([...(contact.tags || []), ...newTags])];

  // Only update if there are actually new tags
  if (merged.length !== (contact.tags || []).length) {
    await supabase
      .from("marketing_contacts")
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq("id", contactId);
  }
}

/**
 * Sync contact tags to all linked opportunities.
 * Merges the contact's tags into each opportunity.
 */
export async function syncTagsToOpportunities(contactId: string, newTags: string[]) {
  if (!contactId) return;

  const { data: opps } = await supabase
    .from("marketing_opportunities")
    .select("id, tags")
    .eq("contact_id", contactId);

  if (!opps || opps.length === 0) return;

  for (const opp of opps) {
    const merged = [...new Set([...(opp.tags || []), ...newTags])];
    if (merged.length !== (opp.tags || []).length) {
      await supabase
        .from("marketing_opportunities")
        .update({ tags: merged, updated_at: new Date().toISOString() })
        .eq("id", opp.id);
    }
  }
}

/**
 * When a tag is removed from a contact, remove it from all linked opportunities too.
 */
export async function removeTagFromOpportunities(contactId: string, removedTag: string) {
  if (!contactId || !removedTag) return;

  const { data: opps } = await supabase
    .from("marketing_opportunities")
    .select("id, tags")
    .eq("contact_id", contactId);

  if (!opps || opps.length === 0) return;

  for (const opp of opps) {
    if ((opp.tags || []).includes(removedTag)) {
      const filtered = (opp.tags || []).filter((t: string) => t !== removedTag);
      await supabase
        .from("marketing_opportunities")
        .update({ tags: filtered, updated_at: new Date().toISOString() })
        .eq("id", opp.id);
    }
  }
}
