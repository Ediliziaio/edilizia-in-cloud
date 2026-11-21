import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from "npm:stripe@14";
import { catchUpReferralStripe } from "../_shared/referralStripe.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from '../_shared/headers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  // Verifica secret cron
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Calcola mese precedente
  const [year, month] = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' })
    .format(new Date()).split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const periodEnd = new Date(Date.UTC(prevYear, prevMonth, 0)).toISOString().slice(0, 10);

  console.log(`[referral-monthly-cycle] Calcolo ${prevMonth}/${prevYear}`);

  try {
    const body = await req.json().catch(() => ({}));
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe non configurato");
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion });
    await catchUpReferralStripe(stripe, supabase);
    if (body.sync_only === true) return jsonResponse({ success: true, reconciled: true });

    // Step 1: Leggi le commissioni contabilizzate
    const { data: commCount, error: calcErr } = await supabase.rpc(
      'calculate_monthly_commissions',
      { p_month: prevMonth, p_year: prevYear }
    );
    if (calcErr) throw calcErr;
    console.log(`[cycle] ${commCount} movimenti commissione già contabilizzati`);

    // Step 2: Genera payout pending
    const { data: payoutCount, error: payErr } = await supabase.rpc(
      'generate_monthly_payouts',
      { p_month: prevMonth, p_year: prevYear }
    );
    if (payErr) throw payErr;
    console.log(`[cycle] Generati ${payoutCount} payout pending`);

    // Step 3: Notifica ogni referrer con le proprie commissioni
    const { data: payouts } = payoutCount > 0
      ? await supabase.from('referral_payouts').select('*, referrers(id, name, email)')
        .eq('status', 'pending').eq('auto_generated', true).eq('period_end', periodEnd)
      : { data: [] };

    const monthNames = [
      'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
      'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
    ];

    for (const payout of (payouts || [])) {
      const referrerId = (payout as any).referrers?.id || payout.referrer_id;
      await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-partner-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': Deno.env.get('CRON_SECRET')!,
          },
          body: JSON.stringify({
            type: 'commission_calculated',
            referrer_id: referrerId,
            data: {
              month_name:   monthNames[prevMonth - 1],
              year:         prevYear,
              total_amount: (payout as any).amount?.toFixed(2) ?? '0.00',
              payment_date: (payout as any).scheduled_payment_date,
            },
          }),
        }
      ).catch((e) => console.error('[cycle] Email error:', e));
    }

    return jsonResponse({
      success:                 true,
      period:                  `${prevMonth}/${prevYear}`,
      commissions_calculated:  commCount,
      payouts_generated:       payoutCount,
      notifications_sent:      (payouts || []).length,
    });
  } catch (err: any) {
    console.error('[referral-monthly-cycle] ERRORE:', err);
    return errorResponse(err.message || 'Internal error', 500);
  }
});
