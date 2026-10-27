import type { SrPercorsoFase, SrTemplatePdfRow } from "@/types/serramenti";
import { conOrigine } from "@/lib/pdf/fotoBlocchi";
import { toDataUrl } from "./pdfImageUtils";
import { eFotoDiSerie, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";

export interface FotoPianoLavoriPdf {
  fasi: Array<string | null>;
  personalizzata?: string | null;
  illustrativa: boolean;
}

export function scenaFase(fase: Pick<SrPercorsoFase, "nome">): string | null {
  const nome = fase.nome.toLocaleLowerCase("it-IT");
  if (/riliev|misur|sopralluog/.test(nome)) return "rilievo";
  if (/consegn|collaud/.test(nome)) return "consegna";
  if (/conferm|approv|ordine/.test(nome)) return "conferma";
  if (/scelt|configur|finitur|material/.test(nome)) return "scelte";
  if (/posa|montagg|install/.test(nome)) return "posa";
  return null;
}

export async function caricaFotoPianoLavori(template: Partial<SrTemplatePdfRow> | null | undefined): Promise<FotoPianoLavoriPdf | null> {
  const percorso = template?.percorso_cliente;
  if (!percorso?.attivo || !(percorso.immagini_illustrative === true || percorso.fasi.some(f => f.attivita_azienda?.trim() || f.conferma_cliente?.trim() || f.tempistiche?.trim()))) return null;
  if (percorso.immagini_illustrative === false) return null;
  const modulo = template?.pdf_blocchi?.modulo_intervento;
  if (modulo && modulo !== "finestre") return null;
  const scelta = leggiFotoPagina("percorso", "serramenti", template?.pdf_blocchi);
  const carica = async (url: string) => {
    try { return await toDataUrl(conOrigine(url)); } catch { return null; }
  };
  if (scelta && !eFotoDiSerie(scelta)) return { fasi: [], personalizzata: await carica(scelta), illustrativa: false };
  const scene = percorso.fasi.map(scenaFase);
  const immagini = new Map(await Promise.all([...new Set(scene.filter((s): s is string => s !== null))].map(async scena =>
    [scena, await carica(`/pdf-stock/serramenti/piano-${scena}-v3.jpg`)] as const)));
  return { fasi: scene.map(scena => scena ? immagini.get(scena) ?? null : null), illustrativa: true };
}
