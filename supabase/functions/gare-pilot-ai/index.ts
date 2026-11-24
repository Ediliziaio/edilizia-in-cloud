import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { precallCheck } from '../_shared/ai-provider/billing.ts';
import { chargeAndLogDirect } from '../_shared/ai-provider/directApi.ts';
import { callOpenRouter } from '../_shared/ai-provider/openrouter.ts';
import { createGareAiHandler, pilotCompanyId } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const secret = Deno.env.get('GARE_AI_BRIDGE_SECRET') ?? '';
const profile = Deno.env.get('GARE_OPENROUTER_PROFILE');
const model = Deno.env.get('GARE_OPENROUTER_MODEL') ?? (profile === 'free' ? 'openrouter/free' : '');
const taskKind = 'gare_appalti';

Deno.serve(async request => {
  if (!url || !anon || !serviceKey || !secret || !Deno.env.get('OPENROUTER_API_KEY') ||
      (profile !== 'free' && profile !== 'credits')) {
    return Response.json({ error: 'AI Gare non configurata.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return createGareAiHandler({
    secret,
    model,
    profile,
    async authorize(jwt) {
      const client = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser(jwt);
      if (error || !data.user || data.user.is_anonymous) return false;
      const pilot = await client.rpc('gare_pilot_role', { cid: pilotCompanyId });
      return !pilot.error && ['admin', 'editor'].includes(pilot.data);
    },
    async credit(estimatedTokens) {
      const result = await precallCheck(service, {
        company_id: pilotCompanyId,
        task_kind: taskKind,
        estimated_tokens_total: estimatedTokens,
      });
      return result.allow;
    },
    complete(params) {
      return callOpenRouter({ ...params, maxRetries: 0 }, { task_kind: taskKind });
    },
    async record(result, requestId) {
      const billing = await chargeAndLogDirect({
        supabase: service,
        company_id: pilotCompanyId,
        task_kind: taskKind,
        model_used: result.model || model,
        cost_usd_real: result.cost_usd,
        cost_is_estimated: result.cost_is_estimated,
        tokens_prompt: result.usage.prompt_tokens,
        tokens_completion: result.usage.completion_tokens,
        idempotency_key: `gare:${requestId}`,
        metadata: { generation_id: result.generation_id ?? null },
      });
      return billing.idempotent_replay || !!billing.usage_log_id &&
        (billing.charged || ['a_debito', 'regalato'].includes(billing.reason));
    },
  })(request);
});
