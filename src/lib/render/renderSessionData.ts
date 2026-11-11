import { supabase } from "@/integrations/supabase/client";
import { createRenderOriginalSignedUrl } from "./renderStorage";
import { renderPlanOrigin } from "./renderPlanOrigin";
import { normalizeRenderStatus } from "./renderStatus";

export { renderSessionSource } from "./renderSources";
import { renderSessionSource } from "./renderSources";
import { classificaBozzeRender } from "./renderDrafts";

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

export interface RenderStoredSession {
  id: string;
  module: string;
  status: string;
  created_at: string;
  results: string[];
  originalPath: string | null;
  originalPublicUrl: string | null;
  config: Record<string, unknown>;
  title: string | null;
  notes: string | null;
  error: string | null;
  createdBy: string | null;
  contactId: string | null;
  opportunityId: string | null;
}

export function normalizeStoredRender(
  module: string,
  value: unknown,
): RenderStoredSession {
  const row = asRecord(value);
  const bathroom = module === "bagno";
  const urls = bathroom ? [row.render_result_url] : row.result_urls;
  return {
    id: String(row.id),
    module,
    status: normalizeRenderStatus(String(bathroom ? row.stato : row.status)),
    created_at: String(row.created_at),
    results: Array.isArray(urls)
      ? urls.filter(
          (url): url is string => typeof url === "string" && !!url.trim(),
        )
      : [],
    originalPath: string(
      bathroom ? row.foto_originale_path : row.original_photo_url,
    ),
    originalPublicUrl: bathroom ? string(row.foto_originale_url) : null,
    config: asRecord(
      bathroom
        ? row.configurazione
        : Object.keys(asRecord(row.config_snapshot)).length
          ? row.config_snapshot
          : row.config,
    ),
    title: bathroom ? string(row.galleria_titolo) : null,
    notes: bathroom ? string(row.galleria_note) : null,
    error: string(row.error_message),
    createdBy: string(bathroom ? row.user_id : row.created_by),
    contactId: string(row.contact_id),
    opportunityId: string(row.opportunity_id),
  };
}

const columns = (bathroom: boolean, snapshot = false) =>
  bathroom
    ? "id,stato,foto_originale_path,foto_originale_url,render_result_url,configurazione,created_at,galleria_titolo,galleria_note,user_id,contact_id,opportunity_id"
    : `id,status,original_photo_url,result_urls,config,created_at,error_message,created_by,contact_id,opportunity_id${snapshot ? ",config_snapshot" : ""}`;

export async function loadStoredRender(
  companyId: string,
  module: string,
  id: string,
  signal?: AbortSignal,
): Promise<RenderStoredSession | null> {
  if (!companyId || !id) return null;
  const source = renderSessionSource(module);
  let query = supabase
    .from(source.table as never)
    .select(
      columns(
        source.bathroom,
        source.technical || module === "pergole" || module === "piscine",
      ) as never,
    )
    .eq("company_id", companyId)
    .eq("id", id);
  if (source.technical) query = query.eq("module_type", module);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw new Error("Non è stato possibile caricare questo render. Riprova.");
  if (!data) return null;
  const stored = normalizeStoredRender(module, data);
  const [classified] = await classificaBozzeRender([stored], companyId);
  return classified;
}

export async function storedRenderOriginal(
  session: RenderStoredSession,
): Promise<string | null> {
  const path = session.originalPath;
  if (path && /^https:\/\//i.test(path)) return path;
  if (path) {
    try {
      return await createRenderOriginalSignedUrl(
        renderSessionSource(session.module).bucket,
        path,
        3600,
      );
    } catch {
      /* Il risultato resta consultabile anche senza la sorgente privata. */
    }
  }
  return session.originalPublicUrl;
}

/** Famiglia esplicita: mai raggruppare due stanze in base al solo nome. */
export function renderVariantKey(session: RenderStoredSession): string | null {
  const origin = renderPlanOrigin(session.config);
  const plan = asRecord(session.config.planimetria);
  if (origin)
    return JSON.stringify([
      session.module,
      origin.planId,
      plan.locale_id,
      origin.version,
      plan.livello_id ?? null,
      plan.ambito ?? null,
    ]);
  return session.originalPath
    ? JSON.stringify([
        session.module,
        renderSessionSource(session.module).bucket,
        session.originalPath,
      ])
    : null;
}

export async function loadRenderVariants(
  companyId: string,
  session: RenderStoredSession,
  offset = 0,
  signal?: AbortSignal,
) {
  const source = renderSessionSource(session.module);
  const origin = renderPlanOrigin(session.config);
  const plan = asRecord(session.config.planimetria);
  if (!origin && !session.originalPath)
    return {
      rows: [] as RenderStoredSession[],
      next: undefined as number | undefined,
    };
  let query = supabase
    .from(source.table as never)
    .select(
      columns(
        source.bathroom,
        source.technical ||
          session.module === "pergole" ||
          session.module === "piscine",
      ) as never,
    )
    .eq("company_id", companyId);
  if (source.technical) query = query.eq("module_type", session.module);
  if (origin) {
    query = query
      .eq(`${source.configColumn}->planimetria->>planimetria_id`, origin.planId)
      .eq(
        `${source.configColumn}->planimetria->>locale_id`,
        String(plan.locale_id),
      )
      .eq(
        `${source.configColumn}->planimetria->>versione`,
        String(origin.version),
      );
  } else query = query.eq(source.originalColumn, session.originalPath);
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 47);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error)
    throw new Error("Le altre varianti non sono disponibili. Puoi riprovare.");
  const all = ((data ?? []) as unknown[]).map((row) =>
    normalizeStoredRender(session.module, row),
  );
  return {
    rows: all.filter(
      (row) =>
        row.status === "completed" &&
        row.results.length &&
        renderVariantKey(row) === renderVariantKey(session),
    ),
    next: all.length === 48 ? offset + 48 : undefined,
  };
}
