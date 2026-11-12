import{afterEach,beforeEach,describe,it,expect,vi}from'vitest';
const mocks=vi.hoisted(()=>({download:vi.fn(),sign:vi.fn(),error:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:()=>({download:mocks.download,createSignedUrl:mocks.sign})}}}));
vi.mock('sonner',()=>({toast:{error:mocks.error}}));
import{scaricaAllegato}from '@/components/orders/filePreviewUtils';
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:test')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});});
afterEach(()=>{vi.runOnlyPendingTimers();vi.useRealTimers();vi.restoreAllMocks();});
describe('Download rivalida i permessi',()=>{
 it('scarica con la sessione corrente senza emettere link riutilizzabili',async()=>{mocks.download.mockResolvedValue({data:new Blob(['Operativo']),error:null});await scaricaAllegato('ordine/prova.txt','prova.txt');expect(mocks.download).toHaveBeenCalledWith('ordine/prova.txt');expect(mocks.sign).not.toHaveBeenCalled();expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();});
 it('una revoca non produce alcun download o URL',async()=>{mocks.download.mockResolvedValue({data:null,error:{message:'not permitted'}});await scaricaAllegato('ordine/hr.txt','hr.txt');expect(URL.createObjectURL).not.toHaveBeenCalled();expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();expect(mocks.error).toHaveBeenCalled();});
});
