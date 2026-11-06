import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {CustomerActivityTimeline} from '@/components/clients/CustomerActivityTimeline';
afterEach(cleanup);
it('mostra gli appuntamenti usando data e ora dello schema reale',()=>{
 render(<MemoryRouter><CustomerActivityTimeline customerId="demo" orders={[]} tickets={[]} fatture={[]} appuntamenti={[{id:'app',title:'Sopralluogo demo',appointment_date:'2026-12-10',appointment_time:'14:30:00',status:'confermato'}]} /></MemoryRouter>);
 expect(screen.getByText('Sopralluogo demo')).toBeInTheDocument();expect(screen.getByText('14:30')).toBeInTheDocument();
});
it('non inventa un orario quando è disponibile soltanto la data',()=>{
 render(<MemoryRouter><CustomerActivityTimeline customerId="demo" orders={[]} tickets={[]} fatture={[]} appuntamenti={[{id:'app',title:'Visita senza ora',appointment_date:'2026-12-10',appointment_time:null as null,status:null as null}]} /></MemoryRouter>);
 expect(screen.getByText('Visita senza ora')).toBeInTheDocument();expect(screen.queryByText('00:00')).not.toBeInTheDocument();
});
