import {afterEach,describe,it,expect,vi} from 'vitest';
import {consentiPreventivoConversazionale,quoteChatReleaseFlag} from '@/lib/preventivi/quoteRollout';
import {consentiSimulazionePreventivoAi} from '@/lib/preventivi/localSimulation';
afterEach(()=>vi.unstubAllEnvs());
describe('Released native chat is separate from the private laboratory',()=>{
  it('enables valid tenant wizards without unlocking the laboratory',()=>{
    const company='b2000000-0000-4000-a000-000000000002';
    expect(consentiPreventivoConversazionale(company)).toBe(true);expect(quoteChatReleaseFlag()).toBe('true');
    expect(consentiSimulazionePreventivoAi(false,'app.example',company)).toBe(false);
    expect(consentiSimulazionePreventivoAi(true,'localhost',company)).toBe(false);
  });
  it('retains an explicit client rollback and rejects missing company scope',()=>{
    vi.stubEnv('VITE_QUOTE_CHAT_ENABLED','false');expect(consentiPreventivoConversazionale('b2000000-0000-4000-a000-000000000002')).toBe(false);
    expect(quoteChatReleaseFlag()).toBe('false');expect(consentiPreventivoConversazionale(null)).toBe(false);expect(consentiPreventivoConversazionale('garbage')).toBe(false);
  });
});
