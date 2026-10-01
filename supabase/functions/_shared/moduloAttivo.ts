// Gate di un modulo (feature) per un'azienda, leggibile con client di servizio.
//
// La RPC resolve_company_feature ha una guardia anti-cross-tenant su auth.uid e
// rifiuta le chiamate di servizio (bot, cron, edge). Qui replichiamo la stessa
// priorità con letture dirette: override azienda > default del piano > piano
// incluso nel flag > default del flag. Usare SOLO dopo aver già verificato che
// l'utente appartenga all'azienda (il bot lo fa a monte, dall'identità WhatsApp).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const vero = (accessLevel: Any, isEnabled: Any) => accessLevel === "enabled" || isEnabled === true;

export async function moduloAttivo(db: Any, companyId: string, featureKey: string): Promise<boolean> {
  const { data: ov } = await db.from("company_feature_overrides")
    .select("access_level, is_enabled, expires_at")
    .eq("company_id", companyId).eq("feature_key", featureKey).maybeSingle();
  if (ov && ov.is_enabled !== null && (ov.expires_at === null || new Date(ov.expires_at) > new Date())) {
    return vero(ov.access_level, ov.is_enabled);
  }
  const { data: comp } = await db.from("companies")
    .select("subscription_plan_id, subscription_plans(slug)").eq("id", companyId).maybeSingle();
  const planId = comp?.subscription_plan_id ?? null;
  const planSlug = comp?.subscription_plans?.slug ?? null;
  if (planId) {
    const { data: pd } = await db.from("plan_feature_defaults")
      .select("access_level, is_enabled").eq("plan_id", planId).eq("feature_key", featureKey).maybeSingle();
    if (pd) return vero(pd.access_level, pd.is_enabled);
  }
  const { data: flag } = await db.from("platform_feature_flags")
    .select("default_value, plans_included").eq("key", featureKey).maybeSingle();
  if (planSlug && Array.isArray(flag?.plans_included) && flag.plans_included.includes(planSlug)) return true;
  return flag?.default_value === true;
}
