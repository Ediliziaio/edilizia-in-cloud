import { describe, expect, it } from 'vitest';
import { buildLocalQuotePdfData } from '@/lib/preventivi/localQuotePdf';
import { applyBathroomBudgetExample } from '@/lib/preventivi/quoteBathroomBudgetExample';
import { emptyChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { emptyQuoteProject } from '@/lib/preventivi/quoteProject';
import type { LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import { createFullBgnTemplate } from '@/lib/moduli-vendita/fullBgnModules';
import type { BgnTemplatePdf } from '@/types/bagni';
const company = 'd2000000-0000-4000-a000-000000000002';
const draft: LocalBagniDraft = { modelId: 'completo', clientName: 'Cliente sintetico', iva: null, rows: [] };
describe('Bozza PDF locale nello stesso documento edile condiviso', () => {
  it('con un modello reale conserva copertina, logo, foto e testi, senza importare righe di esempio', () => {
    const template = createFullBgnTemplate({ company_id: company } as BgnTemplatePdf, 'completo');
    template.pdf_cover_image_url = 'https://example.com/bagno-personalizzato.jpg';
    template.pdf_cover_hero = 'Il bagno su misura'; template.cover_logo_url = 'https://example.com/logo.png';
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0);
    const appearance = { template, company: { name: 'Demo 2', logo_url: 'https://example.com/brand.png' } };
    const data = buildLocalQuotePdfData(doc, draft, emptyQuoteProject(), company, 'Demo 2', appearance);
    expect(data.modello.copertina.immagineUrl).toContain('bagno-personalizzato.jpg');
    expect(data.modello.copertina.titolo).toBe('Il bagno su misura');
    expect(data.modello.copertina.logoUrl).toContain('logo.png');
    expect(Object.values(data.modello.blocchi).some(b => b.foto.length > 0)).toBe(true);
    expect(data.capitoli.flatMap(c => c.voci)).toHaveLength(12); expect(data.totali.imponibile).toBe(12000);
    expect(data.modello.mostraMargine).toBe(false); expect(data.bozzaLocale?.ivaDaDefinire).toBe(true);
    const updated = structuredClone(template); updated.pdf_cover_hero = 'Nuova copertina';
    expect(buildLocalQuotePdfData(doc, draft, emptyQuoteProject(), company, 'Demo 2', { ...appearance, template: updated }).modello.copertina.titolo).toBe('Nuova copertina');
    expect(doc.lines[0].price).toBe(450);
  });
  it('rifiuta il modello di un altro intervento o di un’altra azienda', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0);
    const template = createFullBgnTemplate({ company_id: company } as BgnTemplatePdf, 'doccia');
    expect(() => buildLocalQuotePdfData(doc, draft, emptyQuoteProject(), company, 'Demo', { template })).toThrow('non corrisponde');
    const other = createFullBgnTemplate({ company_id: 'altra' } as BgnTemplatePdf, 'completo');
    expect(() => buildLocalQuotePdfData(doc, draft, emptyQuoteProject(), company, 'Demo', { template: other })).toThrow('non corrisponde');
  });
  it('distingue IVA ignota e stime, omette firme, promesse, foto e costi interni', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0); const project = emptyQuoteProject(); project.address = 'Indirizzo dimostrativo'; project.notes = 'Finiture base da scegliere';
    project.costs = [{ id: doc.lines[0].id, materials: 912345, hours: null, hourlyRate: null, subcontract: null, other: null }];
    const data = buildLocalQuotePdfData(doc, draft, project, company, 'Demo 2');
    expect(data.bozzaLocale).toEqual({ ivaDaDefinire: true }); expect(data.totali.imponibile).toBe(12000);
    expect(data.scheda.some(row => row.valore.includes('IVA da definire'))).toBe(true);
    expect(data.scheda.some(row => row.valore.includes('importi indicativi'))).toBe(true);
    expect(data.modello.mostraMargine).toBe(false); expect(data.modello.condizioniLegali).toEqual([]); expect(data.modello.cronoprogramma).toEqual([]);
    expect(data.modello.copertina.immagineUrl).toBeNull(); expect(data.modello.fotoChiusura).toBeNull(); expect(data.modello.conRecesso).toBe(false);
    expect(JSON.stringify(data)).not.toContain('912345'); expect(data.cantiere).toBe(project.address);
    for (const voce of data.capitoli.flatMap(c => c.voci)) expect(voce.dettaglio).toBe(doc.lines.find(l => l.id === voce.id)?.description);
  });
  it('conserva sconto riga, IVA esplicita, quantità e dettagli senza includere righe escluse', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0); doc.lines[1].included = false;
    const data = buildLocalQuotePdfData(doc, { ...draft, iva: 10, rows: [{ id: doc.lines[0].id, chapter: 'Preparazioni', discount: 10 }] }, emptyQuoteProject(), company, 'Demo 2');
    expect(data.totali.imponibile).toBe(10605); expect(data.totali.totale).toBe(11665.5);
    expect(data.bozzaLocale?.ivaDaDefinire).toBe(false); expect(data.capitoli.flatMap(c => c.voci)).toHaveLength(11);
    expect(data.capitoli[0].voci[0].importo).toBe(405);
  });
  it('non produce un documento apparentemente completo da una bozza vuota', () => {
    expect(() => buildLocalQuotePdfData(emptyChatDocument(), draft, emptyQuoteProject(), company, 'Demo 2')).toThrow('Includi almeno');
  });
});
