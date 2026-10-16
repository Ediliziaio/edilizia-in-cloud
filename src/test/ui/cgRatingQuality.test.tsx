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
