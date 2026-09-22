/**
 * outreach-opportunity-trigger — decide se una risposta "calda" (email o
 * WhatsApp Locale) deve generare un'opportunità, e la crea.
 *
 * Un solo posto per la politica (shouldCreateOpportunity), così i due canali
 * non divergono nel tempo; un solo posto per l'inserimento vero
 * (triggerOpportunityFromSignal), che riusa lo stesso principio anti-doppioni
 * già visto nel motore automazioni: un contatto con un'opportunità aperta
 * non ne riceve una seconda.
 *
 * pipeline_id/stage_id non hanno un "default" configurato da nessuna parte
 * (marketing_pipelines non ha un flag del genere — solo `position` per
 * l'ordinamento): la regola qui è esplicita, la pipeline con `position` più
 * basso della piattaforma, e al suo interno lo stage con `position` più
 * basso (lo stage "di ingresso").
 */

// deno-lint-ignore-file no-explicit-any

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

export type CanaleSegnale = "email" | "whatsapp";

/** appuntamento vale come "interested": ha chiesto di parlare, è il segnale più forte che abbiamo su quel canale. */
const CREA_OPPORTUNITA: Record<CanaleSegnale, ReadonlySet<string>> = {
  email: new Set(["interested"]),
  whatsapp: new Set(["appuntamento"]),
};

/** Un segnale (intent email o esito WhatsApp) merita la creazione automatica di un'opportunità? */
export function shouldCreateOpportunity(channel: CanaleSegnale, label: string | null | undefined): boolean {
  if (!label) return false;
  return CREA_OPPORTUNITA[channel].has(label);
}

export interface SegnaleOpportunita {
  channel: CanaleSegnale;
  contactId: string;
  sourceRefTable: "outreach_replies" | "openwa_campagna_destinatari";
  sourceRefId: string;
  /** frammento del messaggio, per la nota dell'opportunità. */
  snippet?: string | null;
  /**
   * Il brand outreach a cui ha risposto (solo email): l'opportunità entra
   * nella pipeline OMONIMA del brand (es. "Marketing Edile" → pipeline
   * "Marketing Edile"). Senza brand, o se nessuna pipeline ha quel nome
   * (es. WhatsApp Locale, o i brand senza pipeline dedicata), si ripiega
   * sulla pipeline con `position` più basso.
   */
  brandId?: string | null;
}

/**
 * Sceglie pipeline+stage per l'opportunità: la pipeline OMONIMA del brand se
 * c'è (confronto sul nome, case-insensitive), altrimenti quella con `position`
 * più basso. Lo stage è sempre quello con `position` più basso (l'ingresso).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function risolviPipeline(admin: any, brandId: string | null | undefined): Promise<{ pipelineId: string; stageId: string } | null> {
  let pipelineId: string | null = null;

  if (brandId) {
    const { data: brand } = await admin.from("outreach_brands").select("name").eq("id", brandId).maybeSingle();
    if (brand?.name) {
      const { data: p } = await admin
        .from("marketing_pipelines")
        .select("id")
        .eq("company_id", PLATFORM_COMPANY)
        .ilike("name", brand.name) // senza wildcard = uguaglianza case-insensitive
        .limit(1)
        .maybeSingle();
      pipelineId = p?.id ?? null;
    }
  }

  if (!pipelineId) {
    const { data: p } = await admin
      .from("marketing_pipelines")
      .select("id")
      .eq("company_id", PLATFORM_COMPANY)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    pipelineId = p?.id ?? null;
  }
  if (!pipelineId) {
    console.warn("[outreach-opportunity-trigger] nessuna pipeline configurata per la piattaforma");
    return null;
  }

  const { data: stage } = await admin
    .from("marketing_pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage?.id) {
    console.warn("[outreach-opportunity-trigger] la pipeline non ha stage");
    return null;
  }
  return { pipelineId, stageId: stage.id };
}

/**
 * Crea l'opportunità per un segnale caldo, se il contatto non ne ha già una
 * aperta (qualunque fonte — coerente col dedup del motore automazioni).
 * Best-effort: ogni errore viene loggato e la funzione torna null, non
 * lancia mai — chi chiama (gestione risposta email/WhatsApp) non deve
 * fallire per un problema qui. Torna l'id dell'opportunità creata, o null
 * se non ne ha creata una (già presente, o un passaggio è mancante).
 */
export async function triggerOpportunityFromSignal(admin: any, segnale: SegnaleOpportunita): Promise<string | null> {
  try {
    const { data: apertaGia } = await admin
      .from("marketing_opportunities")
      .select("id")
      .eq("company_id", PLATFORM_COMPANY)
      .eq("contact_id", segnale.contactId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (apertaGia?.id) return null;

    const dest = await risolviPipeline(admin, segnale.brandId);
    if (!dest) return null;

    const { data: contatto } = await admin
      .from("marketing_contacts")
      .select("first_name,last_name,company_name")
      .eq("id", segnale.contactId)
      .maybeSingle();
    const nome = [contatto?.first_name, contatto?.last_name].filter(Boolean).join(" ") || contatto?.company_name || "Contatto";
    const fonte = segnale.channel === "email" ? "outreach_email" : "outreach_whatsapp";

    const { data: inserita, error } = await admin
      .from("marketing_opportunities")
      .insert({
        company_id: PLATFORM_COMPANY,
        contact_id: segnale.contactId,
        pipeline_id: dest.pipelineId,
        stage_id: dest.stageId,
        name: `${nome} · risposta calda`,
        source: fonte,
        source_ref_table: segnale.sourceRefTable,
        source_ref_id: segnale.sourceRefId,
        notes: segnale.snippet
          ? `Nato da una risposta ${segnale.channel === "email" ? "email" : "WhatsApp"}: "${segnale.snippet.slice(0, 240)}"`
          : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return inserita?.id ?? null;
  } catch (e) {
    console.warn("[outreach-opportunity-trigger] creazione non riuscita:", e instanceof Error ? e.message : e);
    return null;
  }
}
