/**
 * evalConditions — valutazione regole show_if condivisa tra
 * FieldRenderer e SectionRenderer.
 */
import type { ConditionalRule } from "@/types/surveys";

export function evalRule(rule: ConditionalRule, allValues: Record<string, unknown>): boolean {
  const v = allValues[rule.field];
  switch (rule.operator) {
    case "eq": return v === rule.value;
    case "neq": return v !== rule.value;
    case "in": return Array.isArray(rule.value) && (rule.value as Array<string | number | boolean>).includes(v as string);
    case "not_in": return Array.isArray(rule.value) && !(rule.value as Array<string | number | boolean>).includes(v as string);
    case "truthy": return !!v;
    case "falsy": return !v;
    // 'contains' = il campo (array, p.es. multiselect) contiene il valore
    case "contains":
      return Array.isArray(v) && (v as string[]).includes(String(rule.value));
    default:
      return true;
  }
}

export function isVisible(
  showIf: ConditionalRule | ConditionalRule[] | undefined,
  allValues: Record<string, unknown>,
): boolean {
  if (!showIf) return true;
  const rules = Array.isArray(showIf) ? showIf : [showIf];
  return rules.every((r) => evalRule(r, allValues));
}
