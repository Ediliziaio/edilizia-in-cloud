import { describe, expect, it } from 'vitest';
import { verificaVersionePos } from '../../../supabase/functions/_shared/posVersione';
const token='2026-10-27T00:00:00.123456+00:00';
describe('La versione approvata è quella letta nell’editor',()=>{
 it('accetta solo il token esatto, conservando i microsecondi',()=>{expect(()=>verificaVersionePos({updated_at:token},{versione_client:2,attesa_updated_at:token})).not.toThrow();expect(()=>verificaVersionePos({updated_at:token},{versione_client:2,attesa_updated_at:token.replace('123456','123999')})).toThrow(/è cambiato/);});
 it('il nuovo client senza versione non può approvare',()=>{for(const body of [{versione_client:2},{versione_client:2,attesa_updated_at:9},{versione_client:2,attesa_updated_at:undefined}]){try{verificaVersionePos({updated_at:token},body);expect.fail('Doveva essere respinto');}catch(e){expect((e as Error&{status:number}).status).toBe(409);}}});
 it('i record precedenti con timestamp nullo richiedono comunque una scelta esplicita',()=>{expect(()=>verificaVersionePos({updated_at:null},{versione_client:2,attesa_updated_at:null})).not.toThrow();expect(()=>verificaVersionePos({updated_at:token},{versione_client:2,attesa_updated_at:null})).toThrow(/è cambiato/);});
 it('non ignora un token vecchio nemmeno quando arriva dal percorso precedente',()=>{expect(()=>verificaVersionePos({updated_at:token},{attesa_updated_at:'prima'})).toThrow(/è cambiato/);expect(()=>verificaVersionePos({updated_at:token},{})).not.toThrow();});
});
