import type { SurveyAreaRow } from "@/types/surveys";

/** JSONB normalizes object key order. Array order remains significant. */
export function sameSurveyJson(a: unknown, b: unknown): boolean {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, stable(v)]),
      );
    return value;
  };
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

/** area_data from a field edit contains changed keys only, never a stale full JSON snapshot. */
export function mergeSurveyAreaEdit(
  current: Pick<SurveyAreaRow, "name" | "area_data" | "position">,
  patch: Partial<SurveyAreaRow>,
): Partial<SurveyAreaRow> {
  return {
    name: current.name,
    position: current.position,
    ...patch,
    area_data: { ...(current.area_data ?? {}), ...(patch.area_data ?? {}) },
  };
}
