/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { erroreImpersonazione } from '@/lib/auth/erroreImpersonazione';
const read = (file:string) => readFileSync(file,'utf8');
describe('Accesso aziendale: errori espliciti e nessun rimbalzo',()=>{
  it('il 429 indica attesa breve senza stampare il payload del server',async()=>{
    const error={context:new Response(JSON.stringify({retry_after_seconds:3,error:'segreto-da-non-mostrare'}),{status:429})};
    expect(await erroreImpersonazione(error)).toContain('3 secondi');
    expect(await erroreImpersonazione(error)).not.toContain('segreto');
  });
  it('429 vuoto o malformato conserva un messaggio utile',async()=>{
    expect(await erroreImpersonazione({context:new Response('non-json',{status:429})})).toContain('10 secondi');
  });
  it('distingue sessione scaduta, permesso e rete',async()=>{
    expect(await erroreImpersonazione({context:new Response(null,{status:401})})).toContain('Sessione');
    expect(await erroreImpersonazione({context:new Response(null,{status:403})})).toContain('Non sei autorizzato');
    expect(await erroreImpersonazione(new Error('rete'))).toContain('resti in questa pagina');
  });
  for(const file of ['src/components/layouts/AdminLayout.tsx','src/components/admin/CompanyQuickEnterPopover.tsx','src/pages/admin/CompaniesList.tsx','src/pages/admin/CompanyDetail.tsx']) {
    it(`${file}: un token assente non naviga`,()=>{
      const code=read(file);
      expect(code).toContain('if (!impToken) return;');
      expect(code).not.toContain('navigateToSubdomain(');
      expect(code.indexOf('if (!impToken) return;')).toBeLessThan(code.indexOf('_it: impToken'));
    });
  }
  it('la protezione atomica viene dopo autenticazione, ruolo e allowlist',()=>{
    const code=read('supabase/functions/secure-impersonation/index.ts');
    expect(code.indexOf('impersonation_start_burst')).toBeGreaterThan(code.indexOf('isSuperAdminEmailAllowed(user.email)'));
    expect(code).not.toContain('oneHourAgo');
    expect(code).toContain('status: 503');
    expect(code).toContain('"Retry-After": String(retryAfter)');
    expect(code).toContain('action: "impersonation_start"');
    const sql=read('supabase/migrations/20261016144414_impersonazione_antiraffica.sql');
    expect(sql).toContain('pg_try_advisory_xact_lock');
    expect(sql).toContain("interval '10 seconds'");
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('SECURITY INVOKER');
  });
});
