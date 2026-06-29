/** ai-genera-template-elettrico — wrapper sul CORE condiviso (settore: elettrico). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "elettrico"));
