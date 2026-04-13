import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function ReferralLanding() {
  const { code }     = useParams<{ code: string }>();
  const navigate     = useNavigate();
  const [referrer, setReferrer] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [invalid, setInvalid]   = useState(false);

  useEffect(() => {
    if (!code) return;
    (async () => {
      // Track click
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-referral-click`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referral_code: code,
            landing_page:  window.location.href,
            utm_source:    new URLSearchParams(window.location.search).get('utm_source'),
          }),
        }
      ).catch(() => {});

      const { data } = await supabase
        .from('referrers')
        .select('name, partner_type, referral_tiers(name, icon)')
        .eq('referral_code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (!data) setInvalid(true);
      else setReferrer(data);
      setLoading(false);
    })();
  }, [code]);

  const handleCta = () => {
    // Salva il codice referral in localStorage per la registrazione
    if (code) { try { localStorage.setItem('ref_code', code); } catch { /* Safari Private Browsing */ } }
    navigate('/register');
  };

  if (loading) return (
    <div className='min-h-screen flex items-center justify-center'>
      <Loader2 className='h-8 w-8 animate-spin text-primary' />
    </div>
  );

  if (invalid) return (
    <div className='min-h-screen flex items-center justify-center'>
      <div className='text-center space-y-4'>
        <h1 className='text-2xl font-bold'>Link non valido</h1>
        <p className='text-muted-foreground'>Questo link referral non esiste o non è più attivo.</p>
        <Button onClick={() => navigate('/')}>Vai alla home</Button>
      </div>
    </div>
  );

  return (
    <div className='min-h-screen bg-gradient-to-b from-primary/5 to-background'>
      <div className='max-w-2xl mx-auto px-6 py-16 space-y-12'>

        {/* Header */}
        <div className='text-center space-y-4'>
          <Badge variant='secondary' className='text-sm'>
            Invito di {referrer.name}
            {referrer.referral_tiers && ` · ${referrer.referral_tiers.icon} ${referrer.referral_tiers.name}`}
          </Badge>
          <h1 className='text-4xl font-bold tracking-tight'>
            {referrer.name} ti invita a provare{' '}
            <span className='text-primary'>Edilizia in Cloud</span>
          </h1>
          <p className='text-xl text-muted-foreground'>
            Il gestionale che semplifica il lavoro di imprese edili.
            Preventivi, cantieri, fatturazione, tutto in un posto.
          </p>
        </div>

        {/* Benefits */}
        <div className='space-y-3'>
          {[
            'Prova gratuita di 31 giorni, cancella quando vuoi',
            'Setup in meno di 10 minuti',
            'Assistenza in italiano inclusa',
            'Disdetta in qualsiasi momento',
          ].map((b) => (
            <div key={b} className='flex items-center gap-3'>
              <CheckCircle className='h-5 w-5 text-green-600 shrink-0' />
              <span className='text-base'>{b}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className='text-center space-y-3'>
          <Button size='lg' className='w-full text-lg py-6' onClick={handleCta}>
            Inizia gratis ora <ArrowRight className='ml-2 h-5 w-5' />
          </Button>
          <p className='text-xs text-muted-foreground'>
            Registrandoti confermi di aver letto i nostri
            <a href='/termini' className='underline ml-1'>Termini di Servizio</a>.
          </p>
        </div>

        {/* Social proof */}
        <div className='grid grid-cols-3 gap-4 text-center border rounded-lg p-6'>
          <div>
            <p className='text-2xl font-bold'>500+</p>
            <p className='text-sm text-muted-foreground'>Imprese attive</p>
          </div>
          <div>
            <p className='text-2xl font-bold'>4.8/5</p>
            <p className='text-sm text-muted-foreground'>Soddisfazione</p>
          </div>
          <div>
            <p className='text-2xl font-bold'>-60%</p>
            <p className='text-sm text-muted-foreground'>Tempo in burocrazia</p>
          </div>
        </div>

      </div>
    </div>
  );
}
