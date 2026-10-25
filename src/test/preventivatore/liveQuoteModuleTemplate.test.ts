import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLiveQuoteModuleTemplate } from '@/lib/preventivi/liveQuoteModuleTemplate';
import { createFullBgnTemplate, FULL_BGN_MODULES } from '@/lib/moduli-vendita/fullBgnModules';
import { FULL_SERRAMENTI_MODULES, createFullSerramentiTemplate } from '@/lib/moduli-vendita/fullSerramentiModules';
import type { BgnTemplatePdf } from '@/types/bagni';
const ports = vi.hoisted(() => ({ sync: vi.fn(), bgn: vi.fn(), sr: vi.fn(), savedBagni: vi.fn(), savedSr: vi.fn() }));
vi.mock('@/lib/moduli-vendita/archivioModelli', () => ({ sincronizzaModelliAzienda: ports.sync }));
vi.mock('@/hooks/useBagniProgetto', () => ({ getBgnTemplatePdf: ports.bgn }));
vi.mock('@/lib/serramenti/api', () => ({ getTemplatePdf: ports.sr }));
vi.mock('@/lib/moduli-vendita/localBgnTemplates', () => ({ loadLocalBgnTemplate: ports.savedBagni }));
vi.mock('@/lib/moduli-vendita/localSerramentiTemplates', () => ({ loadLocalSerramentiTemplate: ports.savedSr }));
const company = 'demo-azienda-2';
const base = { company_id: company } as BgnTemplatePdf;
beforeEach(() => { vi.resetAllMocks(); ports.sync.mockResolvedValue({ scaricati: 0 }); ports.bgn.mockResolvedValue(base); ports.sr.mockResolvedValue({ company_id: company }); });
describe('Un solo modello effettivo per chat e preventivatore', () => {
  it.each(FULL_BGN_MODULES)('usa il modello originale Bagni %s senza i prezzi del mock', async id => {
    const loaded = await loadLiveQuoteModuleTemplate(company, 'bagni', id);
    expect(loaded.template).toEqual(createFullBgnTemplate(base, id));
    expect(ports.sync).toHaveBeenCalledWith(company, { solaLettura: true });
    expect(loaded.template.pdf_blocchi?.modulo_intervento).toBe(id);
  });
  it.each(FULL_SERRAMENTI_MODULES)('usa il modello originale Serramenti %s con le sue foto', async id => {
    const loaded = await loadLiveQuoteModuleTemplate(company, 'serramenti', id);
    expect(loaded.template).toEqual(createFullSerramentiTemplate({ company_id: company }, id));
    expect(loaded.template.pdf_cover_image_url).toBeTruthy(); expect(ports.sr).toHaveBeenCalledWith(company, true);
  });
  it('rilegge le personalizzazioni e non torna alla fotografia predefinita', async () => {
    const template = createFullBgnTemplate(base, 'completo'); template.pdf_cover_image_url = '/immagini/mio-bagno.jpg';
    ports.savedBagni.mockReturnValue({ template });
    const first = await loadLiveQuoteModuleTemplate(company, 'bagni', 'completo');
    const next = structuredClone(template); next.pdf_cover_image_url = '/immagini/nuovo-bagno.jpg'; next.cover_title = 'Modello aggiornato';
    ports.savedBagni.mockReturnValue({ template: next });
    const second = await loadLiveQuoteModuleTemplate(company, 'bagni', 'completo');
    expect(first.template.pdf_cover_image_url).toBe('/immagini/mio-bagno.jpg'); expect(second.template.pdf_cover_image_url).toBe('/immagini/nuovo-bagno.jpg');
    expect(ports.bgn).not.toHaveBeenCalled();
  });
  it('non usa una copia vecchia se non riesce a verificare la libreria', async () => {
    ports.sync.mockRejectedValue(new Error('Rete non disponibile'));
    await expect(loadLiveQuoteModuleTemplate(company, 'serramenti', 'finestre')).rejects.toThrow('Rete');
    expect(ports.savedSr).not.toHaveBeenCalled();
  });
  it('non sostituisce modelli non riconosciuti e non accetta un’altra azienda', async () => {
    await expect(loadLiveQuoteModuleTemplate(company, 'bagni', 'sconosciuto')).rejects.toThrow('nessun documento generico'); expect(ports.sync).not.toHaveBeenCalled();
    ports.savedBagni.mockReturnValue({ template: { ...createFullBgnTemplate(base, 'completo'), company_id: 'altra' } });
    await expect(loadLiveQuoteModuleTemplate(company, 'bagni', 'completo')).rejects.toThrow('altra azienda');
  });
});
