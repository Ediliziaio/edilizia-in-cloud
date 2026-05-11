/**
 * src/lib/api/surveys.ts — API client modulo Sopralluoghi
 *
 * Tutte le query rispettano il pattern Supabase con check `error` esplicito.
 * Errori user-friendly in italiano, log a console.error.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  SurveyRow,
  SurveyTemplateRow,
  SurveyAreaRow,
  SurveyElementRow,
  SurveyMediaRow,
  SurveyMediaType,
} from "@/types/surveys";

// ─── TEMPLATES ──────────────────────────────────────────────────────────────

export async function listTemplates(category?: string): Promise<SurveyTemplateRow[]> {
  // Usa la RPC che restituisce solo i template ENABLED per la company corrente
  // (filtrabili via SettingsSopralluoghi). Fallback su query diretta se RPC
  // non disponibile (graceful degradation).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("list_survey_templates_with_settings");
    if (error) throw error;
    let rows = (data ?? []) as Array<SurveyTemplateRow & { enabled_for_company: boolean }>;
    rows = rows.filter((r) => r.enabled_for_company);
    if (category) rows = rows.filter((r) => r.category === category);
    return rows;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from("survey_templates").select("*").eq("is_active", true);
    if (category) q = q.eq("category", category);
    const { data, error } = await q
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });
    if (error) {
      console.error("[surveys] listTemplates failed", error);
      throw new Error("Impossibile caricare i template del rilievo");
    }
    return (data ?? []) as SurveyTemplateRow[];
  }
}

export async function getTemplate(id: string): Promise<SurveyTemplateRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("survey_templates").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[surveys] getTemplate failed", error);
    throw new Error("Impossibile caricare il template");
  }
  if (!data) throw new Error("Template non trovato");
  return data as SurveyTemplateRow;
}

// ─── SURVEYS ────────────────────────────────────────────────────────────────

export interface CreateSurveyInput {
  template_id: string;
  client_id?: string | null;
  order_id?: string | null;
  technician_id?: string | null;
  scheduled_at?: string | null;
  address?: string | null;
  address_number?: string | null;
  city?: string | null;
  zip?: string | null;
  province?: string | null;
  notes?: string | null;
  mode?: "structured" | "express";
}

export async function createSurvey(input: CreateSurveyInput): Promise<SurveyRow> {
  // companyId è iniettato dal trigger via auth.uid → profiles
  const { data: profile } = await supabase
    .from("profiles" as never)
    .select("company_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (profile as any)?.company_id;
  if (!companyId) throw new Error("Profilo senza azienda associata");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("surveys")
    .insert({
      company_id: companyId,
      template_id: input.template_id,
      client_id: input.client_id ?? null,
      order_id: input.order_id ?? null,
      technician_id: input.technician_id ?? null,
      scheduled_at: input.scheduled_at ?? null,
      address: input.address ?? null,
      address_number: input.address_number ?? null,
      city: input.city ?? null,
      zip: input.zip ?? null,
      province: input.province ?? null,
      notes: input.notes ?? null,
      mode: input.mode ?? "structured",
      status: "draft",
    })
    .select("*")
    .single();
  if (error) {
    console.error("[surveys] createSurvey failed", error);
    throw new Error("Creazione sopralluogo fallita");
  }
  return data as SurveyRow;
}

export interface SurveyDetail {
  survey: SurveyRow;
  template: SurveyTemplateRow;
  areas: SurveyAreaRow[];
  elements: SurveyElementRow[];
  media: SurveyMediaRow[];
}

export async function getSurvey(id: string): Promise<SurveyDetail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: survey, error: e1 }, { data: areas, error: e2 }, { data: elements, error: e3 }, { data: media, error: e4 }] =
    await Promise.all([
      sb.from("surveys").select("*").eq("id", id).maybeSingle(),
      sb.from("survey_areas").select("*").eq("survey_id", id).order("position"),
      sb.from("survey_elements").select("*").eq("survey_id", id).order("position"),
      sb.from("survey_media").select("*").eq("survey_id", id).order("position"),
    ]);
  if (e1 || !survey) {
    console.error("[surveys] getSurvey failed", e1);
    throw new Error("Sopralluogo non trovato");
  }
  if (e2 || e3 || e4) {
    console.error("[surveys] getSurvey related failed", e2 || e3 || e4);
    throw new Error("Errore caricamento dati sopralluogo");
  }
  const template = await getTemplate((survey as SurveyRow).template_id);
  return {
    survey: survey as SurveyRow,
    template,
    areas: (areas ?? []) as SurveyAreaRow[],
    elements: (elements ?? []) as SurveyElementRow[],
    media: (media ?? []) as SurveyMediaRow[],
  };
}

export async function updateSurvey(id: string, patch: Partial<SurveyRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("surveys").update(patch).eq("id", id);
  if (error) {
    console.error("[surveys] updateSurvey failed", error);
    throw new Error("Salvataggio sopralluogo fallito");
  }
}

export async function listMySurveys(opts?: { status?: string; limit?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("surveys")
    .select("id, code, status, scheduled_at, address, city, client_id, order_id, technician_id, template_id, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.error("[surveys] listMySurveys failed", error);
    throw new Error("Errore caricamento lista sopralluoghi");
  }
  return (data ?? []) as SurveyRow[];
}

export async function listAssignedToMe() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("surveys_assigned_to_me");
  if (error) {
    console.error("[surveys] listAssignedToMe failed", error);
    throw new Error("Errore caricamento sopralluoghi assegnati");
  }
  return (data ?? []) as Array<{
    id: string;
    code: string;
    status: string;
    template_name: string;
    template_category: string;
    scheduled_at: string | null;
    address: string | null;
    city: string | null;
    client_id: string | null;
    order_id: string | null;
    notes: string | null;
    is_complete: boolean;
    my_role: string;
    assigned_at: string;
  }>;
}

// ─── AREAS ──────────────────────────────────────────────────────────────────

export async function addArea(surveyId: string, area: Partial<SurveyAreaRow>): Promise<SurveyAreaRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("survey_areas")
    .insert({ survey_id: surveyId, name: area.name ?? "Nuova area", area_data: area.area_data ?? {}, position: area.position ?? 0 })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta area fallita");
  return data as SurveyAreaRow;
}

export async function updateArea(id: string, patch: Partial<SurveyAreaRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("survey_areas").update(patch).eq("id", id);
  if (error) throw new Error("Modifica area fallita");
}

export async function deleteArea(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("survey_areas").delete().eq("id", id);
  if (error) throw new Error("Eliminazione area fallita");
}

// ─── ELEMENTS ───────────────────────────────────────────────────────────────

export async function addElement(
  surveyId: string,
  areaId: string,
  element: Partial<SurveyElementRow>,
): Promise<SurveyElementRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("survey_elements")
    .insert({
      survey_id: surveyId,
      area_id: areaId,
      element_type: element.element_type ?? "generic",
      element_label: element.element_label ?? null,
      values: element.values ?? {},
      quantity: element.quantity ?? 1,
      position: element.position ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta elemento fallita");
  return data as SurveyElementRow;
}

export async function updateElement(id: string, patch: Partial<SurveyElementRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("survey_elements").update(patch).eq("id", id);
  if (error) throw new Error("Modifica elemento fallita");
}

export async function deleteElement(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("survey_elements").delete().eq("id", id);
  if (error) throw new Error("Eliminazione elemento fallita");
}

// ─── MEDIA UPLOAD ───────────────────────────────────────────────────────────

export interface UploadMediaOpts {
  type: SurveyMediaType;
  areaId?: string | null;
  elementId?: string | null;
  checklistKey?: string | null;
  checklistLabel?: string | null;
  position?: number;
}

export async function uploadMedia(surveyId: string, file: File, opts: UploadMediaOpts): Promise<SurveyMediaRow> {
  // 1) Carica nello storage
  const { data: profile } = await supabase
    .from("profiles" as never)
    .select("company_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (profile as any)?.company_id;
  if (!companyId) throw new Error("Profilo senza azienda");

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const subfolder =
    opts.type === "audio" ? "audio" :
    opts.type === "sketch" ? "sketches" :
    opts.type === "signature" ? "signatures" :
    opts.type === "document" ? "documents" :
    "photos";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${companyId}/${surveyId}/${subfolder}/${filename}`;

  const { error: uploadErr } = await supabase.storage
    .from("surveys")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("[surveys] uploadMedia storage failed", uploadErr);
    throw new Error("Upload file fallito");
  }

  // Ottieni URL firmato (storage privato → signed URL valido 7 giorni)
  const { data: signed } = await supabase.storage
    .from("surveys")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  const url = signed?.signedUrl ?? "";

  // 2) Insert in survey_media
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("survey_media")
    .insert({
      survey_id: surveyId,
      area_id: opts.areaId ?? null,
      element_id: opts.elementId ?? null,
      type: opts.type,
      url,
      storage_path: storagePath,
      checklist_key: opts.checklistKey ?? null,
      checklist_label: opts.checklistLabel ?? null,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      position: opts.position ?? 0,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[surveys] uploadMedia insert failed", error);
    throw new Error("Registrazione file fallita");
  }
  return data as SurveyMediaRow;
}

export async function deleteMedia(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("survey_media").select("storage_path").eq("id", id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storagePath = (existing as any)?.storage_path;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("survey_media").delete().eq("id", id);
  if (error) throw new Error("Eliminazione media fallita");
  if (storagePath) {
    await supabase.storage.from("surveys").remove([storagePath]);
  }
}

// ─── ACTIVITY LOG ───────────────────────────────────────────────────────────

export async function logActivity(surveyId: string, eventType: string, eventData?: Record<string, unknown>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("survey_activity_log")
    .insert({ survey_id: surveyId, event_type: eventType, event_data: eventData ?? {} });
  if (error) console.error("[surveys] logActivity failed (non-blocking)", error);
}

// ─── ASSIGNEES ──────────────────────────────────────────────────────────────

export async function assignUser(surveyId: string, userId: string, role: "technician" | "subcontractor" | "employee" | "observer" = "technician"): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("survey_assignees")
    .insert({ survey_id: surveyId, user_id: userId, role });
  if (error) {
    console.error("[surveys] assignUser failed", error);
    throw new Error("Assegnazione utente fallita");
  }
}

export async function unassignUser(surveyId: string, userId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("survey_assignees")
    .delete()
    .eq("survey_id", surveyId)
    .eq("user_id", userId);
  if (error) throw new Error("Rimozione assegnazione fallita");
}

// ─── TEMPLATE SETTINGS (S6) ─────────────────────────────────────────────────

export interface TemplateWithSettings extends SurveyTemplateRow {
  enabled_for_company: boolean;
  sort_order_for_company: number;
}

export async function listTemplatesWithSettings(): Promise<TemplateWithSettings[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("list_survey_templates_with_settings");
  if (error) {
    console.error("[surveys] listTemplatesWithSettings failed", error);
    throw new Error("Errore caricamento template");
  }
  return (data ?? []) as TemplateWithSettings[];
}

export async function toggleTemplateEnabled(templateId: string, enabled: boolean): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("toggle_survey_template", {
    p_template_id: templateId,
    p_enabled: enabled,
  });
  if (error) throw new Error("Toggle template fallito");
}

export async function cloneTemplate(sourceId: string, newName: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("clone_survey_template", {
    p_source_id: sourceId,
    p_new_name: newName,
  });
  if (error) throw new Error("Clonazione template fallita");
  return data as string;
}

export async function updateTemplate(
  templateId: string,
  patch: { name?: string; description?: string | null; schema?: unknown; is_active?: boolean },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("survey_templates").update(patch).eq("id", templateId);
  if (error) throw new Error("Aggiornamento template fallito");
}

export async function deleteTemplate(templateId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("survey_templates").delete().eq("id", templateId);
  if (error) throw new Error("Eliminazione template fallita");
}

export async function listAssignees(surveyId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("survey_assignees")
    .select("user_id, role, assigned_at, assigned_by")
    .eq("survey_id", surveyId);
  if (error) throw new Error("Errore caricamento assegnatari");
  return data ?? [];
}
