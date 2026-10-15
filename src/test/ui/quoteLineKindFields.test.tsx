import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { QuoteLineKindFields } from '@/components/marketing/preventivi/QuoteLineKindFields';
import { QuoteConversionSummary } from '@/components/marketing/preventivi/QuoteConversionSummary';
import type { QuoteItemPro } from '@/types/quoteItem';
afterEach(cleanup);
const voce:QuoteItemPro={name:'Scavo',description:'',item_type:'product',item_category:'prodotto',quantity:12.5,unit_price:44,discount_percent:5,vat_rate:22,unit_of_measure:'ml',sort_order:0,prezzo_acquisto:20,mostra_nel_pdf:true,is_optional:false};
it('riclassificare cambia la destinazione senza cambiare prezzi, IVA, quantità o sconti',()=>{
 function Editor(){const [item,setItem]=useState(voce);return <><QuoteLineKindFields item={item} onChange={p=>setItem({...item,...p})}/><output aria-label="Dati voce">{JSON.stringify(item)}</output><QuoteConversionSummary items={[item]} total={637.45}/></>}
 render(<Editor/>);fireEvent.change(screen.getByLabelText('Tipo di voce: Scavo'),{target:{value:'posa'}});
 const salvata=JSON.parse(screen.getByLabelText('Dati voce').textContent!);
 expect(salvata).toEqual({...voce,item_category:'posa',item_type:'service'});
 expect(screen.getByText('Lavorazioni · 1')).toBeTruthy();expect(screen.getByText('Materiali · 0')).toBeTruthy();
 expect(screen.getByText(/637,45/)).toBeTruthy();
});
it('il riepilogo segnala categorie ignote invece di trattarle come articoli',()=>{
 render(<QuoteConversionSummary items={[{name:'Voce',quantity:1,item_category:'ignota'}]} total={120}/>);
 expect(screen.getByRole('alert').textContent).toContain('classificazione');
});
