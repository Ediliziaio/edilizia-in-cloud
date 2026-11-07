import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ManualArticleAdder} from '@/components/warehouse/ManualArticleAdder';
import type {BatchScanEntry} from '@/components/warehouse/BatchBarcodeScanner';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
afterEach(cleanup);
const entries:BatchScanEntry[]=['a','b'].map(clientUuid=>({clientUuid,stockItemId:clientUuid,itemName:clientUuid,rawCode:clientUuid,trackingMode:'fungible',quantity:1,serialNumbers:[] as string[],scannedAt:1}));
function setup(){const change=vi.fn();render(<QueryClientProvider client={new QueryClient()}><ManualArticleAdder companyId={undefined} warehouseId="magazzino" entries={entries} onEntriesChange={change}/></QueryClientProvider>);return change;}
it('rimuove soltanto la scansione selezionata anche quando le righe non hanno id',()=>{
 const change=setup();fireEvent.click(screen.getAllByRole('button',{name:'Rimuovi'})[0]);expect(change).toHaveBeenCalledWith([entries[1]]);
});
it('modifica la quantità della sola scansione selezionata',()=>{
 const change=setup();fireEvent.change(screen.getAllByRole('spinbutton').at(-1)!,{target:{value:'3'}});expect(change).toHaveBeenCalledWith([entries[0],{...entries[1],quantity:3}]);
});
