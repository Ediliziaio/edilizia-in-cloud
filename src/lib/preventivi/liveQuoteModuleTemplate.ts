import type { BgnTemplatePdf } from '@/types/bagni';
import type { SrTemplatePdfRow } from '@/types/serramenti';
import { isFullBgnModuleId } from '@/lib/moduli-vendita/fullBgnModules';
import { isSrQuoteModelId } from '@/lib/serramenti/quoteModel';

export type LiveQuoteModuleTemplate =
  | { module: 'bagni'; modelId: string; template: BgnTemplatePdf }
  | { module: 'serramenti'; modelId: string; template: Partial<SrTemplatePdfRow> };

/** One source for AI previews AND new native quotes. Never imports demo data,
 * writes a quote or replaces an existing quote's contractual snapshot. */
export async function loadLiveQuoteModuleTemplate(companyId: string, module: string, modelId: string): Promise<LiveQuoteModuleTemplate> {
  if (!companyId || !(module === 'bagni' && isFullBgnModuleId(modelId) || module === 'serramenti' && isSrQuoteModelId(modelId))) {
    throw new Error('Modello non disponibile: nessun documento generico verrà usato al suo posto.');
  }
  const { sincronizzaModelliAzienda } = await import('@/lib/moduli-vendita/archivioModelli');
  await sincronizzaModelliAzienda(companyId, { solaLettura: true });
  if (module === 'bagni' && isFullBgnModuleId(modelId)) {
    const [{ getBgnTemplatePdf }, { loadLocalBgnTemplate }, { createFullBgnTemplate }] = await Promise.all([
      import('@/hooks/useBagniProgetto'), import('@/lib/moduli-vendita/localBgnTemplates'), import('@/lib/moduli-vendita/fullBgnModules'),
    ]);
    const saved = loadLocalBgnTemplate(companyId, modelId);
    const template = saved?.template ?? createFullBgnTemplate(await getBgnTemplatePdf(companyId), modelId);
    if (template.company_id !== companyId) throw new Error('Il modello appartiene a un’altra azienda.');
    return { module: 'bagni', modelId, template };
  }
  const [{ getTemplatePdf }, { loadLocalSerramentiTemplate }, { createFullSerramentiTemplate }] = await Promise.all([
    import('@/lib/serramenti/api'), import('@/lib/moduli-vendita/localSerramentiTemplates'), import('@/lib/moduli-vendita/fullSerramentiModules'),
  ]);
  if (!isSrQuoteModelId(modelId)) throw new Error('Modello Serramenti non disponibile.');
  const saved = loadLocalSerramentiTemplate(companyId, modelId);
  const template = saved?.template ?? createFullSerramentiTemplate({ ...await getTemplatePdf(companyId, true), company_id: companyId }, modelId);
  if (template.company_id !== companyId) throw new Error('Il modello appartiene a un’altra azienda.');
  return { module: 'serramenti', modelId, template };
}
