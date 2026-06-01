import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, errorResponse, jsonResponse } from '../_shared/headers.ts';
import { requireAuth, requireRole } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  // Autorizzazione: server-to-server via cron secret, OPPURE super_admin autenticato.
  // In precedenza bastava un header "Bearer" qualsiasi: qualunque utente loggato
  // poteva interrogare i dati frode di referrer/aziende arbitrari (enumerazione).
  const secret    = Deno.env.get('CRON_SECRET');
  const reqSecret = req.headers.get('x-cron-secret');
  const isCron    = !!secret && reqSecret === secret;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (!isCron) {
    try {
      const { userId, supabaseAdmin } = await requireAuth(req, cors);
      await requireRole(supabaseAdmin, userId, ['super_admin'], cors);
    } catch (resp) {
      if (resp instanceof Response) return resp;
      return errorResponse('Unauthorized', 401);
    }
  }

  let payload: { referrer_id?: string; company_id?: string; ip_address?: string | null };
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { referrer_id, company_id, ip_address } = payload;

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
