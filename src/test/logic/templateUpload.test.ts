import { beforeEach, describe, expect, it, vi } from 'vitest';
import { caricaTemplateDocumento, type TemplateRegistro } from '@/lib/documenti/templateUpload';
const validation = vi.hoisted(() => vi.fn());
vi.mock('@/lib/documenti/templateCompilazione', () => ({ validaFileTemplate: validation }));
const company = '00000000-0000-4000-8000-000000000001';
const input = { file: new File(['pdf'], 'contratto.pdf'), nome: 'Contratto', tipo_doc: 'contratto' };
function deps() { return { upload: vi.fn(async (_path: string, _file: File): Promise<void> => {}), register: vi.fn(async (_row: TemplateRegistro): Promise<void> => {}),
  registered: vi.fn(async (_id: string) => false), remove: vi.fn(async (_path: string): Promise<void> => {}) }; }
beforeEach(() => { validation.mockReset(); validation.mockResolvedValue(undefined); });
describe('Caricamento modelli: recupero senza doppioni', () => {
  it('registra il file con ID stabile e percorso aziendale', async () => {
    const d = deps(); const id = await caricaTemplateDocumento(d, company, input);
    expect(d.register).toHaveBeenCalledWith(expect.objectContaining({ id, company_id: company, file_url: `${company}/${id}.pdf` }));
  });
  it('su errore di registrazione pulisce solo il file appena caricato', async () => {
    const d = deps(); d.register.mockRejectedValue(new Error('RLS'));
    await expect(caricaTemplateDocumento(d, company, input)).rejects.toThrow('RLS');
    expect(d.remove).toHaveBeenCalledWith(d.upload.mock.calls[0][0]);
  });
  it('recupera un INSERT riuscito con risposta persa e non cancella il file', async () => {
    const d = deps(); d.register.mockRejectedValue(new Error('timeout')); d.registered.mockResolvedValue(true);
    await expect(caricaTemplateDocumento(d, company, input)).resolves.toBeTypeOf('string');
    expect(d.remove).not.toHaveBeenCalled();
  });
  it('se lo stato è incerto conserva il file, senza cancellazioni arbitrarie', async () => {
    const d = deps(); d.register.mockRejectedValue(new Error('timeout')); d.registered.mockRejectedValue(new Error('offline'));
    await expect(caricaTemplateDocumento(d, company, input)).rejects.toThrow('non verificabile');
    expect(d.remove).not.toHaveBeenCalled();
  });
  it('non carica file non validi e non registra dopo un upload fallito', async () => {
    const d = deps(); validation.mockRejectedValueOnce(new Error('PDF danneggiato'));
    await expect(caricaTemplateDocumento(d, company, input)).rejects.toThrow('PDF danneggiato');
    expect(d.upload).not.toHaveBeenCalled();
    d.upload.mockRejectedValue(new Error('storage'));
    await expect(caricaTemplateDocumento(d, company, input)).rejects.toThrow('storage');
    expect(d.register).not.toHaveBeenCalled();
  });
});
