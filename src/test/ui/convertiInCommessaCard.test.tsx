import type { AnteprimaConversioneModulo, ContrattoModulo } from "@/lib/moduli/convertiInCommessa";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const stato=vi.hoisted(()=>({preview:vi.fn(),rst:vi.fn(),fv:vi.fn(),modulo:vi.fn(),contratto:vi.fn(),navigate:vi.fn()}));
vi.mock('@/lib/moduli/convertiInCommessa',async(orig)=>({...(await orig<typeof import('@/lib/moduli/convertiInCommessa')>()),
  anteprimaConversioneModulo:stato.preview,convertiRstInCommessa:stato.rst,convertiFvInCommessa:stato.fv,convertiModuloInCommessa:stato.modulo,leggiContrattoModulo:stato.contratto}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'u1'}})}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=>'c1'}));
vi.mock('react-router-dom',()=>({useNavigate:()=>stato.navigate}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}}));
vi.mock('@/components/marketing/preventivi/FirmatoSuCarta',()=>({
  FirmatoSuCartaDialog:({modulo,quote}:{modulo:string;quote:{id:string}})=><div role="dialog">Firma su carta {modulo} {quote.id}</div>,
  ContrattoFirmatoCard:()=><p>Contratto firmato</p>,
}));
import { ConvertiInCommessaCard } from '@/components/moduli/ConvertiInCommessaCard';
const preview: AnteprimaConversioneModulo={materiali:[],fasi:[{name:'Posa pavimento',notes:'85.5 mq'}],imponibile:1000,aliquota:22,totale:1220,impronta:'v1',esclusi:1,descrizione:'Casa',rate:[{label:'Acconto alla firma',type:'deposit',amount:366,trigger_evento:'firma_contratto'}]};
const firmato: ContrattoModulo={firmato:true,modo:'digitale',quote_id:'q1',quote_status:'accettata',signed_at:'2026-10-30',signed_by_name:'Mario Rossi',contratto_firmato:null,ordine_id:null,famiglia:null};
const wrap=(ui:ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);
beforeEach(()=>{vi.clearAllMocks();stato.preview.mockResolvedValue(preview);stato.contratto.mockResolvedValue(firmato);
  for (const f of [stato.rst,stato.fv,stato.modulo]) f.mockResolvedValue({orderId:'o1',righe:0,lavorazioni:1});});
afterEach(cleanup);
const pronto=async()=>{await waitFor(()=>expect(screen.getByRole('button',{name:/Controlla e crea/})).toBeEnabled());};
const apri=async()=>{await pronto();fireEvent.click(screen.getByRole('button',{name:/Controlla e crea/}));await screen.findByRole('dialog');};
describe('riepilogo prima della conversione',()=>{
 it('non converte al primo clic, mostra fasi, rate e assenza di acquisti',async()=>{wrap(<ConvertiInCommessaCard modulo="rst" progettoId="p1" capitoli={3}/>);await apri();expect(stato.rst).not.toHaveBeenCalled();expect(screen.getByText('Posa pavimento')).toBeInTheDocument();expect(screen.getByText(/Nessun materiale da ordinare/)).toBeInTheDocument();expect(screen.getByText(/Contratto invariato/)).toHaveTextContent('1.220,00');expect(screen.getByText(/quantità nulla o negativa/)).toBeInTheDocument();expect(screen.getByText('Acconto alla firma')).toBeInTheDocument();});
 it('conferma conserva opzione capitoli e versione mostrata',async()=>{wrap(<ConvertiInCommessaCard modulo="rst" progettoId="p1" capitoli={3}/>);await apri();fireEvent.click(screen.getByRole('button',{name:'Conferma e crea commessa'}));await waitFor(()=>expect(stato.rst).toHaveBeenCalledWith('p1','u1',{fasiDaCapitoli:true,impronta:'v1'}));});
 it('senza raggruppamento le singole lavorazioni restano fasi',async()=>{wrap(<ConvertiInCommessaCard modulo="rst" progettoId="p1" capitoli={3}/>);await pronto();fireEvent.click(screen.getByRole('checkbox'));await apri();expect(stato.preview).toHaveBeenCalledWith('rst','p1',false);});
 it('fotovoltaico conferma la versione senza raggruppamento capitoli',async()=>{wrap(<ConvertiInCommessaCard modulo="fv" progettoId="p1"/>);await apri();fireEvent.click(screen.getByRole('button',{name:'Conferma e crea commessa'}));await waitFor(()=>expect(stato.fv).toHaveBeenCalledWith('p1','u1','v1'));});
 it('un edile passa dallo stesso motore, coi capitoli',async()=>{wrap(<ConvertiInCommessaCard modulo="bagni" progettoId="p1" capitoli={2}/>);await apri();fireEvent.click(screen.getByRole('button',{name:'Conferma e crea commessa'}));await waitFor(()=>expect(stato.modulo).toHaveBeenCalledWith('bagni','p1','u1',{fasiDaCapitoli:true,impronta:'v1'}));});
 it('preventivo cambiato richiede aggiornamento del riepilogo e non naviga',async()=>{stato.rst.mockRejectedValue(new Error('Il preventivo è cambiato'));wrap(<ConvertiInCommessaCard modulo="rst" progettoId="p1"/>);await apri();fireEvent.click(screen.getByRole('button',{name:'Conferma e crea commessa'}));await screen.findByRole('alert');expect(stato.navigate).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Aggiorna riepilogo'})).toBeInTheDocument();});
 it('annullamento non crea commesse',async()=>{wrap(<ConvertiInCommessaCard modulo="rst" progettoId="p1"/>);await apri();fireEvent.click(screen.getByRole('button',{name:'Torna al preventivo'}));expect(stato.rst).not.toHaveBeenCalled();});
 it('blocco iniziale impedisce anche anteprima',async()=>{wrap(<ConvertiInCommessaCard modulo="rst" progettoId="p1" bloccoMotivo="Completa i dati"/>);await screen.findByText('Contratto firmato');expect(screen.getByRole('button',{name:/Controlla e crea/})).toBeDisabled();});
});
describe('il preventivo firmato è il contratto',()=>{
 it('senza firma niente commessa: si offre «Firmato su carta»',async()=>{stato.contratto.mockResolvedValue({...firmato,firmato:false,modo:null});wrap(<ConvertiInCommessaCard modulo="sr" progettoId="p9" codice="SF-1"/>);
  await screen.findByText(/Serve il preventivo firmato/);expect(screen.getByRole('button',{name:/Controlla e crea/})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:/Firmato su carta/}));expect(await screen.findByRole('dialog')).toHaveTextContent('Firma su carta sr p9');expect(stato.preview).not.toHaveBeenCalled();});
 it('una copia di un preventivo già commessa è una variante',async()=>{stato.contratto.mockResolvedValue({...firmato,famiglia:{order_id:'o7',order_code:'C-7',preventivo:'RST-2'}});wrap(<ConvertiInCommessaCard modulo="rst" progettoId="p2"/>);
  await screen.findByText(/RST-2 è già la commessa C-7/);expect(screen.getByRole('button',{name:/Controlla e crea/})).toBeDisabled();expect(screen.queryByRole('button',{name:/Firmato su carta/})).toBeNull();});
 it('la commessa già nata dal contratto si apre, non si rifà',async()=>{stato.contratto.mockResolvedValue({...firmato,ordine_id:'o3'});wrap(<ConvertiInCommessaCard modulo="pav" progettoId="p3"/>);
  fireEvent.click(await screen.findByRole('button',{name:/Apri/}));expect(stato.navigate).toHaveBeenCalledWith('/azienda/ordini/o3');});
});
