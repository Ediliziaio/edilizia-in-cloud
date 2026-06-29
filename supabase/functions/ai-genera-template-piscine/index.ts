/** ai-genera-template-piscine — wrapper sul CORE condiviso (settore: piscine). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "piscine"));
