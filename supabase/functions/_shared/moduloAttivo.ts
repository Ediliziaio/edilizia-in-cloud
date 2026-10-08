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
  const { data: ov, error: overrideError } = await db.from("company_feature_overrides")
    .select("access_level, is_enabled, expires_at")
    .eq("company_id", companyId).eq("feature_key", featureKey).maybeSingle();
  if (overrideError) throw new Error("Abilitazione del modulo non verificabile.");
  if (ov && ov.is_enabled !== null && (ov.expires_at === null || new Date(ov.expires_at) > new Date())) {
    return vero(ov.access_level, ov.is_enabled);
  }
  const { data: comp, error: companyError } = await db.from("companies")
    .select("subscription_plan_id, subscription_plans(slug)").eq("id", companyId).maybeSingle();
  if (companyError || !comp) throw new Error("Azienda del modulo non verificabile.");
  const planId = comp?.subscription_plan_id ?? null;
  const planSlug = comp?.subscription_plans?.slug ?? null;
  if (planId) {
    const { data: pd, error: planError } = await db.from("plan_feature_defaults")
      .select("access_level, is_enabled").eq("plan_id", planId).eq("feature_key", featureKey).maybeSingle();
    if (planError) throw new Error("Piano del modulo non verificabile.");
    if (pd) return vero(pd.access_level, pd.is_enabled);
  }
  const { data: flag, error: flagError } = await db.from("platform_feature_flags")
    .select("default_value, plans_included").eq("key", featureKey).maybeSingle();
  if (flagError) throw new Error("Disponibilità del modulo non verificabile.");
  if (planSlug && Array.isArray(flag?.plans_included) && flag.plans_included.includes(planSlug)) return true;
  return flag?.default_value === true;
}
