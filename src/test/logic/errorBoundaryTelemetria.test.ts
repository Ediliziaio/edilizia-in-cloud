import { describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),insert:vi.fn(),from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mocks.session},from:mocks.from}}));
vi.mock('@/lib/velocity/sentry',()=>({captureVelocityError:vi.fn()}));
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
const report=()=> (new ErrorBoundary({children:null}) as unknown as {reportError:(e:Error,info:{componentStack:string})=>Promise<void>}).reportError(Error('sintetico'),{componentStack:'ComponenteDemo'});
describe('telemetria ErrorBoundary non provoca altri 401',()=>{
  it('prima del login nessuna scrittura al database',async()=>{
    vi.clearAllMocks();mocks.session.mockResolvedValue({data:{session:null}});
    await report();expect(mocks.from).not.toHaveBeenCalled();
  });
  it('autenticato salva senza parametri URL né retry se respinto',async()=>{
    vi.clearAllMocks();mocks.session.mockResolvedValue({data:{session:{user:{id:'u'}}}});
    mocks.from.mockReturnValue({insert:mocks.insert});mocks.insert.mockResolvedValue({error:{code:'42501'}});
    await expect(report()).resolves.toBeUndefined();expect(mocks.insert).toHaveBeenCalledTimes(1);
    const payload=mocks.insert.mock.calls[0][0];expect(payload.metadata.url).not.toContain('?');
  });
});
