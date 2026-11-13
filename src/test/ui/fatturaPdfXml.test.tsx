import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const m=vi.hoisted(()=>({leggi:vi.fn(),pdf:vi.fn()}));
vi.mock('@/lib/fatturazione/scaricaXml',()=>({leggiXmlFattura:m.leggi}));
vi.mock('@/lib/fatturazione/fatturaXmlTabellare',()=>({generaPdfFatturaXml:m.pdf,fatturaXmlTabellareHtml:vi.fn()}));
import {FatturaElettronicaPannello} from '@/components/fatturazione/FatturaElettronicaPannello';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('scarica un PDF dal contenuto XML originale anche quando il documento ha note successive',async()=>{
 const create=vi.fn((_blob:Blob)=> 'blob:pdf');vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:vi.fn()}));
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 m.leggi.mockResolvedValue({xml:'<originale archiviato/>',partito:true});m.pdf.mockResolvedValue(new Uint8Array([37,80,68,70,45]));
 render(<FatturaElettronicaPannello doc={{tipo:'fattura',stato:'consegnata',numero:'FPR 79/26',sdi_stato:'RC',trasmissione:'sdi',sdi_id_trasmissione:'invio',note_documento:'Nota successiva'} as never} azienda={null} tipoLabel="Fattura" onEsportaXml={()=>{}} />);
 fireEvent.click(screen.getByRole('button',{name:'Scarica PDF da XML'}));
 await waitFor(()=>expect(click).toHaveBeenCalledTimes(1));expect(m.pdf).toHaveBeenCalledWith('<originale archiviato/>');expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
});
