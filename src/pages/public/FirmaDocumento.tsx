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

type Step = 'loading' | 'errore' | 'riepilogo' | 'otp' | 'b2c_recesso' | 'b2c_clausole' | 'firma' | 'successo' | 'gia_firmato' | 'rifiutato';

// Testo di recesso di fallback (14 giorni, art. 52 Cod. Consumo): usato quando
// l'azienda non ha una riga fea_configurazione con b2c_testo_recesso.
const RECESSO_FALLBACK =
  'Hai diritto di recedere dal presente contratto entro 14 giorni senza dover fornire alcuna motivazione. Il periodo di recesso scade dopo 14 giorni dalla conclusione del contratto. Per esercitare il diritto di recesso sei tenuto a informare l\'azienda della tua decisione mediante una dichiarazione esplicita (ad es. una lettera inviata per posta o un\'email).';

// Su risposta non-2xx, supabase.functions.invoke restituisce un FunctionsHttpError
// SENZA body parsato: error.message è il generico inglese "Edge Function returned a
// non-2xx status code". Il corpo reale (con il nostro { error } in italiano) è
// leggibile da error.context. Questa helper lo estrae; se non c'è, torna al
// fallback italiano generico passato dal chiamante.
async function messaggioErroreEdge(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
    if (ctx?.json) {
      const data = (await ctx.json()) as { error?: string } | null;
      if (data?.error) return data.error;
    }
  } catch {
    // corpo non leggibile o già consumato: usa il fallback
  }
  return fallback;
}

/** Secondi che mancano alla scadenza di un OTP (0 se assente o passata). */
function secondiRestanti(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

/**
 * Apre il documento da firmare. Il preventivo fotovoltaico è una pagina HTML:
 * lo storage la manda come testo semplice e il cliente vedeva il codice. La si
 * scarica e la si apre come pagina, come fa il dettaglio del preventivo nell'app.
 */
async function apriDocumento(evento: { preventDefault: () => void }, url: string | null | undefined) {
  if (!url) return;
  let pagina = false;
  try {
    pagina = new URL(url).pathname.toLowerCase().endsWith(".html");
  } catch {
    // Indirizzo non leggibile: ci pensa il link.
  }
  if (!pagina) return;
  evento.preventDefault();
  // La scheda si apre subito, dentro il clic: dopo l'attesa il browser la bloccherebbe.
  const finestra = window.open("", "_blank");
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) throw new Error(String(risposta.status));
    const indirizzo = URL.createObjectURL(new Blob([await risposta.text()], { type: "text/html" }));
    if (finestra) finestra.location.href = indirizzo;
    else window.location.href = indirizzo;
    setTimeout(() => URL.revokeObjectURL(indirizzo), 60_000);
  } catch {
    finestra?.close();
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Cornice della pagina di firma. Sta FUORI dal componente: definita dentro,
 * a ogni render era un componente nuovo e React rimontava tutta la pagina.
 * Col timer dell'OTP che aggiorna ogni secondo, i sei campi perdevano il
 * fuoco ogni secondo (e l'autofocus riportava alla prima cifra); su iPhone la
 * tastiera si chiudeva a ogni cifra; il motivo del rifiuto perdeva il fuoco a
 * ogni lettera.
 */
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
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
}

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
  const [rifiutoDialogAperto, setRifiutoDialogAperto] = useState(false);
  const [rifiutoMotivo, setRifiutoMotivo] = useState('');
  const [rifiutoInCorso, setRifiutoInCorso] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Carica sessione al mount
  useEffect(() => {
    if (!token) { setStep('errore'); setErroreMsg('Link non valido'); return; }
    caricaSessione();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Titolo della scheda: il cliente apre il link dal telefono e deve capire
  // subito cos'è, non leggere lo slogan del sito.
  useEffect(() => {
    const prima = document.title;
    if (sessione) document.title = `Firma ${sessione.documento_titolo} · ${sessione.azienda_nome}`;
    return () => { document.title = prima; };
  }, [sessione]);

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
      err => console.warn('Geolocalizzazione non disponibile:', err?.message ?? err), // niente toast: la firma procede comunque
      { timeout: 5000 }
    );
  }, []);

  async function caricaSessione() {
    try {
      const { data, error } = await supabase.functions.invoke('fea-documento-pubblico', {
        body: { token },
      });
      if (error) throw new Error(await messaggioErroreEdge(error, 'Link non valido'));
      if (!data) throw new Error('Link non valido');
      if (data.error) throw new Error(data.error);
      // Documento già firmato: solo schermata di conferma, niente flusso di firma
      if (data.already_signed || data.status === 'signed') {
        setFirmaTimestamp(data.signed_at ?? '');
        setStep('gia_firmato');
        return;
      }
      setSessione(data as FEASessionePubblica);
      if (['expired', 'cancelled'].includes(data.status)) { setStep('errore'); setErroreMsg('Questo link è scaduto o è stato annullato.'); return; }
      setStep('riepilogo');
    } catch (err) {
      setStep('errore');
      setErroreMsg(err instanceof Error ? err.message : 'Errore nel caricamento del documento');
    }
  }

  const inviaOtp = async () => {
    setInvioOtpInCorso(true);
    setOtpError('');
    try {
      const { data, error } = await supabase.functions.invoke('fea-genera-otp', {
        body: { request_id: sessione!.request_id, azienda_nome: sessione!.azienda_nome },
      });
      if (error) throw new Error(await messaggioErroreEdge(error, 'Errore invio OTP'));
      if (data?.error) throw new Error(data.error);
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

  const continuaVersoOtp = async () => {
    // L'OTP parte già insieme all'offerta: se è ancora valido si va dritti ai 6
    // campi (niente terza email). Altrimenti se ne genera uno nuovo.
    const restanti = secondiRestanti(sessione?.otp_valido_fino);
    if (restanti > 30) {
      setOtpTimer(Math.min(600, restanti));
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError('');
      setStep('otp');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return;
    }
    await inviaOtp();
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cifre = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (cifre.length < 2) return; // una cifra sola: comportamento normale
    e.preventDefault();
    const nuove = ['', '', '', '', '', ''];
    cifre.split('').forEach((c, i) => { nuove[i] = c; });
    setOtpDigits(nuove);
    setTimeout(() => inputRefs.current[Math.min(cifre.length, 5)]?.focus(), 0);
    if (cifre.length === 6) verificaOtp(cifre);
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
      if (error) throw new Error(await messaggioErroreEdge(error, 'Codice non corretto'));
      if (data?.error) throw new Error(data.error);
      // OTP verificato — passa allo step successivo.
      // B2C: mostra SEMPRE lo step recesso (il consenso è obbligatorio lato server).
      // Se l'azienda non ha configurato il testo, lo step usa il fallback di legge.
      const isB2c = sessione?.tipo_firmatario === 'b2c';
      if (isB2c) {
        setStep('b2c_recesso');
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
      if (error) throw new Error(await messaggioErroreEdge(error, 'Errore nella firma'));
      if (data?.error) throw new Error(data.error);
      setFirmaTimestamp(data.firma_timestamp ?? new Date().toISOString());
      setStep('successo');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nella firma');
    } finally {
      setFirmaInCorso(false);
    }
  };

  const confermaRifiuto = async () => {
    setRifiutoInCorso(true);
    try {
      const { data, error } = await supabase.functions.invoke('fea-rifiuta-firma', {
        body: {
          token,
          motivo: rifiutoMotivo.trim() || null,
        },
      });
      if (error) throw new Error(await messaggioErroreEdge(error, 'Errore nel rifiuto del documento'));
      if (data?.error) throw new Error(data.error);
      setRifiutoDialogAperto(false);
      setStep('rifiutato');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel rifiuto del documento');
    } finally {
      setRifiutoInCorso(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── RENDER ──────────────────────────────────────────────────────────────
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
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Documento</p>
              <p className="font-semibold text-slate-800">{sessione.documento_titolo}</p>
              {sessione.titolo && <p className="text-sm text-slate-600 break-words">{sessione.titolo}</p>}
              {sessione.importo_totale != null && (
                <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                  {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(sessione.importo_totale)}
                  <span className="text-xs font-normal text-slate-500"> IVA inclusa</span>
                </p>
              )}
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
          {sessione.tipo_firmatario === 'b2c' ? (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">Contratto B2C — tutele consumatore</Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-700 border-slate-200">Contratto B2B</Badge>
          )}
          {!sessione.pdf_url && (
            <div className="flex items-start gap-2 p-2 rounded bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">
              <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>
                Il PDF del documento non è ancora disponibile per il download. Puoi comunque procedere con la firma;
                riceverai una copia firmata via email.
              </span>
            </div>
          )}
          {sessione.pdf_url && (
            <a
              href={sessione.pdf_url} onClick={(e) => apriDocumento(e, sessione.pdf_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-2 rounded border border-slate-200 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              Apri il documento da firmare (PDF)
            </a>
          )}
        </div>
        <Button
          className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600 text-white font-bold"
          onClick={continuaVersoOtp}
          disabled={invioOtpInCorso}
        >
          {invioOtpInCorso ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Invio in corso...</> : 'Continua con il codice'}
        </Button>
        <p className="text-slate-500 text-xs text-center">
          Il codice a 6 cifre arriva via email{sessione.signer_email_mascherata ? ` a ${sessione.signer_email_mascherata}` : ''}. Due passaggi, un minuto.
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
        {sessione.signer_email_mascherata && (
          <p className="text-slate-500 text-sm -mt-3">Inviato a <span className="font-medium text-slate-700">{sessione.signer_email_mascherata}</span></p>
        )}
        {/* 6 campi da 40 px + 5 spazi = 270 px: entrano in un iPhone SE (prima 48 px sforavano la card).
            autoComplete one-time-code: iOS e Android propongono il codice arrivato. */}
        <div className="flex gap-1.5 sm:gap-2 justify-center">
          {otpDigits.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              aria-label={`Cifra ${i + 1} di 6`}
              value={digit}
              onChange={e => handleOtpInput(i, e.target.value)}
              onKeyDown={e => handleOtpKeyDown(i, e)}
              onPaste={handleOtpPaste}
              className="w-10 h-12 sm:w-12 sm:h-14 text-center text-2xl font-bold border-2 rounded-xl focus:border-orange-500 outline-none transition-colors"
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
        {otpTimer === 0 && (
          <div className="flex flex-col items-center gap-3 text-red-600 bg-red-50 rounded-lg p-4 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">Il codice è scaduto. Richiedine uno nuovo per continuare.</span>
            </div>
            <Button
              variant="outline"
              className="gap-2 border-red-200 text-red-600 hover:bg-red-100 hover:text-red-700"
              onClick={inviaOtp}
              disabled={invioOtpInCorso}
            >
              {invioOtpInCorso ? <><Loader2 className="h-4 w-4 animate-spin" />Invio...</> : 'Reinvia codice'}
            </Button>
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
          {sessione.b2c_testo_recesso ?? RECESSO_FALLBACK}
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
          <a href={sessione.pdf_url} onClick={(e) => apriDocumento(e, sessione.pdf_url)} target="_blank" rel="noopener noreferrer"
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
        <div className="pt-2 border-t border-slate-100">
          <Button
            variant="outline"
            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={firmaInCorso}
            onClick={() => { setRifiutoMotivo(''); setRifiutoDialogAperto(true); }}
          >
            Rifiuta il documento
          </Button>
        </div>
      </div>

      {rifiutoDialogAperto && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rifiuto-titolo"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div>
              <h3 id="rifiuto-titolo" className="text-lg font-bold text-slate-800">Rifiuta il documento</h3>
              <p className="text-slate-500 text-sm mt-1">
                Stai per rifiutare la firma di questo documento. L&apos;azione è definitiva.
              </p>
            </div>
            <div>
              <label htmlFor="rifiuto-motivo" className="text-sm font-medium text-slate-700">
                Motivo (opzionale)
              </label>
              <textarea
                id="rifiuto-motivo"
                value={rifiutoMotivo}
                onChange={e => setRifiutoMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Es. i dati non sono corretti, importo errato..."
                className="mt-1 w-full rounded-xl border-2 border-slate-200 p-3 text-sm outline-none focus:border-red-400 resize-none"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                className="w-full sm:flex-1"
                disabled={rifiutoInCorso}
                onClick={() => setRifiutoDialogAperto(false)}
              >
                Annulla
              </Button>
              <Button
                className="w-full sm:flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
                disabled={rifiutoInCorso}
                onClick={confermaRifiuto}
              >
                {rifiutoInCorso ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Rifiuto in corso...</>
                ) : (
                  'Conferma rifiuto'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Wrapper>
  );

  if (step === 'rifiutato') return (
    <Wrapper>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Documento rifiutato</h2>
        <p className="text-slate-600 text-sm max-w-xs">
          Hai rifiutato la firma di questo documento. L&apos;azienda che ti ha inviato il link è stata informata.
        </p>
        <p className="text-slate-500 text-sm max-w-xs">
          Non è richiesta nessuna ulteriore azione. Per assistenza contatta l&apos;azienda.
        </p>
      </div>
    </Wrapper>
  );

  if (step === 'gia_firmato') return (
    <Wrapper>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Documento già firmato</h2>
        <p className="text-slate-600 text-sm">
          {firmaTimestamp
            ? `Documento già firmato il ${format(new Date(firmaTimestamp), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}.`
            : 'Questo documento risulta già firmato.'}
        </p>
        <p className="text-slate-500 text-sm max-w-xs">
          Non è richiesta nessuna ulteriore azione. Per assistenza contatta l&apos;azienda che ti ha inviato il link.
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
          <a href={sessione.pdf_url} onClick={(e) => apriDocumento(e, sessione.pdf_url)} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2 h-11">
              <FileText className="h-4 w-4" />
              Scarica il documento
            </Button>
          </a>
        )}
        {(sessione?.azienda_telefono || sessione?.azienda_email) && (
          <div className="w-full mt-2 pt-4 border-t border-slate-100 text-sm text-slate-600 space-y-1">
            <p className="text-xs text-slate-500">Per qualsiasi domanda, {sessione?.azienda_nome}:</p>
            {sessione?.azienda_telefono && (
              <a href={`tel:${sessione.azienda_telefono.replace(/\s+/g, '')}`} className="block font-medium text-blue-700 underline">{sessione.azienda_telefono}</a>
            )}
            {sessione?.azienda_email && (
              <a href={`mailto:${sessione.azienda_email}`} className="block font-medium text-blue-700 underline break-all">{sessione.azienda_email}</a>
            )}
          </div>
        )}
      </div>
    </Wrapper>
  );

  return null;
}
