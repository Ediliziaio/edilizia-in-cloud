import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CostsOverviewTab from '@/components/costi/CostsOverviewTab';
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'azienda'}})}));
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false}));
vi.mock('@/hooks/useCompanyCostsData',()=>({useCompanyCostsData:()=>({isLoading:false,allCostsUnfiltered:[{id:'senza-data',name:'Costo demo',amount:100,cost_type:'variable',category:'Fornitori',due_date:null as null,is_paid:false,isFromOrder:false}]})}));
afterEach(cleanup);
function Posizione(){const loc=useLocation();return <output aria-label="Destinazione">{loc.search}</output>;}
it('il collegamento senza scadenza apre direttamente le variabili con filtro, senza dipendere dal tab legacy',()=>{
 render(<MemoryRouter initialEntries={['/azienda/costi?tab=panoramica']}><CostsOverviewTab month={new Date(2026,10,1)} onMonthChange={()=>{}}/><Posizione/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:/1 costi senza scadenza/}));
 const params=new URLSearchParams(screen.getByLabelText('Destinazione').textContent!);
 expect(params.get('tab')).toBe('spese-variabili');
 expect(params.get('preset')).toBe('unscheduled');
});
