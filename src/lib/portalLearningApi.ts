import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

export type PortalCourseStatus = "bozza" | "pubblicato" | "revisione";
export type PortalArea = "sicurezza" | "procedure" | "commerciale" | "onboarding" | "tecnica";
export type PortalAudience = "tutti" | "operai" | "ufficio" | "commerciali" | "capicantiere";
export type PortalAssetType = "video" | "pdf" | "procedura" | "quiz" | "link" | "testo" | "immagine" | "documento";

export const PORTAL_MATERIALS_BUCKET = "portal-materials";
export const PORTAL_MAX_MATERIAL_SIZE_BYTES = 100 * 1024 * 1024;
export const PORTAL_ALLOWED_MATERIAL_MIME_TYPES = [
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
export const PORTAL_MATERIAL_ACCEPT = PORTAL_ALLOWED_MATERIAL_MIME_TYPES.join(",");

export interface PortalLearningAsset {
  id: string;
  title: string;
  type: PortalAssetType;
  duration: string;
  moduleId?: string;
  source?: string;
  downloadUrl?: string;
  downloadable?: boolean;
  content?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface PortalLearningModule {
  id: string;
  title: string;
  description: string;
  lessons: number;
  duration: string;
  completedRate: number;
}

export interface PortalLearningCourse {
  id: string;
  title: string;
  description: string;
  area: PortalArea;
  audience: PortalAudience;
  status: PortalCourseStatus;
  owner: string;
  updatedAt: string;
  enrolled: number;
  completion: number;
  modules: PortalLearningModule[];
  assets: PortalLearningAsset[];
  /**
   * Origine del corso dal punto di vista dell'azienda che lo sta vedendo.
   *   - "own"      → corso creato dall'azienda stessa (proprietà piena).
   *   - "platform" → corso concesso dal Superadmin via grant (READ-ONLY).
   * Calcolato a runtime confrontando `companyId` query con `course.company_id`.
   */
  sourceType?: "own" | "platform";
  /** company_id reale del corso (utile quando sourceType=platform per signed url storage). */
  ownerCompanyId?: string;
}

export type PortalEnrollmentStatus = "assegnato" | "in_corso" | "completato" | "in_ritardo";

export interface PortalLearningEnrollment {
  courseId: string;
  userId: string;
  status: PortalEnrollmentStatus;
  progressPercent: number;
  dueAt?: string | null;
  completedAt?: string | null;
  /** Valorizzato quando un admin ha ASSEGNATO il corso (vs auto-iscrizione del learner). */
  assignedBy?: string | null;
}

/** Riga "avanzamento persona" per un corso: iscrizione reale + nome risolto da profiles. */
export interface PortalCoursePersonProgress {
  userId: string;
  name: string;
  email: string | null;
  status: PortalEnrollmentStatus;
  progressPercent: number;
  dueAt: string | null;
  completedAt: string | null;
}

/** Conteggi reali del pubblico Portale (da anagrafica dipendenti hr_profili). */
export interface PortalAudienceCounts {
  total: number;
  operai: number;
  ufficio: number;
  commerciali: number;
  capicantiere: number;
}

interface PortalCourseRow {
  id: string;
  company_id?: string;
  title: string;
  description: string | null;
  area: PortalArea;
  audience: PortalAudience;
  status: PortalCourseStatus;
  owner: string | null;
  enrolled_count: number | null;
  completion_percent: number | null;
  updated_at: string | null;
  portal_course_modules?: PortalModuleRow[] | null;
  portal_course_assets?: PortalAssetRow[] | null;
}

interface PortalModuleRow {
  id: string;
  title: string;
  description: string | null;
  lessons: number | null;
  duration: string | null;
  completed_rate: number | null;
  sort_order: number | null;
}

interface PortalAssetRow {
  id: string;
  title: string;
  type: PortalAssetType;
  duration: string | null;
  module_id?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  is_downloadable?: boolean | null;
  content_text?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  sort_order: number | null;
}

interface PortalEnrollmentRow {
  course_id: string;
  user_id: string;
  status: PortalEnrollmentStatus;
  progress_percent: number | null;
  due_at?: string | null;
  completed_at?: string | null;
  assigned_by?: string | null;
}

interface QueryResult<T = unknown> {
  data?: T | null;
  error?: { message?: string } | null;
}

interface PortalQueryBuilder<T = unknown> extends PromiseLike<QueryResult<T>> {
  select: (columns?: string) => PortalQueryBuilder<T>;
  eq: (column: string, value: unknown) => PortalQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => PortalQueryBuilder<T>;
  upsert: (values: unknown, options?: Record<string, unknown>) => PortalQueryBuilder<T>;
  delete: () => PortalQueryBuilder<T>;
  insert: (values: unknown) => PortalQueryBuilder<T>;
}

function getDb() {
  return supabase as unknown as {
    from: <T = unknown>(table: string) => PortalQueryBuilder<T>;
    auth: typeof supabase.auth;
  };
}

function updatedLabel(value: string | null | undefined) {
  if (!value) return "Aggiornato";
  const updated = new Date(value).getTime();
  if (!Number.isFinite(updated)) return "Aggiornato";
  const diff = Date.now() - updated;
  if (diff < 60_000) return "Aggiornato ora";
  if (diff < 3_600_000) return `Aggiornato ${Math.max(1, Math.round(diff / 60_000))} min fa`;
  if (diff < 86_400_000) return `Aggiornato ${Math.max(1, Math.round(diff / 3_600_000))} ore fa`;
  return `Aggiornato ${Math.max(1, Math.round(diff / 86_400_000))} giorni fa`;
}

function mapCourse(row: PortalCourseRow, viewerCompanyId?: string): PortalLearningCourse {
  const modules = [...(row.portal_course_modules ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description ?? "",
      lessons: module.lessons ?? 0,
      duration: module.duration ?? "Da definire",
      completedRate: module.completed_rate ?? 0,
    }));

  const assets = [...(row.portal_course_assets ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((asset) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type,
      duration: asset.duration ?? "Da definire",
      moduleId: asset.module_id ?? undefined,
      source: asset.storage_path ?? asset.external_url ?? undefined,
      downloadUrl: asset.external_url ?? asset.storage_path ?? undefined,
      downloadable: asset.is_downloadable ?? true,
      content: asset.content_text ?? undefined,
      fileName: asset.file_name ?? undefined,
      fileSize: asset.file_size ?? undefined,
      mimeType: asset.mime_type ?? undefined,
    }));

  // sourceType: se viewerCompanyId è passato e differisce da row.company_id
  // → il corso è platform (visto via grant), altrimenti "own".
  const sourceType: "own" | "platform" | undefined =
    row.company_id && viewerCompanyId
      ? row.company_id === viewerCompanyId
        ? "own"
        : "platform"
      : undefined;

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    area: row.area,
    audience: row.audience,
    status: row.status,
    owner: row.owner ?? "Team",
    updatedAt: updatedLabel(row.updated_at),
    enrolled: row.enrolled_count ?? 0,
    completion: row.completion_percent ?? 0,
    modules,
    assets,
    sourceType,
    ownerCompanyId: row.company_id,
  };
}

/**
 * Lista corsi disponibili per un'azienda. Restituisce sia:
 *   - I corsi creati dall'azienda stessa (sourceType="own")
 *   - I corsi platform a cui l'azienda ha accesso via grant (sourceType="platform")
 *
 * Le RLS sui portal_courses ora consentono SELECT cross-company solo se
 * esiste una riga in portal_course_grants con status='granted'. Quindi non
 * dobbiamo filtrare nulla a livello applicativo: ci basta leggere TUTTO ciò
 * che la RLS ci permette di vedere → marchiamo a runtime own vs platform.
 *
 * Nota: il companyId passato è quello dell'azienda visualizzatrice (effective
 * company). Viene usato sia per la detection own/platform sia come fallback
 * di filtro (legacy compat: se le grants non sono ancora in DB, listiamo
 * solo i corsi propri).
 */
export async function listPortalCourses(companyId: string): Promise<PortalLearningCourse[]> {
  // 1° tentativo: query "open" (RLS decide). Funziona post-migration grants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = supabase as any;
  const primary = await dbAny
    .from("portal_courses")
    .select(
      "id,company_id,title,description,area,audience,status,owner,enrolled_count,completion_percent,updated_at,portal_course_modules(id,title,description,lessons,duration,completed_rate,sort_order),portal_course_assets(id,title,type,duration,module_id,storage_path,external_url,is_downloadable,content_text,file_name,file_size,mime_type,sort_order)",
    )
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  let data = primary.data;

  // Fallback (pre-migration grants): query stretta solo su company_id
  if (primary.error) {
    const fallback = await dbAny
      .from("portal_courses")
      .select(
        "id,company_id,title,description,area,audience,status,owner,enrolled_count,completion_percent,updated_at,portal_course_modules(id,title,description,lessons,duration,completed_rate,sort_order),portal_course_assets(id,title,type,duration,module_id,storage_path,external_url,is_downloadable,content_text,file_name,file_size,mime_type,sort_order)",
      )
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  // PRIVACY: la query "open" si affida alla RLS, ma per un super_admin la RLS
  // restituisce i corsi di TUTTE le aziende, e per un utente multi-azienda i
  // corsi della sua seconda azienda. Entrambi finirebbero mislabellati come
  // "piattaforma". Teniamo solo: corsi PROPRI dell'azienda visualizzatrice +
  // corsi della piattaforma (gli unici concessi via grant nel flusso reale).
  return ((data ?? []) as PortalCourseRow[])
    .filter(
      (row) =>
        row.company_id === companyId ||
        row.company_id === PLATFORM_ADMIN_COMPANY_ID,
    )
    .map((row) => mapCourse(row, companyId));
}

export async function listPortalCourseEnrollments(companyId: string, userId: string): Promise<PortalLearningEnrollment[]> {
  const { data, error } = await getDb()
    .from("portal_course_enrollments")
    .select("course_id,user_id,status,progress_percent,due_at,completed_at,assigned_by")
    .eq("company_id", companyId)
    .eq("user_id", userId);

  if (error) throw error;

  return ((data ?? []) as PortalEnrollmentRow[]).map((row) => ({
    courseId: row.course_id,
    userId: row.user_id,
    status: row.status,
    progressPercent: row.progress_percent ?? 0,
    dueAt: row.due_at ?? null,
    completedAt: row.completed_at ?? null,
    assignedBy: row.assigned_by ?? null,
  }));
}

/**
 * Tutte le iscrizioni dell'azienda (tutti i corsi, tutti gli utenti) in UNA query.
 * Usata per il riepilogo formazione lato admin (aggregazione per corso lato client).
 */
export async function listAllPortalCourseEnrollments(companyId: string): Promise<PortalLearningEnrollment[]> {
  const { data, error } = await getDb()
    .from("portal_course_enrollments")
    .select("course_id,user_id,status,progress_percent,due_at,completed_at")
    .eq("company_id", companyId);
  if (error) throw error;
  return ((data ?? []) as PortalEnrollmentRow[]).map((row) => ({
    courseId: row.course_id,
    userId: row.user_id,
    status: row.status,
    progressPercent: row.progress_percent ?? 0,
    dueAt: row.due_at ?? null,
    completedAt: row.completed_at ?? null,
  }));
}

/**
 * Avanzamento REALE per-persona di un corso: legge le iscrizioni vere
 * (portal_course_enrollments) e risolve nome/email da `profiles` con un join
 * lato client (nessuna dipendenza da FK PostgREST). Se non esistono iscrizioni
 * ritorna [] → la UI mostra uno stato vuoto onesto invece di dati finti.
 */
export async function listPortalCourseProgress(
  companyId: string,
  courseId: string,
): Promise<PortalCoursePersonProgress[]> {
  const db = getDb();
  const { data, error } = await db
    .from("portal_course_enrollments")
    .select("course_id,user_id,status,progress_percent,due_at,completed_at")
    .eq("company_id", companyId)
    .eq("course_id", courseId);
  if (error) throw error;
  const rows = (data ?? []) as PortalEnrollmentRow[];
  if (rows.length === 0) return [];

  // Nomi dai profili della stessa azienda (best-effort: se RLS/assenza → fallback "Utente").
  const nameById = new Map<string, { name: string; email: string | null }>();
  try {
    const { data: profs } = await db
      .from("profiles")
      .select("id,first_name,last_name,email")
      .eq("company_id", companyId);
    const list = (profs ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>;
    for (const p of list) {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      nameById.set(p.id, { name: full || p.email || "Utente", email: p.email ?? null });
    }
  } catch {
    /* nomi non disponibili: si usa il fallback */
  }

  return rows.map((row) => {
    const info = nameById.get(row.user_id);
    return {
      userId: row.user_id,
      name: info?.name ?? "Utente",
      email: info?.email ?? null,
      status: row.status,
      progressPercent: row.progress_percent ?? 0,
      dueAt: row.due_at ?? null,
      completedAt: row.completed_at ?? null,
    };
  });
}

/**
 * Conteggi REALI del pubblico Portale a partire dall'anagrafica dipendenti
 * (hr_profili). `total` è esatto (dipendenti attivi); i sottogruppi sono
 * best-effort per parole chiave su reparto/mansione — ogni persona è contata
 * nel PRIMO gruppo che combacia (capicantiere → commerciali → ufficio → operai),
 * quindi i sottogruppi non sommano necessariamente al totale (onesto).
 */
export async function getPortalAudienceCounts(companyId: string): Promise<PortalAudienceCounts> {
  const db = getDb();
  const { data, error } = await db
    .from("hr_profili")
    .select("reparto,mansione,attivo")
    .eq("company_id", companyId);
  if (error) throw error;
  const rows = ((data ?? []) as Array<{ reparto: string | null; mansione: string | null; attivo: boolean | null }>)
    .filter((r) => r.attivo !== false);
  const counts: PortalAudienceCounts = { total: rows.length, operai: 0, ufficio: 0, commerciali: 0, capicantiere: 0 };
  for (const r of rows) {
    const hay = `${r.reparto ?? ""} ${r.mansione ?? ""}`.toLowerCase();
    if (/capo|prepost|responsabil|direttore di cantiere/.test(hay)) counts.capicantiere += 1;
    else if (/commerc|vendit|sales|agente|preventiv/.test(hay)) counts.commerciali += 1;
    else if (/uffic|ammin|contab|segret|back ?office|risorse umane|\bhr\b|paghe|acquist/.test(hay)) counts.ufficio += 1;
    else if (/oper|cantier|mura|manov|edil|posat|salda|elettr|idraul|carpent|escavat|gruista/.test(hay)) counts.operai += 1;
  }
  return counts;
}

export async function savePortalCourseEnrollment(
  companyId: string,
  userId: string,
  courseId: string,
  progressPercent: number,
  status?: PortalEnrollmentStatus,
) {
  const requestedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));

  // ANTI-REGRESSIONE: il progresso è ricalcolato client-side dai moduli spuntati
  // in localStorage, che su un nuovo dispositivo (cache pulita) è vuoto → senza
  // guardia un semplice "apri il corso e spunta un modulo" farebbe crollare la %
  // su DB (es. 80% → 20%) e azzererebbe completed_at. In un LMS il progresso non
  // regredisce: leggiamo lo stato attuale e teniamo il massimo, preservando la
  // data di completamento già registrata. (`status` esplicito = azione admin
  // intenzionale → bypassa la guardia.)
  const db = getDb();
  let normalizedProgress = requestedProgress;
  let existingCompletedAt: string | null = null;
  if (status === undefined) {
    const { data: existing } = await db
      .from("portal_course_enrollments")
      .select("progress_percent, completed_at")
      .eq("company_id", companyId)
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      normalizedProgress = Math.max(requestedProgress, existing.progress_percent ?? 0);
      existingCompletedAt = existing.completed_at ?? null;
    }
  }

  const nextStatus: PortalEnrollmentStatus =
    status ?? (normalizedProgress >= 100 ? "completato" : normalizedProgress > 0 ? "in_corso" : "assegnato");

  const completedAt =
    nextStatus === "completato"
      ? existingCompletedAt ?? new Date().toISOString() // non riscrivere la data ad ogni tocco
      : existingCompletedAt; // non cancellare un completamento già registrato

  const { error } = await db
    .from("portal_course_enrollments")
    .upsert(
      {
        company_id: companyId,
        course_id: courseId,
        user_id: userId,
        status: nextStatus,
        progress_percent: normalizedProgress,
        completed_at: completedAt,
      },
      { onConflict: "company_id,course_id,user_id" },
    );

  if (error) throw error;
}

/**
 * Assegna un corso a uno o più utenti (admin → utente).
 * Crea iscrizioni `status='assegnato'` (con assigned_by + due_at) SOLO per gli
 * utenti non ancora iscritti; per chi è già iscritto aggiorna solo assigned_by/
 * due_at SENZA toccare status/progresso (nessuna perdita di avanzamento).
 */
export async function assignPortalCourseToUsers(
  companyId: string,
  courseId: string,
  userIds: string[],
  assignedBy: string | null,
  dueAt?: string | null,
): Promise<{ assigned: number; updated: number }> {
  if (userIds.length === 0) return { assigned: 0, updated: 0 };
  const db = getDb();

  const { data: existing, error: exErr } = await db
    .from("portal_course_enrollments")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("course_id", courseId);
  if (exErr) throw exErr;
  const existingIds = new Set(((existing ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));

  const toInsert = userIds
    .filter((u) => !existingIds.has(u))
    .map((u) => ({
      company_id: companyId,
      course_id: courseId,
      user_id: u,
      status: "assegnato" as PortalEnrollmentStatus,
      progress_percent: 0,
      assigned_by: assignedBy,
      due_at: dueAt ?? null,
    }));
  if (toInsert.length > 0) {
    const { error } = await db.from("portal_course_enrollments").insert(toInsert);
    if (error) throw error;
  }

  const toUpdate = userIds.filter((u) => existingIds.has(u));
  for (const u of toUpdate) {
    const { error } = await db
      .from("portal_course_enrollments")
      .update({ assigned_by: assignedBy, due_at: dueAt ?? null })
      .eq("company_id", companyId)
      .eq("course_id", courseId)
      .eq("user_id", u);
    if (error) throw error;
  }

  return { assigned: toInsert.length, updated: toUpdate.length };
}

/**
 * Rimuove un'assegnazione. Per sicurezza elimina SOLO iscrizioni ancora
 * `assegnato` (non avviate): non distrugge mai progresso reale di chi ha iniziato.
 */
export async function unassignPortalCourse(companyId: string, courseId: string, userId: string): Promise<void> {
  const { error } = await getDb()
    .from("portal_course_enrollments")
    .delete()
    .eq("company_id", companyId)
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .eq("status", "assegnato");
  if (error) throw error;
}

export async function logPortalCourseActivity(
  companyId: string,
  courseId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  // Best-effort: l'activity log è telemetria, NON deve mai far fallire l'azione
  // che l'ha innescata. Prima rilanciava l'errore → in openAsset era un
  // unhandled rejection e in persist faceva comparire "Avanzamento non salvato"
  // anche quando l'iscrizione ERA stata salvata (le due await nello stesso try).
  try {
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await getDb().from("portal_course_activity").insert({
      company_id: companyId,
      course_id: courseId,
      actor_id: user?.id ?? null,
      event_type: eventType,
      metadata,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[portale] activity log non registrata (best-effort):", e);
  }
}

export async function savePortalCourse(companyId: string, course: PortalLearningCourse) {
  const rpcClient = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  };
  const rpcResult = await rpcClient.rpc("upsert_portal_course", {
    p_company_id: companyId,
    p_course: course,
  });

  if (!rpcResult.error) return;

  const rpcMessage = String(rpcResult.error.message ?? "").toLowerCase();
  const canFallbackToClientWrites =
    rpcMessage.includes("function") ||
    rpcMessage.includes("schema cache") ||
    rpcMessage.includes("upsert_portal_course");

  if (!canFallbackToClientWrites) throw rpcResult.error;

  const user = (await supabase.auth.getUser()).data.user;
  const nowPublished = course.status === "pubblicato" ? new Date().toISOString() : null;

  const { error: courseError } = await getDb()
    .from("portal_courses")
    .upsert(
      {
        id: course.id,
        company_id: companyId,
        title: course.title,
        description: course.description,
        area: course.area,
        audience: course.audience,
        status: course.status,
        owner: course.owner || "Team",
        enrolled_count: course.enrolled,
        completion_percent: course.completion,
        created_by: user?.id ?? null,
        published_at: nowPublished,
      },
      { onConflict: "company_id,id" },
    );

  if (courseError) throw courseError;

  const db = getDb();
  const moduleIds = new Set(course.modules.map((module) => module.id));
  const moduleRows = course.modules.map((module, index) => ({
    id: module.id,
    company_id: companyId,
    course_id: course.id,
    title: module.title,
    description: module.description,
    lessons: module.lessons,
    duration: module.duration,
    completed_rate: module.completedRate,
    sort_order: index,
  }));

  const assetRows = course.assets.map((asset, index) => ({
    id: asset.id,
    company_id: companyId,
    course_id: course.id,
    title: asset.title,
    type: asset.type,
    duration: asset.duration,
    module_id: asset.moduleId && moduleIds.has(asset.moduleId) ? asset.moduleId : null,
    storage_path: asset.source && !asset.source.startsWith("http") && !asset.source.startsWith("locale/") ? asset.source : null,
    external_url: asset.downloadUrl && asset.downloadUrl.startsWith("http") ? asset.downloadUrl : null,
    is_downloadable: asset.downloadable !== false,
    content_text: asset.content ?? null,
    file_name: asset.fileName ?? null,
    file_size: asset.fileSize ?? null,
    mime_type: asset.mimeType ?? null,
    sort_order: index,
  }));

  const [{ error: deleteModulesError }, { error: deleteAssetsError }] = await Promise.all([
    db.from("portal_course_modules").delete().eq("course_id", course.id).eq("company_id", companyId),
    db.from("portal_course_assets").delete().eq("course_id", course.id).eq("company_id", companyId),
  ]);

  if (deleteModulesError) throw deleteModulesError;
  if (deleteAssetsError) throw deleteAssetsError;

  if (moduleRows.length > 0) {
    const { error } = await db.from("portal_course_modules").insert(moduleRows);
    if (error) throw error;
  }

  if (assetRows.length > 0) {
    const { error } = await db.from("portal_course_assets").insert(assetRows);
    if (error) throw error;
  }

  const { error: activityError } = await db.from("portal_course_activity").insert({
    company_id: companyId,
    course_id: course.id,
    actor_id: user?.id ?? null,
    event_type: "course_saved",
    metadata: { status: course.status, modules: course.modules.length, assets: course.assets.length },
  });

  if (activityError) throw activityError;
}

function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "materiale";
}

export async function uploadPortalMaterial(companyId: string, courseId: string, file: File) {
  const safeCourse = sanitizeStorageSegment(courseId);
  const safeFile = sanitizeStorageSegment(file.name);
  const storagePath = `${companyId}/${safeCourse}/${Date.now()}-${safeFile}`;
  const { data, error } = await supabase.storage
    .from(PORTAL_MATERIALS_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) throw error;

  return {
    path: data.path,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function createPortalMaterialSignedUrl(path: string, expiresIn = 60 * 10) {
  const { data, error } = await supabase.storage
    .from(PORTAL_MATERIALS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

// ─── Portal Course Grants (accesso platform → aziende) ──────────────────

export interface PortalCourseGrant {
  id: string;
  courseId: string;
  targetCompanyId: string;
  targetCompanyName?: string | null;
  targetCompanyLogo?: string | null;
  status: "granted" | "revoked";
  grantedAt: string;
  revokedAt?: string | null;
  notes?: string | null;
}

/** Lista aziende a cui un corso platform è stato concesso. */
export async function listPortalCourseGrants(courseId: string): Promise<PortalCourseGrant[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = supabase as any;
  const { data, error } = await dbAny
    .from("portal_course_grants")
    .select(
      "id,course_id,target_company_id,status,granted_at,revoked_at,notes,target_company:companies!portal_course_grants_target_company_id_fkey(name,logo_url)",
    )
    .eq("course_id", courseId)
    .order("granted_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    courseId: row.course_id as string,
    targetCompanyId: row.target_company_id as string,
    targetCompanyName:
      (row.target_company as { name?: string } | null)?.name ?? null,
    targetCompanyLogo:
      (row.target_company as { logo_url?: string } | null)?.logo_url ?? null,
    status: row.status as "granted" | "revoked",
    grantedAt: row.granted_at as string,
    revokedAt: (row.revoked_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }));
}

/** Concede accesso a un corso platform a N aziende. Solo super_admin. */
export async function grantPortalCourseToCompanies(
  sourceCourseId: string,
  targetCompanyIds: string[],
  notes?: string,
): Promise<{ grantedCount: number; skippedCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcClient = supabase as any;
  const { data, error } = await rpcClient.rpc("grant_admin_portal_course_to_companies", {
    p_source_course_id: sourceCourseId,
    p_target_company_ids: targetCompanyIds,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return {
    grantedCount: (data?.granted_count as number) ?? 0,
    skippedCount: (data?.skipped_count as number) ?? 0,
  };
}

/** Revoca accesso a un corso platform da N aziende. */
export async function revokePortalCourseFromCompanies(
  sourceCourseId: string,
  targetCompanyIds: string[],
): Promise<{ revokedCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcClient = supabase as any;
  const { data, error } = await rpcClient.rpc("revoke_admin_portal_course_from_companies", {
    p_source_course_id: sourceCourseId,
    p_target_company_ids: targetCompanyIds,
  });
  if (error) throw error;
  return { revokedCount: (data?.revoked_count as number) ?? 0 };
}

export function isPortalLearningUnavailable(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  return (
    message.includes("portal_courses") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("not found")
  );
}
