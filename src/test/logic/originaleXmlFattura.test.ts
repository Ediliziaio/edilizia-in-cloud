import { beforeEach,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({download:vi.fn(),generate:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:()=>({download:mock.download})}}}));
vi.mock('@/lib/fatturazione/generateXML',()=>({generateFatturaPAXML:mock.generate}));
import {leggiXmlFattura} from '@/lib/fatturazione/scaricaXml';
beforeEach(()=>vi.clearAllMocks());
it('per una consegnata usa il contenuto originale e non rigenera dalle note attuali',async()=>{
 mock.download.mockResolvedValue({data:{text:async()=>'<originale/>'},error:null});
 const r=await leggiXmlFattura({stato:'consegnata',sdi_file_xml_url:'azienda/originale.xml',note_documento:'Nota aggiunta dopo'} as never,null);
 expect(r).toEqual({xml:'<originale/>',partito:true});expect(mock.generate).not.toHaveBeenCalled();
});
it('non inventa un originale se il file trasmesso manca o lo storage non risponde',async()=>{
 await expect(leggiXmlFattura({stato:'consegnata',sdi_id_trasmissione:'id'} as never,null)).rejects.toThrow(/originale/);
 mock.download.mockResolvedValue({data:null,error:new Error('storage non disponibile')});
 await expect(leggiXmlFattura({stato:'consegnata',sdi_file_xml_url:'originale.xml'} as never,{} as never)).rejects.toThrow(/storage/);
 expect(mock.generate).not.toHaveBeenCalled();
});
it('per una bozza genera soltanto una anteprima dichiarata come non trasmessa',async()=>{
 mock.generate.mockReturnValue('<anteprima/>');expect(await leggiXmlFattura({stato:'bozza',tipo:'fattura'} as never,{} as never)).toEqual({xml:'<anteprima/>',partito:false});
});

it('uno scarto NS senza originale può avere una nuova anteprima corretta con lo stesso numero',async()=>{
 mock.generate.mockReturnValue('<correzione dopo scarto/>');expect(await leggiXmlFattura({stato:'rifiutata',sdi_stato:'NS',sdi_id_trasmissione:'scartato',tipo:'fattura'} as never,{} as never)).toEqual({xml:'<correzione dopo scarto/>',partito:false});
});
