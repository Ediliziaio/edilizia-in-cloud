import type { SrTemplatePdfRow } from "@/types/serramenti";
import { findSerramentiTemplateModule } from "./serramentiTemplateModules";

/** Old local editions receive a readable default; an explicitly cleared value stays empty. */
export function serramentiModuleExclusions(template?: Partial<SrTemplatePdfRow> | null): string {
  if (!template?.id?.startsWith("local-serramenti-")) return "";
  const custom = template.pdf_blocchi?.modulo_esclusioni;
  if (typeof custom === "string") return custom;
  return findSerramentiTemplateModule(template.id.slice("local-serramenti-".length))?.excluded || "";
}
