/**
 * creativeContext — accesso DB per la generazione di grafiche.
 *
 * Sta separato da brandCreativeRules.ts (che è puro e testato) perché qui
 * serve il client Supabase: brand aziendale e conteggio quota giornaliera.
 * Usato da ai-ads-image-generate (modulo Pubblicità) e silvio-generation-worker
 * (chat), così le due strade producono immagini con la STESSA identità e sotto
 * lo STESSO tetto di spesa.
 */

import {
  CREATIVE_DAILY_CAP_DEFAULT,
  quotaCreativitaSuperata,
  messaggioQuotaSuperata,
  type CompanyBrand,
} from "./brandCreativeRules.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/**
 * Identità visiva dell'azienda. Best-effort: se la lettura fallisce si torna
 * `null` e il prompt resta quello generico — mai bloccare una generazione per
 * il branding.
 */
export async function caricaBrandAzienda(admin: Client, companyId: string): Promise<CompanyBrand | null> {
  try {
    const { data } = await admin
      .from("companies")
      .select("name, brand_primary_color, brand_secondary_color, brand_accent_color, logo_url, vertical")
      .eq("id", companyId)
      .maybeSingle();
    if (!data) return null;
    return {
      nome: data.name ?? null,
      colorePrimario: data.brand_primary_color ?? null,
      coloreSecondario: data.brand_secondary_color ?? null,
      coloreAccento: data.brand_accent_color ?? null,
      logoUrl: data.logo_url ?? null,
      vertical: data.vertical ?? null,
    };
  } catch (e) {
    console.warn("[creativeContext] brand non leggibile:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Tetto giornaliero: env di piattaforma, altrimenti il default prudente. */
export function capGiornalieroCreativita(): number {
  const raw = Number(Deno.env.get("CREATIVE_DAILY_CAP") ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : CREATIVE_DAILY_CAP_DEFAULT;
}

export interface EsitoQuota {
  consentito: boolean;
  usateOggi: number;
  cap: number;
  messaggio?: string;
}

/**
 * Immagini AI già generate oggi dall'azienda, su ENTRAMBE le strade:
 * `ad_media` (modulo Pubblicità) + `silvio_generation_jobs` (chat). Senza
 * questa somma un utente aggirerebbe il tetto alternando i due canali.
 *
 * Fail-open deliberato: se il conteggio non è leggibile NON blocchiamo la
 * generazione (il gate sui soldi è il metodo di pagamento; questo è un
 * paracadute anti-abuso, non un controllo fiscale).
 */
export async function verificaQuotaCreativita(admin: Client, companyId: string): Promise<EsitoQuota> {
  const cap = capGiornalieroCreativita();
  const inizioGiorno = new Date();
  inizioGiorno.setHours(0, 0, 0, 0);
  const da = inizioGiorno.toISOString();

  let usateOggi = 0;
  try {
    const [ads, chat] = await Promise.all([
      admin.from("ad_media").select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("source", "ai_generated")
        .gte("created_at", da),
      admin.from("silvio_generation_jobs").select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("tipo", "image")
        .in("status", ["processing", "ready"])
        .gte("created_at", da),
    ]);
    usateOggi = (ads.count ?? 0) + (chat.count ?? 0);
  } catch (e) {
    console.warn("[creativeContext] quota non leggibile, fail-open:", e instanceof Error ? e.message : e);
    return { consentito: true, usateOggi: 0, cap };
  }

  if (quotaCreativitaSuperata(usateOggi, cap)) {
    return { consentito: false, usateOggi, cap, messaggio: messaggioQuotaSuperata(cap) };
  }
  return { consentito: true, usateOggi, cap };
}
