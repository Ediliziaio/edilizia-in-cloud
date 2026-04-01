import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, errorResponse, jsonResponse } from '../_shared/headers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const today = new Date().toISOString().split('T')[0];
  console.log(`[payout-executor] Esecuzione pagamenti per data <= ${today}`);

  // Trova tutti i payout approvati con scheduled_payment_date <= oggi
  const { data: duePayouts, error } = await supabase
    .from('referral_payouts')
    .select('*, referrers(id, name, email, payout_method, payout_details)')
    .eq('status', 'approved')
    .lte('scheduled_payment_date', today);

  if (error) return errorResponse(error.message, 500);

  if (!duePayouts || duePayouts.length === 0) {
    return jsonResponse({ success: true, message: 'Nessun payout da processare', processed: 0 });
  }

  console.log(`[payout-executor] ${duePayouts.length} payout da processare`);

  // Genera CSV SEPA-ready per batch bancario
  const csvRows = [
    'Nome,IBAN,Importo,Causale,Data',
    ...duePayouts.map((p: any) => {
      const details      = p.referrers?.payout_details || {};
      const iban         = details.iban || 'IBAN_MANCANTE';
      const holder       = details.account_holder || p.referrers?.name || '';
      const causale      = `Commissioni referral ${p.period_start?.slice(0, 7)} - EIC`;
      return `"${holder}","${iban}",${p.amount},"${causale}",${today}`;
    }),
  ].join('\n');

  // Porta tutti a status 'processing'
  const ids = duePayouts.map((p: any) => p.id);
  await supabase
    .from('referral_payouts')
    .update({ status: 'processing' })
    .in('id', ids);

  const adminEmail  = Deno.env.get('ADMIN_EMAIL') || 'admin@ediliziaincloud.it';
  const totalAmount = duePayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  // Notifica ogni partner che il pagamento è in elaborazione
  for (const payout of duePayouts) {
    const referrerId = (payout as any).referrers?.id || payout.referrer_id;
    await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-partner-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': secret,
        },
        body: JSON.stringify({
          type:        'payout_approved',
          referrer_id: referrerId,
          data: {
            amount:    (payout as any).amount?.toFixed(2) ?? '0.00',
            reference: `EIC-${payout.id.slice(0, 8).toUpperCase()}`,
          },
        }),
      }
    ).catch((e) => console.error('[executor] Email partner error:', e));
  }

  return jsonResponse({
    success:      true,
    processed:    duePayouts.length,
    total_amount: totalAmount.toFixed(2),
    sepa_csv:     csvRows,   // L'admin usa questo CSV per il bonifico batch
    payout_ids:   ids,
    admin_email:  adminEmail,
  });
});
