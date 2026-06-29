/** ai-genera-template-climatizzazione — wrapper sul CORE condiviso (settore: climatizzazione). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "climatizzazione"));
