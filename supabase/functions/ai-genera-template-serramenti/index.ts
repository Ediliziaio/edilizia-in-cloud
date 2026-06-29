/** ai-genera-template-serramenti — wrapper sul CORE condiviso (settore: serramenti). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "serramenti"));
