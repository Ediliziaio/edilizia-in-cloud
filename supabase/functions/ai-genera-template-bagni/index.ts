/** ai-genera-template-bagni — wrapper sul CORE condiviso (settore: bagni). */
import { handleGeneraTemplate } from "../_shared/generaTemplatePrompt.ts";

Deno.serve((req: Request) => handleGeneraTemplate(req, "bagni"));
