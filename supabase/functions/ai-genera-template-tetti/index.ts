/** ai-genera-template-tetti — wrapper sul CORE condiviso (settore: tetti). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "tetti"));
