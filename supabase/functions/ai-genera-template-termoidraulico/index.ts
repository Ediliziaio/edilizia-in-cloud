/** ai-genera-template-termoidraulico — wrapper sul CORE condiviso (settore: termoidraulico). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "termoidraulico"));
