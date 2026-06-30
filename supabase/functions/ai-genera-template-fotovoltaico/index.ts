/** ai-genera-template-fotovoltaico — wrapper sul CORE condiviso (settore: fotovoltaico). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "fotovoltaico"));
