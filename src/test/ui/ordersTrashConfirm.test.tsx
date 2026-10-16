import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OrderTrashConfirmDialog} from '@/components/orders/OrderTrashConfirmDialog';
afterEach(cleanup);
it('un rifiuto del server resta leggibile nella conferma, senza chiudere il dialog',async()=>{
 const close=vi.fn();const confirm=vi.fn().mockRejectedValue(new Error('Commessa con rapportini registrati: mantienila nello storico.'));
 render(<OrderTrashConfirmDialog open onOpenChange={close} label="C-1" onConfirm={confirm}/>);
 fireEvent.click(screen.getByRole('button',{name:'Sposta nel cestino'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('rapportini registrati');
 expect(screen.getByRole('alertdialog')).toBeInTheDocument();expect(close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Annulla'}));expect(close).toHaveBeenCalledWith(false);
});
it('durante il salvataggio impedisce doppie richieste e chiude soltanto al successo',async()=>{
 let finish!:()=>void;const confirm=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));const close=vi.fn();
 render(<OrderTrashConfirmDialog open onOpenChange={close} label="C-2" onConfirm={confirm}/>);
 fireEvent.click(screen.getByRole('button',{name:'Sposta nel cestino'}));
 expect(screen.getByRole('button',{name:'Spostamento…'})).toBeDisabled();expect(screen.getByRole('button',{name:'Annulla'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Spostamento…'}));expect(confirm).toHaveBeenCalledTimes(1);
 finish();await waitFor(()=>expect(close).toHaveBeenCalledWith(false));
});
