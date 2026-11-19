import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FattureCommessaCard } from '@/components/orders/FattureCommessaCard';
import { setupRadixMenus, scegliNelMenu } from '@/test/helpers/radixMenus';
import type { FatturaCommessa } from '@/lib/orders/fattureCommessa';
setupRadixMenus();
const retry=vi.fn(), download=vi.fn();
const doc=(changes:Partial<FatturaCommessa>={}):FatturaCommessa=>({id:'f1',numero:'FT-1',data_emissione:'2026-11-17',stato:'pagata',tipo:'fattura',totale_documento:122,totale_da_pagare:122,importo_pagato:122,importo_associato:null,...changes});
const rate=[{id:'r1',label:'Acconto 30%',position:1,type:'deposit' as const,amount:122,is_paid:true,documento_fiscale_id:'f1'}];
const documents=()=>[doc(),doc({id:'f2',numero:'FT-2',stato:'emessa',importo_pagato:20}),doc({id:'ann',numero:'ANNULLATA-3',stato:'annullata',importo_pagato:0}),doc({id:'b',numero:'BOZZA',stato:'bozza',importo_pagato:0}),doc({id:'p',numero:'PROFORMA',tipo:'proforma',stato:'emessa',importo_pagato:0})];
function show(props:Partial<Parameters<typeof FattureCommessaCard>[0]>={}){return render(<MemoryRouter><FattureCommessaCard documents={documents()} installments={rate} onRetry={retry} onDownload={download} {...props}/></MemoryRouter>);}
beforeEach(()=>vi.clearAllMocks());afterEach(cleanup);
describe('Fatture e incassi nella commessa',()=>{
  it('le annullate non sono in vista predefinita; i totali includono solo le emesse',()=>{
    show();expect(screen.queryByRole('link',{name:'ANNULLATA-3'})).toBeNull();
    const summary=screen.getByLabelText('Riepilogo fatture della commessa');
    expect(summary).toHaveTextContent('244,00');expect(summary).toHaveTextContent('142,00');expect(summary).toHaveTextContent('102,00');
    expect(screen.getByRole('table')).toHaveTextContent('Acconto 30%');
    fireEvent.click(screen.getByRole('button',{name:/^Annullate e stornate/}));
    const row=screen.getByRole('link',{name:'ANNULLATA-3'}).closest('tr')!;
    expect(row).toHaveTextContent('Annullata');expect(within(row).queryByText('0,00 €')).toBeNull();
    expect(screen.getByLabelText('Riepilogo fatture della commessa')).toHaveTextContent('244,00');
  });
  it('cerca per rata e filtra il tipo, con azzeramento quando non trova documenti',async()=>{
    show();fireEvent.change(screen.getByRole('textbox',{name:'Cerca fattura della commessa'}),{target:{value:'Acconto 30%'}});
    expect(screen.getByRole('link',{name:'FT-1'})).toBeInTheDocument();expect(screen.queryByRole('link',{name:'FT-2'})).toBeNull();
    await scegliNelMenu('Tipo documento cliente','Note di credito');
    expect(screen.getByText('Nessun documento corrisponde ai filtri.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Mostra tutti i documenti'}));
    expect(screen.getByRole('link',{name:'ANNULLATA-3'})).toBeInTheDocument();
  });
  it('apre il documento esistente e il suo PDF senza crearne altri',()=>{
    show();expect(screen.getByRole('link',{name:'FT-1'})).toHaveAttribute('href','/azienda/documenti/f1/dettaglio');
    fireEvent.click(screen.getByRole('button',{name:'PDF FT-1'}));expect(download).toHaveBeenCalledWith(expect.objectContaining({id:'f1'}));
  });
  it('la copia importata rimane raggiungibile, non ha il comando PDF nativo',()=>{
    show({documents:[doc({origine:'importata'})]});
    expect(screen.getByRole('link',{name:'FT-1'})).toHaveAttribute('href','/azienda/documenti/importata/f1');
    expect(screen.queryByRole('button',{name:'PDF FT-1'})).toBeNull();
  });
  it('le copie con incassi discordanti hanno un avviso e conservano gli originali',()=>{
    show({documents:[doc({copie_importate:[{id:'i1',numero:'FT-1'}],copie_da_verificare:true})]});
    fireEvent.click(screen.getByText('Copie con dati diversi · verifica'));
    expect(screen.getByText(/I totali usano il documento nativo/)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Apri FT-1'})).toHaveAttribute('href','/azienda/documenti/importata/i1');
  });
  it('un errore non viene mostrato come zero fatture o totale zero',()=>{
    show({documents:[],error:true});expect(screen.getByRole('alert')).toHaveTextContent('totali non sono stati calcolati');
    expect(screen.queryByLabelText('Riepilogo fatture della commessa')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Riprova fatture'}));expect(retry).toHaveBeenCalledTimes(1);
  });
});

it('distingue l’arrotondamento del piano dal denaro effettivamente registrato sulle fatture',()=>{
 show({documents:[doc()],incassatoPiano:122.01});
 expect(screen.getByText(/Il piano rate include 0,01/)).toBeInTheDocument();
 expect(screen.getByLabelText('Riepilogo fatture della commessa')).toHaveTextContent('Incassato sulle fatture122,00');
});
