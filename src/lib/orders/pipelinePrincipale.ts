import type { PipelineLocale } from "./pipelineLocali";

// Renova gestisce i cantieri per tipologia. Gli stati storici continuano a
// servire le commesse senza assegnazione, l'assistenza e le automazioni.
export const AZIENDA_RENOVA = "f2a16dd8-36c3-4d92-8d78-267d6374dcb5";
export const PIPELINE_PRINCIPALE = "principale";
export const SENZA_PIPELINE = "senza-pipeline";

export function mostraPipelinePrincipale(azienda: string | undefined): boolean {
  return azienda !== AZIENDA_RENOVA;
}

export function pipelineOperativa(azienda: string | undefined, pipeline: readonly PipelineLocale[], scelta: string | null) {
  return pipeline.find(p => p.id === scelta)
    ?? (mostraPipelinePrincipale(azienda) || scelta === SENZA_PIPELINE ? undefined : pipeline[0]);
}
