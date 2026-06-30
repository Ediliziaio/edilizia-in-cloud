/** ai-genera-template-pavimenti — wrapper sul CORE condiviso (settore: pavimenti). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "pavimenti"));
