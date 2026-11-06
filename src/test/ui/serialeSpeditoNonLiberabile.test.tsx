import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {AssignSerialsDialog} from '@/components/warehouse/AssignSerialsDialog';
vi.mock('@/hooks/warehouse/useStockUnits',()=>({useStockUnitsByOrderItem:()=>({data:[{id:'u',serial_number:'DEMO-SN',status:'shipped'}],isLoading:false}),useAssignSerialsToOrderItem:()=>({isPending:false}),useUnassignSerial:()=>({isPending:false,mutateAsync:vi.fn()})}));
afterEach(cleanup);
it('non permette di liberare un seriale già spedito',()=>{
 render(<AssignSerialsDialog open onOpenChange={vi.fn()} orderId="o" orderItemId="i" expectedQty={1}/>);
 expect(screen.getByText('DEMO-SN')).toBeInTheDocument();
 expect(screen.getByTitle('Non si possono liberare seriali già consegnati')).toBeDisabled();
});
