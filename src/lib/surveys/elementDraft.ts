import type { SurveyElementDraft } from "./workspace";
import type { WindowComponent, DrawingView } from "./windowSurvey";

export type SurveyDraftScope = {
  userId: string;
  companyId: string;
  surveyId: string;
  elementId: string;
};
export type PendingSurveyAnnotation = {
  view: DrawingView;
  component: WindowComponent;
  pending: { x: number; y: number };
  note: string;
  photoId: string;
};
export type LocalSurveyDraft = {
  version: 1;
  revision: string;
  savedAt: number;
  baseUpdatedAt: string;
  schema: string;
  base: SurveyElementDraft;
  draft: SurveyElementDraft;
  annotation: PendingSurveyAnnotation | null;
};
export const SURVEY_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CHARS = 250000;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => safeJson(v, depth + 1));
  return (
    record(value) &&
    Object.entries(value).every(
      ([k, v]) =>
        !["__proto__", "constructor", "prototype"].includes(k) &&
        safeJson(v, depth + 1),
    )
  );
}
function draftShape(v: unknown): v is SurveyElementDraft {
  return (
    record(v) &&
    record(v.values) &&
    safeJson(v.values) &&
    typeof v.quantity === "number" &&
    Number.isFinite(v.quantity) &&
    (v.notes === null || typeof v.notes === "string") &&
    (v.element_label === null || typeof v.element_label === "string")
  );
}
function annotationShape(v: unknown): v is PendingSurveyAnnotation | null {
  if (v === null) return true;
  return (
    record(v) &&
    ["interna", "esterna"].includes(String(v.view)) &&
    ["primary", "cassonetto", "tapparella", "zanzariera", "persiana"].includes(
      String(v.component),
    ) &&
    record(v.pending) &&
    [v.pending.x, v.pending.y].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
    ) &&
    typeof v.note === "string" &&
    v.note.length <= 2000 &&
    typeof v.photoId === "string"
  );
}
export function surveyDraftKey(scope: SurveyDraftScope) {
  if (Object.values(scope).some((v) => !v))
    throw new Error("Contesto bozza incompleto.");
  return `survey-element-draft:v1:${[scope.userId, scope.companyId, scope.surveyId, scope.elementId].map(encodeURIComponent).join(":")}`;
}
export function surveySchemaKey(schema: unknown) {
  const text = JSON.stringify(schema);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readSurveyDraft(
  store: Store,
  key: string,
  now = Date.now(),
): LocalSurveyDraft | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    if (raw.length > MAX_CHARS) throw new Error("too large");
    const d: unknown = JSON.parse(raw);
    if (
      record(d) &&
      d.version === 1 &&
      typeof d.savedAt === "number" &&
      Number.isFinite(d.savedAt) &&
      now - d.savedAt > SURVEY_DRAFT_TTL
    ) {
      if (store.getItem(key) === raw) store.removeItem(key);
      return null;
    }
    if (
      !record(d) ||
      d.version !== 1 ||
      typeof d.revision !== "string" ||
      typeof d.savedAt !== "number" ||
      !Number.isFinite(d.savedAt) ||
      d.savedAt > now + 300000 ||
      now - d.savedAt > SURVEY_DRAFT_TTL ||
      typeof d.baseUpdatedAt !== "string" ||
      typeof d.schema !== "string" ||
      !draftShape(d.base) ||
      !draftShape(d.draft) ||
      !annotationShape(d.annotation)
    )
      throw new Error("invalid draft");
    return d as LocalSurveyDraft;
  } catch {
    // Keep unreadable/newer-version data for manual recovery; never destroy it silently.
    return null;
  }
}
export function writeSurveyDraft(
  store: Store,
  key: string,
  draft: LocalSurveyDraft,
  expectedRevision: string | null,
) {
  if (
    !draftShape(draft.base) ||
    !draftShape(draft.draft) ||
    !annotationShape(draft.annotation)
  )
    throw new Error(
      "La bozza contiene un valore non serializzabile. Correggilo prima di uscire.",
    );
  const current = readSurveyDraft(store, key);
  if (!current && store.getItem(key))
    throw new Error(
      "Esiste una bozza incompatibile in questo browser: non la sovrascrivo. Mantieni questa scheda aperta e salva nel gestionale.",
    );
  if ((current?.revision ?? null) !== expectedRevision)
    throw new Error(
      "La bozza è cambiata in un’altra scheda. Questa copia resta aperta, ma non sovrascrivo quella dell’altra scheda.",
    );
  const raw = JSON.stringify(draft);
  if (raw.length > MAX_CHARS)
    throw new Error(
      "La bozza è troppo grande per la protezione locale. Salva nel gestionale prima di uscire.",
    );
  store.setItem(key, raw);
}
export function removeSurveyDraft(
  store: Store,
  key: string,
  expectedRevision: string | null,
) {
  const current = readSurveyDraft(store, key);
  if (!current && store.getItem(key)) return false;
  if ((current?.revision ?? null) !== expectedRevision) return false;
  store.removeItem(key);
  return true;
}
export type DraftConflict = { key: string; local: unknown; remote: unknown };
export function reconcileSurveyDraft(
  base: SurveyElementDraft,
  remote: SurveyElementDraft,
  local: SurveyElementDraft,
  resolutions: Record<string, "local" | "remote"> = {},
) {
  const merged = structuredClone(remote),
    conflicts: DraftConflict[] = [];
  const choose = (
    key: string,
    b: unknown,
    r: unknown,
    l: unknown,
    assign: (v: unknown) => void,
  ) => {
    if (equal(b, l)) return;
    if (!equal(b, r) && !equal(r, l)) {
      conflicts.push({ key, local: l, remote: r });
      if (!resolutions[key] || resolutions[key] === "remote") return;
    }
    assign(l);
  };
  const keys = new Set([
    ...Object.keys(base.values),
    ...Object.keys(remote.values),
    ...Object.keys(local.values),
  ]);
  for (const key of keys)
    choose(
      `values.${key}`,
      base.values[key],
      remote.values[key],
      local.values[key],
      (v) => {
        if (v === undefined) delete merged.values[key];
        else
          Object.defineProperty(merged.values, key, {
            value: v,
            writable: true,
            enumerable: true,
            configurable: true,
          });
      },
    );
  for (const key of ["quantity", "notes", "element_label"] as const)
    choose(key, base[key], remote[key], local[key], (v) =>
      Object.assign(merged, { [key]: v }),
    );
  return {
    draft: merged,
    conflicts,
    unresolved: conflicts.filter((c) => !resolutions[c.key]),
  };
}
