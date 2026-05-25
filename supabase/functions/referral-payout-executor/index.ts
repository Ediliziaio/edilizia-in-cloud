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

  const isPayoutCompliant = (payout: any) => {
    const details = payout.referrers?.payout_details || {};
    const method = payout.referrers?.payout_method || payout.payment_method || 'bank_transfer';
    const bankVerified = method !== 'bank_transfer' || details.bank_verification?.status === 'verified';
    const contractApproved = payout.referrers?.has_accepted_terms === true && details.contract?.status === 'approved';
    return bankVerified && contractApproved;
  };

  const complianceReason = (payout: any) => {
    const details = payout.referrers?.payout_details || {};
    const method = payout.referrers?.payout_method || payout.payment_method || 'bank_transfer';
    const reasons: string[] = [];
    if (method === 'bank_transfer' && details.bank_verification?.status !== 'verified') {
      reasons.push('conto corrente non verificato');
    }
    if (payout.referrers?.has_accepted_terms !== true || details.contract?.status !== 'approved') {
      reasons.push('contratto partner non approvato');
    }
    return reasons.join(' · ');
  };

  const today = new Date().toISOString().split('T')[0];
  console.log(`[payout-executor] Esecuzione pagamenti per data <= ${today}`);

  // Trova tutti i payout approvati con scheduled_payment_date <= oggi
  const { data: duePayouts, error } = await supabase
    .from('referral_payouts')
    .select('*, referrers(id, name, email, payout_method, payout_details, has_accepted_terms)')
    .eq('status', 'approved')
    .lte('scheduled_payment_date', today);

  if (error) return errorResponse(error.message, 500);

  if (!duePayouts || duePayouts.length === 0) {
    return jsonResponse({ success: true, message: 'Nessun payout da processare', processed: 0 });
  }

  const blockedPayouts = duePayouts.filter((p: any) => !isPayoutCompliant(p));
  const payablePayouts = duePayouts.filter((p: any) => isPayoutCompliant(p));

  for (const payout of blockedPayouts) {
    await supabase
      .from('referral_payouts')
      .update({
        status: 'pending',
        rejection_reason: `Bloccato dal controllo compliance: ${complianceReason(payout)}`,
      })
      .eq('id', payout.id);
  }

  if (payablePayouts.length === 0) {
    return jsonResponse({
      success: true,
      message: 'Nessun payout conforme da processare',
      processed: 0,
      blocked: blockedPayouts.length,
    });
  }

  console.log(`[payout-executor] ${payablePayouts.length} payout conformi da processare, ${blockedPayouts.length} bloccati`);

  // Genera CSV SEPA-ready per batch bancario
  const csvRows = [
    'Nome,IBAN,Importo,Causale,Data',
    ...payablePayouts.map((p: any) => {
      const details      = p.referrers?.payout_details || {};
      const iban         = details.iban || 'IBAN_MANCANTE';
      const holder       = details.account_holder || p.referrers?.name || '';
      const causale      = `Commissioni referral ${p.period_start?.slice(0, 7)} - EIC`;
      return `"${holder}","${iban}",${p.amount},"${causale}",${today}`;
    }),
  ].join('\n');

  // Porta tutti a status 'processing'
  const ids = payablePayouts.map((p: any) => p.id);
  await supabase
    .from('referral_payouts')
    .update({ status: 'processing' })
    .in('id', ids);

  const adminEmail  = Deno.env.get('ADMIN_EMAIL') || 'admin@ediliziaincloud.it';
  const totalAmount = payablePayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  // Notifica ogni partner che il pagamento è in elaborazione
  for (const payout of payablePayouts) {
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
    blocked:      blockedPayouts.length,
    admin_email:  adminEmail,
  });
});
