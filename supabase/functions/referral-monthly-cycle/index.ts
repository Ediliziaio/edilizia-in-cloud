import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  console.log(`[referral-monthly-cycle] Calcolo ${prevMonth}/${prevYear}`);

  try {
    // Step 1: Calcola commissioni
    const { data: commCount, error: calcErr } = await supabase.rpc(
      'calculate_monthly_commissions',
      { p_month: prevMonth, p_year: prevYear }
    );
    if (calcErr) throw calcErr;
    console.log(`[cycle] Calcolate ${commCount} voci commissione`);

    // Step 2: Genera payout pending
    const { data: payoutCount, error: payErr } = await supabase.rpc(
      'generate_monthly_payouts',
      { p_month: prevMonth, p_year: prevYear }
    );
    if (payErr) throw payErr;
    console.log(`[cycle] Generati ${payoutCount} payout pending`);

    // Step 3: Notifica ogni referrer con le proprie commissioni
    const { data: payouts } = await supabase
      .from('referral_payouts')
      .select('*, referrers(id, name, email)')
      .eq('status', 'pending')
      .eq('auto_generated', true)
      .filter(
        'period_start',
        'gte',
        new Date(prevYear, prevMonth - 1, 1).toISOString().split('T')[0]
      );

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
