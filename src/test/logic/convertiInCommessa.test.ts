import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import { anteprimaConversioneModulo,convertiFvInCommessa,convertiRstInCommessa } from '@/lib/moduli/convertiInCommessa';
const preview={materiali:[{name:'Pannello',quantity:12,unit_price:140,description:null}],fasi:[{name:'Posa',notes:'7.5 h'}],imponibile:10000,aliquota:10,totale:11000,impronta:'versione-1',esclusi:0,descrizione:'Impianto'};
beforeEach(()=>{rpc.mockReset();rpc.mockImplementation(async(fn:string,args:any)=>({data:fn==='commessa_avvia'?{fasi:0,rate:2}:{...preview,...(!args.p_anteprima?{id:'o1'}:{})},error:null}));});
describe('client conversione atomica dei moduli',()=>{
 it('anteprima non chiede alcuna scrittura né passa prezzi dal browser',async()=>{expect(await anteprimaConversioneModulo('fv','p1')).toEqual(preview);expect(rpc).toHaveBeenCalledExactlyOnceWith('converti_modulo_commessa_atomic',{p_modulo:'fv',p_progetto_id:'p1',p_raggruppa_capitoli:false,p_anteprima:true,p_impronta:null});});
 it('conferma usa la versione mostrata e avvia rate solo dopo il salvataggio',async()=>{expect(await convertiFvInCommessa('p1','u1','versione-1')).toMatchObject({orderId:'o1',righe:1,lavorazioni:1,avviso:null});expect(rpc.mock.calls.map(c=>c[0])).toEqual(['converti_modulo_commessa_atomic','commessa_avvia']);expect(rpc.mock.calls[0][1]).toMatchObject({p_anteprima:false,p_impronta:'versione-1'});});
 it('vecchi chiamanti senza anteprima ricevono una verifica server prima di convertire',async()=>{await convertiRstInCommessa('p2','u1',{fasiDaCapitoli:true});expect(rpc.mock.calls[0][1]).toMatchObject({p_anteprima:true,p_raggruppa_capitoli:true});expect(rpc.mock.calls[1][1]).toMatchObject({p_anteprima:false,p_impronta:'versione-1',p_raggruppa_capitoli:true});});
 it('errore atomico propagato senza avviare rate o altri aggiornamenti',async()=>{rpc.mockResolvedValue({data:null,error:{message:'Accesso scaduto'}});await expect(convertiFvInCommessa('p1','u1','versione-1')).rejects.toThrow('Accesso scaduto');expect(rpc).toHaveBeenCalledTimes(1);});
 it('sessione mancante non chiama la conversione',async()=>{await expect(convertiFvInCommessa('p1','')).rejects.toThrow('Sessione');expect(rpc).not.toHaveBeenCalled();});
 it('fallimento avvio rate segnalato senza fingere che la commessa sia fallita',async()=>{rpc.mockImplementation(async(fn:string)=>fn==='commessa_avvia'?{error:{message:'rete'},data:null}:{data:{...preview,id:'o1'},error:null});expect(await convertiFvInCommessa('p1','u1','versione-1')).toMatchObject({orderId:'o1',avviso:expect.stringContaining('Verifica le rate')});});
});
