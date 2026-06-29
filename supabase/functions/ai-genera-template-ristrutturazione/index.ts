/** ai-genera-template-ristrutturazione — wrapper sul CORE condiviso (settore: ristrutturazione). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "ristrutturazione"));
