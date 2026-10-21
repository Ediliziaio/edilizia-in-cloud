import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { RatingResult } from '@/hooks/controlloGestione/useStatoPatrimoniale';
import { TabRatingBancario } from '@/components/controllo-gestione/tabs/TabRatingBancario';
const state=vi.hoisted(()=>({data:{anno:2026,classe:'AAA',livello:'molto_basso',score:100,attendibile:false,motivi:['Stato patrimoniale non riconciliato'],indicatori:[]} as RatingResult}));
vi.mock('@/hooks/controlloGestione/useStatoPatrimoniale',()=>({useRating:()=>({data:state.data,isLoading:false,isError:false,refetch:vi.fn()})}));
vi.mock('@/components/controllo-gestione/ui/RatingGauge',()=>({RatingGauge:()=> <div>Rating validato</div>}));
afterEach(cleanup);
describe('Rating e affidabilità dei dati',()=>{
 it('uno score AAA non diventa validato con patrimonio sbilanciato',()=>{
  state.data.attendibile=false;render(<MemoryRouter><TabRatingBancario anno={2026}/></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('provvisoria');expect(screen.getByText('Stato patrimoniale non riconciliato')).toBeInTheDocument();expect(screen.queryByText('Rating validato')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Apri controlli e riconciliazione'})).toHaveAttribute('href','/azienda/controllo-gestione/health');
 });
 it('la valutazione valida rimane consultabile',()=>{state.data.attendibile=true;render(<MemoryRouter><TabRatingBancario anno={2026}/></MemoryRouter>);expect(screen.getByText('Rating validato')).toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();});
 it('un risultato vecchio senza qualità esplicita non viene certificato',()=>{delete state.data.attendibile;render(<MemoryRouter><TabRatingBancario anno={2026}/></MemoryRouter>);expect(screen.getByRole('alert')).toHaveTextContent('Non validato');});
});
describe('Rating: testi per il titolare',()=>{
 it('nomi italiani, numeri con la virgola e importi dei motivi formattati',()=>{
  state.data={anno:2026,classe:'AAA',livello:'molto_basso',score:95,attendibile:false,
   motivi:['Stato patrimoniale non riconciliato: differenza 1346331.55 €'],
   indicatori:[
    {codice:'liquidita',label:'Attivo Circ. / Passivo Circ.',valore:3.9447,punteggio:25,soglia_top:1.8},
    {codice:'indipendenza',label:'Mezzi Propri / Tot. Passivo',valore:0.3892,punteggio:20,soglia_top:0.4},
    {codice:'oneri_finanziari',label:'OF / Fatturato',valore:0.0005,punteggio:25,soglia_top:0.015},
   ]} as RatingResult;
  render(<MemoryRouter><TabRatingBancario anno={2026}/></MemoryRouter>);
  expect(screen.getByText('Liquidità')).toBeInTheDocument();
  expect(screen.getByText('Indipendenza finanziaria')).toBeInTheDocument();
  expect(screen.getByText('Peso degli oneri finanziari')).toBeInTheDocument();
  expect(screen.queryByText('oneri_finanziari')).not.toBeInTheDocument();
  expect(screen.getByText('3,94')).toBeInTheDocument();
  expect(screen.getByText('38,9%')).toBeInTheDocument();
  expect(screen.getByText(/1\.346\.331,55 €/)).toBeInTheDocument();
  expect(screen.getByText('Punteggio pieno: fino a 1,5%')).toBeInTheDocument();
 });
});
