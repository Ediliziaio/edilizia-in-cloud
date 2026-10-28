import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { RuoloCantiereCampo } from '@/components/campo/RuoloCantiereCampo';
import { leggiRuoloOperativoCampo } from '@/lib/campo/ruoloOperativo';
afterEach(cleanup);
const base={orderId:'commessa-1',subappaltatore:false,caricamento:false,errore:false,onRiprova:vi.fn(),onRapportini:vi.fn(),ruolo:{isCapocantiere:false,isCaposquadra:false,esisteCapo:true}};
describe('Ruolo operativo nella commessa Campo',()=>{
  it.each([null,undefined,{},[],{capocantiere:true},{capocantiere:false,esiste_capo:'false'}])('non interpreta un ruolo assente/incompleto come nessun capo (%j)',valore=>{
    expect(()=>leggiRuoloOperativoCampo(valore)).toThrow();
  });
  it('conserva i flag distinti di capo cantiere e capo squadra',()=>{
    expect(leggiRuoloOperativoCampo({capocantiere:false,esiste_capo:true,caposquadra:true})).toEqual({capocantiere:false,esiste_capo:true,caposquadra:true});
  });
  it('operaio: fasi contestuali e propri rapportini senza il comando di squadra',()=>{
    render(<MemoryRouter><RuoloCantiereCampo {...base}/></MemoryRouter>);
    expect(screen.getByRole('heading',{name:'Operaio'})).toBeTruthy();
    expect(screen.getByRole('link',{name:'Fasi di questo cantiere'})).toHaveAttribute('href','/campo/avanzamento?order_id=commessa-1');
    expect(screen.queryByRole('link',{name:'Presenze e squadra del cantiere'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'I miei rapportini'}));expect(base.onRapportini).toHaveBeenCalled();
  });
  it.each(['isCapocantiere','isCaposquadra'] as const)('il coordinatore %s trova la propria squadra',chi=>{
    render(<MemoryRouter><RuoloCantiereCampo {...base} ruolo={{...base.ruolo,[chi]:true}}/></MemoryRouter>);
    expect(screen.getByRole('link',{name:'Presenze e squadra del cantiere'})).toHaveAttribute('href','/campo/squadra/commessa-1');
    expect(screen.getByText(/non sostituisce nomine/)).toBeTruthy();
  });
  it('il subappaltatore vede il flusso operativo, senza introdurre importi o pagamenti',()=>{
    render(<MemoryRouter><RuoloCantiereCampo {...base} subappaltatore/></MemoryRouter>);
    expect(screen.getByRole('heading',{name:'Impresa subappaltatrice'})).toBeTruthy();
    expect(screen.getByText(/Le quantità economiche e i SAL vengono verificati nel gestionale/)).toBeTruthy();
  });
  it('un errore di ruolo propone un nuovo tentativo e non azioni di coordinamento',()=>{
    render(<MemoryRouter><RuoloCantiereCampo {...base} errore/></MemoryRouter>);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Rileggi il ruolo'}));expect(base.onRiprova).toHaveBeenCalled();
  });
});
