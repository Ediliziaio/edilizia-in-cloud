import { supabase } from "@/integrations/supabase/client";
import { areTagListsExactlyEqual, normalizeTagList, normalizeTagName } from "@/lib/marketingTags";

/**
 * Merge opportunity tags into the linked contact's tags.
 * New tags are added; existing tags are preserved.
 */
export async function syncTagsToContact(contactId: string, newTags: string[], companyId?: string) {
  const incomingTags = normalizeTagList(newTags);
  if (!contactId || incomingTags.length === 0) return;

  let query = supabase
    .from("marketing_contacts")
    .select("tags")
    .eq("id", contactId);
  if (companyId) query = query.eq("company_id", companyId);
  const { data: contact, error: fetchError } = await query.single();

  if (fetchError) throw fetchError;
  if (!contact) return;

  const merged = normalizeTagList([...(contact.tags || []), ...incomingTags]);

  if (!areTagListsExactlyEqual(contact.tags || [], merged)) {
    let updateQuery = supabase
      .from("marketing_contacts")
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq("id", contactId);
    if (companyId) updateQuery = updateQuery.eq("company_id", companyId);
    const { error } = await updateQuery;
    if (error) throw error;
  }
}

/**
 * Sync contact tags to all linked opportunities.
 * Merges the contact's tags into each opportunity.
 */
export async function syncTagsToOpportunities(contactId: string, newTags: string[], companyId?: string) {
  const incomingTags = normalizeTagList(newTags);
  if (!contactId || incomingTags.length === 0) return;

  let query = supabase
    .from("marketing_opportunities")
    .select("id, tags")
    .eq("contact_id", contactId);
  if (companyId) query = query.eq("company_id", companyId);
  const { data: opps, error: fetchError } = await query;

  if (fetchError) throw fetchError;
  if (!opps || opps.length === 0) return;

  const updates = opps
    .map((opp) => {
      const merged = normalizeTagList([...(opp.tags || []), ...incomingTags]);
      if (!areTagListsExactlyEqual(opp.tags || [], merged)) {
        let updateQuery = supabase
          .from("marketing_opportunities")
          .update({ tags: merged, updated_at: new Date().toISOString() })
          .eq("id", opp.id);
        if (companyId) updateQuery = updateQuery.eq("company_id", companyId);
        return updateQuery.then(({ error }) => { if (error) throw error; });
      }
      return null;
    })
    .filter(Boolean);

  await Promise.all(updates);
}

/**
 * When a tag is removed from an opportunity, remove it from the linked contact too.
 */
export async function removeTagFromContact(contactId: string, removedTag: string, companyId?: string) {
  const normalizedRemovedTag = normalizeTagName(removedTag);
  if (!contactId || !normalizedRemovedTag) return;

  let query = supabase
    .from("marketing_contacts")
    .select("tags")
    .eq("id", contactId);
  if (companyId) query = query.eq("company_id", companyId);
  const { data: contact, error: fetchError } = await query.single();

  if (fetchError) throw fetchError;
  if (!contact) return;

  if (normalizeTagList(contact.tags || []).includes(normalizedRemovedTag)) {
    const filtered = normalizeTagList(contact.tags || []).filter((tag) => tag !== normalizedRemovedTag);
    let updateQuery = supabase
      .from("marketing_contacts")
      .update({ tags: filtered, updated_at: new Date().toISOString() })
      .eq("id", contactId);
    if (companyId) updateQuery = updateQuery.eq("company_id", companyId);
    const { error } = await updateQuery;
    if (error) throw error;
  }
}

/**
 * When a tag is removed from a contact, remove it from all linked opportunities too.
 */
export async function removeTagFromOpportunities(contactId: string, removedTag: string, companyId?: string) {
  const normalizedRemovedTag = normalizeTagName(removedTag);
  if (!contactId || !normalizedRemovedTag) return;

  let query = supabase
    .from("marketing_opportunities")
    .select("id, tags")
    .eq("contact_id", contactId);
  if (companyId) query = query.eq("company_id", companyId);
  const { data: opps, error: fetchError } = await query;

  if (fetchError) throw fetchError;
  if (!opps || opps.length === 0) return;

  const updates = opps
    .map((opp) => {
      const currentTags = normalizeTagList(opp.tags || []);
      if (currentTags.includes(normalizedRemovedTag)) {
        const filtered = currentTags.filter((tag) => tag !== normalizedRemovedTag);
        let updateQuery = supabase
          .from("marketing_opportunities")
          .update({ tags: filtered, updated_at: new Date().toISOString() })
          .eq("id", opp.id);
        if (companyId) updateQuery = updateQuery.eq("company_id", companyId);
        return updateQuery.then(({ error }) => { if (error) throw error; });
      }
      return null;
    })
    .filter(Boolean);

  await Promise.all(updates);
}
