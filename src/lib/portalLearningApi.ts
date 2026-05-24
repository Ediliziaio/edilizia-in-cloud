import { supabase } from "@/integrations/supabase/client";

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
}

export type PortalEnrollmentStatus = "assegnato" | "in_corso" | "completato" | "in_ritardo";

export interface PortalLearningEnrollment {
  courseId: string;
  userId: string;
  status: PortalEnrollmentStatus;
  progressPercent: number;
  dueAt?: string | null;
  completedAt?: string | null;
}

interface PortalCourseRow {
  id: string;
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

function mapCourse(row: PortalCourseRow): PortalLearningCourse {
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
  };
}

export async function listPortalCourses(companyId: string): Promise<PortalLearningCourse[]> {
  const { data, error } = await getDb()
    .from("portal_courses")
    .select(
      "id,title,description,area,audience,status,owner,enrolled_count,completion_percent,updated_at,portal_course_modules(id,title,description,lessons,duration,completed_rate,sort_order),portal_course_assets(id,title,type,duration,module_id,storage_path,external_url,is_downloadable,content_text,file_name,file_size,mime_type,sort_order)",
    )
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as PortalCourseRow[]).map(mapCourse);
}

export async function listPortalCourseEnrollments(companyId: string, userId: string): Promise<PortalLearningEnrollment[]> {
  const { data, error } = await getDb()
    .from("portal_course_enrollments")
    .select("course_id,user_id,status,progress_percent,due_at,completed_at")
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
  }));
}

export async function savePortalCourseEnrollment(
  companyId: string,
  userId: string,
  courseId: string,
  progressPercent: number,
  status?: PortalEnrollmentStatus,
) {
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));
  const nextStatus: PortalEnrollmentStatus =
    status ?? (normalizedProgress >= 100 ? "completato" : normalizedProgress > 0 ? "in_corso" : "assegnato");

  const { error } = await getDb()
    .from("portal_course_enrollments")
    .upsert(
      {
        company_id: companyId,
        course_id: courseId,
        user_id: userId,
        status: nextStatus,
        progress_percent: normalizedProgress,
        completed_at: nextStatus === "completato" ? new Date().toISOString() : null,
      },
      { onConflict: "company_id,course_id,user_id" },
    );

  if (error) throw error;
}

export async function logPortalCourseActivity(
  companyId: string,
  courseId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await getDb().from("portal_course_activity").insert({
    company_id: companyId,
    course_id: courseId,
    actor_id: user?.id ?? null,
    event_type: eventType,
    metadata,
  });

  if (error) throw error;
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
