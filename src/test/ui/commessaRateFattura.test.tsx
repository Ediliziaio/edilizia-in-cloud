import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CommessaRateFattura } from '@/components/fatturazione/CommessaRateFattura';
import type { RataDellaFattura } from '@/hooks/useRataDellaFattura';
afterEach(cleanup);
it('una fattura extra senza rata torna alla tab esistente della commessa',()=>{
 render(<MemoryRouter><CommessaRateFattura ordineId="o1" rate={[]} onRetry={()=>{}}/></MemoryRouter>);
 expect(screen.getByRole('link',{name:'Apri Fatture e Incassi della commessa'})).toHaveAttribute('href','/azienda/ordini/o1?tab=finanza&vista_economia=pagamenti');
 expect(screen.getByText(/Fattura senza rata collegata/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Crea/})).toBeNull();
});
it('mostra tutte le quote della stessa fattura e un solo collegamento alla commessa',()=>{
 const rate:RataDellaFattura[]=[300,400,300].map((amount,i):RataDellaFattura=>({id:`r${i}`,position:i,label:['Acconto','SAL','Saldo'][i],type:'deposit',amount,is_paid:i<2,paid_date:null,documento_quota_lorda:amount,quota_fattura_residua:i<2?0:100,fattura:{id:'f1',numero:'FT-1',stato:'parzialmente_pagata',importo_pagato:i<2?amount:200},commessa:{id:'o1',order_code:'ORD-1',description:null}}));
 render(<MemoryRouter><CommessaRateFattura ordineId="o1" rate={rate} onRetry={()=>{}}/></MemoryRouter>);
 expect(screen.getAllByRole('link',{name:'ORD-1'})).toHaveLength(1);
 expect(screen.getAllByRole('listitem')).toHaveLength(3);
 expect(screen.getByText(/incassato 200,00.*residuo 100,00/)).toBeInTheDocument();
});
it('un errore di lettura non diventa una falsa assenza di rate',()=>{
 const retry=vi.fn();render(<MemoryRouter><CommessaRateFattura ordineId="o1" rate={[]} error onRetry={retry}/></MemoryRouter>);
 expect(screen.getByRole('alert')).toHaveTextContent('non disponibili');
 expect(screen.queryByText(/Fattura senza rata collegata/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Riprova rate'}));expect(retry).toHaveBeenCalledOnce();
});
