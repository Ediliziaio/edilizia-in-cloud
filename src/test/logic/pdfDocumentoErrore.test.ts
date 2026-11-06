import { afterEach, expect, it, vi } from 'vitest';
import { downloadNativePDF } from '@/lib/fatturazione/generatePDF';
const mock = vi.hoisted(()=>({invoke:vi.fn(),stampa:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mock.invoke}}}));
vi.mock('@/lib/fotovoltaico/htmlToPdf',()=>({stampaPreventivoNativo:mock.stampa}));
afterEach(()=>vi.clearAllMocks());
it('limita la richiesta e propaga l’errore senza fingere un download',async()=>{
 mock.invoke.mockResolvedValue({data:null,error:{message:'Tempo scaduto'}});
 await expect(downloadNativePDF('demo')).rejects.toThrow('Tempo scaduto');
 expect(mock.invoke).toHaveBeenCalledWith('generate-native-pdf',{body:{documento_id:'demo'},timeout:30000});
 expect(mock.stampa).not.toHaveBeenCalled();
});
it('il comando richiama la stampa nativa quando il contenuto esiste',async()=>{
 mock.invoke.mockResolvedValue({data:{html:'<p>Bozza demo</p>'},error:null});
 await downloadNativePDF('demo');
 expect(mock.stampa).toHaveBeenCalledWith('<p>Bozza demo</p>','Documento demo');
});
