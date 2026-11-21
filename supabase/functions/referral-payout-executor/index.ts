import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from "npm:stripe@14";
import { catchUpReferralStripe } from "../_shared/referralStripe.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from '../_shared/headers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return errorResponse('Unauthorized', 401);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe non configurato");
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion });
    await catchUpReferralStripe(stripe, supabase);
  } catch (error) {
    console.error("[referral-payout-executor] Riconciliazione incassi non disponibile", error);
    return errorResponse("Riconciliazione incassi non disponibile", 503);
  }

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
  const { data: duePayouts, error } = await supabase
    .from('referral_payouts')
    .select('id')
    .eq('status', 'approved')
    .lte('scheduled_payment_date', today);
  if (error) return errorResponse(error.message, 500);

  let processed = 0;
  let blocked = 0;
  for (const payout of duePayouts ?? []) {
    const { data: instruction, error: prepareError } = await supabase.rpc('referral_payout_transition', {
      p_payout_id: payout.id,
      p_action: 'prepare',
    });
    if (prepareError) {
      console.warn('[referral-payout-executor] Preparazione sospesa', payout.id, prepareError.message);
      blocked += 1;
    } else if (instruction.created) {
      processed += 1;
    }
  }
  return jsonResponse({ success: true, processed, blocked });
});
