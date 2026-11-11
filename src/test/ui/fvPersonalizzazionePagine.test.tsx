import {useState} from "react";
import {describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent} from "@testing-library/react";
import FvPersonalizzazionePagine from "../../components/fotovoltaico/FvPersonalizzazionePagine";
import {personalizzaDocumentoFv} from "../../../supabase/functions/_shared/fvPersonalizzazioneCompleta";
vi.mock("@/hooks/useFileRiservati",()=>({useImmaginiModelloFirmate:(x:unknown)=>x}));
const html='<div class="page"><header data-fv-section="flussi"></header><h1>Il tuo tetto produce.</h1><p>Produzione annua 75000 kWh.</p><img src="/standard.png" alt="Casa standard"/></div>',ctx={variabili:{},immaginiDati:[] as string[]},campione=()=>({html,contesto:ctx});
function Editor(){const[b,set]=useState<Record<string,unknown>>({});return <><FvPersonalizzazionePagine form={{pdf_blocchi:b}} renderCampione={campione} onBlocchi={set} campoFoto={(_v,onChange)=><button onClick={()=>onChange('/nuova.png')}>Sostituisci immagine</button>}/><div data-testid="pdf" dangerouslySetInnerHTML={{__html:personalizzaDocumentoFv(html,b,ctx)}}/></>;}
describe("editor di tutti i contenuti del PDF",()=>{
 it("applica un titolo al documento effettivo e può ripristinare quello approvato",()=>{
  render(<Editor/>);const titolo=screen.getByLabelText('Titolo');fireEvent.change(titolo,{target:{value:'La tua nuova energia.'}});fireEvent.blur(titolo);
  expect(screen.getByTestId('pdf')).toHaveTextContent('La tua nuova energia.');fireEvent.click(screen.getByText('Ripristina testo standard'));expect(screen.getByTestId('pdf')).toHaveTextContent('Il tuo tetto produce.');
 });
 it("non applica un testo che cancella il valore calcolato",()=>{
  render(<Editor/>);const testo=screen.getByLabelText('Testo / etichetta');expect(testo).toHaveValue('Produzione annua {valore_1}.');fireEvent.change(testo,{target:{value:'Produzione annua 90000 kWh.'}});fireEvent.blur(testo);
  expect(screen.getByRole('alert')).toHaveTextContent('Mantieni i segnaposto');expect(screen.getByTestId('pdf')).toHaveTextContent('75000 kWh');
 });
 it("sostituisce e ripristina l’immagine senza toccare la produzione",()=>{
  render(<Editor/>);fireEvent.click(screen.getByText('Sostituisci immagine'));expect(screen.getByTestId('pdf').querySelector('img')).toHaveAttribute('src','/nuova.png');expect(screen.getByTestId('pdf')).toHaveTextContent('75000 kWh');fireEvent.click(screen.getByText('Ripristina immagine standard'));expect(screen.getByTestId('pdf').querySelector('img')).toHaveAttribute('src','/standard.png');
 });
});
