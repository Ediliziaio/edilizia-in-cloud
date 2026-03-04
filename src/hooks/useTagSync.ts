import { supabase } from "@/integrations/supabase/client";

/**
 * Merge opportunity tags into the linked contact's tags.
 * New tags are added; existing tags are preserved.
 */
export async function syncTagsToContact(contactId: string, newTags: string[]) {
  if (!contactId || newTags.length === 0) return;

  const { data: contact, error: fetchError } = await supabase
    .from("marketing_contacts")
    .select("tags")
    .eq("id", contactId)
    .single();

  if (fetchError) throw fetchError;
  if (!contact) return;

  const merged = [...new Set([...(contact.tags || []), ...newTags])];

  if (merged.length !== (contact.tags || []).length) {
    const { error } = await supabase
      .from("marketing_contacts")
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq("id", contactId);
    if (error) throw error;
  }
}

/**
 * Sync contact tags to all linked opportunities.
 * Merges the contact's tags into each opportunity.
 */
export async function syncTagsToOpportunities(contactId: string, newTags: string[]) {
  if (!contactId) return;

  const { data: opps, error: fetchError } = await supabase
    .from("marketing_opportunities")
    .select("id, tags")
    .eq("contact_id", contactId);

  if (fetchError) throw fetchError;
  if (!opps || opps.length === 0) return;

  const updates = opps
    .map((opp) => {
      const merged = [...new Set([...(opp.tags || []), ...newTags])];
      if (merged.length !== (opp.tags || []).length) {
        return supabase
          .from("marketing_opportunities")
          .update({ tags: merged, updated_at: new Date().toISOString() })
          .eq("id", opp.id)
          .then(({ error }) => { if (error) throw error; });
      }
      return null;
    })
    .filter(Boolean);

  await Promise.all(updates);
}

/**
 * When a tag is removed from an opportunity, remove it from the linked contact too.
 */
export async function removeTagFromContact(contactId: string, removedTag: string) {
  if (!contactId || !removedTag) return;

  const { data: contact, error: fetchError } = await supabase
    .from("marketing_contacts")
    .select("tags")
    .eq("id", contactId)
    .single();

  if (fetchError) throw fetchError;
  if (!contact) return;

  if ((contact.tags || []).includes(removedTag)) {
    const filtered = (contact.tags || []).filter((t: string) => t !== removedTag);
    const { error } = await supabase
      .from("marketing_contacts")
      .update({ tags: filtered, updated_at: new Date().toISOString() })
      .eq("id", contactId);
    if (error) throw error;
  }
}

/**
 * When a tag is removed from a contact, remove it from all linked opportunities too.
 */
export async function removeTagFromOpportunities(contactId: string, removedTag: string) {
  if (!contactId || !removedTag) return;

  const { data: opps, error: fetchError } = await supabase
    .from("marketing_opportunities")
    .select("id, tags")
    .eq("contact_id", contactId);

  if (fetchError) throw fetchError;
  if (!opps || opps.length === 0) return;

  const updates = opps
    .map((opp) => {
      if ((opp.tags || []).includes(removedTag)) {
        const filtered = (opp.tags || []).filter((t: string) => t !== removedTag);
        return supabase
          .from("marketing_opportunities")
          .update({ tags: filtered, updated_at: new Date().toISOString() })
          .eq("id", opp.id)
          .then(({ error }) => { if (error) throw error; });
      }
      return null;
    })
    .filter(Boolean);

  await Promise.all(updates);
}
