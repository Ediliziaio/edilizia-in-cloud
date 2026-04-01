import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, errorResponse, jsonResponse } from '../_shared/headers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  // Accettabile anche con JWT utente autenticato (per chiamate client-side)
  const secret    = Deno.env.get('CRON_SECRET');
  const reqSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('Authorization');

  const isAuthorized =
    (secret && reqSecret === secret) ||
    authHeader?.startsWith('Bearer ');

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { referrer_id, company_id, ip_address } = await req.json();

  if (!referrer_id || !company_id) {
    return errorResponse('referrer_id e company_id sono obbligatori', 400);
  }

  const { data, error } = await supabase.rpc('check_referral_fraud', {
    p_referrer_id: referrer_id,
    p_company_id:  company_id,
    p_ip_address:  ip_address || null,
  });

  if (error) return errorResponse(error.message, 500);

  return jsonResponse(data);
});
