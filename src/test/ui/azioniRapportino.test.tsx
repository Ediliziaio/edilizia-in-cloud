import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({canApprove:true,mutate:vi.fn()}));
vi.mock('@/components/orders/CorreggiRapportino',()=>({CorreggiRapportino:()=> <button>Modifica rapportino</button>}));
vi.mock('@/components/orders/DecisioneRapportino',()=>({useDecisioneRapportino:()=>({canApprove:m.canApprove,annullaMutation:{mutate:m.mutate,isPending:false}}),AnnullaRapportinoDialog:({onConferma,onMotivo,motivo,elimina}:{onConferma:(anteprima?:string)=>void;onMotivo:(s:string)=>void;motivo:string;elimina:boolean})=><div role="dialog"><input aria-label="Motivo" value={motivo} onChange={e=>onMotivo(e.target.value)}/><button onClick={()=>onConferma(elimina?undefined:'anteprima-30')}>Conferma rimozione</button></div>}));
import { AzioniRapportino } from '@/components/orders/AzioniRapportino';
const report={id:'r',updated_at:'versione',approvato:false};
beforeEach(()=>{m.canApprove=true;m.mutate.mockReset();});afterEach(cleanup);
it('rende disponibile Elimina anche per un rapportino non approvato o rifiutato',()=>{
 render(<AzioniRapportino report={report} orderId="o"/>);fireEvent.click(screen.getByRole('button',{name:'Elimina rapportino'}));
 expect(m.mutate).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText('Motivo'),{target:{value:'Prova'}});fireEvent.click(screen.getByRole('button',{name:'Conferma rimozione'}));expect(m.mutate).toHaveBeenCalledWith({id:'r',updatedAt:'versione',motivo:'Prova'});
});
it('sugli approvati mostra Annulla e conserva Modifica',()=>{render(<AzioniRapportino report={{...report,approvato:true}} orderId="o"/>);expect(screen.getByRole('button',{name:'Annulla rapportino'})).toBeVisible();expect(screen.getByRole('button',{name:'Modifica rapportino'})).toBeVisible();});
it("trasmette la versione dell'anteprima per la revoca di un approvato", () => {
  render(<AzioniRapportino report={{ ...report, stato: "approvato" }} orderId="o" />);
  fireEvent.click(screen.getByRole("button", { name: "Annulla rapportino" }));
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Correzione" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferma rimozione" }));
  expect(m.mutate).toHaveBeenCalledWith({ id: "r", updatedAt: "versione", motivo: "Correzione", anteprima: "anteprima-30" });
});
it('non offre modifiche senza permessi o su un annullato',()=>{
 m.canApprove=false;const el=render(<AzioniRapportino report={report} orderId="o"/>);expect(screen.queryByRole('button')).toBeNull();m.canApprove=true;el.rerender(<AzioniRapportino report={{...report,annullato_at:'ieri'}} orderId="o"/>);expect(screen.queryByRole('button')).toBeNull();
});
