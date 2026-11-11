import {describe,it,expect,vi} from 'vitest';
import {globalWebhookTarget,deliverGlobalWebhook} from '../../../supabase/functions/_shared/globalWebhookDelivery';
const dns=async(_h:string,t:string)=>t==='A'?['8.8.8.8']:[];
describe('Global webhook delivery boundary',()=>{
 it.each(['https://127.0.0.1/x','https://10.1.2.3/x','https://169.254.169.254/x','https://172.20.1.2/x','https://192.168.1.2/x','https://100.64.1.2/x','https://[::1]/x','https://metadata.google.internal/x','https://example.local/x','http://example.com/x','https://u:p@example.com/x'])('rejects unsafe destination %s',async url=>{await expect(globalWebhookTarget(url,dns)).rejects.toThrow()});
 it('rejects DNS names resolving to a private address even among public records',async()=>{await expect(globalWebhookTarget('https://example.com',async(_h,t)=>t==='A'?['8.8.8.8','192.168.1.2']:[])).rejects.toThrow(/DNS/)});
 it('accepts public IPv6 DNS and denies mapped or link-local IPv6',async()=>{await expect(globalWebhookTarget('https://example.com',async()=>['2606:4700:4700::1111'])).resolves.toBeInstanceOf(URL);for(const ip of ['::ffff:127.0.0.1','fe80::1','fc00::1'])await expect(globalWebhookTarget('https://example.com',async()=>[ip])).rejects.toThrow()});
 it('enforces configured exact IP and IPv4 CIDR lists',async()=>{await expect(globalWebhookTarget('https://example.com',dns,['8.8.8.0/24'])).resolves.toBeInstanceOf(URL);await expect(globalWebhookTarget('https://example.com',dns,['1.1.1.1'])).rejects.toThrow(/consentiti/)});
 it('uses a stable event envelope and HMAC across retries, refuses redirects and never stores an echoed response',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>new Response('secret=receiver-echo',{status:200}));const delivery={id:'receipt',event_id:'logical-event',occurred_at:'2026-11-11T12:00:00Z',event_type:'contact.created',payload:{id:'contact'},url:'https://example.com',secret:'test-signing-secret'};
  const first=await deliverGlobalWebhook(delivery,fetcher,dns),second=await deliverGlobalWebhook(delivery,fetcher,dns);expect(first.status).toBe('success');expect(second.status).toBe('success');
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',headers:{'X-Webhook-ID':'logical-event'}});
  const h=fetcher.mock.calls[0][1].headers;const {createHmac}=await import('node:crypto');expect(h['X-Webhook-Signature']).toBe('sha256='+createHmac('sha256','test-signing-secret').update(fetcher.mock.calls[0][1].body).digest('hex'));expect(h['X-Webhook-Signature-V2']).toBe('sha256='+createHmac('sha256','test-signing-secret').update(h['X-Webhook-Timestamp']+'.'+fetcher.mock.calls[0][1].body).digest('hex'));expect(first.response_body).toBe('HTTP 200');
 });
 it('fails closed without DNS and does not make an HTTP request',async()=>{const f=vi.fn();expect((await deliverGlobalWebhook({id:'x',event_type:'test.ping',payload:{},url:'https://example.com'},f,async()=>[])).status).toBe('failed');expect(f).not.toHaveBeenCalled()});
});
