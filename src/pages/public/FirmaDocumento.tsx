import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FEASessionePubblica, FEAClausolaVessatoria } from '@/types/fea';
import { CheckCircle2, Loader2, Shield, FileText, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

type Step = 'loading' | 'errore' | 'riepilogo' | 'otp' | 'b2c_recesso' | 'b2c_clausole' | 'firma' | 'successo';

export default function FirmaDocumento() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [sessione, setSessione] = useState<FEASessionePubblica | null>(null);
  const [erroreMsg, setErroreMsg] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(600);
  const [otpTentativi, setOtpTentativi] = useState(0);
  const [otpError, setOtpError] = useState('');
  const [recessoAccettato, setRecessoAccettato] = useState(false);
  const [clausoleApprovate, setClausoleApprovate] = useState<string[]>([]);
  const [documentoLetto, setDocumentoLetto] = useState(false);
  const [invioOtpInCorso, setInvioOtpInCorso] = useState(false);
  const [verificaOtpInCorso, setVerificaOtpInCorso] = useState(false);
  const [firmaInCorso, setFirmaInCorso] = useState(false);
  const [firmaTimestamp, setFirmaTimestamp] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Carica sessione al mount
  useEffect(() => {
    if (!token) { setStep('errore'); setErroreMsg('Link non valido'); return; }
    caricaSessione();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Countdown OTP — usa ref per evitare stale closure su timer ID
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (step !== 'otp') return;
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    otpTimerRef.current = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) {
          if (otpTimerRef.current) { clearInterval(otpTimerRef.current); otpTimerRef.current = null; }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (otpTimerRef.current) { clearInterval(otpTimerRef.current); otpTimerRef.current = null; } };
  }, [step]);

  // Geolocation silenzioso
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // fallback silenzioso
      { timeout: 5000 }
    );
  }, []);

  const caricaSessione = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fea-documento-pubblico', {
        body: { token },
      });
      if (error || !data) throw new Error(error?.message ?? 'Link non valido');
      if (data.error) throw new Error(data.error);
      setSessione(data as FEASessionePubblica);
      if (data.status === 'signed') { setStep('successo'); setFirmaTimestamp(data.signed_at ?? ''); return; }
      if (['expired', 'cancelled'].includes(data.status)) { setStep('errore'); setErroreMsg('Questo link è scaduto o è stato annullato.'); return; }
      setStep('riepilogo');
    } catch (err) {
      setStep('errore');
      setErroreMsg(err instanceof Error ? err.message : 'Errore nel caricamento del documento');
    }
  };

  const inviaOtp = async () => {
    setInvioOtpInCorso(true);
    setOtpError('');
    try {
      const { data, error } = await supabase.functions.invoke('fea-genera-otp', {
        body: { request_id: sessione!.request_id, azienda_nome: sessione!.azienda_nome },
      });
      if (error || data?.error) throw new Error(data?.error ?? 'Errore invio OTP');
      setOtpTimer(600);
      setOtpDigits(['', '', '', '', '', '']);
      setStep('otp');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore invio OTP');
    } finally {
      setInvioOtpInCorso(false);
    }
  };

  const handleOtpInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    if (value && index < 5) setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
    if (newDigits.every(d => d !== '') && newDigits.join('').length === 6) {
      verificaOtp(newDigits.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verificaOtp = async (otp?: string) => {
    const otpValue = otp ?? otpDigits.join('');
    if (otpValue.length !== 6) { setOtpError('Inserisci il codice a 6 cifre'); return; }
    setVerificaOtpInCorso(true);
    setOtpError('');
    try {
      const { data, error } = await supabase.functions.invoke('fea-verifica-otp', {
        body: { token, otp: otpValue },
      });
      if (error || data?.error) throw new Error(data?.error ?? 'Codice non corretto');
      // OTP verificato — passa allo step successivo
      const isB2c = sessione?.tipo_firmatario === 'b2c';
      if (isB2c && sessione?.b2c_testo_recesso) {
        setStep('b2c_recesso');
      } else if (isB2c && (sessione?.b2c_clausole?.length ?? 0) > 0) {
        setStep('b2c_clausole');
      } else {
        setStep('firma');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Codice non corretto';
      setOtpError(msg);
      setOtpTentativi(prev => prev + 1);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setVerificaOtpInCorso(false);
    }
  };

  const completaFirma = async () => {
    setFirmaInCorso(true);
    try {
      const { data, error } = await supabase.functions.invoke('fea-completa-firma', {
        body: {
          token,
          ip: null, // il server legge dall'header
          user_agent: navigator.userAgent,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          b2c_recesso_accettato: sessione?.tipo_firmatario === 'b2c' ? recessoAccettato : null,
          b2c_clausole_approvate: sessione?.tipo_firmatario === 'b2c' ? clausoleApprovate : null,
        },
      });
      if (error || data?.error) throw new Error(data?.error ?? 'Errore nella firma');
      setFirmaTimestamp(data.firma_timestamp ?? new Date().toISOString());
      setStep('successo');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nella firma');
    } finally {
      setFirmaInCorso(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── RENDER ──────────────────────────────────────────────────────────────
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-6">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-orange-400" />
            <div>
              <p className="text-white font-bold text-lg leading-none">Firma Elettronica</p>
              <p className="text-slate-400 text-xs mt-0.5">Edilizia in Cloud</p>
            </div>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );

  if (step === 'loading') return (
    <Wrapper>
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <p className="text-slate-600 text-sm">Caricamento documento...</p>
      </div>
    </Wrapper>
  );

  if (step === 'errore') return (
    <Wrapper>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-bold text-slate-800">Link non valido</h2>
        <p className="text-slate-500 text-sm">{erroreMsg || 'Questo link non è valido o è scaduto.'}</p>
        <p className="text-slate-400 text-xs">Contatta l&apos;azienda per ricevere un nuovo link.</p>
      </div>
    </Wrapper>
  );

  if (step === 'riepilogo' && sessione) return (
    <Wrapper>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Documento da firmare</h2>
          <p className="text-slate-500 text-sm mt-1">Verifica i dettagli prima di procedere</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-slate-500">Documento</p>
              <p className="font-semibold text-slate-800">{sessione.documento_titolo}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-slate-500">Azienda richiedente</p>
              <p className="font-medium text-slate-700">{sessione.azienda_nome}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-slate-500">Link valido fino al</p>
              <p className="font-medium text-slate-700">
                {format(new Date(sessione.expires_at), 'dd MMMM yyyy', { locale: it })}
              </p>
            </div>
          </div>
          {sessione.tipo_firmatario === 'b2c' && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">Contratto B2C — tutele consumatore</Badge>
          )}
        </div>
        <Button
          className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white font-bold"
          onClick={inviaOtp}
          disabled={invioOtpInCorso}
        >
          {invioOtpInCorso ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Invio in corso...</> : 'Invia codice OTP via email'}
        </Button>
        <p className="text-slate-400 text-xs text-center">
          Riceverai un codice a 6 cifre su {sessione.signer_name ? `${sessione.signer_name} — ` : ''}email
        </p>
      </div>
    </Wrapper>
  );

  if (step === 'otp' && sessione) return (
    <Wrapper>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Inserisci il codice OTP</h2>
          <p className="text-slate-500 text-sm mt-1">Controlla la tua email e inserisci il codice a 6 cifre</p>
        </div>
        <div className="flex gap-2 justify-center">
          {otpDigits.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleOtpInput(i, e.target.value)}
              onKeyDown={e => handleOtpKeyDown(i, e)}
              className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:border-orange-500 outline-none transition-colors"
              autoFocus={i === 0}
            />
          ))}
        </div>
        {otpError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{otpError}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className={`font-mono ${otpTimer < 60 ? 'text-red-500' : 'text-slate-500'}`}>
            {otpTimer > 0 ? `Codice valido: ${formatTimer(otpTimer)}` : 'Codice scaduto'}
          </span>
          <button
            onClick={inviaOtp}
            disabled={invioOtpInCorso || otpTimer > 540}
            className="text-orange-500 underline disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {invioOtpInCorso ? 'Invio...' : 'Reinvia codice'}
          </button>
        </div>
        <Button
          className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white font-bold"
          onClick={() => verificaOtp()}
          disabled={verificaOtpInCorso || otpDigits.some(d => !d)}
        >
          {verificaOtpInCorso ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Verifica...</> : 'Verifica codice'}
        </Button>
        {otpTentativi > 0 && (
          <p className="text-slate-400 text-xs text-center">Tentativi errati: {otpTentativi}/5</p>
        )}
      </div>
    </Wrapper>
  );

  if (step === 'b2c_recesso' && sessione) return (
    <Wrapper>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Diritto di recesso</h2>
          <p className="text-slate-500 text-sm mt-1">Leggi attentamente prima di procedere</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-sm text-slate-700 max-h-48 overflow-y-auto leading-relaxed">
          {sessione.b2c_testo_recesso ?? 'Hai diritto di recedere dal presente contratto entro 14 giorni senza dover fornire alcuna motivazione. Il periodo di recesso scade dopo 14 giorni dalla conclusione del contratto.'}
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="recesso"
            checked={recessoAccettato}
            onCheckedChange={v => setRecessoAccettato(!!v)}
          />
          <label htmlFor="recesso" className="text-sm text-slate-700 cursor-pointer">
            Ho letto e compreso il diritto di recesso di 14 giorni
          </label>
        </div>
        <Button
          className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white font-bold"
          disabled={!recessoAccettato}
          onClick={() => {
            const hasClausole = (sessione.b2c_clausole?.length ?? 0) > 0;
            setStep(hasClausole ? 'b2c_clausole' : 'firma');
          }}
        >
          Continua
        </Button>
      </div>
    </Wrapper>
  );

  if (step === 'b2c_clausole' && sessione) {
    const clausole = (sessione.b2c_clausole ?? []) as FEAClausolaVessatoria[];
    const tutteApprovate = clausole.every(c => clausoleApprovate.includes(c.id));
    return (
      <Wrapper>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Clausole specifiche</h2>
            <p className="text-slate-500 text-sm mt-1">Ogni clausola deve essere approvata singolarmente</p>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {clausole.map((c, i) => (
              <div key={c.id} className="border rounded-xl p-4 space-y-3">
                <p className="text-sm text-slate-700">{c.testo}</p>
                <Button
                  size="sm"
                  variant={clausoleApprovate.includes(c.id) ? 'default' : 'outline'}
                  className={clausoleApprovate.includes(c.id) ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                  onClick={() => setClausoleApprovate(prev =>
                    prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                  )}
                >
                  {clausoleApprovate.includes(c.id) ? '✓ Approvata' : `Approva clausola ${i + 1}`}
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white font-bold"
            disabled={!tutteApprovate}
            onClick={() => setStep('firma')}
          >
            Continua ({clausoleApprovate.length}/{clausole.length} approvate)
          </Button>
        </div>
      </Wrapper>
    );
  }

  if (step === 'firma' && sessione) return (
    <Wrapper>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Firma il documento</h2>
          <p className="text-slate-500 text-sm mt-1">Ultimo passo — nessun disegno richiesto</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
          <p><strong>Documento:</strong> {sessione.documento_titolo}</p>
          <p><strong>Firmatario:</strong> {sessione.signer_name}</p>
          <p><strong>Azienda:</strong> {sessione.azienda_nome}</p>
          <p><strong>Data e ora:</strong> {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it })}</p>
        </div>
        {sessione.pdf_url && (
          <a href={sessione.pdf_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-orange-500 text-sm underline">
            <FileText className="h-4 w-4" />
            Visualizza il documento
          </a>
        )}
        <div className="flex items-start gap-3">
          <Checkbox
            id="letto"
            checked={documentoLetto}
            onCheckedChange={v => setDocumentoLetto(!!v)}
          />
          <label htmlFor="letto" className="text-sm text-slate-700 cursor-pointer">
            Confermo di aver letto e compreso il documento e di accettarne il contenuto
          </label>
        </div>
        <Button
          className="w-full h-14 text-base bg-orange-500 hover:bg-orange-600 text-white font-bold"
          disabled={!documentoLetto || firmaInCorso}
          onClick={completaFirma}
        >
          {firmaInCorso ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" />Firma in corso...</>
          ) : (
            '✍️ Accetto e firmo'
          )}
        </Button>
        <p className="text-slate-400 text-xs text-center">
          La tua firma elettronica ha valore legale ai sensi del CAD e del Regolamento eIDAS
        </p>
      </div>
    </Wrapper>
  );

  if (step === 'successo') return (
    <Wrapper>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Documento firmato!</h2>
        {firmaTimestamp && (
          <p className="text-slate-600 text-sm">
            Firmato il {format(new Date(firmaTimestamp), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}
          </p>
        )}
        <p className="text-slate-500 text-sm max-w-xs">
          La firma elettronica è stata registrata correttamente.
          {sessione?.tipo_firmatario === 'b2c' && ' Riceverai una copia via email.'}
        </p>
        {sessione?.pdf_url && (
          <a href={sessione.pdf_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Scarica il documento
            </Button>
          </a>
        )}
      </div>
    </Wrapper>
  );

  return null;
}
