import type { FullFacModuleId, FullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";

/** In-memory safety net for BrowserRouter POP/unmount timing. Never persisted or shared across companies. */
export interface FacDraft { template: FullFacTemplate; baseline: string; revision: string | null }
const drafts = new Map<string, FacDraft>();
const key = (company: string, module: FullFacModuleId) => JSON.stringify([company, module]);
export const getFacDraft = (company: string, module: FullFacModuleId) => drafts.get(key(company, module));
export const putFacDraft = (company: string, module: FullFacModuleId, draft: FacDraft) => drafts.set(key(company, module), draft);
export const clearFacDraft = (company: string, module: FullFacModuleId) => drafts.delete(key(company, module));
