import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmissionePos } from "@/hooks/useEmissioniPos";
const s=vi.hoisted(()=>({permesso:true,lettura:false,errore:false,emissioni:[] as EmissionePos[],fonti:[{id:'snapshot-1',revisione:0}],prepara:vi.fn(),scarica:vi.fn()}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewSicurezzaCantiere:s.permesso,isAdmin:false,solaLettura:s.lettura})}));
vi.mock('@/hooks/useEmissioniPos',()=>({useEmissioniPos:()=>({data:s.emissioni,isError:s.errore,isLoading:false,refetch:vi.fn()}),useContenutiPerEmissione:()=>({data:s.fonti,isError:false,isLoading:false,refetch:vi.fn()}),usePreparaEmissione:()=>({mutate:s.prepara,isPending:false}),apriEmissionePos:s.scarica}));
import { EmissioniPos } from '@/components/sicurezza/pos/EmissioniPos';
afterEach(cleanup);
beforeEach(()=>{s.permesso=true;s.lettura=false;s.errore=false;s.emissioni=[];s.fonti=[{id:'snapshot-1',revisione:0}];vi.clearAllMocks();});
const mostra=()=>render(<EmissioniPos companyId="azienda" posId="pos" approvato/>);
function completa():EmissionePos{return {id:'emissione-1',revisione:0,stato:'completa',origine:'approvazione_corrente',emesso_il:'2026-10-27T12:00:00Z',updated_at:'2026-10-27T12:00:01Z',snapshot_id:'snapshot-1',errore:null,manifest:{generatore:'test',avvertenza:'Le firme non sono attestate dalla copia',file:[{ruolo:'allegato',nome:'allegati/001-relazione.pdf',nomeOriginale:'Relazione.pdf',sha256:'a'.repeat(64),dimensione:1024}]}};}
describe('Emissioni POS e copie dei contenuti storici',()=>{
 it('richiede un’azione esplicita e distingue la copia dall’originale storico',()=>{mostra();expect(screen.getByText(/Non ricostruisce i byte dei vecchi PDF/)).toBeTruthy();expect(s.prepara).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Prepara copia'}));expect(s.prepara).toHaveBeenCalledWith('snapshot-1');});
 it('la sola lettura scarica un’emissione già conservata ma non ne prepara altre',async()=>{s.lettura=true;s.emissioni=[completa()];s.fonti.push({id:'snapshot-2',revisione:1});mostra();expect(screen.queryByRole('button',{name:'Prepara copia'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'PDF'}));await waitFor(()=>expect(s.scarica).toHaveBeenCalledWith('azienda','emissione-1','pdf'));});
 it('un errore delle fonti non viene presentato come archivio vuoto',()=>{s.errore=true;mostra();expect(screen.getByRole('alert').textContent).toMatch(/non disponibili/);expect(screen.queryByText(/Nessuna emissione conservata/)).toBeNull();expect(screen.queryByRole('button',{name:'Prepara copia'})).toBeNull();});
 it('non offre il PDF di una preparazione non completata',()=>{s.emissioni=[{...completa(),stato:'preparazione',manifest:null}];mostra();expect(screen.getByText(/Preparazione in corso/)).toBeTruthy();expect(screen.queryByRole('button',{name:'PDF'})).toBeNull();});
 it('mantiene visibile l’errore senza confonderlo con un’approvazione',()=>{s.emissioni=[{...completa(),stato:'errore',manifest:null,errore:'Allegato mancante'}];mostra();expect(screen.getByRole('alert').textContent).toMatch(/Allegato mancante.*non equivale/);expect(screen.queryByRole('button',{name:'Archivio ZIP interno'})).toBeNull();});
 it('esclude chi non ha il permesso sicurezza',()=>{s.permesso=false;mostra();expect(screen.queryByText('Emissioni PDF e allegati')).toBeNull();});
});
