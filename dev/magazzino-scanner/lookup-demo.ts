import {useMutation} from '@tanstack/react-query';
import type {LookupResult,LookupInput} from '../../src/hooks/warehouse/useBarcodeLookup';
/** Fixture solo per questa anteprima: nessuna chiamata a database, API o Storage. */
export function useBarcodeLookup() {
 return useMutation({mutationFn:async({rawScan}:LookupInput):Promise<LookupResult>=>({rawScan,parsedPrimary:rawScan,gs1Detected:false,action:{kind:'accept_item',itemId:'demo-cavo'},rows:[{match_type:'item',stock_item_id:'demo-cavo',stock_unit_id:null,item_name:'Cavo elettrico · esempio',item_tracking_mode:'fungible',supplier_id:null,supplier_name:null}]})});
}
