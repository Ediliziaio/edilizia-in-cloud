import { expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MarkPaidDialog from '@/components/scadenzario/MarkPaidDialog';
import type { Scadenza } from '@/hooks/useScadenzario';
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
const base: Scadenza = {
 id:'demo', company_id:'demo', tipo:'incasso_cliente', direction:'entrata',description:'Prova incasso',amount:10,paid_amount:0,due_date:'2026-11-05',status:'da_pagare',
 paid_date:null,payment_method:null,invoice_id:null,order_id:null,supplier_id:null,cost_id:null,contact_id:null,order_item_id:null,prima_nota_entry_id:null,
 alert_days_before:0,alert_sent_at:null,is_auto_generated:false,auto_source:null,notes:null,is_recurring:false,created_at:'2026-11-05',updated_at:'2026-11-05',
};
it('UX-82: distingue incasso e pagamento senza registrare movimenti', () => {
 const confirm=vi.fn(); const props={open:true,onOpenChange:vi.fn(),onConfirm:confirm,isPending:false};
 const {rerender}=render(<MarkPaidDialog {...props} scadenza={base}/>);
 expect(screen.getByRole('heading',{name:'Registra incasso'})).toBeInTheDocument();
 expect(screen.getByLabelText('Importo incassato')).toHaveValue(10);
 rerender(<MarkPaidDialog {...props} scadenza={{...base,id:'uscita',direction:'uscita',tipo:'pagamento_fornitore'}}/>);
 expect(screen.getByRole('heading',{name:'Registra pagamento'})).toBeInTheDocument();
 expect(screen.getByLabelText('Importo pagato')).toHaveValue(10);
 expect(confirm).not.toHaveBeenCalled(); cleanup();
});
