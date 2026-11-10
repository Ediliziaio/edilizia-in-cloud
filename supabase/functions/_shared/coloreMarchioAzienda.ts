/**
 * Il colore del marchio che l'azienda ha scelto in «Brand & Azienda» (`companies.brand_primary_color`), per l'accento
 * dei documenti HTML (SAL, giornale: stileDocumenti.ts). Il colore di fabbrica della colonna non conta (temaColori).
 * Non lancia mai: senza, il documento usa l'anagrafica o l'accento predefinito (10/11/2026).
 */
import { marchioScelto } from "./temaColori.ts";

// deno-lint-ignore no-explicit-any
export async function leggiColoreMarchio(db: any, companyId: string): Promise<string | null> {
  try {
    const { data, error } = await db.from("companies").select("brand_primary_color").eq("id", companyId).maybeSingle();
    if (error) return null;
    return marchioScelto(data?.brand_primary_color);
  } catch {
    return null;
  }
}
