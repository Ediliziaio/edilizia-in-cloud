/** Exact plan lookup. Never strip punctuation into another billable plan. */
export async function platformSubscriptionPlan(supabase: any, reference: unknown): Promise<any | null> {
  const ref = String(reference ?? "").trim();
  if (!ref) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const columns = "id, name, slug, trial_days, price_monthly";
  const { data, error } = await supabase.from("subscription_plans").select(columns)
    .eq(uuid ? "id" : "slug", uuid ? ref : ref.toLowerCase()).maybeSingle();
  if (error) throw error;
  if (data || uuid) return data;
  const { data: byName, error: nameError } = await supabase.from("subscription_plans").select(columns).eq("name", ref).maybeSingle();
  if (nameError) throw nameError; // Ambiguity must be resolved with the UUID.
  return byName;
}
